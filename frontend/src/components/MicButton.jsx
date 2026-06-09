import { useRef, useState, useEffect } from 'react'

/*
  Кнопка голосового ввода (диктовка по-русски) через Web Speech API браузера.
  Бесплатно, работает в Chrome/Edge/Safari. Если браузер не поддерживает — кнопка не показывается.
  onText(текст) вызывается с распознанной фразой; родитель сам решает, куда её добавить.
*/
const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null

export default function MicButton({ onText, title = 'Надиктовать голосом', primary = false }) {
  const [listening, setListening] = useState(false)
  const recRef = useRef(null)

  useEffect(() => () => { try { recRef.current?.stop() } catch { /* ignore */ } }, [])

  if (!SR) return null

  function toggle() {
    if (listening) { try { recRef.current?.stop() } catch { /* ignore */ } return }
    const rec = new SR()
    rec.lang = 'ru-RU'
    rec.interimResults = false
    rec.continuous = false
    rec.onresult = (e) => {
      let txt = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) txt += e.results[i][0].transcript
      }
      txt = txt.trim()
      if (txt) onText(txt)
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recRef.current = rec
    setListening(true)
    try { rec.start() } catch { setListening(false) }
  }

  return (
    <button
      type="button"
      className={`mic-btn ${primary ? 'primary' : ''} ${listening ? 'listening' : ''}`}
      onClick={toggle}
      title={listening ? 'Остановить' : title}
      aria-label={title}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
        <line x1="12" y1="18" x2="12" y2="22" />
      </svg>
      <style>{`
        .mic-btn {
          flex-shrink: 0;
          width: 38px; height: 38px; border-radius: 11px;
          background: var(--bg-secondary); border: 1px solid var(--border);
          color: var(--muted); cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: color 0.15s, border-color 0.15s, background 0.15s;
        }
        .mic-btn:hover { color: var(--accent); border-color: var(--border-hover); }
        .mic-btn.primary {
          background: var(--accent); color: var(--accent-foreground); border-color: var(--accent);
          box-shadow: inset 0 1.5px 0.5px rgba(255,255,255,0.22), inset 0 -2px 3px rgba(0,0,0,0.22), 0 3px 6px rgba(0,0,0,0.3);
        }
        .mic-btn.primary:hover { filter: brightness(1.07); color: var(--accent-foreground); }
        .mic-btn.listening {
          color: #fff; background: var(--red); border-color: var(--red);
          animation: mic-pulse 1.3s ease-in-out infinite;
        }
        @keyframes mic-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(168, 90, 74,0.5); }
          50% { box-shadow: 0 0 0 7px rgba(168, 90, 74,0); }
        }
      `}</style>
    </button>
  )
}
