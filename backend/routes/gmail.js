import { Router } from 'express'
import { kvGet } from '../store.js'
import { getAccessToken } from './calendar.js'

// Отправка писем через Gmail API (один общий вход Google, server-side — ключи пользователю не нужны).
// Монтируется с requireAuth на уровне app.js.
const router = Router()
const TOKENS_KEY = 'google:tokens'

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

// Кодируем не-ASCII заголовок (тема) по RFC 2047
function encodeHeader(str) {
  if (/^[\x00-\x7F]*$/.test(str)) return str
  return `=?UTF-8?B?${Buffer.from(str, 'utf8').toString('base64')}?=`
}

function buildMime({ to, subject, body }) {
  const headers = [
    `To: ${to}`,
    `Subject: ${encodeHeader(subject || '')}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64'
  ]
  const encodedBody = Buffer.from(body || '', 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n')
  return headers.join('\r\n') + '\r\n\r\n' + encodedBody
}

const validEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || '').trim())

// Доступна ли отправка (Google подключён)
router.get('/status', async (_req, res) => {
  const t = await kvGet(TOKENS_KEY)
  res.json({ connected: !!t?.refresh_token })
})

// Отправить письмо
router.post('/send', async (req, res) => {
  const { to, subject, body } = req.body || {}
  if (!validEmail(to)) return res.json({ ok: false, message: 'Укажите корректный email получателя.' })
  if (!String(body || '').trim()) return res.json({ ok: false, message: 'Пустое письмо — добавьте текст.' })

  const access = await getAccessToken()
  if (!access) return res.json({ ok: false, message: 'Google не подключён. Подключите Google в разделе «Подключения».' })

  try {
    const raw = b64url(buildMime({ to: String(to).trim(), subject, body }))
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw })
    })
    if (!r.ok) {
      const errText = await r.text().catch(() => '')
      const needReauth = r.status === 403 || /insufficient|scope|permission|ACCESS_TOKEN_SCOPE/i.test(errText)
      return res.json({
        ok: false,
        message: needReauth
          ? 'Нет доступа к отправке писем. Переподключите Google в «Подключениях» (нужно заново разрешить отправку почты).'
          : 'Не удалось отправить письмо. Попробуйте ещё раз.'
      })
    }
    res.json({ ok: true })
  } catch {
    res.json({ ok: false, message: 'Ошибка отправки. Проверьте соединение.' })
  }
})

export default router
