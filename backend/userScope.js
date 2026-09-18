import { kvGet, kvSet, kvDel } from './store.js'

/*
  Ключи данных, привязанные к человеку (этап «б» мультипользовательской модели).

  Было: один общий ключ на всё приложение — `google:tokens`, `whoop:tokens`,
  `garmin:token`, `labs:yandex_url`, `labs:store`, `sync:albert:state`. Пока
  пользователь был один, это работало; с появлением аккаунтов любой второй
  человек видел бы и перезаписывал данные первого.

  Стало: `<база>:<id владельца данных>`.

  Владелец старой однопользовательской версии заходит по APP_PASSWORD и получает
  стабильный id OWNER_ID. Его данные переносятся ЛЕНИВО, при первом чтении: если
  персонального ключа ещё нет, а старый общий есть — читаем старый и тут же
  копируем в персональный. Так не нужен отдельный скрипт миграции, который можно
  забыть запустить на проде, и нет момента, когда данные недоступны.

  Тонкость, из-за которой нельзя просто читать со старого ключа: удаление.
  Если «отключить интеграцию» сотрёт только персональный ключ, то при следующем
  чтении сработает откат на старый общий — и отключённая интеграция воскреснет.
  Поэтому kvDelScoped для владельца стирает ОБА ключа.
*/

export const OWNER_ID = 'owner'

export const scopedKey = (base, userId) => `${base}:${userId}`

// id владельца данных для запроса. Гость сюда попадать не должен — у него данных нет.
export function scopeOf(req) {
  if (req.role === 'owner') return OWNER_ID
  return req.userId || null
}

// legacyBase — если старый общий ключ назывался иначе, чем база нового (так у синхронизации:
// раньше `sync:albert:state`, теперь база `sync:state`). Без этого ленивый перенос просто
// не нашёл бы старые данные владельца и они выглядели бы потерянными.
export async function kvGetScoped(base, userId, legacyBase = base) {
  if (!userId) return null
  const own = await kvGet(scopedKey(base, userId))
  if (own !== null && own !== undefined) return own
  if (userId !== OWNER_ID) return null

  // Владелец: данные могли остаться под старым общим ключом — переносим на лету.
  const legacy = await kvGet(legacyBase)
  if (legacy === null || legacy === undefined) return null
  await kvSet(scopedKey(base, userId), legacy)
  return legacy
}

export async function kvSetScoped(base, userId, value) {
  if (!userId) return false
  return await kvSet(scopedKey(base, userId), value)
}

// Стираем и персональный ключ, и (для владельца) старый общий — иначе ленивый
// перенос воскресит только что отключённую интеграцию.
export async function kvDelScoped(base, userId, legacyBase = base) {
  if (!userId) return
  await kvDel(scopedKey(base, userId))
  if (userId === OWNER_ID) await kvDel(legacyBase)
}
