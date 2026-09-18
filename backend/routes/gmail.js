import { Router } from 'express'
import { kvGetScoped, scopeOf } from '../userScope.js'
import { getAccessToken } from './calendar.js'
import { msg as uiMsg } from '../messages.js'

// Sending mail through the Gmail API (one shared Google sign-in, server-side — the user needs no keys).
// Mounted behind requireAuth in app.js.
const router = Router()
const TOKENS_KEY = 'google:tokens'

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

// Encode a non-ASCII header (the subject) per RFC 2047
function encodeHeader(str) {
  // RFC 2047 defines the ASCII range literally as \x00-\x7F, so the control
  // characters in this class are deliberate: it is the standard test for whether
  // a header needs encoding at all.
  // eslint-disable-next-line no-control-regex
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

// Is sending available (is Google connected)
router.get('/status', async (req, res) => {
  const t = await kvGetScoped(TOKENS_KEY, scopeOf(req))
  res.json({ connected: !!t?.refresh_token })
})

// Send an email
router.post('/send', async (req, res) => {
  const { to, subject, body } = req.body || {}
  if (!validEmail(to)) return res.json({ ok: false, message: uiMsg(req, 'mailBadTo') })
  if (!String(body || '').trim()) return res.json({ ok: false, message: uiMsg(req, 'mailEmpty') })

  const access = await getAccessToken(scopeOf(req))
  if (!access) return res.json({ ok: false, message: uiMsg(req, 'mailNoGoogle') })

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
    res.json({ ok: false, message: uiMsg(req, 'mailNetwork') })
  }
})

export default router
