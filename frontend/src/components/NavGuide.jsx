import { useState, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Compass, Home, CalendarDays, HeartPulse, UtensilsCrossed, CheckSquare, Check,
  ChevronLeft, ChevronRight, X,
} from 'lucide-react'
import { useLang } from '../context/LanguageContext.jsx'
import { SPRING, EASE, Z } from '../motion.js'

/*
  Гайд по навигации — СПОТЛАЙТ-тур: на каждом шаге подсвечивает реальный пункт меню
  («вот тут это находится») и показывает рядом подсказку с описанием раздела. Для Питания
  и Задач — развёрнутый разбор функционала. Показывается ОДИН РАЗ на устройстве (флаг в
  localStorage). Якорится к пунктам меню ПО ПОЛОЖЕНИЮ (без правок FluidMenu), а если меню
  не найдено (другая оболочка) — мягко падает в карточку по центру. Повтор для проверки: ?tour=1.

  Позиционирование подсказки — чисто CSS-якорное (без замера высоты): на мобиле тултип
  привязан НИЖНИМ краем над меню (растёт вверх — не вылезает за низ даже с буллетами),
  на десктопе — по вертикальному центру пункта. Так высота контента не ломает место.
*/

// Версия ключа: бампни (v2→v3…), чтобы показать гайд заново ВСЕМ на обычной загрузке —
// старый флаг перестаёт совпадать, и гайд снова открывается один раз у каждого (чистить браузер не нужно).
const FLAG = 'albert-navguide-v2'
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// target: 'nav' — всё меню; число — индекс пункта (Главная..Задачи); null — по центру без подсветки.
const STEPS = [
  {
    key: 'welcome', Ico: Compass, target: 'nav',
    ru: { title: 'Вот меню', text: 'Навигация всегда под рукой: слева на компьютере, снизу на телефоне. Пройдёмся по разделам — покажу, где что.' },
    en: { title: 'Here’s the menu', text: 'Navigation is always at hand: left on desktop, bottom on phone. Let’s walk the sections and show what’s where.' },
  },
  {
    key: 'home', Ico: Home, target: 0,
    ru: { title: 'Главная', text: 'Сводка дня: ближайшие события, спорт, восстановление и советы ИИ — всё на одном экране.' },
    en: { title: 'Home', text: 'Your day at a glance: upcoming events, training, recovery and AI tips — all on one screen.' },
  },
  {
    key: 'schedule', Ico: CalendarDays, target: 1,
    ru: { title: 'Расписание', text: 'Календарь и план дня. ИИ создаёт и переносит события, готовит письма за тебя.' },
    en: { title: 'Schedule', text: 'Calendar and daily plan. AI creates and reschedules events and drafts emails for you.' },
  },
  {
    key: 'health', Ico: HeartPulse, target: 2,
    ru: { title: 'Здоровье', text: 'Анализы, восстановление (Whoop) и тренировки (Garmin) — с персональными выводами по твоим данным.' },
    en: { title: 'Health', text: 'Lab results, recovery (Whoop) and workouts (Garmin) — with insights personalized to your data.' },
  },
  {
    key: 'nutrition', Ico: UtensilsCrossed, target: 3,
    ru: {
      title: 'Питание', text: 'Фото-дневник питания и умный подбор еды:',
      bullets: [
        'Сфотографировал блюдо — ИИ посчитал калории и БЖУ',
        'Кольцо дня: сколько съедено и сколько осталось до цели',
        'Советник — что съесть к ближайшему приёму по твоим данным',
        'Подбор блюд + штрих-код, скан этикетки, сохранённые',
      ],
    },
    en: {
      title: 'Nutrition', text: 'A photo food diary with smart meal picks:',
      bullets: [
        'Snap a meal — AI counts calories and macros',
        'Daily ring: how much you ate and what’s left to your goal',
        'Advisor — what to eat for the nearest meal, from your data',
        'Dish picks + barcode, label scan, saved meals',
      ],
    },
  },
  {
    key: 'tasks', Ico: CheckSquare, target: 4,
    ru: {
      title: 'Задачи', text: 'Доска задач по дому и помощники:',
      bullets: [
        'Вставь список из WhatsApp — ИИ разберёт на задачи',
        'У каждой задачи — исполнители и срок',
        'Помощник отмечает «Готово» по личной ссылке с PIN',
        'Прогресс и просрочки видно сразу, и на Главной тоже',
      ],
    },
    en: {
      title: 'Tasks', text: 'A house-tasks board with helpers:',
      bullets: [
        'Paste a WhatsApp list — AI splits it into tasks',
        'Each task has assignees and a due date',
        'Helpers tap “Done” via a personal PIN link',
        'Progress and overdue are visible at a glance, and on Home',
      ],
    },
  },
  {
    key: 'done', Ico: Check, target: null,
    ru: { title: 'Готово', text: 'Это всё. Меню всегда под рукой — загляни в любой раздел. Гайд показывается один раз.' },
    en: { title: 'All set', text: 'That’s it. The menu is always at hand — open any section. This guide shows once.' },
  },
]

