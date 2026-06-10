import { useState } from 'react'
import { motion } from 'framer-motion'
import { mskDateKey } from '../utils/time.js'
import { useLang } from '../context/LanguageContext.jsx'
import { categoryColor, categoryTint } from '../utils/categoryColor.js'

/*
  Модалка добавления события.
  Поля: тип, название, время начала/конца, контакт.
  onAdd(event) — передаёт новое событие наверх, onClose — закрывает.
  AI-парсинг текста ("завтра в 15:00 встреча") — заглушка на будущее.
*/

const TYPES = [
  { value: 'call', label: 'Звонок', labelEn: 'Call', color: 'var(--cat-event-call)' },
  { value: 'calendar', label: 'Событие', labelEn: 'Event', color: 'var(--cat-event-calendar)' },
  { value: 'email', label: 'Письмо', labelEn: 'Email', color: 'var(--cat-event-email)' },
  { value: 'meeting', label: 'Встреча', labelEn: 'Meeting', color: 'var(--cat-event-meeting)' }
]

// Варианты повторения (как в Google Calendar)
const REPEATS = [
  { value: 'none', label: 'Не повторяется', labelEn: 'Does not repeat' },
  { value: 'daily', label: 'Каждый день', labelEn: 'Every day' },
  { value: 'weekdays', label: 'По будням (Пн–Пт)', labelEn: 'On weekdays (Mon–Fri)' },
  { value: 'weekly', label: 'Каждую неделю', labelEn: 'Every week' },
  { value: 'monthly', label: 'Каждый месяц', labelEn: 'Every month' },
  { value: 'yearly', label: 'Каждый год', labelEn: 'Every year' },
  { value: 'custom', label: 'По дням (выбрать)', labelEn: 'On days (choose)' }
]

const WEEKDAYS = [
  { value: 1, short: 'Пн', shortEn: 'Mon' },
  { value: 2, short: 'Вт', shortEn: 'Tue' },
  { value: 3, short: 'Ср', shortEn: 'Wed' },
  { value: 4, short: 'Чт', shortEn: 'Thu' },
  { value: 5, short: 'Пт', shortEn: 'Fri' },
  { value: 6, short: 'Сб', shortEn: 'Sat' },
  { value: 0, short: 'Вс', shortEn: 'Sun' }
]

export const REPEAT_LABELS = Object.fromEntries(REPEATS.map(r => [r.value, r.label]))
export const REPEAT_LABELS_EN = Object.fromEntries(REPEATS.map(r => [r.value, r.labelEn]))

// Приоритеты: 1 — самый важный (неотложный).
// Цвет — токен темы --cat-pri-*, в рендере categoryColor(p.colorKey).
export const PRIORITIES = [
  { value: 1, label: 'Неотложный', labelEn: 'Urgent', colorKey: 'pri-1' },
  { value: 2, label: 'Важный', labelEn: 'Important', colorKey: 'pri-2' },
  { value: 3, label: 'Обычный', labelEn: 'Normal', colorKey: 'pri-3' }
]
export const PRIORITY_MAP = Object.fromEntries(PRIORITIES.map(p => [p.value, p]))

