import { useEffect } from 'react'

/*
  Тема оформления. Две раздельные настройки:
   - albert-theme        — выбор для ДЕСКТОПА (кожаные темы и т.п.), дефолт black-leather.
   - albert-theme-mobile — выбор для ТЕЛЕФОНА: 'auto' | 'ios-dark' | 'ios-light', дефолт 'auto'.

  На телефоне доступны только минималистичные iOS-темы. 'auto' подстраивается под
  оформление телефона (prefers-color-scheme): системная тёмная → ios-dark, светлая → ios-light,
  и переключается вживую, когда пользователь меняет тему телефона.

  Источник истины применённой темы — атрибут <html data-theme>. resolveTheme() считает
  «эффективную» тему с учётом устройства и системы; applyTheme() её проставляет.
*/

const KEY = 'albert-theme'
const MOBILE_KEY = 'albert-theme-mobile'
export const DEFAULT_DESKTOP = 'black-leather'
export const DEFAULT_MOBILE = 'red-lava'   // фирменное оформление RedLava на телефоне по умолчанию
const MOBILE_Q = '(max-width: 640px)'
const DARK_Q = '(prefers-color-scheme: dark)'
const EVT = 'albert-theme-change'

const NOOP_MQ = { matches: false, addEventListener() {}, removeEventListener() {} }
const mq = (q) => { try { return window.matchMedia(q) } catch { return NOOP_MQ } }

export const isMobileViewport = () => mq(MOBILE_Q).matches
const prefersDark = () => mq(DARK_Q).matches

export function getDesktopTheme() {
  try { return localStorage.getItem(KEY) || DEFAULT_DESKTOP } catch { return DEFAULT_DESKTOP }
}
export function getMobilePref() {
  try { return localStorage.getItem(MOBILE_KEY) || DEFAULT_MOBILE } catch { return DEFAULT_MOBILE }
}

// Эффективная data-theme с учётом устройства и системной темы телефона.
export function resolveTheme() {
  if (isMobileViewport()) {
    const m = getMobilePref()
    if (m === 'red-lava' || m === 'ios-dark' || m === 'ios-light' || m === 'brown-leather') return m
    return prefersDark() ? 'ios-dark' : 'ios-light' // 'auto' → следуем телефону
  }
  return getDesktopTheme()
}

// В Safari (вкладка) верхняя полоса со статус-баром тонируется в <meta theme-color>.
// Красим её в фон приложения (--bg-app) — тогда «чёлка/граница» сливается с сайтом,
// а не выглядит чужой полосой. На домашнем экране (standalone) контент и так уходит
// под Dynamic Island (apple-mobile-web-app-status-bar-style=black-translucent).
function syncThemeColor() {
  try {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-app').trim()
    if (!bg) return
    let meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'theme-color')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', bg)
  } catch { /* ignore */ }
}

export function applyTheme() {
  try { document.documentElement.setAttribute('data-theme', resolveTheme()) } catch { /* ignore */ }
  syncThemeColor()
}

function emit() { try { window.dispatchEvent(new CustomEvent(EVT)) } catch { /* ignore */ } }

export function setDesktopTheme(id) { try { localStorage.setItem(KEY, id) } catch { /* ignore */ } applyTheme(); emit() }
export function setMobilePref(id) { try { localStorage.setItem(MOBILE_KEY, id) } catch { /* ignore */ } applyTheme(); emit() }

// Держит <html data-theme> в согласии с устройством и системной темой вживую.
// Вызывать один раз в App. onChange (опц.) дёргается при любой смене, чтобы UI обновил выделение.
export function useThemeSync(onChange) {
  useEffect(() => {
    applyTheme()
    const m = mq(MOBILE_Q), d = mq(DARK_Q)
    const on = () => { applyTheme(); onChange?.() }
    m.addEventListener('change', on)
    d.addEventListener('change', on)
    window.addEventListener(EVT, on)
    return () => {
      m.removeEventListener('change', on)
      d.removeEventListener('change', on)
      window.removeEventListener(EVT, on)
    }
  }, [onChange])
}
