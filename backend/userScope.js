import { kvGet, kvSet, kvDel } from './store.js'

/*
  Ключи данных, привязанные к человеку. Это и есть изоляция аккаунтов друг от друга.

  Было: один общий ключ на всё приложение — `google:tokens`, `whoop:tokens`,
  `garmin:token`, `labs:yandex_url`, `labs:store`, `sync:state`. Пока пользователь был
  один, это работало; с появлением аккаунтов любой второй человек видел бы и
  перезаписывал данные первого.

  Стало: `<база>:<id владельца данных>`. Без исключений — привилегированного
  пользователя с фиксированным id в системе нет, у каждого аккаунта свой UUID.

  Раньше здесь жил ещё ленивый перенос данных с тех старых общих ключей на владельца
  (и парное удаление, чтобы отключённая интеграция не воскресала при следующем чтении).
  Это удалено вместе с ролью 'owner': переносить было нечего — токены интеграций за
  месяцы простоя истекли всё равно, а владелец завёл обычный аккаунт, как все.
*/

export const scopedKey = (base, userId) => `${base}:${userId}`

// id владельца данных для запроса. У гостя его нет — своих данных у демо не бывает.
export const scopeOf = (req) => req.userId || null

export async function kvGetScoped(base, userId) {
  if (!userId) return null
  const value = await kvGet(scopedKey(base, userId))
  return value === undefined ? null : value
}

export async function kvSetScoped(base, userId, value) {
  if (!userId) return false
  return await kvSet(scopedKey(base, userId), value)
}

export async function kvDelScoped(base, userId) {
  if (!userId) return
  await kvDel(scopedKey(base, userId))
}
