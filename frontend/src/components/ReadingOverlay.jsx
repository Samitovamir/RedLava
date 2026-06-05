import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

/*
  Режим чтения. Отдельное окно поверх сайта (не на весь экран),
  фон заблюрен и затемнён. Прокручивается. Картинки от ИИ (Wikipedia).
  Ведёт ДИАЛОГ: внизу можно задать уточняющий вопрос, ИИ помнит контекст.
  Закрытие: крестик, клик по фону, Esc.
  props: { open, entries:[{q,text,images,loadingImages}], loading, onClose, onAsk }
*/

// Разложить текст на абзацы и вставить между ними картинки
function buildBlocks(text, images = []) {
  const paragraphs = (text || '').split(/\n{2,}/).map(s => s.trim()).filter(Boolean)
  const blocks = []
  const step = Math.max(1, Math.ceil(paragraphs.length / (images.length || 1)))
  let placed = 0
  paragraphs.forEach((p, i) => {
    blocks.push({ type: 'p', value: p })
    if (images[placed] && i > 0 && i % step === 0) {
      blocks.push({ type: 'img', value: images[placed] }); placed++
    }
  })
  while (placed < images.length) { blocks.push({ type: 'img', value: images[placed] }); placed++ }
  return blocks
}

export default function ReadingOverlay({ open, entries = [], loading, onClose, onAsk }) {
  const [q, setQ] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])

  // Автопрокрутка вниз при новом ответе / загрузке
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [entries.length, loading])

  function submit(e) {
    e.preventDefault()
    const text = q.trim()
    if (!text || loading) return
    setQ('')
    onAsk?.(text)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="ro-backdrop"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            className="ro-panel"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="ro-head">
              <div className="ro-head-left">
                <span className="ro-badge">ИИ</span>
                <span className="ro-mode">Режим чтения</span>
              </div>
              <button className="ro-close" onClick={onClose} aria-label="Закрыть">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="ro-scroll" ref={scrollRef}>
              {entries.map((e, ei) => {
                const blocks = buildBlocks(e.text, e.images || [])
                return (
                  <article className="ro-entry" key={ei}>
                    {ei === 0
                      ? <h2 className="ro-title">{e.q}</h2>
                      : <div className="ro-followq"><span>{e.q}</span></div>}
                    {e.loadingImages && (
                      <div className="ro-img-loading"><span className="ro-img-spin" /> Подбираю иллюстрации…</div>
                    )}
                    <div className="ro-body">
                      {blocks.map((b, i) =>
                        b.type === 'p'
                          ? <p key={i} className="ro-para">{b.value}</p>
                          : (
                            <figure key={i} className="ro-figure">
                              <img src={b.value.src} alt={b.value.title} loading="lazy"
                                onError={ev => { const f = ev.currentTarget.closest('figure'); if (f) f.style.display = 'none' }} />
                              <figcaption>{b.value.title}</figcaption>
                            </figure>
                          )
                      )}
                    </div>
                  </article>
                )
              })}
              {loading && <div className="ro-thinking"><span className="ro-img-spin" /> Думаю…</div>}
            </div>

            <form className="ro-ask" onSubmit={submit}>
              <input
                className="ro-ask-input"
                placeholder="Спросить дальше по этой теме…"
                value={q}
                onChange={ev => setQ(ev.target.value)}
                disabled={loading}
              />
              <button className="ro-ask-send" type="submit" disabled={!q.trim() || loading} aria-label="Спросить">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </form>
          </motion.div>

          <style>{`
            .ro-backdrop {
              position: fixed; inset: 0; z-index: 1000;
              display: flex; align-items: center; justify-content: center;
              padding: 4vh 20px;
              background: rgba(15, 13, 11, 0.55);
              backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
            }
            .ro-panel {
              width: min(820px, 100%); max-height: 92vh;
              display: flex; flex-direction: column;
              background: var(--card); border: 1px solid var(--border);
              border-radius: 20px; overflow: hidden;
              box-shadow: 0 30px 80px rgba(0,0,0,0.55);
            }
            .ro-head {
              display: flex; align-items: center; justify-content: space-between;
              padding: 16px 20px; border-bottom: 1px solid var(--border); flex-shrink: 0;
            }
            .ro-head-left { display: flex; align-items: center; gap: 10px; }
            .ro-badge {
              font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
              color: var(--primary-foreground); background: var(--primary);
              padding: 3px 8px; border-radius: 6px;
            }
            .ro-mode { font-size: 13px; font-weight: 600; color: var(--muted-foreground); }
            .ro-close {
              width: 36px; height: 36px; border-radius: 10px; border: none;
              background: var(--bg-secondary); color: var(--muted-foreground);
              display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s;
            }
            .ro-close:hover { color: var(--foreground); background: var(--bg-primary); }

            .ro-scroll { overflow-y: auto; padding: 24px 32px 8px; }
            .ro-scroll::-webkit-scrollbar { width: 10px; }
            .ro-scroll::-webkit-scrollbar-thumb { background: var(--bg-secondary); border-radius: 8px; }
            .ro-entry + .ro-entry { margin-top: 26px; }
            .ro-title {
              font-size: 26px; font-weight: 700; color: var(--foreground);
              line-height: 1.25; margin: 0 0 18px;
            }
            .ro-title::first-letter { text-transform: uppercase; }
            .ro-followq {
              display: flex; align-items: center; gap: 10px; margin: 0 0 16px;
              padding-top: 22px; border-top: 1px solid var(--border);
            }
            .ro-followq span {
              font-size: 17px; font-weight: 700; color: var(--primary);
            }
            .ro-followq span::first-letter { text-transform: uppercase; }

            .ro-img-loading, .ro-thinking {
              display: flex; align-items: center; gap: 10px;
              font-size: 14px; color: var(--muted-foreground); margin: 10px 0;
            }
            .ro-img-spin {
              width: 16px; height: 16px; border-radius: 50%;
              border: 2px solid var(--bg-secondary); border-top-color: var(--primary);
              animation: ro-spin 0.8s linear infinite;
            }
            @keyframes ro-spin { to { transform: rotate(360deg); } }

            .ro-body { display: flex; flex-direction: column; gap: 16px; }
            .ro-para {
              font-size: 18px; line-height: 1.8; color: var(--foreground);
              white-space: pre-wrap; margin: 0;
            }
            .ro-figure { margin: 6px 0; display: flex; flex-direction: column; gap: 6px; }
            .ro-figure img {
              width: 100%; max-height: 420px; object-fit: cover;
              border-radius: 14px; border: 1px solid var(--border); display: block;
            }
            .ro-figure figcaption { font-size: 13px; color: var(--muted-foreground); text-align: center; }

            .ro-ask {
              display: flex; gap: 8px; align-items: center;
              padding: 14px 20px; border-top: 1px solid var(--border); flex-shrink: 0;
            }
            .ro-ask-input {
              flex: 1; background: var(--bg-secondary); border: 1px solid var(--border);
              border-radius: 12px; padding: 13px 16px; font-family: inherit; font-size: 16px;
              color: var(--foreground); outline: none; transition: border-color 0.15s;
            }
            .ro-ask-input:focus { border-color: var(--primary); }
            .ro-ask-input::placeholder { color: var(--muted-foreground); }
            .ro-ask-send {
              flex-shrink: 0; width: 46px; height: 46px; border-radius: 12px; border: none;
              background: var(--primary); color: var(--primary-foreground);
              display: flex; align-items: center; justify-content: center; cursor: pointer; transition: opacity 0.15s;
            }
            .ro-ask-send:hover:not(:disabled) { opacity: 0.9; }
            .ro-ask-send:disabled { opacity: 0.4; cursor: default; }

            @media (max-width: 560px) {
              .ro-scroll { padding: 18px 18px 4px; }
              .ro-title { font-size: 22px; }
              .ro-para { font-size: 17px; }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
