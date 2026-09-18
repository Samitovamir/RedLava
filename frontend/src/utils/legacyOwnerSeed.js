// Разовый перенос личных настроек владельца из кода в его собственные данные.
//
// Зачем: раньше приложение было рассчитано на одного человека, и его личное было
// просто зашито в код — профиль питания по умолчанию (его рост/вес/возраст) и
// привычки прямо в промптах ИИ («тренируется в 06:30», «нет духовки, есть
// конвектомат»). Из-за этого каждый НОВЫЙ аккаунт получал чужие калории и чужие
// привычки. Код стал нейтральным — а чтобы у владельца при этом ничего не поехало,
// эти же данные один раз записываются в его профиль и его память, где им и место.
//
// Запускается один раз (флаг ниже), только для роли 'owner', и только дописывает
// то, чего ещё нет — существующие значения не трогает.

import { PROFILE_KEY, TASTE_KEY, DEFAULT_PREFS } from './nutrition.js'

const SEED_FLAG = 'albert-legacy-seed-v1'
const MEMORY_KEY = 'albert-memory'

// То, что раньше было зашито в код как «для всех», а на самом деле было личным.
const LEGACY_PROFILE = { weight: 75, height: 175, age: 35, sex: 'male', goal: 'lose' }
// Low-FODMAP у владельца назначена врачом. В общих дефолтах её быть не должно
// (иначе лечебная диета достаётся каждому), поэтому включаем её здесь — ему лично.
const LEGACY_PREFS = { fodmap: true }
const LEGACY_FACTS = [
  'Тренируется по утрам, примерно в 06:30',
  'Не любит планировать дела после 21:00',
  'Дома нет духовки — есть конвектомат (пароконвектомат) и обычная плита',
]

export function seedLegacyOwnerData(role) {
  if (role !== 'owner') return
  try {
    if (localStorage.getItem(SEED_FLAG)) return

    // 1) Профиль питания — только если владелец никогда его не сохранял сам.
    if (!localStorage.getItem(PROFILE_KEY)) {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(LEGACY_PROFILE))
    }

    // 2) Вкусовые настройки — только если владелец их ни разу не сохранял сам.
    if (!localStorage.getItem(TASTE_KEY)) {
      localStorage.setItem(TASTE_KEY, JSON.stringify({ ...DEFAULT_PREFS, ...LEGACY_PREFS }))
    }

    // 3) Память — дописываем недостающие факты, ничего не удаляя.
    let facts = []
    try { facts = JSON.parse(localStorage.getItem(MEMORY_KEY) || '[]') } catch { facts = [] }
    if (!Array.isArray(facts)) facts = []
    const known = new Set(facts.map(f => String(f?.text || '').toLowerCase()))
    const missing = LEGACY_FACTS.filter(t => !known.has(t.toLowerCase()))
    if (missing.length) {
      const added = missing.map((text, i) => ({ id: Date.now() + i + Math.random(), text }))
      localStorage.setItem(MEMORY_KEY, JSON.stringify([...facts, ...added]))
    }

    localStorage.setItem(SEED_FLAG, String(Date.now()))
  } catch { /* приватный режим / нет доступа к хранилищу — не критично */ }
}
