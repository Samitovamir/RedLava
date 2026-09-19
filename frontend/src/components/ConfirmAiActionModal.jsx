import { Trash2, ArrowRightLeft } from 'lucide-react'
import { useEvents } from '../context/EventsContext.jsx'
import { dayLabel } from '../utils/history.js'
import { Modal, Button, Icon } from '../ui'
import { useT } from '../context/LanguageContext.jsx'

/*
  Confirmation before the AI actually moves or deletes an event.
  Why a separate window instead of running straight away (as create_event does): the
  assistant builds its answer not only from what the person said but also from data in the
  snapshot — other people's event titles, emails. If planted text that looks like a command
  gets in there, nothing real happens without the person's tap.
  Rendered globally (in App); reacts to the pendingAiActions queue.
*/
export default function ConfirmAiActionModal() {
  const { pendingAiActions, confirmPendingAiAction, rejectPendingAiAction } = useEvents()
  const t = useT({
    ru: {
      badge: 'ИИ предлагает',
      titleDelete: 'Удалить событие?',
      titleMove: 'Перенести событие?',
      when: (ev) => `${dayLabel(ev.date)}, ${ev.start}–${ev.end}`,
      to: 'на',
      confirmDelete: 'Удалить',
      confirmMove: 'Перенести',
      reject: 'Отклонить',
    },
    en: {
      badge: 'AI suggests',
      titleDelete: 'Delete this event?',
      titleMove: 'Move this event?',
      when: (ev) => `${dayLabel(ev.date)}, ${ev.start}–${ev.end}`,
      to: 'to',
      confirmDelete: 'Delete',
      confirmMove: 'Move',
      reject: 'Dismiss',
    },
  })

  const item = pendingAiActions?.[0]
  if (!item) return null

  const isDelete = item.name === 'delete_event'
  const inp = item.input || {}
  const target = item.target
  const newDate = inp.new_date || target.date
  const newStart = inp.new_start || target.start
  const newEnd = inp.new_end || target.end

  return (
    <Modal open={!!item} onClose={() => rejectPendingAiAction(item.id)} size="sm" badge={t.badge} title={isDelete ? t.titleDelete : t.titleMove}>
      <div className="caa-body">
        <div className="caa-icon" data-danger={isDelete}>
          <Icon icon={isDelete ? Trash2 : ArrowRightLeft} size={20} />
        </div>
        <div className="caa-text">
          <div className="caa-name">«{target.title}»</div>
          {isDelete ? (
            <div className="caa-when">{t.when(target)}</div>
          ) : (
            <div className="caa-when">{t.when(target)} → {t.to} {t.when({ date: newDate, start: newStart, end: newEnd })}</div>
          )}
        </div>
      </div>
      <div className="caa-actions">
        <Button variant="ghost" onClick={() => rejectPendingAiAction(item.id)}>{t.reject}</Button>
        <Button variant={isDelete ? 'danger' : 'primary'} onClick={() => confirmPendingAiAction(item.id)}>
          {isDelete ? t.confirmDelete : t.confirmMove}
        </Button>
      </div>

      <style>{`
        .caa-body { display: flex; align-items: flex-start; gap: 12px; padding: 4px 0 18px; }
        .caa-icon { flex-shrink: 0; width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: var(--bg-tile); color: var(--text-secondary); }
        .caa-icon[data-danger="true"] { color: var(--status-crit); }
        .caa-text { min-width: 0; }
        .caa-name { font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; word-break: break-word; }
        .caa-when { font-size: 13.5px; color: var(--text-secondary); line-height: 1.5; }
        .caa-actions { display: flex; justify-content: flex-end; gap: 8px; }
      `}</style>
    </Modal>
  )
}
