import { Router } from 'express'
import crypto from 'crypto'
import { requireAuth } from '../authGuard.js'
import { kvGet, kvSet, kvDel, kvLock, kvUnlock, kvSetIfLocked } from '../store.js'

const router = Router()

const TOKENS_KEY = 'whoop:tokens'
const LOCK_KEY = 'whoop:refresh-lock'
const ACCESS_SKEW_MS = 60 * 1000   // обновляем access_token за минуту до истечения
// Критическая секция под замком ЖЁСТКО ограничена таймаутами:
//   kvGet(≤3s) + refreshGrant(≤7s) + persistRotation(3×≤3s + backoff ≈ 9.5s) ≈ 19.5s.
// LOCK_TTL_S = 35s даёт ~15s запаса, поэтому замок не может истечь под активным
// держателем (а более долгий процесс убьёт сам Vercel раньше, чем он что-то запишет).
const LOCK_TTL_S = 35
const REFRESH_TIMEOUT_MS = 7000   // жёсткий таймаут refresh-гранта
const delay = (ms) => new Promise(r => setTimeout(r, ms))
const AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth'
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'
const API = 'https://api.prod.whoop.com/developer'
const SCOPE = 'offline read:recovery read:sleep read:cycles read:workout read:profile read:body_measurement'

const configured = () =>
  !!(process.env.WHOOP_CLIENT_ID && process.env.WHOOP_CLIENT_SECRET && process.env.WHOOP_REDIRECT_URI)

function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL
  const proto = req.headers['x-forwarded-proto'] || 'http'
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `${proto}://${host}`
}

// Кэш ещё живой? (access_token есть и не истёк с запасом)
function cacheValid(t) {
  return !!(t?.access_token && t.access_expires_at && Date.now() < t.access_expires_at - ACCESS_SKEW_MS)
}

// Один refresh-грант. Возвращает { ok:true, data } | { ok:false, terminal:bool }.
// terminal=true → refresh_token мёртв (invalid_grant) → нужно переподключение.
// terminal=false → временный сбой (5xx/429/сеть) → токен НЕ трогаем.
async function refreshGrant(refresh_token) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token,
    client_id: process.env.WHOOP_CLIENT_ID,
    client_secret: process.env.WHOOP_CLIENT_SECRET,
    scope: 'offline'   // обязательно: иначе Whoop не вернёт НОВЫЙ refresh_token
  })
  let r
  try {
    r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS) })
  } catch { return { ok: false, terminal: false } } // сеть/таймаут — временно
  if (r.ok) {
    let d
    try { d = await r.json() } catch { return { ok: false, terminal: false } }
    if (!d.access_token) return { ok: false, terminal: false }
    return { ok: true, data: d }
  }
  // Терминально ТОЛЬКО при invalid_grant (RFC 6749 §5.2) — единственный код, означающий,
  // что refresh_token использован/протух/отозван. Пустое тело, 429, 5xx, invalid_request,
  // прокси/WAF 4xx — временно (живой токен НЕ помечаем мёртвым).
  let terminal = false
  if (r.status >= 400 && r.status < 500 && r.status !== 429) {
    try { const e = await r.json(); terminal = e?.error === 'invalid_grant' } catch { /* нет тела → временно */ }
  }
  return { ok: false, terminal }
}

// Сохранить ротированную запись ПОД ФЕНСИНГОМ замка: пишем только пока реально владеем
// замком (kvSetIfLocked). Если инстанс «заморозился» и TTL замка истёк — запоздалая
// запись отвергается, и мы не затрём токен преемника. Возвращает 'saved' | 'lostlock' | 'failed'.
async function persistRotation(prev, d, lockToken) {
  const expires_in = Number(d.expires_in) || 3600
  const rec = {
    refresh_token: d.refresh_token || prev.refresh_token, // offline → новый; иначе оставляем текущий
    access_token: d.access_token,
    access_expires_at: Date.now() + expires_in * 1000,
    connected_at: prev.connected_at || Date.now(),
    updated_at: Date.now()
  }
  for (let i = 0; i < 3; i++) {
    const r = await kvSetIfLocked(TOKENS_KEY, rec, LOCK_KEY, lockToken)
    if (r.applied) return 'saved'
    if (!r.error) return 'lostlock'   // замок потерян (TTL истёк под заморозкой) — не наша запись
    await delay(150)                  // сетевой сбой — повтор
  }
  return 'failed'
}

