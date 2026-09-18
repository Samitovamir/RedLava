// The "СТАТУС" hero signal at the top of Home: a headline verdict + a short breakdown by
// domain (stress / ahead / sport / blood tests / nutrition) + a line of overall advice, plus
// a colored assessment border (ok / warn / crit). The AI generates the content — because the
// thresholds between modes come from the user's PERSONAL baseline (long-term memory), not
// from general medical tables.
//
// The snapshot is stable within a PHASE of the day (morning/afternoon/evening) and until a
// new workout appears — WITHOUT any minute-level figures (the exact time, Body Battery), so
// the hero cache is not invalidated every minute while the window still moves along with the
// day (one thing in the morning, another after a workout).

import { WHOOP_DAYS } from './whoop.js'
import { mskNow } from './time.js'
import { labsFlagged } from './siteSnapshot.js'
import { nutritionTodayLine } from './nutrition.js'

function readWhoop() {
  try { const s = localStorage.getItem('albert-whoop-live'); if (s) return JSON.parse(s) } catch { /* ignore */ }
  return null
}
function readGarmin() {
  try { const s = localStorage.getItem('albert-garmin-live'); if (s) return JSON.parse(s) } catch { /* ignore */ }
  return null
}

function todayIso(now) {
  const p = n => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

// The phase of the day — used to adapt the text and as part of the CACHE key (no exact minute).
function dayPhase(now) {
  const h = now.getHours()
  if (h < 11) return 'утро'
  if (h < 17) return 'день'
  return 'вечер'
}

// The signal's snapshot, stable within a phase of the day: date + phase + recovery/sleep +
// weekly trend + CURRENT stress + last workout + blood tests + nutrition + memory.
export function buildSignalData({ events = [], facts = [] } = {}) {
  const now = mskNow()
  const today = todayIso(now)
  const phase = dayPhase(now)
  const whoop = readWhoop()
  const garmin = readGarmin()

  const lines = [`Дата: ${today}. Фаза дня: ${phase}.`]

  // Health: recovery/sleep + the weekly trend
  if (whoop) {
    lines.push(`Восстановление сегодня ${whoop.recovery}% (утренний балл готовности). Нагрузка ${whoop.strain}/21. Сон ${whoop.sleep?.hoursSlept} ч (${whoop.sleep?.performance}% от нормы сна).`)
    const week = Array.isArray(whoop.week) && whoop.week.length ? whoop.week : WHOOP_DAYS
    if (week?.length) {
      lines.push(`Восстановление по дням недели (тренд, выше — лучше): ${week.map(d => `${d.day} ${d.recovery}%`).join(', ')}.`)
    }
  } else {
    lines.push('Данных Whoop нет (восстановление/сон неизвестны).')
  }

  // Stress — the recent figure (averaged over the last hour, refreshed when the watch syncs)
  const stress = garmin?.stress
  if (stress && (stress.recent ?? stress.current ?? stress.avg) != null) {
    lines.push(`Стресс (Garmin) ${stress.recent ?? stress.current ?? stress.avg}/100 за последний час.`)
  }

  // Sport: the last workout (+ a "post-workout" marker from its date/title, for the cache)
  const lastW = (garmin?.workouts && garmin.workouts[0]) || garmin?.lastWorkout || null
  if (lastW) {
    const parts = [
      lastW.distanceKm != null ? `${lastW.distanceKm} км` : null,
      lastW.durationMin != null ? `${lastW.durationMin} мин` : null,
      lastW.avgHr != null ? `ср.пульс ${lastW.avgHr}` : null,
    ].filter(Boolean).join(', ')
    lines.push(`Последняя тренировка: ${lastW.date} «${lastW.title || 'тренировка'}»${parts ? ` (${parts})` : ''}.`)
  } else {
    lines.push('Тренировок в данных Garmin нет.')
  }

  // The day's schedule → "ahead"
  const todayEvents = events.filter(e => e.date === today)
  lines.push(todayEvents.length
    ? `Сегодня событий в расписании: ${todayEvents.length} (${todayEvents.map(e => `${e.start} ${e.title}`).slice(0, 6).join('; ')}).`
    : 'Сегодня расписание свободно (событий нет).')

  // Blood tests: the key deviations (the same computation as in the site-wide snapshot)
  try {
    const { flagged, hasData } = labsFlagged()
    if (!hasData) lines.push('Анализы крови пока не загружены.')
    else lines.push(flagged.length ? `Анализы вне нормы: ${flagged.join('; ')}.` : 'Анализы крови в норме.')
  } catch { /* ignore */ }

  // Nutrition: the target + HOW MUCH HAS ALREADY BEEN EATEN today and how much is left — so
  // the status knows the FACTS and not just the target, and advises against what remains.
  // "Eaten" changes the snapshot → the status is regenerated with every new meal logged.
  try { lines.push(`Питание: ${nutritionTodayLine()}`) } catch { /* ignore */ }

  lines.push(`Личная память о норме и привычках пользователя:\n${facts.length ? facts.map(f => `- ${f.text || f}`).join('\n') : 'пока ничего не запомнено'}`)

  return lines.join('\n')
}

// The system prompt for "Статус". It encodes the format (status token → headline → one row
// per domain → advice), the 4 modes, and the rules (personal baseline, crit stays rare, an
// informational tone, the decision stays the user's, adapt to the phase of the day).
export const SIGNAL_CONTEXT =
  'Ты формируешь верхний баннер «СТАТУС» на личном дашборде пользователя — человека, который занимается триатлоном. ' +
  'Это спокойный человеческий разбор сегодняшнего дня по ВСЕМ данным сразу, с практичным советом. Не диагноз и не команда.\n' +
  'ФОРМАТ ОТВЕТА — строго так, КАЖДЫЙ пункт с новой строки, без markdown, без кавычек, без лишних строк:\n' +
  'СТАТУС: <ok|warn|crit>\n' +
  'Заголовок: <короткий вывод 3–6 слов, без точки>\n' +
  'Стресс: <недавний стресс/100 + короткая словесная оценка>\n' +
  'Впереди: <ближайшие события дня кратко, либо «свободно»>\n' +
  'Спорт: <последняя тренировка кратко · восстановление %>\n' +
  'Здоровье: <сопоставь восстановление и текущую нагрузку в одной мысли (есть запас / баланс / перегруз); если есть отклонение в анализах — добавь его коротко>\n' +
  'Питание: <если сегодня уже что-то съедено — назови съедено/осталось ккал и чего не хватает (белок), и что разумно съесть в оставшихся приёмах; если ещё ничего не залогировано — цель и акцент дня>\n' +
  'Совет: <1–2 предложения обобщённого совета, связывающего ВСЕ данные воедино (сон / ужин / нагрузка), решение оставляешь пользователю>\n\n' +
  'СТАТУС-ТОКЕН (цвет рамки, согласован с заголовком): ok — всё хорошо или есть запас; warn — «на грани» (низковатое восстановление / высокий стресс / очень плотный день, но не кризис); crit — РЕДКО, только когда и данные, и личная норма реально на пределе.\n' +
  'РЕЖИМЫ (выбери по данным И личной норме): РЕЖИМ 1 «всё хорошо» → ok. РЕЖИМ 2 «есть запас, тело тянет ещё» → ok. РЕЖИМ «на грани» → warn. РЕЖИМ 3 «данные и норма на пределе» (РЕДКО) → crit. Не повторяй один заголовок изо дня в день — варьируй.\n' +
  'ВАЖНЫЕ ПРАВИЛА:\n' +
  '1) Пороги бери из ЛИЧНОЙ НОРМЫ пользователя (из памяти ниже), а НЕ из общих мед. таблиц. Если для него такое восстановление/стресс — рутина, это НЕ warn/crit.\n' +
  '2) crit — редкий; если злоупотреблять, обесценится.\n' +
  '3) Тон — информатор, не командир: «вот что показывают данные». Финал отдаёт решение пользователю («на твоё усмотрение», «решай сам»). Это уважение к тому, что он знает своё тело.\n' +
  '4) Адаптируй текст под ФАЗУ ДНЯ из данных: утро — готовность и план на день; день — как идёт день и что осталось; вечер — итог дня, сон, завтра. Если последняя тренировка только что (сегодня) — отметь её и восстановление/дозаправку.\n' +
  '5) Опирайся ТОЛЬКО на данные ниже, ничего не выдумывай. Если данных мало — спокойный нейтральный статус ok.'

// The context for the status's PER-DOMAIN ADVICE (the new "Статус"): every section carries,
// to the right of its chart, a short personal piece of AI advice about what to do — not a
// retelling of the numbers already on screen.
export const DOMAIN_ADVICE_CONTEXT =
  'Ты — персональный ассистент человека, который занимается триатлоном. По данным ниже дай КОРОТКИЙ практичный совет по каждому разделу: 1–1.5 предложения, по-человечески и конкретно. ' +
  'НЕ повторяй цифры — они уже видны на графике рядом; подскажи, ЧТО С ЭТИМ ДЕЛАТЬ сегодня. Тон — информатор, окончательное решение за пользователем.\n' +
  'ФОРМАТ — каждый пункт с новой строки, без markdown, без кавычек, ровно эти ярлыки:\n' +
  'Стресс: <совет>\n' +
  'Расписание: <совет с учётом плотности дня>\n' +
  'Спорт: <совет по готовности к тренировке>\n' +
  'Здоровье: <совет по восстановлению и нагрузке>\n' +
  'Питание: <совет по еде на остаток дня, с акцентом на белок при необходимости>\n' +
  'ПРАВИЛА: опирайся ТОЛЬКО на данные ниже; пороги бери из ЛИЧНОЙ нормы пользователя (память ниже), а не из общих таблиц; ничего не выдумывай; если данных мало — мягкий нейтральный совет. Каждый совет самостоятелен, не ссылается на другие разделы и не начинается с ярлыка повторно.'

// Parse the per-domain advice into an object { стресс, расписание, спорт, здоровье, питание }.
export function parseAdvice(text) {
  const out = {}
  for (const raw of String(text || '').split('\n')) {
    const m = raw.trim().match(/^([A-Za-zА-Яа-яЁё]+)\s*[:\-–—]\s*(.+)$/)
    if (m) out[m[1].toLowerCase()] = m[2].trim()
  }
  return out
}

// Parse the AI's reply into { status, headline, rows, advice, note }.
// note is there for backwards compatibility (older call sites expect a headline + caption).
export function parseSignal(text) {
  const raw = String(text || '').split('\n').map(s => s.trim()).filter(Boolean)
  if (!raw.length) return null
  const ROW_LABELS = ['стресс', 'впереди', 'спорт', 'здоровье', 'анализы', 'питание', 'сегодня', 'сон', 'осталось', 'восстановление', 'восст']
  let status = null, headline = '', advice = ''
  const rows = []
  for (const line of raw) {
    const m = line.match(/^([A-Za-zА-Яа-яЁё]+)\s*[:·]\s*(.+)$/)
    const label = m ? m[1] : null
    const val = m ? m[2].trim() : null
    const low = (label || '').toLowerCase()
    if (low === 'статус') { status = (val || '').toLowerCase().replace(/[^a-z]/g, ''); continue }
    if (low === 'заголовок') { headline = val; continue }
    if (low === 'совет' || low === 'итог') { advice = val; continue }
    if (label && ROW_LABELS.some(L => low.startsWith(L))) { rows.push({ label, value: val }); continue }
    // a line with no recognized label: the first becomes the headline, the rest the advice
    if (!headline) headline = line.replace(/^[«"]|[»"]$/g, '')
    else advice = advice ? `${advice} ${line}` : line
  }
  if (!status || !['ok', 'warn', 'crit'].includes(status)) {
    status = (status || '').includes('crit') ? 'crit' : (status || '').includes('warn') ? 'warn' : 'ok'
  }
  const note = advice || (rows[0] ? `${rows[0].label}: ${rows[0].value}` : '')
  return { status, headline, rows, advice, note }
}

// A simple fallback with no AI: the status and breakdown derived deterministically from
// recovery and stress.
export function fallbackSignal(lang = 'ru') {
  const en = lang === 'en'
  const whoop = readWhoop()
  const garmin = readGarmin()
  const r = whoop?.recovery
  const stress = garmin?.stress ? (garmin.stress.recent ?? garmin.stress.current ?? garmin.stress.avg) : null

  let status = 'ok'
  if (r != null) {
    if (r < 34 || (stress != null && stress >= 66)) status = 'crit'
    else if (r < 67 || (stress != null && stress >= 50)) status = 'warn'
  }

  const rows = []
  if (stress != null) rows.push({ label: en ? 'Stress' : 'Стресс', value: `${stress}/100` })
  if (r != null) rows.push({ label: en ? 'Health' : 'Здоровье', value: en ? `recovery ${r}%${whoop?.sleep?.hoursSlept != null ? `, sleep ${whoop.sleep.hoursSlept} h` : ''}` : `восстановление ${r}%${whoop?.sleep?.hoursSlept != null ? `, сон ${whoop.sleep.hoursSlept} ч` : ''}` })

  let headline, advice
  if (r == null) {
    headline = en ? 'A calm day' : 'Спокойный день'
    advice = en ? 'Nothing unusual to flag — an ordinary day.' : 'Ничего необычного — день как день.'
  } else if (status === 'ok') {
    headline = en ? 'Some reserve today' : 'Есть запас на сегодня'
    advice = en ? `Recovery ${r}% — room for a load if you feel like it.` : `Восстановление ${r}% — тело спокойно возьмёт нагрузку, если в настроении.`
  } else if (status === 'warn') {
    headline = en ? 'A calm day' : 'Спокойный день'
    advice = en ? `Recovery ${r}%. Do as you see fit.` : `Восстановление ${r}%. Делай как считаешь нужным.`
  } else {
    headline = en ? 'Body is signalling more than usual' : 'Тело сигналит сильнее обычного'
    advice = en ? `Recovery ${r}% — below your usual. Your call.` : `Восстановление ${r}% — ниже твоего обычного. Дальше на твоё усмотрение.`
  }
  return { status, headline, rows, advice, note: advice }
}
