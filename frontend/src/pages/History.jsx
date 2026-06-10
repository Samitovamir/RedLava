import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Mail, CalendarDays, Search, Check, Bell, Activity, Inbox } from 'lucide-react'
import { useHistory } from '../context/HistoryContext.jsx'
import AssistantMemory from '../components/AssistantMemory.jsx'
import { useLang, useT } from '../context/LanguageContext.jsx'
import { SectionHeader, Chip, EmptyState, Icon, StatusPill } from '../ui'
import {
  ACTION_TYPES, STATUS_INFO, ACTOR_INFO, dayLabel, timeOf, dateOf, pickLabel
} from '../utils/history.js'

// Иконка по типу действия — единый line-set (lucide) через примитив <Icon>
const TYPE_ICONS = { mail: Mail, calendar: CalendarDays, search: Search, check: Check, bell: Bell, activity: Activity }

// Статус журнала → тон StatusPill (единственный цветной элемент записи)
const STATUS_TONE = { done: 'ok', pending: 'warn', failed: 'crit' }

export default function History() {
  const { entries } = useHistory()
  const { lang } = useLang()
  const t = useT({
    ru: {
      heading: 'История', sub: 'Журнал действий ИИ-помощника',
      total: 'Всего действий', emails: 'Письма', events: 'События', searches: 'Поиски',
      all: 'Все', ai: 'ИИ', self: 'Сам',
      empty: 'Здесь пока пусто — по этому фильтру действий нет.'
    },
    en: {
      heading: 'History', sub: 'Activity log of the AI assistant',
      total: 'Total actions', emails: 'Emails', events: 'Events', searches: 'Searches',
      all: 'All', ai: 'AI', self: 'You',
      empty: 'Nothing here yet — no actions match this filter.'
    }
  })
  const [filter, setFilter] = useState('all')
  const [actorFilter, setActorFilter] = useState('all')

  const filtered = useMemo(
    () => entries
      .filter(a => filter === 'all' || a.type === filter)
      .filter(a => actorFilter === 'all' || a.actor === actorFilter)
      .sort((a, b) => b.datetime.localeCompare(a.datetime)),
    [entries, filter, actorFilter]
  )

  // Группировка по дате
  const groups = useMemo(() => {
    const map = new Map()
    filtered.forEach(a => {
      const d = dateOf(a.datetime)
      if (!map.has(d)) map.set(d, [])
      map.get(d).push(a)
    })
    return [...map.entries()]
  }, [filtered])

  // Статистика — числа нейтральные (--text-primary), различие несёт подпись, не цвет
  const stats = [
    { key: 'all', label: t.total, count: entries.length },
    { key: 'email', label: t.emails, count: entries.filter(a => a.type === 'email').length },
    { key: 'event', label: t.events, count: entries.filter(a => a.type === 'event').length },
    { key: 'search', label: t.searches, count: entries.filter(a => a.type === 'search').length }
  ]

  const actorChips = [{ key: 'all', label: t.all }, { key: 'ai', label: t.ai }, { key: 'user', label: t.self }]
  const typeChips = [{ key: 'all', label: t.all }, ...Object.entries(ACTION_TYPES).map(([k, v]) => ({ key: k, label: pickLabel(v, lang) }))]

  return (
    <div className="history-page">
      <SectionHeader title={t.heading} subtitle={t.sub} />

      {/* Долгая память помощника */}
      <AssistantMemory />

      {/* Статистика */}
      <div className="hist-stats">
        {stats.map(s => (
          <div key={s.key} className="card hist-stat">
            <span className="hist-stat-val">{s.count}</span>
            <span className="hist-stat-lbl">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Фильтры — один горизонтальный ряд чипов: автор (Все/ИИ/Сам) + типы */}
      <div className="hist-filters">
        {actorChips.map(a => (
          <Chip key={`actor-${a.key}`} active={actorFilter === a.key} onClick={() => setActorFilter(a.key)}>
            {a.label}
          </Chip>
        ))}
        <span className="hist-filter-sep" aria-hidden />
        {typeChips.map(c => (
          <Chip key={`type-${c.key}`} active={filter === c.key} onClick={() => setFilter(c.key)}>
            {c.label}
          </Chip>
        ))}
      </div>

      {/* Таймлайн */}
      <div className="card hist-timeline">
        {groups.length === 0 && (
          <EmptyState icon={Inbox} text={t.empty} />
        )}
        {groups.map(([date, items]) => (
          <div key={date} className="hist-group">
            <div className="hist-day">{dayLabel(date, lang)}</div>
            <div className="hist-items">
              {items.map((a, i) => {
                const ti = ACTION_TYPES[a.type] || ACTION_TYPES.task
                const st = STATUS_INFO[a.status] || STATUS_INFO.done
                return (
                  <motion.div key={a.id} className="hist-item"
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.03 * i }}>
                    <div className="hist-rail">
                      <span className="hist-dot">
                        <Icon icon={TYPE_ICONS[ti.icon]} size={16} />
                      </span>
                    </div>
                    <div className="hist-body">
                      <div className="hist-item-head">
                        <span className="hist-title">{(lang === 'en' && a.titleEn) || a.title}</span>
                        <span className="hist-time">{timeOf(a.datetime)}</span>
                      </div>
                      <p className="hist-detail">{(lang === 'en' && a.detailEn) || a.detail}</p>
                      <div className="hist-tags">
                        <span className="hist-meta">{pickLabel(ACTOR_INFO[a.actor], lang)} · {pickLabel(ti, lang)}</span>
                        <StatusPill status={STATUS_TONE[a.status] || 'ok'}>{pickLabel(st, lang)}</StatusPill>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        /* Постоянный воздух снизу: лента действий никогда не упирается в нижний край окна (любая тема/высота) */
        .history-page { display: flex; flex-direction: column; gap: 24px; max-width: 1000px; padding-bottom: 72px; }

        .hist-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
        .hist-stat { display: flex; flex-direction: column; gap: 4px; padding: 18px; }
        .hist-stat-val { font-size: 30px; font-weight: 800; line-height: 1; color: var(--text-primary); }
        .hist-stat-lbl { font-size: 13px; color: var(--text-muted); }

        /* Один ряд чипов; на узких экранах — горизонтальный скролл без переноса */
        .hist-filters { display: flex; align-items: center; gap: 8px; overflow-x: auto; scrollbar-width: none; }
        .hist-filters::-webkit-scrollbar { display: none; }
        .hist-filters .ds-chip { flex-shrink: 0; white-space: nowrap; }
        .hist-filter-sep { width: 1px; height: 18px; background: var(--border-med); flex-shrink: 0; margin: 0 4px; }

        .hist-timeline { display: flex; flex-direction: column; gap: 24px; padding-bottom: 56px; }
        .hist-group { display: flex; flex-direction: column; gap: 14px; }
        .hist-day {
          font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
          color: var(--text-muted);
        }
        .hist-items { display: flex; flex-direction: column; }
        .hist-item { display: flex; gap: 14px; }
        .hist-rail { display: flex; flex-direction: column; align-items: center; }
        /* Нейтральный тип-маркер: line-иконка на тихой плашке; цвет несёт только статус */
        .hist-dot {
          width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: var(--bg-tile); border: 1px solid var(--border-soft); color: var(--text-muted);
        }
        .hist-item:not(:last-child) .hist-rail::after {
          content: ''; flex: 1; width: 2px; background: var(--border-soft); margin: 4px 0;
        }
        .hist-body { flex: 1; padding-bottom: 20px; display: flex; flex-direction: column; gap: 5px; }
        .hist-item-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
        .hist-title { font-size: 15px; font-weight: 600; color: var(--foreground); }
        .hist-time { font-size: 12px; flex-shrink: 0; color: var(--text-muted); }
        .hist-detail { font-size: 13.5px; line-height: 1.5; color: var(--text-muted); }
        .hist-tags { display: flex; align-items: center; gap: 10px; margin-top: 3px; }
        /* Метаданные — тихий текст (actor · тип), без пилюль; цвет остаётся только у статуса */
        .hist-meta { font-size: 12px; color: var(--text-muted); }

        @media (max-width: 640px) {
          .hist-stats { grid-template-columns: repeat(2, 1fr); }
          .hist-filters .ds-chip { min-height: 44px; padding-inline: 14px; }
        }
      `}</style>
    </div>
  )
}
