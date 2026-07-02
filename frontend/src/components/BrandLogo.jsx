import { useLang } from '../context/LanguageContext.jsx'

// Бренд-марка RED LAVA (щит + «REDLAVA») для шапки Главной.
// Источник — фирменный логотип команды по триатлону (лого2.cdr → PNG
// с прозрачным фоном). Слоган «TRIATHLON TEAM» в марке намеренно обрезан:
// на размере шапки он превращается в нечитаемую кашу из 3–4 px.
//
// На СВЕТЛЫХ темах лого «парит» прозрачным — чёрно-красные элементы
// читаются на светлом фоне. На ТЁМНЫХ — садится на белую плашку-патч
// (токены --brand-badge-* из index.css), иначе «LAVA» и остриё щита тонут.
export default function BrandLogo({ size = 56, className = '' }) {
  const { lang } = useLang()
  const alt = lang === 'en' ? 'RED LAVA Triathlon Team' : 'RED LAVA — команда по триатлону'
  return (
    <span className={`brand-logo ${className}`} style={{ '--brand-logo-h': `${size}px` }}>
      <img src="/logo-redlava-mark.png" alt={alt} draggable="false" />
      <style>{`
        .brand-logo {
          display: inline-flex;
          align-items: center;
          align-self: flex-start;
          border-radius: 14px;
          background: var(--brand-badge-bg, transparent);
          padding: var(--brand-badge-pad, 0);
          border: var(--brand-badge-border, 0 solid transparent);
          box-shadow: var(--brand-badge-shadow, none);
        }
        .brand-logo img {
          height: var(--brand-logo-h, 56px);
          width: auto;
          display: block;
          user-select: none;
          -webkit-user-select: none;
        }
        @media (max-width: 640px) {
          .brand-logo img { height: calc(var(--brand-logo-h, 56px) - 8px); }
        }
      `}</style>
    </span>
  )
}
