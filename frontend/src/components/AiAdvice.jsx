import { Sparkles } from 'lucide-react'
import RichText from './RichText.jsx'

/*
  One AI-advice block for the whole site: a neutral background, a border in the "AI colour"
  (--ai: gold on dark themes, violet on light ones), a running glow wave and a label.
  Styles live in index.css (.ai-advice / .ai-glow). Usage: <AiAdvice>{text}</AiAdvice>
  Props: label, glow ('soft'|'mid'|'strong'), showLabel, as (the tag), className.
*/
export default function AiAdvice({
  children,
  label = 'ИИ-совет',
  glow = 'mid',
  showLabel = true,
  as: Tag = 'div',
  className = '',
  ...rest
}) {
  const glowCls = glow === 'soft' ? 'ai-glow-soft' : glow === 'strong' ? 'ai-glow-strong' : ''
  return (
    <Tag className={`ai-advice ai-glow ${glowCls} ${className}`.trim()} {...rest}>
      {showLabel && (
        <span className="ai-advice-label"><Sparkles size={13} strokeWidth={2.2} />{label}</span>
      )}
      <div className="ai-advice-body">
        {typeof children === 'string' ? <RichText>{children}</RichText> : children}
      </div>
    </Tag>
  )
}