// Выполнить мутацию TOKENS_KEY под общим замком (сериализация с refresh-холдером).
// Авторитетные операции (/callback, /disconnect) немного ждут занятый замок, затем
// выполняются всё равно (последнее намерение пользователя важнее, чем фоновый refresh).
async function withTokenLock(fn) {
  let lockToken = null
  // Бюджет ~8s покрывает обычного refresh-держателя (refresh ≤7s); затем — авторитетная
  // запись всё равно (реконнект/отключение важнее фонового refresh; фенсинг на стороне
  // держателя не даст его stale-записи затереть наш свежий токен/удаление).
  for (let i = 0; i < 20 && !lockToken; i++) {
    lockToken = await kvLock(LOCK_KEY, LOCK_TTL_S)
    if (!lockToken) await delay(400)
  }
  try { return await fn() } finally { if (lockToken) await kvUnlock(LOCK_KEY, lockToken) }
}

// Достать рабочий access_token. Возвращает { access } | { error: 'reauth' | 'transient' }.
// Single-flight через KV-замок: одновременные запросы не жгут одноразовый refresh_token —
// рефрешит только держатель замка, остальные ждут и переиспользуют свежий access_token.
async function getAccessToken({ force = false, staleAccess = null } = {}) {
  let t = await kvGet(TOKENS_KEY)
  if (!t?.refresh_token) return { error: 'reauth' }
  if (t.dead) return { error: 'reauth' }
  if (!force && cacheValid(t)) return { access: t.access_token }

  const lockToken = await kvLock(LOCK_KEY, LOCK_TTL_S)
  if (!lockToken) {
    // Кто-то уже обновляет — ждём СВЕЖИЙ токен (force: строго отличный от отвергнутого).
    // Бюджет ожидания (~8s) покрывает типичный refresh держателя (1–2s); при редком
    // долгом обновлении — transient (один пустой ответ, самоисцеляется на след. заходе).
    for (let i = 0; i < 20; i++) {
      await delay(400)
      t = await kvGet(TOKENS_KEY)
      if (t?.dead) return { error: 'reauth' }
      if (cacheValid(t) && t.access_token !== staleAccess) return { access: t.access_token }
    }
    return { error: 'transient' }
  }
  try {
    // Перечитываем под замком: предыдущий держатель мог только что ротировать.
    t = await kvGet(TOKENS_KEY)
    if (!t?.refresh_token) return { error: 'reauth' }
    if (t.dead) return { error: 'reauth' }
    if (!force && cacheValid(t)) return { access: t.access_token }

    const res = await refreshGrant(t.refresh_token)
    if (res.ok) {
      // Записали ротированный токен (под фенсингом) → выдаём свежий access;
      // 'lostlock'/'failed' → transient (на следующем заходе возьмём актуальный токен).
      return (await persistRotation(t, res.data, lockToken)) === 'saved'
        ? { access: res.data.access_token } : { error: 'transient' }
    }
    if (res.terminal) {
      // Перечитываем под замком:
      const cur = await kvGet(TOKENS_KEY)
      // запись удалена (/disconnect) — НЕ воскрешаем зомби-токен.
      if (!cur?.refresh_token) return { error: 'reauth' }
      // кто-то реконнектил (другой refresh_token) — это НЕ наш приговор, не трогаем свежий токен.
      if (cur.refresh_token !== t.refresh_token) {
        return cacheValid(cur) ? { access: cur.access_token } : { error: 'transient' }
      }
      // Помечаем токен мёртвым ПОД ФЕНСИНГОМ замка (потеряли замок под заморозкой → не
      // объявляем dead, отдаём transient: следующий держатель выведет истину из консистентного чтения).
      for (let i = 0; i < 3; i++) {
        const r = await kvSetIfLocked(TOKENS_KEY, { ...cur, dead: true, dead_at: Date.now() }, LOCK_KEY, lockToken)
        if (r.applied) return { error: 'reauth' }
        if (!r.error) return { error: 'transient' } // замок потерян
        await delay(150)
      }
      return { error: 'transient' } // не смогли записать (сеть) — не врём про dead
    }
    return { error: 'transient' }
  } finally {
    await kvUnlock(LOCK_KEY, lockToken)
  }
}

