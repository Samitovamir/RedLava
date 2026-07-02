import { Sparkles } from 'lucide-react'
import RichText from './RichText.jsx'

/*
  Единый блок ИИ-совета для всего сайта: нейтральный фон + рамка «цвета ИИ»
  (--ai: золото на тёмных темах, фиолет на светлых) + бегущая волна свечения + метка.
  Стили — в index.css (.ai-advice / .ai-glow). Использование: <AiAdvice>{текст}</AiAdvice>
  Пропсы: label (метка), glow ('soft'|'mid'|'strong'), showLabel, as (тег), className.
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
