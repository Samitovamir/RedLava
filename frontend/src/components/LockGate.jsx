import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useT } from '../context/LanguageContext.jsx'
import { isLocked, unlockSite } from '../utils/lock.js'

// Глобальный «замок» поверх всего сайта (пасхалка «Перейти на Premium»).
// Появляется, когда сайт заблокирован, и не даёт никуда уйти, пока не введёшь
// верный ответ (9986). Переживает перезагрузку — состояние берётся из localStorage.
export default function LockGate() {
  const t = useT({
    ru: {
      title: 'Никогда не знаешь, когда твоя идея обернётся против тебя',
      hint: 'Решите пример, чтобы вернуть сайт:',
      placeholder: 'Дайте ответ', back: 'Вернуть сайт',
      wrong: 'Неверно. Подумайте ещё 🙂',
    },
    en: {
      title: 'You never know when your own idea will turn against you',
      hint: 'Solve the equation to bring the site back:',
      placeholder: 'Enter the answer', back: 'Bring the site back',
      wrong: 'Wrong. Think again 🙂',
    },
  })

  const [locked, setLocked] = useState(isLocked())
  const [answer, setAnswer] = useState('')
  const [wrong, setWrong] = useState(false)
  const [delay, setDelay] = useState(0)
  const prev = useRef(locked)

  useEffect(() => {
    const onLock = () => {
      const now = isLocked()
      // Переход «разблокировано → заблокировано» (нажали Premium) —
      // даём буквам сначала упасть, потом плавно показываем замок.
      setDelay(now && !prev.current ? 1.8 : 0)
      prev.current = now
      setLocked(now)
      if (!now) { setAnswer(''); setWrong(false) }
    }
    window.addEventListener('albert-lock', onLock)
    return () => window.removeEventListener('albert-lock', onLock)
  }, [])

  function checkAnswer(e) {
    e.preventDefault()
    if (answer.trim() === '9986') unlockSite()
    else setWrong(true)
  }

  return (
    <AnimatePresence>
      {locked && (
        <motion.div
          className="lock-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
          transition={{ duration: 0.8, delay }}
        >
          <motion.h2
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.8, delay: delay + 0.2, ease: 'backOut' }}
          >
            {t.title}
          </motion.h2>
          <motion.div
            className="lock-math"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: delay + 0.5 }}
          >
            <div className="lock-math-hint">{t.hint}</div>
            <div className="lock-expr">√99720196 · ∫₁ᵉ (1/x) dx + ∑(n=1..∞) 1/2ⁿ − 1 = ?</div>
            <form className="lock-answer" onSubmit={checkAnswer}>
              <input
                className={`lock-input ${wrong ? 'err' : ''}`}
                placeholder={t.placeholder}
                inputMode="numeric"
                value={answer}
                onChange={e => { setAnswer(e.target.value); setWrong(false) }}
                autoFocus
              />
              <button className="lock-back-btn" type="submit">{t.back}</button>
            </form>
            {wrong && <div className="lock-wrong">{t.wrong}</div>}
          </motion.div>

          <style>{`
            .lock-overlay {
              position: fixed;
              inset: 0;
              z-index: 1100;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              pointer-events: auto;
              background: radial-gradient(800px circle at 50% 50%, rgba(30,27,24,0.55), rgba(30,27,24,0.92));
              backdrop-filter: blur(3px);
            }
            .lock-overlay h2 {
              font-size: clamp(32px, 6vw, 72px);
              font-weight: 800;
              letter-spacing: -0.02em;
              text-align: center;
              background: linear-gradient(135deg, var(--foreground), var(--accent));
              -webkit-background-clip: text;
              background-clip: text;
              -webkit-text-fill-color: transparent;
              padding: 0 24px;
            }
            .lock-math {
              display: flex; flex-direction: column; align-items: center; gap: 16px;
              margin-top: 36px; padding: 0 24px; max-width: 760px; width: 100%;
            }
            .lock-math-hint { font-size: 14px; color: var(--muted-foreground); }
            .lock-expr {
              font-family: var(--font-serif), 'Times New Roman', Georgia, serif;
              font-size: clamp(20px, 3.2vw, 34px);
              color: var(--foreground);
              text-align: center;
              line-height: 1.5;
              letter-spacing: 0.01em;
            }
            .lock-answer { display: flex; gap: 10px; align-items: center; margin-top: 6px; flex-wrap: wrap; justify-content: center; }
            .lock-input {
              background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px;
              padding: 12px 18px; font-family: inherit; font-size: 18px; color: var(--foreground);
              outline: none; text-align: center; width: 180px; transition: border-color 0.15s;
            }
            .lock-input:focus { border-color: var(--accent); }
            .lock-input.err { border-color: var(--red); }
            .lock-input::placeholder { color: var(--muted-foreground); }
            .lock-wrong { font-size: 14px; color: var(--red); }
            .lock-back-btn {
              font-size: 14px; font-weight: 600; font-family: inherit;
              padding: 11px 24px; border-radius: 16px; cursor: pointer;
              background: var(--accent); color: var(--accent-foreground); border: 1px solid var(--accent);
              transition: opacity 0.15s;
            }
            .lock-back-btn:hover { opacity: 0.9; }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
