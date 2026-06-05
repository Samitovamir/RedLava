// Единый «снимок» всего сайта для ИИ: расписание + спорт + здоровье + анализы +
// память о владельце + недавние действия. Любое окно ассистента может опираться на него,
// чтобы давать связные ответы по всем данным сразу.

import { WORKOUTS, WORKOUT_TYPES, WEEK_STATS, GARMIN } from './workouts.js'
import { WHOOP, recoveryLabel } from './whoop.js'
import { INITIAL_REPORTS, buildHistory, markerStatus, STATUS_INFO, rangeText, resolveMarker } from './labs.js'
import { mskNow } from './time.js'

const PRIO = { 1: 'неотложный', 2: 'важный', 3: 'обычный' }
const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']

function labsFlagged() {
  let reports = INITIAL_REPORTS
  try { const s = localStorage.getItem('albert-labs'); if (s) reports = JSON.parse(s) } catch { /* ignore */ }
  const hist = buildHistory(reports)
  // Норму берём из документа, справочник дополняет (группы/единицы/нормы).
  const flagged = []
  Object.entries(hist).forEach(([name, h]) => {
    const last = h[h.length - 1]
    const def = resolveMarker(name, last)
    const st = markerStatus(last.value, def.min, def.max)
    if (st === 'low' || st === 'high') {
      flagged.push(`${def.name} ${last.value} ${def.unit || ''} (норма ${rangeText(def.min, def.max)}, ${STATUS_INFO[st].label})`)
    }
  })
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
    const head = [
      g.steps != null ? `Шаги сегодня ${g.steps}` : null,
      g.restingHr != null ? `пульс покоя ${g.restingHr}` : null,
      g.vo2Max != null ? `VO2max ${g.vo2Max}` : null,
      g.weekKm != null ? `за 7 дней ${g.weekKm} км (${g.weekCount} тренировок)` : null
    ].filter(Boolean).join(', ')
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
    sport = `${head}.\nПоследние тренировки:\n${list}\nЭто реальные данные Garmin. Опирайся только на них, ничего не добавляй от себя.`
  } else {
    sport = 'Garmin не подключён. Данных о тренировках, шагах, VO2max и форме НЕТ. Не придумывай их — если спросят, скажи, что нужно подключить Garmin.'
  }

  // Whoop — только реальные данные (если подключён), иначе честно «нет данных»
  let liveWhoop = null
  try { const s = localStorage.getItem('albert-whoop-live'); if (s) liveWhoop = JSON.parse(s) } catch { /* ignore */ }
  const w = liveWhoop ? { ...WHOOP, ...liveWhoop, sleep: { ...WHOOP.sleep, ...liveWhoop.sleep } } : null
  const health = w
    ? `Восстановление ${w.recovery}% (${recoveryLabel(w.recovery)}), дневная нагрузка ${w.strain}/21, HRV ${w.hrv} мс, пульс покоя ${w.rhr}, дыхание ${w.respiratoryRate}/мин, SpO2 ${w.spo2}%. ` +
      `Сон ${w.sleep.hoursSlept} ч из ${w.sleep.hoursNeeded} нужных (${w.sleep.performance}%).`
    : 'Whoop не подключён. Данных о восстановлении, сне, HRV и пульсе НЕТ. Не придумывай их — если спросят, скажи, что нужно подключить Whoop.'

  const { flagged, hasData } = labsFlagged()
  const labs = !hasData
    ? 'Анализы крови пока не загружены (подключите Яндекс.Диск с файлами). Не придумывай показатели.'
    : flagged.length ? `Вне нормы: ${flagged.join('; ')}. Остальные показатели в норме.` : 'все показатели в норме.'

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

ПАМЯТЬ О ВЛАДЕЛЬЦЕ (важные факты и предпочтения):
${factsBlock}

ЖУРНАЛ ДЕЙСТВИЙ — история того, что делалось раньше. Это НЕ текущее расписание: упомянутые тут события могли быть позже изменены или удалены. НЕ считай событие существующим только потому, что оно есть в журнале — проверяй по РАСПИСАНИЮ:
${recent}`
}
