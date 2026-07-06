/*
  ВРЕМЕННО: страница-отладка. Тянет сырые ответы Garmin/Whoop изнутри приложения
  (где есть токен), чтобы владелец мог прислать реальный JSON для правки маппинга полей.
  Убрать после диагностики.
*/
import { useState } from 'react'

const PATHS = ['/api/garmin/insights', '/api/garmin/data', '/api/whoop/data']

export default function DebugDump() {
  const [out, setOut] = useState('')
  const [loading, setLoading] = useState(false)

  const run = async () => {
    setLoading(true); setOut('Загрузка…')
    const parts = []
    for (const p of PATHS) {
      try {
        const r = await fetch(p)
        let body
        try { body = JSON.stringify(await r.json(), null, 2) } catch { body = await r.text() }
        parts.push(`===== ${p} (HTTP ${r.status}) =====\n${body}`)
      } catch (e) { parts.push(`===== ${p} — ОШИБКА =====\n${String(e)}`) }
    }
    setOut(parts.join('\n\n')); setLoading(false)
  }
  const copy = async () => { try { await navigator.clipboard.writeText(out) } catch { /* ignore */ } }

  return (
    <div className="card settings-card">
      <div className="settings-card-head">
        <span className="settings-card-title">Отладка (временно)</span>
        <span className="settings-card-hint">Сырые данные Garmin/Whoop — для диагностики подписей. Нажми «Показать», затем «Копировать» и пришли текст.</span>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="settings-lang" onClick={run} disabled={loading} style={{ maxWidth: 160 }}>{loading ? 'Гружу…' : 'Показать'}</button>
        {out && !loading && <button className="settings-lang" onClick={copy} style={{ maxWidth: 160 }}>Копировать</button>}
      </div>
      {out && (
        <pre style={{ maxHeight: 380, overflow: 'auto', fontSize: 11, lineHeight: 1.45, background: 'var(--bg-tile)', border: '1px solid var(--border-med)', padding: 12, borderRadius: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-body)', margin: 0 }}>{out}</pre>
      )}
    </div>
  )
}
