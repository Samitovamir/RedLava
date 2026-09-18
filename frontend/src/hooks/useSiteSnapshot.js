import { useMemo } from 'react'
import { useEvents } from '../context/EventsContext.jsx'
import { useHistory } from '../context/HistoryContext.jsx'
import { useMemoryFacts } from '../context/MemoryContext.jsx'
import { buildSiteSnapshot } from '../utils/siteSnapshot.js'

// A reactive snapshot of the whole site: rebuilt whenever the events, the history or the facts change.
export function useSiteSnapshot() {
  const { events } = useEvents()
  const { entries } = useHistory()
  const { facts } = useMemoryFacts()
  return useMemo(
    () => buildSiteSnapshot({ events, history: entries, facts }),
    [events, entries, facts]
  )
}
