// Маленькая кнопка «сгенерировать ИИ-текст заново»
export default function AiRefreshButton({ onClick, loading }) {
  return (
    <button className="ai-refresh" onClick={onClick} disabled={loading} title="Сгенерировать заново">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ animation: loading ? 'ai-spin 0.8s linear infinite' : 'none' }}>
        <path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
      </svg>
      <style>{`
        .ai-refresh {
          margin-left: auto; width: 26px; height: 26px; flex-shrink: 0;
          border: 1px solid var(--border); background: transparent; border-radius: 8px;
          color: var(--muted-foreground); cursor: pointer;
          display: flex; align-items: center; justify-content: center; transition: all 0.15s;
        }
        .ai-refresh:hover:not(:disabled) { color: var(--primary); border-color: var(--primary); }
        .ai-refresh:disabled { opacity: 0.5; cursor: default; }
        @keyframes ai-spin { to { transform: rotate(360deg); } }
      `}</style>
    </button>
  )
}
