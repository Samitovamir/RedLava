import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { TriangleAlert, ArrowRight } from 'lucide-react'
import { useEvents } from '../context/EventsContext.jsx'
import { useT } from '../context/LanguageContext.jsx'
import Icon from '../ui/Icon.jsx'

/*
  Плашка «переподключите Google» в Расписании.
  Показывается, только когда токен Google протух/отозван (invalid_grant) — отличаем
  от «никогда не подключали», чтобы не пугать пустым календарём без причины.
  Кнопка ведёт в Настройки → Подключения, где живёт «Подключить Google».
*/
export default function GoogleReconnectBanner() {
  const { googleNeedsReconnect } = useEvents()
  const navigate = useNavigate()
  const t = useT({
    ru: {
      title: 'Google-календарь отключился',
      body: 'Доступ к календарю истёк — события не загружаются. Переподключите Google в «Настройки → Подключения».',
      action: 'Открыть подключения'
    },
    en: {
      title: 'Google Calendar disconnected',
      body: 'Calendar access expired — events aren’t loading. Reconnect Google in “Settings → Connections”.',
      action: 'Open connections'
    }
  })

  return (
    <AnimatePresence>
      {googleNeedsReconnect && (
        <motion.div
          className="grb"
          role="alert"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.28 }}
        >
          <span className="grb-ico"><Icon icon={TriangleAlert} size={20} strokeWidth={2} /></span>
          <div className="grb-text">
            <span className="grb-title">{t.title}</span>
            <span className="grb-body">{t.body}</span>
          </div>
          <button className="grb-btn" onClick={() => navigate('/settings')}>
            <span>{t.action}</span>
            <Icon icon={ArrowRight} size={16} strokeWidth={2.2} />
          </button>

          <style>{`
            .grb {
              display: flex; align-items: center; gap: 14px;
              padding: 14px 16px;
              border-radius: var(--radius);
              background: var(--status-warn-bg, var(--bg-tile));
              border: 1px solid var(--status-warn);
              box-shadow: var(--inset-tile, none);
            }
            .grb-ico {
              flex-shrink: 0;
              display: flex; align-items: center; justify-content: center;
              width: 38px; height: 38px; border-radius: 11px;
              background: color-mix(in srgb, var(--status-warn) 18%, transparent);
              color: var(--status-warn);
            }
            .grb-text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
            .grb-title { font-size: 14.5px; font-weight: 700; color: var(--text-primary); }
            .grb-body { font-size: 13px; color: var(--text-body); line-height: 1.4; }
            .grb-btn {
              flex-shrink: 0;
              display: inline-flex; align-items: center; gap: 7px;
              padding: 9px 14px; border-radius: 10px;
              border: 1px solid var(--status-warn);
              background: transparent;
              color: var(--status-warn);
              font-family: inherit; font-size: 13px; font-weight: 600;
              cursor: pointer; transition: background 0.15s, transform 0.12s;
            }
            .grb-btn:hover { background: color-mix(in srgb, var(--status-warn) 14%, transparent); }
            .grb-btn:active { transform: scale(0.97); }

            @media (max-width: 640px) {
              .grb { flex-wrap: wrap; gap: 10px 12px; padding: 13px 14px; }
              .grb-btn { width: 100%; justify-content: center; min-height: 42px; }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
