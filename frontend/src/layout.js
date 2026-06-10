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
  { id: 'classic', ru: 'Классика',         en: 'Classic',        ruHint: 'Разделы и сайдбар — сайт как сейчас',                    enHint: 'Sections and sidebar — the site as it is' },
  { id: 'cockpit', ru: 'Один экран',       en: 'One screen',     ruHint: 'Весь сайт на одном экране, разделы всплывают окнами',    enHint: 'Whole site on one screen, sections pop up as windows' },
  { id: 'journal', ru: 'Лента',            en: 'Feed',           ruHint: 'Весь сайт — одна прокручиваемая лента-брифинг',          enHint: 'The whole site as one scrollable brief' },
  { id: 'command', ru: 'Командный центр',  en: 'Command center', ruHint: 'Рабочий стол: день и помощник всегда на экране',         enHint: 'Workspace: day and assistant always on screen' },
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
