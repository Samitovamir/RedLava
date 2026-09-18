import { useLang } from '../context/LanguageContext.jsx'

// The RED LAVA brand mark (shield + "REDLAVA") for the Home header.
// Its source is the triathlon team's official logo (лого2.cdr → PNG with a
// transparent background). The "TRIATHLON TEAM" tagline is deliberately cropped
// out of the mark: at header size it turns into unreadable 3–4 px mush.
//
// On the LIGHT themes the logo floats transparent — its black-and-red elements
// read well against a light background. On the DARK ones it sits on a white
// patch (the --brand-badge-* tokens in index.css), or "LAVA" and the shield's tip drown.
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
