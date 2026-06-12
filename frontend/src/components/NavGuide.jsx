import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Compass, Home, CalendarDays, HeartPulse, UtensilsCrossed, CheckSquare, Check,
  ChevronLeft, ChevronRight, X,
} from 'lucide-react'
import { useLang } from '../context/LanguageContext.jsx'
import { SPRING, EASE, Z } from '../motion.js'

/*
  Гайд по навигации — приветственный обзор разделов. Показывается ОДИН РАЗ на устройстве
  (флаг в localStorage), знакомит с тем, что где находится, и зеркалит реальную навигацию
  (те же иконки/названия, что в FluidMenu). Это информационный оверлей, а не спотлайт по DOM:
  устойчив к перестройке меню и ничего не открывает сам (не лезет в полусобранные разделы).
  Повторно открыть для проверки: добавить ?tour=1 к адресу (флаг при этом не трогаем).
*/

const FLAG = 'albert-navguide-v1'

// Шаги: приветствие → разделы (как в меню) → финал. Иконки общие для RU/EN.
const STEPS = [
  {
    key: 'welcome', Ico: Compass, solid: true,
    ru: { title: 'Добро пожаловать', text: 'Это личный дашборд владельца. За минуту покажу, что где находится — потом меню всегда под рукой.' },
    en: { title: 'Welcome', text: 'This is the owner’s personal dashboard. A quick minute on what’s where — then the menu is always at hand.' },
  },
  {
    key: 'home', Ico: Home,
    ru: { title: 'Главная', text: 'Сводка дня: ближайшие события, спорт, восстановление и советы ИИ — всё на одном экране.' },
    en: { title: 'Home', text: 'Your day at a glance: upcoming events, training, recovery and AI tips — all on one screen.' },
  },
  {
    key: 'schedule', Ico: CalendarDays,
    ru: { title: 'Расписание', text: 'Календарь и план дня. ИИ создаёт и переносит события, готовит письма за тебя.' },
    en: { title: 'Schedule', text: 'Calendar and daily plan. AI creates and reschedules events and drafts emails for you.' },
  },
  {
    key: 'health', Ico: HeartPulse,
    ru: { title: 'Здоровье', text: 'Анализы, восстановление (Whoop) и тренировки (Garmin) — с персональными выводами по твоим данным.' },
    en: { title: 'Health', text: 'Lab results, recovery (Whoop) and workouts (Garmin) — with insights personalized to your data.' },
  },
  {
    key: 'nutrition', Ico: UtensilsCrossed,
    ru: { title: 'Питание', text: 'Фото-дневник еды: сфотографировал — ИИ посчитал КБЖУ. Плюс советник и подбор блюд под твой день.' },
    en: { title: 'Nutrition', text: 'Photo food diary: snap a meal and AI counts the macros. Plus an advisor and dish picks for your day.' },
  },
  {
    key: 'tasks', Ico: CheckSquare,
    ru: { title: 'Задачи', text: 'Поручения по дому и персоналу с быстрыми ссылками — чтобы ничего не терялось.' },
    en: { title: 'Tasks', text: 'Home and staff to-dos with quick links — so nothing slips through the cracks.' },
  },
  {
    key: 'done', Ico: Check, solid: true,
    ru: { title: 'Готово', text: 'Меню всегда под рукой: слева на компьютере, снизу на телефоне. Гайд показывается один раз — приятной работы!' },
    en: { title: 'All set', text: 'The menu is always at hand: left on desktop, bottom on phone. This guide shows once — enjoy!' },
  },
]