function resolveTarget(step, isMobile) {
  if (step.target == null) return null
  const navSel = isMobile ? '.mobile-tabbar' : '.fluid-menu'
  if (step.target === 'nav') return document.querySelector(navSel)
  const items = document.querySelectorAll(
    isMobile ? '.mobile-tabbar .tab-item' : '.fluid-menu .fluid-menu-inner .nav-item'
  )
  return items[step.target] || null
}

// Якорь подсказки — без замера высоты: мобила привязана нижним краем над меню,
// десктоп — по вертикали к центру пункта; нет пункта → строго по центру экрана.
function computePos(rect, vw, vh, isMobile, width) {
  const M = 14, GAP = 14
  if (!rect) return { style: { left: vw / 2, top: vh / 2, transform: 'translate(-50%, -50%)' }, arrow: null }
  if (isMobile) {
    const left = (vw - width) / 2
    const bottom = vh - (rect.top - GAP)             // нижний край тултипа — на GAP выше меню
    const off = clamp(rect.left + rect.width / 2 - left, 24, width - 24)
    return { style: { left, bottom }, arrow: { side: 'bottom', off } }
  }
  let left = rect.left + rect.width + GAP
  let side = 'left'
  if (left + width > vw - M) { left = rect.left - GAP - width; side = 'right' }   // нет места справа → слева
  left = clamp(left, M, vw - width - M)
  const top = clamp(rect.top + rect.height / 2, 180, vh - 180)  // центр тултипа у центра пункта
  return { style: { left, top, transform: 'translateY(-50%)' }, arrow: { side } }
}

