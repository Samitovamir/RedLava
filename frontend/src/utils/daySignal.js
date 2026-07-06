// Верхний hero-сигнал «СТАТУС» на Главной: заголовок-вывод + короткий разбор по доменам
// (стресс / впереди / спорт / анализы / питание) + строка обобщённого совета, плюс
// цветная рамка-оценка (ok / warn / crit). Контент генерит ИИ — потому что ПОРОГИ режимов
// берутся из ЛИЧНОЙ НОРМЫ владельца (долгая память), а не из общих мед. таблиц.
//
// Снимок стабилен в пределах ФАЗЫ дня (утро/день/вечер) и до появления новой тренировки —
// БЕЗ минутных величин (точное время, Body Battery), чтобы кэш hero не сбрасывался каждую
// минуту, но окно при этом «живёт» по ходу дня (утром одно, после тренировки другое).

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

// Фаза дня — для адаптации текста и для КЭША (без точной минуты).
function dayPhase(now) {
  const h = now.getHours()
  if (h < 11) return 'утро'
  if (h < 17) return 'день'
  return 'вечер'
}

// Стабильный в пределах фазы дня «снимок» для сигнала: дата + фаза + восстановление/сон +
// недельный тренд + АКТУАЛЬНЫЙ стресс + последняя тренировка + анализы + питание + память.
export function buildSignalData({ events = [], facts = [] } = {}) {
  const now = mskNow()
  const today = todayIso(now)
  const phase = dayPhase(now)
  const whoop = readWhoop()
  const garmin = readGarmin()

  const lines = [`Дата: ${today}. Фаза дня: ${phase}.`]

  // Здоровье: восстановление/сон + недельный тренд
  if (whoop) {
    lines.push(`Восстановление сегодня ${whoop.recovery}% (утренний балл готовности). Нагрузка ${whoop.strain}/21. Сон ${whoop.sleep?.hoursSlept} ч (${whoop.sleep?.performance}% от нормы сна).`)
    const week = Array.isArray(whoop.week) && whoop.week.length ? whoop.week : WHOOP_DAYS
    if (week?.length) {
      lines.push(`Восстановление по дням недели (тренд, выше — лучше): ${week.map(d => `${d.day} ${d.recovery}%`).join(', ')}.`)
    }
  } else {
    lines.push('Данных Whoop нет (восстановление/сон неизвестны).')
  }

  // Стресс — недавний (среднее за последний час, обновляется при синке часов)
  const stress = garmin?.stress
  if (stress && (stress.recent ?? stress.current ?? stress.avg) != null) {
    lines.push(`Стресс (Garmin) ${stress.recent ?? stress.current ?? stress.avg}/100 за последний час.`)
  }

  // Спорт: последняя тренировка (+ маркер «после тренировки» по дате/названию для кэша)
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

  // Расписание дня → «впереди»
  const todayEvents = events.filter(e => e.date === today)
  lines.push(todayEvents.length
    ? `Сегодня событий в расписании: ${todayEvents.length} (${todayEvents.map(e => `${e.start} ${e.title}`).slice(0, 6).join('; ')}).`
    : 'Сегодня расписание свободно (событий нет).')

  // Анализы: ключевые отклонения (тот же расчёт, что и в общем снимке сайта)
  try {
    const { flagged, hasData } = labsFlagged()
    if (!hasData) lines.push('Анализы крови пока не загружены.')
    else lines.push(flagged.length ? `Анализы вне нормы: ${flagged.join('; ')}.` : 'Анализы крови в норме.')
  } catch { /* ignore */ }

  // Питание: цель + СКОЛЬКО УЖЕ СЪЕДЕНО сегодня и сколько осталось — чтобы статус знал ФАКТ,
  // а не только цель, и советовал с учётом остатка. «Съедено» меняет снимок → статус
  // перегенерируется при каждом новом логе еды.
  try { lines.push(`Питание: ${nutritionTodayLine()}`) } catch { /* ignore */ }

  lines.push(`Личная память о норме и привычках владельца:\n${facts.length ? facts.map(f => `- ${f.text || f}`).join('\n') : 'пока ничего не запомнено'}`)

  return lines.join('\n')
}

