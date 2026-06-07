import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useT } from '../context/LanguageContext.jsx'

export default function DisintegratingText() {
  const t = useT({
    ru: { firstText: 'Дисциплина 99% успеха', secondText: 'Хули-Ули2' },
    en: { firstText: 'Discipline is 99% of success', secondText: 'Huli-Uli2' },
  })
  const FIRST_TEXT = t.firstText
  const SECOND_TEXT = t.secondText
  const [phase, setPhase] = useState('visible') // 'visible' | 'disintegrating' | 'done'
  const [fallenChars, setFallenChars] = useState([])
  const timerRef = useRef(null)

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setPhase('disintegrating')
      startDisintegration()
    }, 10000)
    return () => clearTimeout(timerRef.current)
  }, [])

  function startDisintegration() {
    const chars = FIRST_TEXT.split('')
    chars.forEach((_, i) => {
      setTimeout(() => {
        setFallenChars(prev => [...prev, i])
        if (i === chars.length - 1) {
          setTimeout(() => setPhase('done'), 600)
        }
      }, i * 80 + Math.random() * 60)
    })
  }

  if (phase === 'done') {
    return (
      <motion.p
        className="disintegrating-text second"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {SECOND_TEXT}
      </motion.p>
    )
  }

  return (
    <p className="disintegrating-text first">
      {FIRST_TEXT.split('').map((char, i) => (
        <motion.span
          key={i}
          style={{ display: 'inline-block', whiteSpace: 'pre' }}
          animate={fallenChars.includes(i) ? {
            y: [0, -4, window.innerHeight],
            opacity: [1, 1, 0],
            rotate: (Math.random() - 0.5) * 40
          } : {}}
          transition={{
            duration: 0.9,
            ease: [0.25, 0.46, 0.45, 0.94],
            times: [0, 0.1, 1]
          }}
        >
          {char}
        </motion.span>
      ))}

      <style>{`
        .disintegrating-text {
          font-size: 15px;
          font-weight: 400;
          color: var(--muted);
          line-height: 1.5;
        }
        .disintegrating-text.second {
          color: var(--accent);
          font-weight: 500;
        }
      `}</style>
    </p>
  )
}
