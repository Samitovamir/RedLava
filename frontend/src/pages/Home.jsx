import { useNavigate } from 'react-router-dom'
import AIWorkZone from '../components/AIWorkZone.jsx'
import BrandLogo from '../components/BrandLogo.jsx'
import DaySchedule from '../components/DaySchedule.jsx'
import DaySummary from '../components/DaySummary.jsx'
import HealthBrief from '../components/HealthBrief.jsx'
import HealthSignal from '../components/HealthSignal.jsx'
import SportSignal from '../components/SportSignal.jsx'
import DayAgenda from '../components/DayAgenda.jsx'
import NutritionHomeCard from '../components/NutritionHomeCard.jsx'
import TodaySignal from '../components/TodaySignalV2.jsx'
import { useLayout } from '../layout.js'
import { getQuoteOfDay } from '../utils/quotes.js'
import { useT, useLang } from '../context/LanguageContext.jsx'
import { mskNow } from '../utils/time.js'

function getGreeting(t) {
  const hour = mskNow().getHours()
  if (hour >= 5 && hour < 12) return t.greetMorning
  if (hour >= 12 && hour < 17) return t.greetDay
  if (hour >= 17 && hour < 22) return t.greetEvening
  return t.greetNight
}

function formatDate(t) {
  const d = mskNow()
  const days = t.days
  const months = t.months
  // По-русски месяцы строчные: «10 июня». Заглавная — только у первой буквы строки
  // (имя дня недели в начале), без CSS-capitalize, который бы поднял и «Июня».
  const s = `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const ICON_GEAR = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
)

export default function Home() {
  const t = useT({
    ru: {
      greetMorning: 'Доброе утро', greetDay: 'Добрый день', greetEvening: 'Добрый вечер', greetNight: 'Доброй ночи',
      greetName: '',
      days: ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'],
      months: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
    },
    en: {
      greetMorning: 'Good morning', greetDay: 'Good afternoon', greetEvening: 'Good evening', greetNight: 'Good night',
      greetName: '',
      days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    },
  })
  const navigate = useNavigate()
  const { lang } = useLang()
  const quote = getQuoteOfDay(lang)

  const dateStr = formatDate(t)
  const greetStr = `${getGreeting(t)}${t.greetName}`
  const quoteStr = quote.text
  const authorStr = `— ${quote.author}`

  // Раскладка: в «Командном центре» Главная — компактный обзор центра экрана
  // (лента дня/статусы/помощник живут в постоянных панелях оболочки).
  const layout = useLayout()

  return (
    <div className="home-page">
      <div className="home-header">
        <div className="header-left">
          <BrandLogo />
          <span className="home-date">{dateStr}</span>
          <h1 className="greeting">{greetStr}</h1>
        </div>
        <div className="quote-of-day">
          <p className="quote-text">{quoteStr}</p>
          <span className="quote-author">{authorStr}</span>
        </div>
        {/* Настройки на мобиле — маленькая шестерёнка в шапке (на десктопе — в рейле меню) */}
        <button className="home-settings" aria-label={lang === 'en' ? 'Settings' : 'Настройки'} onClick={() => navigate('/settings')}>{ICON_GEAR}</button>
      </div>

      <TodaySignal />

      {layout === 'command' ? (
        <div className="home-cards">
          <DayAgenda />
          <SportSignal />
          <HealthSignal />
          <NutritionHomeCard />
        </div>
      ) : (
        <>
          {/* По просьбе пользователя: под «Статусом» убраны блоки Расписание/Спорт/Здоровье/Питание —
              оставлен только «Ваш помощник». Основная мысль по доменам теперь внутри «Статуса»
              (виджеты: спидометр стресса, ползунок событий). Компоненты сохранены (импорты ниже),
              их можно вернуть, если понадобится. */}
          <AIWorkZone />
        </>
      )}

      {/*
        Временно убрано с Главной (по просьбе). ФУНКЦИОНАЛ СОХРАНЁН: компоненты,
        импорты и страницы на месте — можно вернуть сюда или перенести в другое место,
        просто раскомментировав. Сетку (.home-grid / .quick-cards) пока не трогаем.

        <HealthBrief />            — «Коротко о здоровье»
        <div className="home-grid">
          <DaySchedule />          — календарь дня
          <DaySummary />           — «Сводка дня»
        </div>
      */}

      <style>{`
        .home-page {
          display: flex;
          flex-direction: column;
          gap: 28px;
          max-width: 1400px;
        }
        .home-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 32px;
        }
        .header-left { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
        .header-left .brand-logo { margin-bottom: 6px; }
        .home-settings { display: none; }

        .quote-of-day {
          max-width: 420px;
          text-align: right;
          /* Фиксированный бейдж «Демо-режим» (position:fixed; top:14px; right:16px; высота ~34px)
             перекрывает правый верхний угол — отступаем цитату ПОД него, чтобы не пересекались. */
          padding-top: 48px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .quote-text {
          /* Inter, без засечного курсива: тихая подпись, не конкурирует с заголовком */
          font-size: 13px;
          line-height: 1.55;
          color: var(--text-muted);
          font-style: normal;
        }
        .quote-author {
          font-size: 12px;
          color: var(--text-muted);
          font-weight: 500;
        }

        .home-date {
          font-size: 13px;
          color: var(--muted);
          font-weight: 500;
        }
        .greeting {
          font-size: 36px;
          font-weight: 700;
          color: var(--foreground);
          letter-spacing: -0.025em;
          line-height: 1.1;
        }
        .quick-cards {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }
        /* Карточная сетка Главной: «Расписание» во всю ширину, Спорт/Здоровье парой под ним */
        .home-cards {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          align-items: start;
        }
        .home-cards > .day-agenda { grid-column: 1 / -1; }
        .home-cards > .nutrition-home { grid-column: 1 / -1; }
        .home-cards > .tasks-home { grid-column: 1 / -1; }
        .quick-card {
          display: flex;
          flex-direction: column;
          gap: 6px;
          cursor: default;
          transition: box-shadow 0.2s, border-color 0.2s;
        }
        .quick-card:hover {
          box-shadow: var(--shadow-lift);
          border-color: var(--border-hover);
        }
        .quick-card.clickable { cursor: pointer; }
        .quick-card-top {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 6px;
        }
        .quick-card-label {
          font-size: 15px;
          color: var(--muted-foreground);
          font-weight: 600;
        }
        .quick-card-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          /* цвет приходит инлайном и зависит от состояния */
        }
        .quick-card-value {
          font-size: 22px;
          font-weight: 700;
          color: var(--foreground);
          letter-spacing: -0.01em;
          min-width: 0;
          overflow-wrap: anywhere;   /* длинные слова («восстановились») переносятся, не вылезают за край */
        }
        .quick-card-sub {
          font-size: 12.5px;
          color: var(--muted);
        }
        .home-grid {
          display: grid;
          grid-template-columns: 1.8fr 1fr;
          gap: 16px;
          align-items: stretch;
        }

        /* Мобайл: карточки-сводки в один столбец на всю ширину — длинные значения
           («Хорошо восстановились») помещаются в строку, без обрезки и сжатия. */
        @media (max-width: 640px) {
          .quick-cards { grid-template-columns: 1fr; gap: 12px; }
          .home-cards { grid-template-columns: 1fr; gap: 12px; }
          .greeting { font-size: 30px; }
          /* На мобиле цитату прячем (тесно), вместо неё — кнопка «Настройки» в углу шапки
             (рейла меню на мобиле нет, поэтому настройки переезжают сюда) */
          .quote-of-day { display: none; }
          .home-settings {
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0; width: 40px; height: 40px; border-radius: 12px;
            border: 1px solid var(--border-med); background: var(--bg-tile);
            color: var(--text-secondary); cursor: pointer;
            transition: color 0.15s, border-color 0.15s;
          }
          .home-settings:active { color: var(--accent); border-color: var(--accent); }
        }

        /* ===== РАСКЛАДКА «ЛЕНТА» (journal): глава-брифинг ===== */
        html[data-layout="journal"] .home-page {
          max-width: 760px;
          margin-inline: auto;
          gap: 22px;
        }
        html[data-layout="journal"] .home-header { flex-direction: column; gap: 10px; }
        html[data-layout="journal"] .greeting { font-size: 40px; }
        html[data-layout="journal"] .quote-of-day {
          text-align: left; padding-top: 0; max-width: none;
        }
        /* Брифинг: сначала «главное сейчас» (события), затем вывод дня и тело */
        html[data-layout="journal"] .home-header { order: 0; }
        html[data-layout="journal"] .quick-cards { order: 1; grid-template-columns: 1fr; }
        html[data-layout="journal"] .today-signal { order: 2; }
        html[data-layout="journal"] .ai-work-zone { order: 4; }
        html[data-layout="journal"] .quick-card:not(.signal-card) .quick-card-value { font-size: 30px; }

        /* ===== «КОМАНДНЫЙ ЦЕНТР»: Главная = компактный обзор центральной панели ===== */
        html[data-layout="command"] .home-page { gap: 18px; max-width: none; }
        html[data-layout="command"] .greeting { font-size: 28px; }
        html[data-layout="command"] .quote-of-day { display: none; }
        html[data-layout="command"] .home-header { padding-right: 90px; }
      `}</style>
    </div>
  )
}