// Системный промпт «Статуса». Кодирует формат (статус-токен → заголовок → строки по доменам →
// совет), 4 режима, правила (личная норма, редкий crit, тон-информатор, решение за владельцем,
// адаптация под фазу дня).
export const SIGNAL_CONTEXT =
  'Ты формируешь верхний баннер «СТАТУС» на личном дашборде владельца (пожилой человек, опытный триатлет). ' +
  'Это спокойный человеческий разбор сегодняшнего дня по ВСЕМ его данным сразу, с практичным советом. Не диагноз и не команда.\n' +
  'ФОРМАТ ОТВЕТА — строго так, КАЖДЫЙ пункт с новой строки, без markdown, без кавычек, без лишних строк:\n' +
  'СТАТУС: <ok|warn|crit>\n' +
  'Заголовок: <короткий вывод 3–6 слов, без точки>\n' +
  'Стресс: <недавний стресс/100 + короткая словесная оценка>\n' +
  'Впереди: <ближайшие события дня кратко, либо «свободно»>\n' +
  'Спорт: <последняя тренировка кратко · восстановление %>\n' +
  'Здоровье: <сопоставь восстановление и текущую нагрузку в одной мысли (есть запас / баланс / перегруз); если есть отклонение в анализах — добавь его коротко>\n' +
  'Питание: <если сегодня уже что-то съедено — назови съедено/осталось ккал и чего не хватает (белок), и что разумно съесть в оставшихся приёмах; если ещё ничего не залогировано — цель и акцент дня>\n' +
  'Совет: <1–2 предложения обобщённого совета, связывающего ВСЕ данные воедино (сон / ужин / нагрузка), решение оставляешь владельцу>\n\n' +
  'СТАТУС-ТОКЕН (цвет рамки, согласован с заголовком): ok — всё хорошо или есть запас; warn — «на грани» (низковатое восстановление / высокий стресс / очень плотный день, но не кризис); crit — РЕДКО, только когда и данные, и личная норма реально на пределе.\n' +
  'РЕЖИМЫ (выбери по данным И личной норме): РЕЖИМ 1 «всё хорошо» → ok. РЕЖИМ 2 «есть запас, тело тянет ещё» → ok. РЕЖИМ «на грани» → warn. РЕЖИМ 3 «данные и норма на пределе» (РЕДКО) → crit. Не повторяй один заголовок изо дня в день — варьируй.\n' +
  'ВАЖНЫЕ ПРАВИЛА:\n' +
  '1) Пороги бери из ЛИЧНОЙ НОРМЫ владельца (из памяти ниже), а НЕ из общих мед. таблиц. Если для него такое восстановление/стресс — рутина, это НЕ warn/crit.\n' +
  '2) crit — редкий; если злоупотреблять, обесценится.\n' +
  '3) Тон — информатор, не командир: «вот что показывают данные». Финал отдаёт решение владельцу («на твоё усмотрение», «решай сам»). Это уважение к тому, что он знает своё тело.\n' +
  '4) Адаптируй текст под ФАЗУ ДНЯ из данных: утро — готовность и план на день; день — как идёт день и что осталось; вечер — итог дня, сон, завтра. Если последняя тренировка только что (сегодня) — отметь её и восстановление/дозаправку.\n' +
  '5) Опирайся ТОЛЬКО на данные ниже, ничего не выдумывай. Если данных мало — спокойный нейтральный статус ok.'

// Разобрать ответ ИИ в { status, headline, rows, advice, note }.
// note — для обратной совместимости (старые места, что ждут заголовок+подпись).
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
    // строка без распознанного ярлыка: первая → заголовок, дальше → совет
    if (!headline) headline = line.replace(/^[«"]|[»"]$/g, '')
    else advice = advice ? `${advice} ${line}` : line
  }
  if (!status || !['ok', 'warn', 'crit'].includes(status)) {
    status = (status || '').includes('crit') ? 'crit' : (status || '').includes('warn') ? 'warn' : 'ok'
  }
  const note = advice || (rows[0] ? `${rows[0].label}: ${rows[0].value}` : '')
  return { status, headline, rows, advice, note }
}

// Простой фолбэк без ИИ: статус и разбор детерминированно по восстановлению/стрессу.
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
