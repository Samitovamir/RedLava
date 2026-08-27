// Синхронизация пользовательских данных между устройствами пользователя.
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
// Канонический снимок (только SYNC_KEYS, в их порядке) — для сравнения local vs server.
function snapshotOf(obj) {
  const s = {}
  for (const k of SYNC_KEYS) { const v = obj?.[k]; if (v != null) s[k] = v }
  return JSON.stringify(s)
}

// Подтянуть серверный блоб. ВАЖНО: затираем localStorage ТОЛЬКО если сервер реально новее
// локального (serverAt > localAt). Иначе локальные правки, которые не успели уехать на сервер
// (еду залогировали и закрыли приложение до push) затирались бы стартовым pull — еда «слетала».
// Если локальное не старше — не трогаем его и помечаем для отправки на сервер ближайшим push.
export async function pullSync() {
  if (isGuest()) return
  try {
    const res = await fetch('/api/sync/state')
    if (!res.ok) { lastSnap = JSON.stringify(collectState()); return }
    const data = await res.json()
    const localAt = Number(localStorage.getItem(AT_KEY) || 0)
    const serverAt = Number(data?.updatedAt || 0)
    const serverHasState = !!(data?.ok && data.state && typeof data.state === 'object' && Object.keys(data.state).length)
    const localEmpty = JSON.stringify(collectState()) === '{}'   // новое устройство / очищенный кэш
    if (serverHasState && (serverAt > localAt || localEmpty)) {
      // Сервер новее ИЛИ локалка пуста — безопасно гидрируем.
      for (const [k, v] of Object.entries(data.state)) {
        try { if (typeof v === 'string') localStorage.setItem(k, v) } catch { /* ignore */ }
      }
      try { localStorage.setItem(AT_KEY, String(serverAt)) } catch { /* ignore */ }
      lastSnap = JSON.stringify(collectState())
    } else {
      // Локальное не старше серверного — НЕ затираем. Базовый снимок = серверный:
      // если локалка отличается (есть несинхронизированные правки), ближайший pushSync их отправит.
      lastSnap = snapshotOf(data?.state || {})
    }
  } catch {
    lastSnap = JSON.stringify(collectState())
  }
}

// Отправить текущее состояние на сервер, если изменилось с прошлого push.
// keepalive=true — для push при сворачивании/закрытии: обычный fetch браузер обрывает на
// unload, и правки (только что залогированная еда) не доезжали до сервера. keepalive
// позволяет запросу завершиться после ухода со страницы (лимит тела ~64 КБ — снимок текстовый,
// миниатюры в синк не входят, так что укладываемся).
export async function pushSync(opts = {}) {
  if (isGuest()) return
  const state = collectState()
  const snap = JSON.stringify(state)
  if (snap === lastSnap) return
  try {
    const updatedAt = Date.now()
    const res = await fetch('/api/sync/state', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, updatedAt }),
      keepalive: !!opts.keepalive,
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
  // НЕ переинициализируем lastSnap здесь: его уже выставил pullSync. Сбросив его в текущее
  // локальное состояние, мы бы «забыли» о несинхронизированных правках, и push их не отправил.
  setInterval(() => { pushSync() }, 8000)
  window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') pushSync({ keepalive: true }) })
  window.addEventListener('pagehide', () => { pushSync({ keepalive: true }) })
}