// Человекочитаемая подпись повторения (для отображения в событии)
export function repeatLabel(repeat, customDays, lang = 'ru') {
  const labels = lang === 'en' ? REPEAT_LABELS_EN : REPEAT_LABELS
  if (!repeat || repeat === 'none') return ''
  if (repeat === 'custom') {
    if (!customDays?.length) return lang === 'en' ? 'On days' : 'По дням'
    const order = [1, 2, 3, 4, 5, 6, 0]
    const map = lang === 'en'
      ? { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' }
      : { 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 0: 'Вс' }
    return order.filter(d => customDays.includes(d)).map(d => map[d]).join(', ')
  }
  return labels[repeat] || ''
}

export default function AddEventModal({ onAdd, onClose, initial, defaultDate, defaultStart, defaultEnd }) {
  const { lang } = useLang()
  const t = useT({
    ru: {
      editTitle: 'Редактировать событие',
      newTitle: 'Новое событие',
      name: 'Название',
      namePlaceholder: 'Например, Звонок с командой',
      date: 'Дата',
      start: 'Начало',
      end: 'Конец',
      timeError: 'Время указано неправильно: конец должен быть позже начала',
      contact: 'Контакт',
      contactPlaceholder: 'Имя или «Личное»',
      priority: 'Приоритет',
      whatIsThis: 'Что это?',
      priHelp1: 'Приоритет определяет, чем можно пожертвовать. При поиске свободного времени ИИ предлагает подвинуть события с низким приоритетом, а ',
      priHelpUrgent: 'неотложные',
      priHelp2: ' (1) не трогает. Если не выбрать — будет «Обычный».',
      repeat: 'Повторение',
      addRepeat: 'Добавить повторение',
      done: 'Готово',
      save: 'Сохранить',
      add: 'Добавить',
      cancel: 'Отмена'
    },
    en: {
      editTitle: 'Edit event',
      newTitle: 'New event',
      name: 'Title',
      namePlaceholder: 'E.g. Call with the team',
      date: 'Date',
      start: 'Start',
      end: 'End',
      timeError: 'Invalid time: the end must be later than the start',
      contact: 'Contact',
      contactPlaceholder: 'Name or “Personal”',
      priority: 'Priority',
      whatIsThis: 'What is this?',
      priHelp1: 'Priority defines what can be sacrificed. When looking for free time, the AI suggests moving low-priority events and leaves ',
      priHelpUrgent: 'urgent',
      priHelp2: ' (1) ones untouched. If you don’t choose one, it defaults to “Normal”.',
      repeat: 'Repeat',
      addRepeat: 'Add repeat',
      done: 'Done',
      save: 'Save',
      add: 'Add',
      cancel: 'Cancel'
    }
  })
  const personalName = lang === 'en' ? 'Personal' : 'Личное'
  const isEdit = !!initial
  const [type, setType] = useState(initial?.type || 'call')
  const [title, setTitle] = useState(initial?.title || '')
  const [date, setDate] = useState(initial?.date || defaultDate || mskDateKey())
  const [start, setStart] = useState(initial?.start || defaultStart || '12:00')
  const [end, setEnd] = useState(initial?.end || defaultEnd || '12:30')
  const [who, setWho] = useState(initial?.who && initial.who !== 'Личное' ? initial.who : '')
  const [repeat, setRepeat] = useState(initial?.repeat || 'none')
  const [customDays, setCustomDays] = useState(initial?.customDays || [])
  const [repeatOpen, setRepeatOpen] = useState(false)
  const [priority, setPriority] = useState(initial?.priority || null) // не обязателен; по умолчанию «Обычный»
  const [showPriHelp, setShowPriHelp] = useState(false)

  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  const toStr = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  const invalidTime = toMin(end) <= toMin(start) // конец должен быть позже начала

  // При выборе начала — конец автоматически +1 час (можно потом исправить)
  function changeStart(v) {
    setStart(v)
    setEnd(toStr(Math.min(toMin(v) + 60, 23 * 60 + 59)))
  }

  function toggleDay(d) {
    setCustomDays(days => days.includes(d) ? days.filter(x => x !== d) : [...days, d])
  }

  function submit() {
    if (!title.trim() || invalidTime) return
    onAdd({ type, title: title.trim(), date, start, end, who: who.trim() || 'Личное', repeat, customDays, priority: priority || 3 })
    onClose()
  }

  return (
    <div className="aem-backdrop" onClick={onClose}>
      <motion.div
        className="aem-modal card"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div className="aem-head">
          <h3>{isEdit ? t.editTitle : t.newTitle}</h3>
          <button className="aem-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="aem-types">
          {TYPES.map(t => (
            <button
              key={t.value}
              className={`aem-type ${type === t.value ? 'active' : ''}`}
              style={type === t.value ? { borderColor: t.color, color: t.color } : {}}
              onClick={() => setType(t.value)}
            >
              <span className="aem-type-dot" style={{ background: t.color }} />
              {lang === 'en' ? t.labelEn : t.label}
            </button>
          ))}
        </div>

        <label className="aem-field">
          <span>{t.name}</span>
          <input
            className="aem-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.namePlaceholder}
            autoFocus
          />
        </label>

        <label className="aem-field">
          <span>{t.date}</span>
          <input className="aem-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <div className="aem-row">
          <label className="aem-field">
            <span>{t.start}</span>
            <input className="aem-input" type="time" value={start} onChange={(e) => changeStart(e.target.value)} />
          </label>
          <label className="aem-field">
            <span>{t.end}</span>
            <input className={`aem-input ${invalidTime ? 'error' : ''}`} type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        {invalidTime && (
          <div className="aem-time-error">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {t.timeError}
          </div>
        )}

        <label className="aem-field">
          <span>{t.contact}</span>
          <input
            className="aem-input"
            value={who}
            onChange={(e) => setWho(e.target.value)}
            placeholder={t.contactPlaceholder}
          />
        </label>

        {/* Приоритет (обязательное поле) */}
        <div className="aem-field">
          <span className="aem-pri-label">
            {t.priority}
            <button className="aem-help" onClick={() => setShowPriHelp(v => !v)} title={t.whatIsThis}>?</button>
          </span>
          {showPriHelp && (
            <div className="aem-help-box">
              {t.priHelp1}<b>{t.priHelpUrgent}</b>{t.priHelp2}
            </div>
          )}
          <div className="aem-pri-row">
            {PRIORITIES.map(p => {
              const on = priority === p.value
              const c = categoryColor(p.colorKey)
              return (
                <button
                  key={p.value}
                  className={`aem-pri ${on ? 'active' : ''}`}
                  style={{
                    borderColor: on ? c : 'var(--border)',
                    color: on ? c : 'var(--muted-foreground)',
                    background: on ? categoryTint(p.colorKey, 0.12) : 'var(--bg-secondary)'
                  }}
                  onClick={() => setPriority(p.value)}
                >
                  <span className="aem-pri-dot" style={{ background: c }} />
                  {p.value} · {lang === 'en' ? p.labelEn : p.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Повторение (как в Google Calendar) */}
        <div className="aem-field">
          <span>{t.repeat}</span>
          {!repeatOpen ? (
            <button className="aem-repeat-toggle" onClick={() => setRepeatOpen(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
              {repeat === 'none' ? t.addRepeat : repeatLabel(repeat, customDays, lang)}
            </button>
          ) : (
            <div className="aem-repeat-list">
              {REPEATS.map(r => (
                <div key={r.value}>
                  <button
                    className={`aem-repeat-item ${repeat === r.value ? 'active' : ''}`}
                    onClick={() => {
                      setRepeat(r.value)
                      // для не-кастомных закрываем список, для custom оставляем для выбора дней
                      if (r.value !== 'custom') setRepeatOpen(false)
                    }}
                  >
                    <span className="aem-radio">{repeat === r.value && <span className="aem-radio-dot" />}</span>
                    {lang === 'en' ? r.labelEn : r.label}
                  </button>
                  {/* Выбор конкретных дней недели */}
                  {r.value === 'custom' && repeat === 'custom' && (
                    <div className="aem-weekdays">
                      {WEEKDAYS.map(d => (
                        <button
                          key={d.value}
                          className={`aem-weekday ${customDays.includes(d.value) ? 'active' : ''}`}
                          onClick={() => toggleDay(d.value)}
                        >
                          {lang === 'en' ? d.shortEn : d.short}
                        </button>
                      ))}
                      <button className="aem-weekdays-done" onClick={() => setRepeatOpen(false)} disabled={!customDays.length}>{t.done}</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="aem-actions">
          <button className="aem-btn primary" onClick={submit} disabled={!title.trim() || invalidTime}>{isEdit ? t.save : t.add}</button>
          <button className="aem-btn ghost" onClick={onClose}>{t.cancel}</button>
        </div>

        <style>{`
          .aem-backdrop {
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.5);
            backdrop-filter: blur(3px);
            z-index: 500;
            display: flex; align-items: center; justify-content: center;
            padding: 24px;
          }
          .aem-modal {
            width: 100%;
            max-width: 440px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            max-height: 88vh;
            overflow-y: auto;
          }
          .aem-head { display: flex; align-items: center; justify-content: space-between; }
          .aem-head h3 { font-size: 18px; font-weight: 700; color: var(--foreground); }
          .aem-close {
            border: none; background: transparent;
            color: var(--muted-foreground);
            cursor: pointer; padding: 4px; border-radius: 8px;
            display: flex; transition: all 0.15s;
          }
          .aem-close:hover { background: var(--bg-secondary); color: var(--foreground); }
          .aem-types { display: flex; gap: 8px; flex-wrap: wrap; }
          .aem-type {
            display: flex; align-items: center; gap: 7px;
            padding: 7px 13px;
            border: 1px solid var(--border);
            background: var(--bg-secondary);
            color: var(--muted-foreground);
            border-radius: 10px;
            font-family: inherit; font-size: 13px; font-weight: 500;
            cursor: pointer; transition: all 0.15s;
          }
          .aem-type-dot { width: 8px; height: 8px; border-radius: 50%; }
          .aem-field { display: flex; flex-direction: column; gap: 6px; flex: 1; }
          .aem-field > span {
            font-size: 12px; font-weight: 600;
            color: var(--muted-foreground);
            text-transform: uppercase; letter-spacing: 0.05em;
          }
          .aem-input {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 11px 14px;
            font-family: inherit; font-size: 14px;
            color: var(--foreground);
            outline: none; transition: border-color 0.2s;
            color-scheme: dark;
          }
          .aem-input:focus { border-color: var(--border-hover); }
          .aem-input::placeholder { color: var(--muted-foreground); }
          .aem-input.error { border-color: var(--red); }
          .aem-time-error {
            display: flex; align-items: center; gap: 7px;
            font-size: 12.5px; color: var(--red);
            margin-top: -6px;
          }
          .aem-row { display: flex; gap: 12px; }

          .aem-pri-label { display: flex; align-items: center; gap: 8px; }
          .aem-help {
            width: 17px; height: 17px; border-radius: 50%;
            border: 1px solid var(--border); background: var(--bg-secondary);
            color: var(--muted-foreground); font-size: 11px; font-weight: 700;
            cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
            line-height: 1; padding: 0; transition: all 0.15s;
          }
          .aem-help:hover { color: var(--primary); border-color: var(--border-hover); }
          .aem-help-box {
            font-size: 12.5px; line-height: 1.55; color: var(--muted-foreground);
            background: var(--bg-secondary); border: 1px solid var(--border);
            border-radius: 10px; padding: 10px 12px;
          }
          .aem-help-box b { color: var(--foreground); }
          .aem-pri-row { display: flex; gap: 8px; }
          .aem-pri {
            flex: 1;
            display: flex; align-items: center; justify-content: center; gap: 7px;
            padding: 9px 8px;
            border: 1px solid var(--border); background: var(--bg-secondary);
            color: var(--muted-foreground);
            border-radius: 10px; cursor: pointer;
            font-family: inherit; font-size: 12.5px; font-weight: 600;
            transition: all 0.15s;
          }
          .aem-pri:hover { border-color: var(--border-hover); }
          .aem-pri-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

          .aem-repeat-toggle {
            display: flex; align-items: center; gap: 9px;
            padding: 11px 14px;
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 10px;
            color: var(--foreground);
            font-family: inherit; font-size: 14px; font-weight: 500;
            cursor: pointer; transition: border-color 0.2s;
          }
          .aem-repeat-toggle:hover { border-color: var(--border-hover); }
          .aem-repeat-toggle svg { color: var(--primary); }
          .aem-repeat-list {
            display: flex; flex-direction: column; gap: 2px;
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 6px;
          }
          .aem-repeat-item {
            display: flex; align-items: center; gap: 10px;
            text-align: left;
            padding: 9px 10px; border-radius: 8px;
            border: none; background: transparent;
            color: var(--foreground);
            font-family: inherit; font-size: 14px;
            cursor: pointer; transition: background 0.12s;
          }
          .aem-repeat-item:hover { background: rgba(255,255,255,0.05); }
          .aem-repeat-item.active { color: var(--primary); }
          .aem-radio {
            width: 16px; height: 16px; border-radius: 50%;
            border: 2px solid var(--muted-foreground);
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0;
          }
          .aem-repeat-item.active .aem-radio { border-color: var(--primary); }
          .aem-radio-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--primary); }

          .aem-weekdays {
            display: flex; flex-wrap: wrap; gap: 6px;
            padding: 8px 10px 10px 36px;
            align-items: center;
          }
          .aem-weekday {
            width: 38px; height: 38px;
            border-radius: 50%;
            border: 1px solid var(--border);
            background: var(--card);
            color: var(--muted-foreground);
            font-family: inherit; font-size: 13px; font-weight: 600;
            cursor: pointer; transition: all 0.15s;
          }
          .aem-weekday:hover { border-color: var(--border-hover); }
          .aem-weekday.active {
            background: var(--primary); color: var(--primary-foreground);
            border-color: var(--primary);
          }
          .aem-weekdays-done {
            margin-left: auto;
            padding: 8px 16px; border-radius: 9px;
            border: none; background: var(--bg-secondary);
            color: var(--primary); font-weight: 600;
            font-family: inherit; font-size: 13px; cursor: pointer;
            transition: opacity 0.15s;
          }
          .aem-weekdays-done:disabled { opacity: 0.4; cursor: default; }

          .aem-actions { display: flex; gap: 10px; margin-top: 4px; }
          .aem-btn {
            padding: 11px 22px; border-radius: 11px;
            font-family: inherit; font-size: 14px; font-weight: 600;
            cursor: pointer; transition: all 0.18s; border: 1px solid transparent;
          }
          .aem-btn.primary { background: var(--primary); color: var(--primary-foreground); }
          .aem-btn.primary:hover:not(:disabled) { opacity: 0.9; }
          .aem-btn.primary:disabled { opacity: 0.4; cursor: default; }
          .aem-btn.ghost { background: transparent; border-color: var(--border); color: var(--muted-foreground); }
          .aem-btn.ghost:hover { color: var(--foreground); border-color: var(--border-hover); }
        `}</style>
      </motion.div>
    </div>
  )
}
