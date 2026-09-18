// Локальные данные принадлежат АККАУНТУ, а не браузеру.
//
// Зачем: localStorage один на устройство. Если на телефоне выйти из одного аккаунта и
// зайти в другой, данные первого остаются лежать — и второй человек их видит. Хуже того,
// фоновая синхронизация потом отправила бы чужие данные уже в ЕГО ячейку на сервере
// (pullSync не затирает локальное, когда на сервере у нового аккаунта ещё пусто).
//
// Поэтому рядом с данными храним отметку, чьи они. При входе сверяем: другой аккаунт —
// стираем личные ключи до старта приложения, дальше pullSync подтянет данные владельца
// этого аккаунта с сервера. Сами данные при этом остаются В localStorage — на нём держится
// офлайн-режим PWA, и переносить их полностью на сервер значило бы его сломать.

const OWNER_TAG = 'albert-data-owner'

// Личные данные: стираются при смене аккаунта.
const PERSONAL_PREFIXES = ['albert-', 'ai-sum']
// Исключения — НЕ личные: вход, идентификатор устройства и настройки самого устройства
// (тема, раскладка, язык). Их незачем терять при смене аккаунта.
const KEEP = new Set([
  'albert-auth', 'albert-role', 'albert-device',
  'albert-theme', 'albert-theme-mobile', 'albert-layout',
  OWNER_TAG,
])

const isPersonal = (key) => !KEEP.has(key) && PERSONAL_PREFIXES.some(p => key.startsWith(p))

export function wipePersonalData() {
  try {
    Object.keys(localStorage).filter(isPersonal).forEach(k => localStorage.removeItem(k))
  } catch { /* приватный режим — не критично */ }
}

/*
  Сверить, чьи данные лежат в браузере, с тем, кто вошёл сейчас.
  accountKey — устойчивый идентификатор аккаунта: userId настоящего аккаунта,
  либо роль для владельца/гостя (у них userId нет).
  Возвращает true, если данные пришлось стереть.
*/
export function claimLocalData(accountKey) {
  if (!accountKey) return false
  try {
    const previous = localStorage.getItem(OWNER_TAG)
    if (previous === accountKey) return false
    if (previous) wipePersonalData()      // данные другого аккаунта — не показываем их этому
    localStorage.setItem(OWNER_TAG, accountKey)
    return !!previous
  } catch { return false }
}