// Возвращает распарсенный JSON, null при обычной ошибке, либо 'unauth' при 401
// (access_token отвергнут API → дадим /data шанс принудительно обновить токен).
async function whoopGet(path, access) {
  let r
  try { r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(8000) }) }
  catch { return null }
  if (r.status === 401) return 'unauth'
  if (!r.ok) return null
  try { return await r.json() } catch { return null }
}

const ms2h = (m) => Math.round((m / 3600000) * 10) / 10

router.get('/connect-url', requireAuth, async (_req, res) => {
  if (!configured()) return res.status(503).json({ error: 'not_configured' })
  const state = crypto.randomBytes(16).toString('hex')
  await kvSet('whoop:state:' + state, { at: Date.now() })
  const params = new URLSearchParams({
    client_id: process.env.WHOOP_CLIENT_ID,
    redirect_uri: process.env.WHOOP_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    state
  })
  res.json({ url: `${AUTH_URL}?${params}` })
})

router.get('/callback', async (req, res) => {
  const { code, state } = req.query
  const back = (ok) => res.redirect(`${appUrl(req)}/connections?whoop=${ok ? 'ok' : 'err'}`)
  try {
    if (!code || !state) return back(false)
    const pending = await kvGet('whoop:state:' + state)
    if (!pending) return back(false)
    await kvDel('whoop:state:' + state)
    const body = new URLSearchParams({
      grant_type: 'authorization_code', code,
      client_id: process.env.WHOOP_CLIENT_ID, client_secret: process.env.WHOOP_CLIENT_SECRET,
      redirect_uri: process.env.WHOOP_REDIRECT_URI
    })
    const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
    if (!r.ok) return back(false)
    const d = await r.json()
    if (!d.refresh_token) return back(false)
    // Свежее подключение: записываем токен + сразу кэшируем access_token (и НЕ наследуем dead).
    // Под общим замком — чтобы фоновый refresh не затёр свежий токен (и не пометил dead).
    await withTokenLock(() => kvSet(TOKENS_KEY, {
      refresh_token: d.refresh_token,
      access_token: d.access_token || null,
      access_expires_at: d.access_token ? Date.now() + (Number(d.expires_in) || 3600) * 1000 : 0,
      connected_at: Date.now()
    }))
    return back(true)
  } catch { return back(false) }
})

router.get('/status', requireAuth, async (_req, res) => {
  const t = await kvGet(TOKENS_KEY)
  // Честно: помеченный dead токен (refresh упал с invalid_grant) = не подключён,
  // чтобы UI предложил переподключение. Whoop при этом не дёргаем.
  res.json({ configured: configured(), connected: !!(t?.refresh_token && !t.dead) })
})

router.post('/disconnect', requireAuth, async (_req, res) => {
  // Под общим замком — чтобы параллельный refresh не воскресил удалённый токен.
  await withTokenLock(() => kvDel(TOKENS_KEY))
  res.json({ ok: true })
})

