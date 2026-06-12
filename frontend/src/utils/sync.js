// Синхронизация пользовательских данных между устройствами владельца.
// Модель: один общий блоб на сервере (роль albert). pull при старте приложения (гидрируем
// localStorage ДО показа интерфейса), затем фоновый debounced push изменений + push при
// уходе со страницы. Last-write-wins. Device-local (темы/раскладка/язык), кэши Whoop/Garmin
// и журнал «Истории» НЕ синхронизируем.

import { isGuest } from '../api/authFetch.js'

const SYNC_KEYS = [
  'albert-events',            // расписание
  'albert-memory',            // память о владельце
  'albert-labs',              // анализы крови
  'albert-nutrition-profile', // профиль питания
  'albert-taste',             // вкусовые предпочтения
  'albert-meal-plan',         // меню
  'albert-intake',            // съеденное (КБЖУ дня)
  'albert-shopping-2',        // список покупок
  'albert-pantry',            // недавно купленное
  'albert-home-dish',         // блюдо на Главной (под текущий приём)
  'albert-saved-dishes',      // сохранённые блюда фото-дневника (быстрый повтор)
  // NB: albert-intake-thumbs (миниатюры фото) НЕ синкаем — большой base64, только локально.
]
const AT_KEY = 'albert-sync-at'
let lastSnap = ''

function collectState() {
  const state = {}
  for (const k of SYNC_KEYS) {
    try { const v = localStorage.getItem(k); if (v != null) state[k] = v } catch { /* ignore */ }
  }
  return state
}

// Подтянуть серверный блоб и записать в localStorage (сервер — источник истины между устройствами).
export async function pullSync() {
  if (isGuest()) return
  try {
    const res = await fetch('/api/sync/state')
    if (!res.ok) return
    const data = await res.json()
    if (data?.ok && data.state && typeof data.state === 'object') {
      for (const [k, v] of Object.entries(data.state)) {
        try { if (typeof v === 'string') localStorage.setItem(k, v) } catch { /* ignore */ }
      }
      try { localStorage.setItem(AT_KEY, String(data.updatedAt || 0)) } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  lastSnap = JSON.stringify(collectState())
}

// Отправить текущее состояние на сервер, если изменилось с прошлого push.
export async function pushSync() {
  if (isGuest()) return
  const state = collectState()
  const snap = JSON.stringify(state)
  if (snap === lastSnap) return
  try {
    const updatedAt = Date.now()
    const res = await fetch('/api/sync/state', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, updatedAt })
    })
    if (res.ok) {
      lastSnap = snap
      try { localStorage.setItem(AT_KEY, String(updatedAt)) } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

let started = false
export function startSync() {
  if (started || isGuest() || typeof window === 'undefined') return
  started = true
  lastSnap = JSON.stringify(collectState())
  setInterval(() => { pushSync() }, 8000)
  window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') pushSync() })
  window.addEventListener('pagehide', () => { pushSync() })
}