export default function NavGuide() {
  const { lang } = useLang()
  const T = (o) => (lang === 'en' ? o.en : o.ru)
  const [open, setOpen] = useState(false)
  const [i, setI] = useState(0)

  // Решаем при монтировании: ?tour=1 форсирует показ (для проверки), иначе — только если ещё не видели.
  useEffect(() => {
    let force = false, seen = false
    try { force = new URLSearchParams(window.location.search).has('tour') } catch { /* ignore */ }
    try { seen = localStorage.getItem(FLAG) === '1' } catch { /* ignore */ }
    if (force || !seen) setOpen(true)
  }, [])

  const finish = useCallback(() => {
    try { localStorage.setItem(FLAG, '1') } catch { /* ignore */ }
    setOpen(false)
  }, [])

  const last = i === STEPS.length - 1
  const next = useCallback(() => (last ? finish() : setI(v => v + 1)), [last, finish])
  const back = useCallback(() => setI(v => Math.max(0, v - 1)), [])

  // Клавиатура: ← / → листают, Esc — закрыть
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') finish()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, next, back, finish])

  if (!open) return null
  const step = STEPS[i]
  const tt = lang === 'en'
    ? { skip: 'Skip', back: 'Back', next: 'Next', done: 'Got it', step: `${i + 1} of ${STEPS.length}` }
    : { skip: 'Пропустить', back: 'Назад', next: 'Далее', done: 'Понятно', step: `${i + 1} из ${STEPS.length}` }

  return createPortal(
    <motion.div
      className="ng-scrim"
      style={{ zIndex: Z.top }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: EASE }}
    >
      <motion.div
        className="ng-panel"
        role="dialog" aria-modal="true" aria-label={T(step).title}
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={SPRING.soft}
        onClick={e => e.stopPropagation()}
      >
        <button className="ng-close" onClick={finish} aria-label={tt.skip}><X size={18} strokeWidth={1.8} /></button>

        <div className="ng-body">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step.key}
              className="ng-step"
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -18 }}
              transition={{ duration: 0.22, ease: EASE }}
            >
              <span className={`ng-icon ${step.solid ? 'solid' : ''}`}>
                <step.Ico size={28} strokeWidth={1.7} />
              </span>
              <h3 className="ng-title">{T(step).title}</h3>
              <p className="ng-text">{T(step).text}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="ng-dots" aria-hidden="true">
          {STEPS.map((s, idx) => (
            <span key={s.key} className={`ng-dot ${idx === i ? 'on' : ''} ${idx < i ? 'past' : ''}`} />
          ))}
        </div>

        <div className="ng-actions">
          <button className="ng-skip" onClick={finish}>{tt.skip}</button>
          <span className="ng-count">{tt.step}</span>
          <div className="ng-nav">
            {i > 0 && (
              <button className="ng-btn ghost" onClick={back}><ChevronLeft size={16} strokeWidth={2} /> {tt.back}</button>
            )}
            <button className="ng-btn primary" onClick={next}>
              {last ? tt.done : tt.next}{!last && <ChevronRight size={16} strokeWidth={2} />}
            </button>
          </div>
        </div>
      </motion.div>

      <style>{`
        .ng-scrim {
          position: fixed; inset: 0;
          display: flex; align-items: center; justify-content: center;
          padding: 16px;
          background: rgba(0,0,0,0.62);
          -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
        }
        .ng-panel {
          position: relative;
          width: min(440px, 100%);
          background: linear-gradient(180deg, var(--bg-card-top, var(--bg-surface)), var(--bg-card-bot, var(--bg-surface)));
          border: 1px solid var(--border-soft);
          border-radius: var(--radius);
          box-shadow: var(--shadow-lift, 0 8px 28px rgba(0,0,0,0.4));
          padding: 30px 26px 20px;
        }
        .ng-close {
          position: absolute; top: 14px; right: 14px;
          width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
          border: none; border-radius: 10px; background: transparent;
          color: var(--text-muted); cursor: pointer;
        }
        .ng-close:hover { background: var(--bg-tile, var(--bg-surface)); color: var(--text-body); }

        .ng-body { min-height: 188px; display: flex; }
        .ng-step { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 14px; width: 100%; }
        .ng-icon {
          width: 64px; height: 64px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          border-radius: 18px;
          background: color-mix(in srgb, var(--accent) 14%, transparent);
          color: var(--accent);
        }
        .ng-icon.solid {
          background: linear-gradient(180deg, var(--accent-btn-top, var(--accent)), var(--accent-btn-bot, var(--accent)));
          color: var(--on-accent);
          box-shadow: inset 0 1.5px 0.5px rgba(255,255,255,0.18), var(--shadow-btn, 0 3px 6px rgba(0,0,0,0.3));
        }
        .ng-title { font-size: 21px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.015em; }
        .ng-text { font-size: 14.5px; line-height: 1.6; color: var(--text-secondary); max-width: 340px; }

        .ng-dots { display: flex; justify-content: center; gap: 7px; margin: 18px 0 16px; }
        .ng-dot {
          width: 7px; height: 7px; border-radius: 999px;
          background: var(--border-med); transition: all 0.2s var(--ease, ease);
        }
        .ng-dot.past { background: color-mix(in srgb, var(--accent) 55%, transparent); }
        .ng-dot.on { width: 22px; background: var(--accent); }

        .ng-actions { display: flex; align-items: center; gap: 12px; }
        .ng-skip {
          border: none; background: none; cursor: pointer; font-family: inherit;
          font-size: 13.5px; font-weight: 600; color: var(--text-muted); padding: 6px 2px;
        }
        .ng-skip:hover { color: var(--text-body); }
        .ng-count { font-size: 12px; color: var(--text-faint); margin-left: auto; font-variant-numeric: tabular-nums; }
        .ng-nav { display: flex; align-items: center; gap: 8px; }
        .ng-btn {
          display: inline-flex; align-items: center; gap: 5px;
          border-radius: 12px; padding: 9px 15px; cursor: pointer; font-family: inherit;
          font-size: 14px; font-weight: 700; border: 1px solid transparent;
        }
        .ng-btn.ghost { background: transparent; border-color: var(--border-med); color: var(--text-body); }
        .ng-btn.ghost:hover { background: var(--bg-tile, var(--bg-surface)); }
        .ng-btn.primary {
          background: linear-gradient(180deg, var(--accent-btn-top, var(--accent)), var(--accent-btn-bot, var(--accent)));
          color: var(--on-accent); border: none;
          box-shadow: inset 0 1.5px 0.5px rgba(255,255,255,0.22), var(--shadow-btn, 0 3px 6px rgba(0,0,0,0.3));
        }

        @media (max-width: 640px) {
          .ng-panel { padding: 28px 20px 18px; }
          .ng-title { font-size: 19px; }
          .ng-count { display: none; }
          .ng-actions { gap: 8px; }
        }
      `}</style>
    </motion.div>,
    document.body
  )
}