// Свежие данные Whoop → форма для страницы «Здоровье»
router.get('/data', requireAuth, async (_req, res) => {
  if (!configured()) return res.json({ connected: false })
  let tok = await getAccessToken()
  if (!tok.access) return res.json({ connected: false, needsReauth: tok.error === 'reauth' })

  const fetchAll = (access) => Promise.all([
    whoopGet('/v2/recovery?limit=7', access),
    whoopGet('/v2/activity/sleep?limit=10', access),
    whoopGet('/v2/cycle?limit=1', access)
  ])
  let [rec, sleep, cycle] = await fetchAll(tok.access)
  // Кэшированный access_token отвергнут (401) — принудительно обновим токен (требуя СВЕЖИЙ,
  // отличный от отвергнутого) и повторим один раз.
  if (rec === 'unauth' || sleep === 'unauth' || cycle === 'unauth') {
    tok = await getAccessToken({ force: true, staleAccess: tok.access })
    if (!tok.access) return res.json({ connected: false, needsReauth: tok.error === 'reauth' })
    ;[rec, sleep, cycle] = await fetchAll(tok.access)
    // Свежий токен всё ещё отвергнут API → подключение нужно пересоздать, а не отдавать нули.
    if (rec === 'unauth' || sleep === 'unauth' || cycle === 'unauth') {
      return res.json({ connected: false, needsReauth: true })
    }
  }

  const r = rec?.records?.[0]?.score || {}

  // Неделя восстановления — из реальных записей (от старых к новым)
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1).replace('.', '')
  const week = (rec?.records || [])
    .filter(x => x.score?.recovery_score != null)
    .map(x => ({
      day: cap(new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', weekday: 'short' }).format(new Date(x.created_at))),
      recovery: Math.round(x.score.recovery_score)
    }))
    .reverse()
  // Берём последний НОЧНОЙ сон, а не дневной (nap): Whoop пишет дневной сон
  // отдельной записью, и при limit=1 он может перекрыть основной ночной сон.
  const sleepRecords = sleep?.records || []
  const sleepRec = sleepRecords.find(x => x.nap !== true) || sleepRecords[0] || {}
  const sRec = sleepRec.score || {}
  const cRec = cycle?.records?.[0]?.score || {}
  const stage = sRec.stage_summary || {}
  const need = sRec.sleep_needed || {}

  const slept = ms2h((stage.total_light_sleep_time_milli || 0) + (stage.total_slow_wave_sleep_time_milli || 0) + (stage.total_rem_sleep_time_milli || 0))
  const needed = ms2h((need.baseline_milli || 0) + (need.need_from_sleep_debt_milli || 0) + (need.need_from_recent_strain_milli || 0))

  // Реальные стадии сна (минуты) — чтобы полоса фаз обновлялась, а не показывала демо
  const ms2min = (m) => Math.round((m || 0) / 60000)
  const stages = {
    awake: ms2min(stage.total_awake_time_milli),
    light: ms2min(stage.total_light_sleep_time_milli),
    rem: ms2min(stage.total_rem_sleep_time_milli),
    deep: ms2min(stage.total_slow_wave_sleep_time_milli)
  }
  const mskHHMM = (iso) => {
    if (!iso) return null
    try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) } catch { return null }
  }

  // Дневной сон (nap) — отдельной плашкой. Показываем только если он свежее
  // ночного сна (т.е. был сегодня после пробуждения), а не устаревший из истории.
  const napRec = sleepRecords.find(x => x.nap === true && (!sleepRec.start || new Date(x.start) > new Date(sleepRec.start)))
  const napStage = napRec?.score?.stage_summary || {}
  const nap = napRec ? {
    hoursSlept: ms2h((napStage.total_light_sleep_time_milli || 0) + (napStage.total_slow_wave_sleep_time_milli || 0) + (napStage.total_rem_sleep_time_milli || 0)),
    start: mskHHMM(napRec.start),
    end: mskHHMM(napRec.end),
    performance: Math.round(napRec.score?.sleep_performance_percentage ?? 0)
  } : null

  res.json({
    connected: true,
    whoop: {
      recovery: Math.round(r.recovery_score ?? 0),
      strain: Math.round((cRec.strain ?? 0) * 10) / 10,
      hrv: Math.round(r.hrv_rmssd_milli ?? 0),
      rhr: Math.round(r.resting_heart_rate ?? 0),
      spo2: Math.round(r.spo2_percentage ?? 0),
      respiratoryRate: Math.round((sRec.respiratory_rate ?? 0) * 10) / 10,
      sleep: {
        hoursSlept: slept,
        hoursNeeded: needed,
        performance: Math.round(sRec.sleep_performance_percentage ?? 0),
        efficiency: Math.round(sRec.sleep_efficiency_percentage ?? 0),
        stages,
        start: mskHHMM(sleepRec.start),
        end: mskHHMM(sleepRec.end),
        cycles: sRec.sleep_cycle_count ?? null,
        disturbances: sRec.disturbance_count ?? null
      },
      nap,
      week
    }
  })
})

export default router
