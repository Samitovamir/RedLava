import { useState, useEffect } from 'react'

/*
  Site layouts ("where things sit") — a system parallel to the themes
  ("what colour everything is"). The choice is kept in localStorage and applied to
  <html data-layout="…">; pages react to it through the CSS selector
  html[data-layout="…"] and through the useLayout() hook for structural differences.

  - classic  — the current arrangement (the default, changes nothing)
  - cockpit  — "Cockpit": fixed large zones, as little scrolling as possible
  - journal  — "Journal": a single column, briefing order conclusion→data→actions
  - command  — "Command center": dense columns, a status line across the top
*/

const STORAGE_KEY = 'albert-layout'
export const DEFAULT_LAYOUT = 'classic'

// The mobile breakpoint (kept in sync with the @media query in index.css).
export const MOBILE_QUERY = '(max-width: 640px)'

// Reactive "narrow screen" flag. On mobile the site always runs in
// Classic (the other layouts look bad on a narrow screen).
export function useIsMobile() {
  const [m, setM] = useState(() => {
    try { return window.matchMedia(MOBILE_QUERY).matches } catch { return false }
  })
  useEffect(() => {
    let mq
    try { mq = window.matchMedia(MOBILE_QUERY) } catch { return }
    const onChange = () => setM(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return m
}

export const LAYOUTS = [
  { id: 'classic', ru: 'Классика',         en: 'Classic',        ruHint: 'Разделы и сайдбар — сайт как сейчас',                    enHint: 'Sections and sidebar — the site as it is' },
  { id: 'command', ru: 'Командный центр',  en: 'Command center', ruHint: 'Рабочий стол: день и помощник всегда на экране',         enHint: 'Workspace: day and assistant always on screen' },
]

const VALID_LAYOUTS = new Set(LAYOUTS.map(l => l.id))

// Layouts saved by older builds (cockpit/journal) are no longer supported → Classic.
export function getLayout() {
  try { const v = localStorage.getItem(STORAGE_KEY); return VALID_LAYOUTS.has(v) ? v : DEFAULT_LAYOUT } catch { return DEFAULT_LAYOUT }
}

export function applyLayout(id) {
  document.documentElement.setAttribute('data-layout', id)
  try { localStorage.setItem(STORAGE_KEY, id) } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('albert-layout', { detail: id }))
}

// Subscribe to layout changes — for components that differ structurally between layouts
export function useLayout() {
  const [layout, setLayout] = useState(getLayout)
  useEffect(() => {
    const onChange = (e) => setLayout(e.detail || getLayout())
    window.addEventListener('albert-layout', onChange)
    return () => window.removeEventListener('albert-layout', onChange)
  }, [])
  return layout
}
