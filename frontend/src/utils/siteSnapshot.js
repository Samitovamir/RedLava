// Единый «снимок» всего сайта для ИИ: расписание + спорт + здоровье + анализы +
// память о владельце + недавние действия. Любое окно ассистента может опираться на него,
// чтобы давать связные ответы по всем данным сразу.

import { WORKOUTS, WORKOUT_TYPES, WEEK_STATS, GARMIN } from './workouts.js'
import { WHOOP, WHOOP_DAYS, recoveryLabel } from './whoop.js'
import { INITIAL_REPORTS, buildHistory, markerStatus, STATUS_INFO, rangeText, resolveMarker } from './labs.js'
import { loadProfile, computeTarget, GOALS } from './nutrition.js'
import { mskNow } from './time.js'

const PRIO = { 1: 'неотложный', 2: 'важный', 3: 'обычный' }
const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']

function labsFlagged() {
  let reports = INITIAL_REPORTS
  try { const s = localStorage.getItem('albert-labs'); if (s) reports = JSON.parse(s) } catch { /* ignore */ }
  const hist = buildHistory(reports)
  // Важные показатели вне нормы — списком; второстепенные/профильные — только счётчиком,
  // чтобы ИИ не тонул в огромных панелях (микробиом, метаболомика и т.п.).
  const key = [], minorCount = []
  Object.entries(hist).forEach(([name, h]) => {
    const last = h[h.length - 1]
    const def = resolveMarker(name, last)
    const st = markerStatus(last.value, def.min, def.max)
    if (st !== 'low' && st !== 'high') return
    if (def.priority === 'key') key.push(`${def.name} ${last.value} ${def.unit || ''} (норма ${rangeText(def.min, def.max)}, ${STATUS_INFO[st].label})`)
    else minorCount.push(`${def.name} ${last.value} ${def.unit || ''}`)
  })
  const flagged = [...key]
  if (minorCount.length) flagged.push(`ещё ${minorCount.length} второстепенных вне нормы: ${minorCount.slice(0, 12).join('; ')}${minorCount.length > 12 ? ' и др.' : ''}`)
  return { flagged, hasData: Object.keys(hist).length > 0 }
}

