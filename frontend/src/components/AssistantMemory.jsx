import { useState } from 'react'
import { useMemoryFacts } from '../context/MemoryContext.jsx'
import { useT } from '../context/LanguageContext.jsx'

// «Память помощника»: факты и предпочтения об владельце, которые ИИ учитывает всегда.
// Пополняется вручную здесь или самим ИИ (через команду в чате).
export default function AssistantMemory() {
  const { facts, addFact, removeFact } = useMemoryFacts()
  const [input, setInput] = useState('')
  const t = useT({
    ru: {
      title: 'Память помощника',
      sub: 'Что ИИ помнит о вас и учитывает в советах и планировании',
      empty: 'Пока ничего не запомнено. Добавьте факт или скажите ассистенту «запомни, что…».',
      forget: 'Забыть',
      placeholder: 'Добавить факт о себе…',
      remember: 'Запомнить'
    },
    en: {
      title: 'Assistant memory',
      sub: 'What the AI remembers about you and factors into advice and planning',
      empty: 'Nothing saved yet. Add a fact or tell the assistant “remember that…”.',
      forget: 'Forget',
      placeholder: 'Add a fact about yourself…',
      remember: 'Remember'
    }
  })

  function add() {
    if (!input.trim()) return
    addFact(input.trim())
    setInput('')
  }

  return (
    <div className="card mem-card">
      <div className="mem-head">
        <span className="mem-icon" aria-hidden>🧠</span>
        <div>
          <div className="mem-title">{t.title}</div>
          <div className="mem-sub muted">{t.sub}</div>
        </div>
      </div>

      <div className="mem-facts">
        {facts.length === 0 && <span className="muted mem-empty">{t.empty}</span>}
        {facts.map(f => (
          <span key={f.id} className="mem-fact">
            {f.text}
            <button className="mem-x" onClick={() => removeFact(f.id)} title={t.forget}>×</button>
          </span>
        ))}
      </div>

      <div className="mem-add">
        <input
          className="mem-input"
          placeholder={t.placeholder}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }}
        />
        <button className="mem-add-btn" onClick={add} disabled={!input.trim()}>{t.remember}</button>
      </div>

      <style>{`
        .mem-card { display: flex; flex-direction: column; gap: 14px; }
        .mem-head { display: flex; align-items: flex-start; gap: 12px; }
        .mem-icon { font-size: 22px; line-height: 1; }
        .mem-title { font-size: 16px; font-weight: 700; color: var(--foreground); }
        .mem-sub { font-size: 12.5px; margin-top: 2px; }
        .mem-facts { display: flex; flex-wrap: wrap; gap: 8px; }
        .mem-empty { font-size: 13px; }
        .mem-fact {
          display: inline-flex; align-items: center; gap: 8px;
          background: rgba(176, 123, 82,0.12); color: var(--foreground);
          border: 1px solid var(--border); border-radius: 20px;
          padding: 6px 8px 6px 14px; font-size: 13px;
        }
        .mem-x {
          width: 18px; height: 18px; border-radius: 50%; border: none;
          background: var(--bg-secondary); color: var(--muted-foreground);
          cursor: pointer; font-size: 14px; line-height: 1;
          display: flex; align-items: center; justify-content: center; transition: all 0.15s;
        }
        .mem-x:hover { background: var(--red); color: #fff; }
        .mem-add { display: flex; gap: 8px; }
        .mem-input {
          flex: 1; background: var(--bg-secondary); border: 1px solid var(--border);
          border-radius: 10px; padding: 9px 12px; font-family: inherit; font-size: 13.5px;
          color: var(--foreground); outline: none; transition: border-color 0.2s;
        }
        .mem-input:focus { border-color: var(--primary); }
        .mem-input::placeholder { color: var(--muted-foreground); }
        .mem-add-btn {
          flex-shrink: 0; padding: 9px 16px; border-radius: 10px;
          border: 1px solid var(--primary); background: transparent; color: var(--primary);
          font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s;
        }
        .mem-add-btn:hover:not(:disabled) { background: rgba(176, 123, 82,0.12); }
        .mem-add-btn:disabled { opacity: 0.4; cursor: default; }
      `}</style>
    </div>
  )
}