export default function NavGuide() {
  const { lang } = useLang()
  const T = (o) => (lang === 'en' ? o.en : o.ru)
  const [open, setOpen] = useState(false)
  const [i, setI] = useState(0)
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 640 : false))
  const [rect, setRect] = useState(null)

  // Показ: ?tour=1 форсирует (для проверки), иначе — только если ещё не видели на этом устройстве.
  useEffect(() => {
    let force = false, seen = false
    try { force = new URLSearchParams(window.location.search).has('tour') } catch { /* ignore */ }
    try { seen = localStorage.getItem(FLAG) === '1' } catch { /* ignore */ }
    if (force || !seen) setOpen(true)
  }, [])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Замер позиции подсвечиваемого пункта меню (повтор после кадра — меню могло домонтироваться).
  useLayoutEffect(() => {
    if (!open) return
    const measure = () => {
      const el = resolveTarget(STEPS[i], isMobile)
      if (!el) { setRect(null); return }
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    measure()
    const raf = requestAnimationFrame(measure)
    const tmr = setTimeout(measure, 140)
    window.addEventListener('resize', measure)
    return () => { cancelAnimationFrame(raf); clearTimeout(tmr); window.removeEventListener('resize', measure) }
  }, [open, i, isMobile])

  const finish = useCallback(() => {
    try { localStorage.setItem(FLAG, '1') } catch { /* ignore */ }
    setOpen(false)
  }, [])
  const last = i === STEPS.length - 1
  const next = useCallback(() => (last ? finish() : setI(v => v + 1)), [last, finish])
  const back = useCallback(() => setI(v => Math.max(0, v - 1)), [])

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
  const data = T(step)
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const width = isMobile ? Math.min(360, vw - 28) : 322
  const pos = computePos(rect, vw, vh, isMobile, width)
  const PAD = 7  // отступ выреза-подсветки вокруг пункта
  const tt = lang === 'en'
    ? { skip: 'Skip', back: 'Back', next: 'Next', done: 'Got it' }
    : { skip: 'Пропустить', back: 'Назад', next: 'Далее', done: 'Понятно' }

  return createPortal(
    <motion.div
      className={`ng-overlay ${rect ? 'spot' : 'center'}`}
      style={{ zIndex: Z.top }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: EASE }}
    >
      {/* Вырез-подсветка вокруг реального пункта меню */}
      {rect && (
        <motion.div
          className="ng-spot-box"
          initial={false}
          animate={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
          transition={SPRING.snappy}
        />
      )}

      {/* Подсказка — позиция через style (CSS-якорь, не ломается высотой контента) */}
      <div
        className="ng-tip"
        role="dialog" aria-modal="true" aria-label={data.title}
        style={{ width, ...pos.style }}
        onClick={(e) => e.stopPropagation()}
      >
        {pos.arrow && (
          <span className={`ng-arrow ${pos.arrow.side}`}
            style={pos.arrow.side === 'bottom' ? { left: pos.arrow.off } : { top: '50%' }} />
        )}
        <button className="ng-close" onClick={finish} aria-label={tt.skip}><X size={16} strokeWidth={1.9} /></button>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step.key}
            initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }}
            transition={{ duration: 0.2, ease: EASE }}
          >
            <div className="ng-head">
              <span className="ng-ic"><step.Ico size={18} strokeWidth={1.8} /></span>
              <h3 className="ng-title">{data.title}</h3>
            </div>
            <p className="ng-text">{data.text}</p>
            {data.bullets && (
              <ul className="ng-list">
                {data.bullets.map((b, k) => (
                  <li key={k}><Check size={14} strokeWidth={2.4} /> <span>{b}</span></li>
                ))}
              </ul>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="ng-foot">
          <div className="ng-dots" aria-hidden="true">
            {STEPS.map((s, idx) => <span key={s.key} className={`ng-dot ${idx === i ? 'on' : ''}`} />)}
          </div>
          <div className="ng-nav">
            <button className="ng-skip" onClick={finish}>{tt.skip}</button>
            {i > 0 && <button className="ng-btn ghost" onClick={back} aria-label={tt.back}><ChevronLeft size={16} strokeWidth={2.2} /></button>}
            <button className="ng-btn primary" onClick={next}>
              {last ? tt.done : tt.next}{!last && <ChevronRight size={16} strokeWidth={2.2} />}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .ng-overlay { position: fixed; inset: 0; }
        .ng-overlay.center { background: rgba(0,0,0,0.66); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); }
        .ng-spot-box {
          position: fixed; border-radius: 14px;
          box-shadow: 0 0 0 9999px rgba(0,0,0,0.70), 0 0 0 2px var(--accent), 0 0 22px -2px color-mix(in srgb, var(--accent) 60%, transparent);
          pointer-events: none;
        }
        .ng-tip {
          position: fixed;
          background: linear-gradient(180deg, var(--bg-card-top, var(--bg-surface)), var(--bg-card-bot, var(--bg-surface)));
          border: 1px solid var(--border-soft);
          border-radius: var(--radius, 18px);
          box-shadow: var(--shadow-lift, 0 8px 28px rgba(0,0,0,0.4));
          padding: 18px 18px 14px;
        }
        .ng-arrow {
          position: absolute; width: 12px; height: 12px;
          background: var(--bg-card-bot, var(--bg-surface));
          border: 1px solid var(--border-soft);
        }
        .ng-arrow.left   { left: -7px;   transform: translateY(-50%) rotate(45deg); border-right: none; border-top: none; }
        .ng-arrow.right  { right: -7px;  transform: translateY(-50%) rotate(45deg); border-left: none;  border-bottom: none; }
        .ng-arrow.bottom { bottom: -7px; transform: translateX(-50%) rotate(45deg); border-left: none;  border-top: none; }

        .ng-close {
          position: absolute; top: 10px; right: 10px;
          width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
          border: none; border-radius: 9px; background: transparent; color: var(--text-muted); cursor: pointer;
        }
        .ng-close:hover { background: var(--bg-tile, var(--bg-surface)); color: var(--text-body); }

        .ng-head { display: flex; align-items: center; gap: 10px; margin-bottom: 9px; padding-right: 26px; }
        .ng-ic {
          width: 34px; height: 34px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
          border-radius: 10px; background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--accent);
        }
        .ng-title { font-size: 17px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.01em; }
        .ng-text { font-size: 13.5px; line-height: 1.55; color: var(--text-secondary); }
        .ng-list { list-style: none; margin: 11px 0 2px; display: flex; flex-direction: column; gap: 8px; }
        .ng-list li { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; line-height: 1.45; color: var(--text-body); }
        .ng-list li svg { flex-shrink: 0; margin-top: 2px; color: var(--accent); }

        .ng-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 16px; }
        .ng-dots { display: flex; gap: 6px; }
        .ng-dot { width: 6px; height: 6px; border-radius: 999px; background: var(--border-med); transition: all 0.2s var(--ease, ease); }
        .ng-dot.on { width: 18px; background: var(--accent); }
        .ng-nav { display: flex; align-items: center; gap: 7px; }
        .ng-skip { border: none; background: none; cursor: pointer; font-family: inherit; font-size: 13px; font-weight: 600; color: var(--text-muted); padding: 6px 4px; }
        .ng-skip:hover { color: var(--text-body); }
        .ng-btn {
          display: inline-flex; align-items: center; gap: 3px; justify-content: center;
          min-height: 34px; padding: 7px 13px; border-radius: 11px; cursor: pointer; font-family: inherit;
          font-size: 13.5px; font-weight: 700; border: 1px solid transparent;
        }
        .ng-btn.ghost { background: transparent; border-color: var(--border-med); color: var(--text-body); padding: 7px 9px; }
        .ng-btn.ghost:hover { background: var(--bg-tile, var(--bg-surface)); }
        .ng-btn.primary {
          background: linear-gradient(180deg, var(--accent-btn-top, var(--accent)), var(--accent-btn-bot, var(--accent)));
          color: var(--on-accent); border: none;
          box-shadow: inset 0 1.5px 0.5px rgba(255,255,255,0.22), var(--shadow-btn, 0 3px 6px rgba(0,0,0,0.3));
        }
      `}</style>
    </motion.div>,
    document.body
  )
}
