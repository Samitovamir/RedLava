// Глобальная «блокировка» сайта (пасхалка-розыгрыш «Перейти на Premium»).
// Состояние хранится в localStorage, поэтому переживает перезагрузку:
// пока не введёшь верный ответ — сайт остаётся заблокированным и никуда не уйдёшь.

const LOCK_KEY = 'albert-locked'

export const isLocked = () => {
  try { return localStorage.getItem(LOCK_KEY) === '1' } catch { return false }
}

export const lockSite = () => {
  try { localStorage.setItem(LOCK_KEY, '1') } catch { /* ignore */ }
  try { window.dispatchEvent(new Event('albert-lock')) } catch { /* ignore */ }
}

export const unlockSite = () => {
  try { localStorage.removeItem(LOCK_KEY) } catch { /* ignore */ }
  try { window.dispatchEvent(new Event('albert-lock')) } catch { /* ignore */ }
}
