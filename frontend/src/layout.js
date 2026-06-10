import { useState, useEffect } from 'react'

/*
  Раскладки сайта («что где находится») — параллельная система к темам
  («какого всё цвета»). Выбор хранится в localStorage и применяется к
  <html data-layout="…">; страницы реагируют CSS-селекторами
  html[data-layout="…"] и хуком useLayout() для структурных различий.

  - classic  — текущая компоновка (по умолчанию, ничего не меняет)
  - cockpit  — «Кокпит»: фиксированные крупные зоны, минимум скролла
  - journal  — «Журнал»: одна колонка, брифинг-иерархия вывод→данные→действия
  - command  — «Командный центр»: плотные колонки, статус-строка сверху
*/

const STORAGE_KEY = 'albert-layout'
export const DEFAULT_LAYOUT = 'classic'

export const LAYOUTS = [
  { id: 'classic', ru: 'Классика',         en: 'Classic',        ruHint: 'Как сейчас — спокойная лента блоков',          enHint: 'Current look — calm stack of blocks' },
  { id: 'cockpit', ru: 'Кокпит',           en: 'Cockpit',        ruHint: 'Крупные зоны, всё важное на одном экране',     enHint: 'Big zones, everything at a glance' },
  { id: 'journal', ru: 'Журнал',           en: 'Journal',        ruHint: 'Одна колонка: вывод → данные → действия',      enHint: 'Single column: verdict → data → actions' },
  { id: 'command', ru: 'Командный центр',  en: 'Command center', ruHint: 'Плотные колонки и статус-строка сверху',       enHint: 'Dense columns with a global status bar' },
]

export function getLayout() {
  try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_LAYOUT } catch { return DEFAULT_LAYOUT }
}

export function applyLayout(id) {
  document.documentElement.setAttribute('data-layout', id)
  try { localStorage.setItem(STORAGE_KEY, id) } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('albert-layout', { detail: id }))
}

// Подписка на смену раскладки — для компонентов со структурными различиями
export function useLayout() {
  const [layout, setLayout] = useState(getLayout)
  useEffect(() => {
    const onChange = (e) => setLayout(e.detail || getLayout())
    window.addEventListener('albert-layout', onChange)
    return () => window.removeEventListener('albert-layout', onChange)
  }, [])
  return layout
}
