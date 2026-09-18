import { kvGet, kvSet, kvDel } from './store.js'

/*
  Data keys tied to a person. This is what isolates accounts from one another.

  Before: a single key shared by the whole app — `google:tokens`, `whoop:tokens`,
  `garmin:token`, `labs:yandex_url`, `labs:store`, `sync:state`. That worked while there
  was only one user; once accounts existed, any second person would have seen and
  overwritten the first person's data.

  Now: `<base>:<data owner's id>`. No exceptions — the system has no privileged user
  with a fixed id, every account carries its own UUID.

  This file also used to hold a lazy migration of data from those old shared keys onto
  the owner (plus a paired delete, so that a disconnected integration wouldn't come back
  to life on the next read). That went away together with the 'owner' role: there was
  nothing left to migrate — the integration tokens expired over months of idleness
  anyway, and the owner signed up for an ordinary account like everybody else.
*/

export const scopedKey = (base, userId) => `${base}:${userId}`

// The data owner's id for this request. A guest has none — the demo never has data of its own.
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
