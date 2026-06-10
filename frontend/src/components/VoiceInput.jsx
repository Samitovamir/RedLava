import { useRef, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useLang, useT } from '../context/LanguageContext.jsx'

/*
  Голосовой ввод как ОСНОВНОЙ способ: большая кнопка-микрофон с живой расшифровкой
  по-русски (Web Speech API). Текстовый ввод — вторичная альтернатива (раскрывается).
  Если браузер не поддерживает распознавание — сразу показываем текстовое поле.
  Props: value, onChange(value), onSubmit(), busy.
*/
const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null

export default function VoiceInput({ value, onChange, onSubmit, busy }) {
  const { lang } = useLang()
  const t = useT({
    ru: {
      stop: 'Остановить запись', start: 'Начать запись голосом',
      noVoice: 'Голос недоступен в этом браузере. Напечатайте задачу ниже.',
      hear: (i) => `Слышу: ${i}`, listening: 'Слушаю… говорите', press: 'Нажмите и говорите',
      placeholder: 'Здесь появится распознанный текст — можно поправить или напечатать задачу',
      clear: 'Очистить', submit: 'Выполнить',
      hideField: 'Скрыть поле ввода', typeInstead: 'или напечатать текстом'
    },
    en: {
      stop: 'Stop recording', start: 'Start voice recording',
      noVoice: 'Voice input is not available in this browser. Type your task below.',
      hear: (i) => `Hearing: ${i}`, listening: 'Listening… go ahead', press: 'Tap and speak',
      placeholder: 'Recognized text will appear here — you can edit it or type a task',
      clear: 'Clear', submit: 'Run',
      hideField: 'Hide input field', typeInstead: 'or type instead'
    }
  })
  const supported = !!SR
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [showText, setShowText] = useState(!supported)
  const recRef = useRef(null)
  const valueRef = useRef(value)
  useEffect(() => { valueRef.current = value }, [value])
  useEffect(() => () => { try { recRef.current?.stop() } catch { /* ignore */ } }, [])

  function toggle() {
    if (!supported) { setShowText(true); return }
    if (listening) { try { recRef.current?.stop() } catch { /* ignore */ } return }
    const rec = new SR()
    rec.lang = lang === 'en' ? 'en-US' : 'ru-RU'
    rec.interimResults = true
    rec.continuous = true
    rec.onresult = (e) => {
      let fin = '', itm = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const tr = e.results[i][0].transcript
        if (e.results[i].isFinal) fin += tr; else itm += tr
      }
      if (fin.trim()) onChange((valueRef.current ? valueRef.current.trim() + ' ' : '') + fin.trim())
      setInterim(itm)
    }
    rec.onend = () => { setListening(false); setInterim('') }
    rec.onerror = () => { setListening(false); setInterim('') }
    recRef.current = rec
    setListening(true)
    try { rec.start() } catch { setListening(false) }
  }

  const hasText = !!(value && value.trim())
  // Единое редактируемое поле: показываем, как только есть текст, идёт запись или
  // пользователь сам открыл ручной ввод. Никакого дублирования «плашка + textarea».
  const showField = hasText || listening || showText

  return (
    <div className="vi">
      <div className="vi-voice">
        <motion.button
          type="button"
          className={`vi-mic ${listening ? 'listening' : ''}`}
          onClick={toggle}
          whileTap={{ scale: 0.94 }}
          aria-label={listening ? t.stop : t.start}
        >
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
            <line x1="12" y1="18" x2="12" y2="22" />
          </svg>
        </motion.button>
        <div className="vi-hint">
          {!supported
            ? t.noVoice
            : listening ? (interim ? t.hear(interim) : t.listening) : t.press}
        </div>
      </div>

      {showField && (
        <textarea
          className="vi-field"
          placeholder={t.placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={3}
        />
      )}

      <div className="vi-actions">
        {hasText && <button type="button" className="vi-clear" onClick={() => onChange('')}>{t.clear}</button>}
        <button type="button" className="vi-submit" onClick={onSubmit} disabled={busy || !hasText}>
          {t.submit}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
      </div>

      {supported && !hasText && !listening && (
        <button type="button" className="vi-text-toggle" onClick={() => setShowText(s => !s)}>
          {showText ? t.hideField : t.typeInstead}
        </button>
      )}

      <style>{`
        .vi { display: flex; flex-direction: column; align-items: center; gap: 14px; flex: 1; }
        .vi-voice { display: flex; flex-direction: column; align-items: center; gap: 12px; padding-top: 6px; }
        .vi-mic {
          width: 96px; height: 96px; border-radius: 50%;
          background: var(--accent); color: var(--accent-foreground);
          border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
          /* выпуклость без свечения: кромка света сверху + внутренняя тень снизу + тень под кнопкой */
          box-shadow: inset 0 2px 0.5px rgba(255,255,255,0.22), inset 0 -3px 5px rgba(0,0,0,0.22), 0 5px 12px rgba(0,0,0,0.4);
          transition: filter 0.15s, box-shadow 0.2s;
        }
        .vi-mic:hover { filter: brightness(1.06); }
        .vi-mic.listening {
          background: var(--red); color: var(--on-accent);
          box-shadow: 0 0 0 0 color-mix(in srgb, var(--red) 55%, transparent);
          animation: vi-pulse 1.4s ease-in-out infinite;
        }
        @keyframes vi-pulse {
          0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--red) 50%, transparent); }
          50% { box-shadow: 0 0 0 16px color-mix(in srgb, var(--red) 0%, transparent); }
        }
        .vi-hint { font-size: 15px; font-weight: 600; color: var(--muted); text-align: center; }

        .vi-field {
          width: 100%; background: var(--bg-secondary); border: 1px solid var(--border);
          border-radius: 12px; padding: 14px 16px; font-family: inherit; font-size: 17px; line-height: 1.55;
          color: var(--foreground); min-height: 56px; resize: vertical; outline: none; transition: border-color 0.15s;
        }
        .vi-field:focus { border-color: var(--accent); }
        .vi-field::placeholder { color: var(--muted); }

        .vi-actions { display: flex; align-items: center; gap: 12px; align-self: stretch; justify-content: flex-end; }
        .vi-clear {
          background: transparent; border: 1px solid var(--border); border-radius: 12px;
          padding: 10px 16px; font-family: inherit; font-size: 14px; color: var(--muted); cursor: pointer; transition: all 0.15s;
        }
        .vi-clear:hover { color: var(--foreground); border-color: var(--border-hover); }
        .vi-submit {
          display: flex; align-items: center; gap: 8px; padding: 11px 22px;
          background: linear-gradient(180deg, var(--accent-btn-top), var(--accent-btn-bot)); color: var(--on-accent); border: none; border-radius: 12px;
          font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer; transition: opacity 0.18s, transform 0.1s, filter 0.15s;
        }
        .vi-submit:hover:not(:disabled) { filter: brightness(1.06); }
        .vi-submit:active:not(:disabled) { transform: scale(0.97); }
        .vi-submit:disabled { background: var(--bg-tile); color: var(--text-faint); border: 1px solid var(--border-med); opacity: 0.6; cursor: not-allowed; }

        .vi-text-toggle {
          background: transparent; border: none; color: var(--muted); font-family: inherit;
          font-size: 13px; cursor: pointer; text-decoration: none; padding: 4px 2px;
        }
        .vi-text-toggle:hover { color: var(--accent); }
      `}</style>
    </div>
  )
}