export function buildSiteSnapshot({ events = [], history = [], facts = [] } = {}) {
  const now = mskNow()
  const p = n => String(n).padStart(2, '0')
  const iso = d => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  const today = iso(now)
  const weekday = WD[now.getDay()]
  const hhmm = `${p(now.getHours())}:${p(now.getMinutes())}`

  // Готовое сопоставление «день недели → точная дата» на 11 дней вперёд,
  // чтобы ИИ не ошибался при словах «завтра», «в пятницу», «через неделю».
  const cal = []
  for (let i = 0; i < 11; i++) {
    const d = new Date(now); d.setDate(now.getDate() + i)
    const tag = i === 0 ? ' (сегодня)' : i === 1 ? ' (завтра)' : i === 2 ? ' (послезавтра)' : ''
    cal.push(`${iso(d)} — ${WD[d.getDay()]}${tag}`)
  }
  const calBlock = cal.join('\n')

  const sched = events.length
    ? [...events].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
        .map(e => `${e.date} ${e.start}–${e.end} «${e.title}»${e.who ? ` (${e.who})` : ''} [${PRIO[e.priority || 3]}]`).join('\n')
    : 'нет событий'

  // Garmin — только реальные данные (если подключён), иначе честно «нет данных»
  let liveGarmin = null
  try { const s = localStorage.getItem('albert-garmin-live'); if (s) liveGarmin = JSON.parse(s) } catch { /* ignore */ }
  let sport
  if (liveGarmin && (liveGarmin.lastWorkout || liveGarmin.steps != null)) {
    const g = liveGarmin
    const bb = g.bodyBattery, str = g.stress
    const head = [
      g.steps != null ? `Шаги сегодня ${g.steps}` : null,
      g.restingHr != null ? `пульс покоя ${g.restingHr}` : null,
      g.vo2Max != null ? `VO2max ${g.vo2Max}` : null,
      bb?.current != null ? `Body Battery (заряд тела) сейчас ${bb.current}/100${bb.charged != null ? `, заряжено +${bb.charged}` : ''}${bb.drained != null ? `, потрачено −${bb.drained}` : ''}` : null,
      str && (str.current ?? str.avg) != null ? `Стресс ${str.current ?? str.avg}/100${str.avg != null ? ` (средний ${str.avg})` : ''}` : null,
      g.weekKm != null ? `за 7 дней ${g.weekKm} км (${g.weekCount} тренировок)` : null
    ].filter(Boolean).join(', ')
    const bbNote = bb?.current != null
      ? ' Body Battery — это ОСТАВШАЯСЯ энергия на день: заряжается во сне/отдыхе, тратится активностью и стрессом, меняется в течение дня. Это НЕ утренний балл и не «с чем проснулся» (в отличие от восстановления Whoop). Низкий Body Battery вечером — это нормально (израсходовал за день).'
      : ''
    const list = (g.workouts || []).slice(0, 8).map(w => {
      const parts = [
        w.distanceKm != null ? `${w.distanceKm} км` : null,
        w.durationMin != null ? `${w.durationMin} мин` : null,
        w.pace ? `темп ${w.pace}/км` : (w.speedKmh != null ? `${w.speedKmh} км/ч` : null),
        w.avgHr != null ? `ср.пульс ${w.avgHr}` : null,
        w.elevationGain != null ? `набор ${w.elevationGain} м` : null,
        w.calories != null ? `${w.calories} ккал` : null,
        w.trainingEffect != null ? `эффект ${w.trainingEffect}${w.trainingLabel ? ' ' + w.trainingLabel : ''}` : null
      ].filter(Boolean).join(', ')
      return `${w.date} «${w.title}» (${w.label}): ${parts}`
    }).join('\n')
    sport = `${head}.${bbNote}\nПоследние тренировки:\n${list}\nЭто реальные данные Garmin. Опирайся только на них, ничего не добавляй от себя.`
  } else {
    sport = 'Garmin не подключён. Данных о тренировках, шагах, VO2max и форме НЕТ. Не придумывай их — если спросят, скажи, что нужно подключить Garmin.'
  }

  // Whoop — только реальные данные (если подключён), иначе честно «нет данных»
  let liveWhoop = null
  try { const s = localStorage.getItem('albert-whoop-live'); if (s) liveWhoop = JSON.parse(s) } catch { /* ignore */ }
  const w = liveWhoop ? { ...WHOOP, ...liveWhoop, sleep: { ...WHOOP.sleep, ...liveWhoop.sleep } } : null
  // Неделя по дням: восстановление (балл готовности) и нагрузка (strain) — РАЗНЫЕ показатели, явно разделяем
  const weekDays = w ? (Array.isArray(liveWhoop?.week) && liveWhoop.week.length ? liveWhoop.week : WHOOP_DAYS) : []
  const weekBlock = weekDays.length
    ? `НЕДЕЛЯ ПО ДНЯМ (два РАЗНЫХ показателя, не путай их):\n` +
      `• Восстановление по дням (% готовности, выше — лучше): ${weekDays.map(d => `${d.day} ${d.recovery}%`).join(', ')}.\n` +
      `• Нагрузка (strain) по дням (шкала 0–21, это НЕ восстановление, а сколько владелец нагрузился): ${weekDays.map(d => `${d.day} ${d.strain}`).join(', ')}.\n` +
      `Когда говоришь о дне недели — бери восстановление из строки восстановления, а нагрузку из строки нагрузки. НЕ называй число нагрузки восстановлением и наоборот.`
    : ''
  const health = w
    ? `Восстановление ${w.recovery}% (${recoveryLabel(w.recovery)}), дневная нагрузка ${w.strain}/21, HRV ${w.hrv} мс, пульс покоя ${w.rhr}, дыхание ${w.respiratoryRate}/мин, SpO2 ${w.spo2}%. ` +
      `Сон ${w.sleep.hoursSlept} ч из ${w.sleep.hoursNeeded} нужных (${w.sleep.performance}%). ` +
      `ВАЖНО: «Восстановление» — это УТРЕННИЙ балл готовности Whoop, с ним владелец проснулся; он фиксирован на день и НЕ убывает в течение дня. ` +
      `Это НЕ «остаток заряда»: не трактуй его как энергию, которая тратится по ходу дня (это был бы Body Battery, а его в данных нет). ` +
      `«Нагрузка» (strain) — это СКОЛЬКО владелец нагрузился за день (0–21), противоположный по смыслу показатель: высокая нагрузка ≠ хорошее восстановление.` +
      (weekBlock ? `\n${weekBlock}` : '')
    : 'Whoop не подключён. Данных о восстановлении, сне, HRV и пульсе НЕТ. Не придумывай их — если спросят, скажи, что нужно подключить Whoop.'

  const { flagged, hasData } = labsFlagged()
  const labs = !hasData
    ? 'Анализы крови пока не загружены (подключите Яндекс.Диск с файлами). Не придумывай показатели.'
    : flagged.length ? `Вне нормы: ${flagged.join('; ')}. Остальные показатели в норме.` : 'все показатели в норме.'

  // Питание — цель КБЖУ из профиля + наличие меню недели
  let nutrition
  try {
    const profile = loadProfile()
    const tgt = computeTarget(profile)
    const goalLabel = (GOALS.find(g => g.key === profile.goal) || {}).label || profile.goal
    let hasPlan = false
    try { const s = localStorage.getItem('albert-meal-plan'); const o = s ? JSON.parse(s) : null; hasPlan = !!(o && Object.keys(o).length) } catch { /* ignore */ }
    nutrition = `Цель: ${goalLabel}. Норма ~${tgt.kcal} ккал/день (белок ${tgt.protein} г, жиры ${tgt.fat} г, углеводы ${tgt.carb} г). Профиль: ${profile.weight} кг, ${profile.height} см, ${profile.age} лет. В дни тренировок дневная цель растёт на реальный расход из Garmin. ${hasPlan ? 'Меню на неделю составлено.' : 'Меню недели пока не составлено.'}`
  } catch { nutrition = 'Данные питания недоступны.' }

  const recent = history.slice(0, 6).map(h => `${h.datetime} ${h.title}`).join('\n') || 'нет'
  const factsBlock = facts.length ? facts.map(f => `- ${f.text || f}`).join('\n') : 'пока ничего не запомнено'

  return `СЕГОДНЯ: ${today} (${weekday}), сейчас ${hhmm} по Москве

КАЛЕНДАРЬ (бери точные даты отсюда, не вычисляй в уме):
${calBlock}

РАСПИСАНИЕ — полный актуальный список ВСЕХ существующих событий. Это ЕДИНСТВЕННЫЙ источник истины о том, какие события есть и когда. Если события здесь нет — значит, его не существует:
${sched}

СПОРТ (Garmin):
${sport}

ЗДОРОВЬЕ (Whoop):
${health}

АНАЛИЗЫ КРОВИ (последние значения):
${labs}

ПИТАНИЕ (цель КБЖУ и меню):
${nutrition}

ПАМЯТЬ О ВЛАДЕЛЬЦЕ (важные факты и предпочтения):
${factsBlock}

ЖУРНАЛ ДЕЙСТВИЙ — история того, что делалось раньше. Это НЕ текущее расписание: упомянутые тут события могли быть позже изменены или удалены. НЕ считай событие существующим только потому, что оно есть в журнале — проверяй по РАСПИСАНИЮ:
${recent}`
}
