import { useState } from 'react'
import { Brain, X, Sparkles } from 'lucide-react'
import { useMemoryFacts } from '../context/MemoryContext.jsx'
import { useT } from '../context/LanguageContext.jsx'

// «Память помощника»: факты и предпочтения об пользователе, которые ИИ учитывает всегда.
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
        <span className="mem-icon" aria-hidden>
          <Brain size={20} strokeWidth={1.5} />
        </span>
        <div>
          <div className="mem-title">{t.title}</div>
          <div className="mem-sub muted">{t.sub}</div>
        </div>
      </div>

      <div className="mem-facts">
        {facts.length === 0 ? (
          <div className="mem-empty">
            <Sparkles size={20} strokeWidth={1.5} className="mem-empty-icon" />
            <span className="mem-empty-text">{t.empty}</span>
          </div>
        ) : (
          facts.map(f => (
            <span key={f.id} className="mem-fact">
              {f.text}
              <button className="mem-x" onClick={() => removeFact(f.id)} title={t.forget} aria-label={t.forget}>
                <X size={12} strokeWidth={2} />
              </button>
            </span>
          ))
        )}
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
        .mem-icon {
          display: flex; align-items: center; justify-content: center;
          color: var(--accent); margin-top: 1px;
        }
        .mem-title { font-size: 16px; font-weight: 700; color: var(--foreground); }
        .mem-sub { font-size: 12.5px; margin-top: 2px; }
        .mem-facts { display: flex; flex-wrap: wrap; gap: 8px; }

        /* Аккуратный empty-state: line-иконка + текст */
        .mem-empty {
          display: flex; align-items: center; gap: 10px;
          width: 100%; padding: 14px 16px;
          background: var(--bg-tile); border: 1px solid var(--border-med);
          border-radius: var(--radius-md);
        }
        .mem-empty-icon { color: var(--text-muted); flex-shrink: 0; }
        .mem-empty-text { font-size: 13px; color: var(--text-muted); line-height: 1.45; }

        .mem-fact {
          display: inline-flex; align-items: center; gap: 8px;
          background: var(--bg-tile); color: var(--text-body);
          border: 1px solid var(--border-med); border-radius: 20px;
          padding: 6px 8px 6px 14px; font-size: 13px;
        }
        .mem-x {
          width: 18px; height: 18px; border-radius: 50%; border: none;
          background: var(--bg-secondary); color: var(--text-muted);
          cursor: pointer; padding: 0;
          display: flex; align-items: center; justify-content: center; transition: all 0.15s;
        }
        .mem-x:hover { background: var(--status-crit); color: var(--on-accent); }
        .mem-add { display: flex; gap: 8px; }
        .mem-input {
          flex: 1; background: var(--bg-tile); border: 1px solid var(--border-med);
          border-radius: var(--radius-sm); padding: 9px 12px; font-family: inherit; font-size: 13.5px;
          color: var(--foreground); outline: none; transition: border-color 0.2s;
        }
        .mem-input:focus { border-color: var(--accent); }
        .mem-input::placeholder { color: var(--text-faint); }
        /* Кнопка не из глобального CTA-списка — применяем тот же приём токенами вручную */
        .mem-add-btn {
          flex-shrink: 0; padding: 9px 16px; border-radius: var(--radius-sm);
          border: none; background: linear-gradient(180deg, var(--accent-btn-top), var(--accent-btn-bot));
          color: var(--on-accent);
          font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s;
        }
        .mem-add-btn:hover:not(:disabled) { filter: brightness(1.06); }
        /* Честное disabled: нейтральная плашка + приглушённый текст */
        .mem-add-btn:disabled {
          background: var(--bg-tile); color: var(--text-faint);
          border: 1px solid var(--border-med); box-shadow: none;
          opacity: 0.6; cursor: not-allowed;
        }
      `}</style>
    </div>
  )
}
