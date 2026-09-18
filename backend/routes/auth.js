import { Router } from 'express'
import crypto from 'crypto'
import { signToken, guestRoleForLogin, requireAuth, bumpUserEpoch } from '../authGuard.js'
import { kvGet, kvSet } from '../store.js'
import { createUser, verifyUserPassword, validateCredentials, publicUser, getUserById, MIN_PASSWORD_LENGTH } from '../users.js'

const router = Router()

// --- Защита от подбора (логин и регистрация) ---
// Бэкенд serverless (Vercel) — у каждого вызова может быть новый процесс, поэтому счётчик
// в обычной переменной не сработает (сбрасывается каждый раз). Используем kvGet/kvSet —
// тот же общий стор, что и для дневного лимита ИИ у гостя.
const WINDOW_MS = 15 * 60 * 1000  // окно 15 минут
const LOGIN_MAX_FAILS = 8         // неудачных попыток логина за окно — дальше блок
// Регистраций с одного IP за окно. Настоящая защита от посторонних — REGISTRATION_CODE;
// этот лимит нужен только против скриптового потока, поэтому щедрый: клуб может
// регистрироваться вечером всей командой с одного Wi-Fi (или за NAT оператора),
// и 5 попыток там упирались мгновенно, блокируя живых людей на 15 минут.
const REGISTER_MAX = 30

function attemptKey(prefix, req) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'noip'
  const window = Math.floor(Date.now() / WINDOW_MS)
  return `auth:${prefix}:${ip.replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 45)}:${window}`
}
async function tooManyFails(key, max) {
  return (Number(await kvGet(key)) || 0) >= max
}
async function recordFail(key) {
  await kvSet(key, (Number(await kvGet(key)) || 0) + 1)
}
// Успешная регистрация тоже расходует лимит — иначе «5 регистраций с одного IP» не
// ограничивало бы ничего. НО опечатки в форме (короткий пароль, занятое имя) НЕ считаются:
// они ничего не создают, а человек за клубным Wi-Fi иначе выжигал бы лимит на всех соседей.
const recordAttempt = recordFail
// Минут до конца окна — чтобы в ответе был срок, а не просто «подождите немного»
const minutesLeft = () => Math.max(1, Math.ceil((WINDOW_MS - (Date.now() % WINDOW_MS)) / 60000))

// Сравнение постоянным временем: код приглашения — секрет, а обычное === выдаёт длину
// совпавшего префикса через время ответа.
function safeEqual(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b))
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb)
}

// Публичная информация об условиях входа — чтобы экран входа знал, показывать ли поле
// «код приглашения», и не предлагал регистрацию там, где она закрыта.
router.get('/config', (_req, res) => res.json({
  registrationCodeRequired: !!process.env.REGISTRATION_CODE,
  minPasswordLength: MIN_PASSWORD_LENGTH
}))

// Регистрация обычного аккаунта (username + пароль). Если задан REGISTRATION_CODE —
// требуем его: так клуб раздаёт доступ по приглашению, а не открывает регистрацию всему
// интернету. Переменная не задана — регистрация открыта (удобно на время разработки).
router.post('/register', async (req, res) => {
  const key = attemptKey('register', req)
  if (await tooManyFails(key, REGISTER_MAX)) {
    return res.status(429).json({ error: 'too_many_attempts', retryInMinutes: minutesLeft() })
  }

  const { username, password, code } = req.body || {}

  const required = process.env.REGISTRATION_CODE
  if (required && (typeof code !== 'string' || !code || !safeEqual(code, required))) {
    await recordFail(key)   // подбор кода — считаем
    return res.status(403).json({ error: 'bad_code' })
  }

  // Опечатку в форме лимитом не наказываем (см. комментарий к recordAttempt).
  // Текст ошибки НЕ пишем: отдаём код, фронт покажет его на языке интерфейса —
  // иначе в английском UI вылезала бы русская строка с сервера.
  const invalid = validateCredentials(username, password)
  if (invalid) return res.status(400).json({ error: invalid, minPasswordLength: MIN_PASSWORD_LENGTH })

  const { user, error } = await createUser(username, password)
  if (error === 'name_taken') return res.status(409).json({ error })
  if (error) return res.status(503).json({ error })

  await recordAttempt(key)   // успешная регистрация тоже расходует лимит
  return res.json({ token: await signToken('user', user.id), role: 'user', user: publicUser(user) })
})

// Вход — username + пароль. Два пути подряд, а не развилка по вводу:
//   1) обычный аккаунт (username есть в users:by-login, пароль сходится с хешем);
//   2) если не подошло — гостевое демо по GUEST_PASSWORD (у него нет записи аккаунта).
// Отдельного входа для владельца больше нет: он такой же аккаунт, как остальные,
// а серверные права даёт флаг isAdmin в его записи (см. requireAdmin в authGuard.js).
router.post('/login', async (req, res) => {
  const key = attemptKey('fails', req)
  if (await tooManyFails(key, LOGIN_MAX_FAILS)) {
    return res.status(429).json({ error: 'too_many_attempts', retryInMinutes: minutesLeft() })
  }

  const { username, password } = req.body || {}

  const user = await verifyUserPassword(username, password)
  if (user) return res.json({ token: await signToken('user', user.id), role: 'user', user: publicUser(user) })

  const role = guestRoleForLogin(username, password)
  if (!role) {
    await recordFail(key)  // считаем только неудачи — угадавший с первого раза не наказывается
    return res.status(401).json({ error: 'wrong_password' })
  }
  return res.json({ token: await signToken(role), role })
})

// Проверка действующего токена (для тихого входа при открытии сайта) — возвращаем роль
// и СВЕЖИЙ токен: активный пользователь так продлевает себе сессию на ещё TOKEN_TTL и никогда
// не разлогинивается сам по себе, а истинно заброшенный/украденный токен через TOKEN_TTL истечёт.
router.get('/verify', requireAuth, async (req, res) => {
  // Запись аккаунта нужна фронту для двух вещей: показать «Вы вошли как …» в Настройках
  // и понять, показывать ли админские действия (publicUser отдаёт isAdmin).
  const user = req.role === 'user' ? publicUser(await getUserById(req.userId)) : null
  res.json({ ok: true, role: req.role, userId: req.userId || null, user, token: await signToken(req.role, req.userId) })
})

// «Выйти со всех устройств» — СВОИХ. Поднимает персональную эпоху сессий этого аккаунта:
// все его ранее выданные токены сразу перестают действовать, у остальных ничего не меняется.
// Раньше эпоха была общей и эта кнопка разлогинивала весь клуб — верно для однопользовательской
// версии, где «все сессии» и «мои сессии» совпадали, и неверно с появлением аккаунтов.
// Сценарий: украли телефон → зашёл с ноутбука → (сменил пароль) → выкинул свои сессии.
// Гостю нечего отзывать: у демо нет аккаунта, а значит и персональной эпохи.
router.post('/logout-all', requireAuth, async (req, res) => {
  if (req.role !== 'user' || !req.userId) return res.status(403).json({ error: 'forbidden' })
  await bumpUserEpoch(req.userId)
  // Свежий токен с новой эпохой — чтобы устройство, с которого нажали, осталось внутри.
  res.json({ ok: true, token: await signToken(req.role, req.userId) })
})

export default router
