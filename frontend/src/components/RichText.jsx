/*
  Лёгкий рендер ИИ-текста для читаемости длинных ответов: **жирный**, списки (- / •),
  абзацы по пустой строке. Без тяжёлого markdown-парсера. Оформление сдержанное:
  жирный — ярче и с лёгким подкрасом под «цвет ИИ» (--ai), маркеры списков — точки --ai.
*/

function renderInline(text, kp) {
  const parts = []
  const re = /\*\*(.+?)\*\*/g
  let last = 0, m, i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(<strong key={`${kp}b${i++}`}>{m[1]}</strong>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length ? parts : text
}

export default function RichText({ children, className = '' }) {
  const raw = String(children ?? '')
  const lines = raw.split('\n')
  const blocks = []
  let list = null
  const flush = (key) => { if (list) { blocks.push(<ul key={`ul${key}`} className="rt-ul">{list}</ul>); list = null } }
  lines.forEach((line, idx) => {
    const t = line.trim()
    if (/^[-•]\s+/.test(t)) {
      if (!list) list = []
      list.push(<li key={`li${idx}`}>{renderInline(t.replace(/^[-•]\s+/, ''), `li${idx}`)}</li>)
    } else {
      flush(idx)
      if (t) blocks.push(<p key={`p${idx}`} className="rt-p">{renderInline(t, `p${idx}`)}</p>)
    }
  })
  flush('end')

  return (
    <div className={`rt ${className}`}>
      {blocks}
      <style>{`
        .rt { display: flex; flex-direction: column; gap: 8px; }
        .rt-p { margin: 0; }
        .rt strong {
          font-weight: 700;
          color: color-mix(in srgb, var(--ai, var(--accent)) 22%, var(--text-primary));
        }
        .rt-ul { margin: 1px 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
        .rt-ul li { position: relative; padding-left: 17px; }
        .rt-ul li::before {
          content: ""; position: absolute; left: 3px; top: 0.62em;
          width: 5px; height: 5px; border-radius: 50%;
          background: var(--ai, var(--accent)); transform: translateY(-50%);
        }
      `}</style>
    </div>
  )
}
