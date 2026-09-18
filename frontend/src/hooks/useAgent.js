import { useCallback } from 'react'
import { useEvents } from '../context/EventsContext.jsx'
import { useMail } from '../context/MailContext.jsx'
import { useMemoryFacts } from '../context/MemoryContext.jsx'
import { useHistory } from '../context/HistoryContext.jsx'

// Единый ассистент: ВСЕ окна ИИ ходят сюда (один «мозг», одна память, все инструменты).
// ask() шлёт сообщение в /agent и сам применяет вернувшиеся действия:
// события расписания, письмо, и — главное — пополнение/обновление долгой памяти о человеке.
export function useAgent() {
  const { applyAiActions } = useEvents()
  const { openDraft } = useMail()
  const { addFact, updateFact } = useMemoryFacts()
  const { logAction } = useHistory()

  const ask = useCallback(async ({ message, snapshot, history, context }) => {
    let data
    try {
      const res = await fetch('/api/ai/agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, snapshot, history, context })
      })
      data = await res.json()
    } catch {
      return { reply: null, actions: [], error: true }
    }

    const actions = data.actions || []
    const mem = ['remember_fact', 'update_fact']
    const eventActions = actions.filter(a => !mem.includes(a.name) && a.name !== 'send_email')
    if (eventActions.length) applyAiActions(eventActions)

    const mail = actions.find(a => a.name === 'send_email')
    if (mail) openDraft(mail.input)

    actions.filter(a => a.name === 'remember_fact').forEach(a => {
      if (a.input?.fact) { addFact(a.input.fact); logAction({ actor: 'ai', type: 'task', title: `Запомнил: ${a.input.fact}` }) }
    })
    actions.filter(a => a.name === 'update_fact').forEach(a => {
      if (a.input?.old) {
        updateFact(a.input.old, a.input.new)
        logAction({ actor: 'ai', type: 'task', title: a.input.new ? `Обновил память: ${a.input.new}` : `Забыл устаревшее: ${a.input.old}` })
      }
    })

    return { reply: data.reply || '', actions, error: false }
  }, [applyAiActions, openDraft, addFact, updateFact, logAction])

  return { ask }
}
