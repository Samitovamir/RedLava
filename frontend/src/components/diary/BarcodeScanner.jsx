import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { useT } from '../../context/LanguageContext.jsx'

/*
  Сканер штрих-кода: живой поток камеры (getUserMedia) + ZXing. На распознанном EAN/UPC
  вызывает onDetected(code). getUserMedia требует HTTPS/localhost; при ошибке камеры —
  onError (вызывающий предложит сфотографировать). Нативный BarcodeDetector НЕ используем
  (нестабилен в iOS-PWA) — ZXing надёжнее.
*/
export default function BarcodeScanner({ onDetected, onClose, onError }) {
  const t = useT({
    ru: { title: 'Наведи на штрих-код', hint: 'Помести штрих-код в рамку', cancel: 'Отмена', noCam: 'Камера недоступна' },
    en: { title: 'Point at the barcode', hint: 'Align the barcode within the frame', cancel: 'Cancel', noCam: 'Camera unavailable' },
  })
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const doneRef = useRef(false)
  const [err, setErr] = useState(false)

  useEffect(() => {
    let cancelled = false
    const reader = new BrowserMultiFormatReader()
    reader.decodeFromVideoDevice(undefined, videoRef.current, (result, _e, ctrl) => {
      if (ctrl && !controlsRef.current) controlsRef.current = ctrl
      if (result && !doneRef.current) {
        doneRef.current = true
        try { (ctrl || controlsRef.current)?.stop() } catch { /* ignore */ }
        onDetected(result.getText())
      }
    }).then(ctrl => {
      controlsRef.current = ctrl
      if (cancelled) { try { ctrl.stop() } catch { /* ignore */ } }
    }).catch(() => { setErr(true); onError?.() })
    return () => { cancelled = true; try { controlsRef.current?.stop() } catch { /* ignore */ } }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bc-backdrop">
      <motion.div className="bc-sheet" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
        <div className="bc-head">
          <span className="bc-title">{t.title}</span>
          <button className="bc-close" onClick={onClose} aria-label={t.cancel}><X size={20} /></button>
        </div>
        {err ? (
          <div className="bc-err">{t.noCam}</div>
        ) : (
          <div className="bc-frame">
            <video ref={videoRef} className="bc-video" muted playsInline />
            <div className="bc-reticle" />
          </div>
        )}
        <div className="bc-hint muted">{t.hint}</div>
        <style>{`
          .bc-backdrop { position: fixed; inset: 0; z-index: 520; background: color-mix(in srgb, var(--bg-app) 82%, transparent); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 20px; }
          .bc-sheet { width: 100%; max-width: 440px; display: flex; flex-direction: column; gap: 14px; background: var(--bg-surface); border: 1px solid var(--border-med); border-radius: var(--radius-lg); padding: 18px; }
          .bc-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
          .bc-title { font-size: 17px; font-weight: 700; color: var(--text-primary); }
          .bc-close { border: none; background: var(--bg-tile); color: var(--text-secondary); width: 34px; height: 34px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
          .bc-frame { position: relative; width: 100%; aspect-ratio: 4 / 3; border-radius: var(--radius-md); overflow: hidden; background: #000; }
          .bc-video { width: 100%; height: 100%; object-fit: cover; }
          .bc-reticle { position: absolute; left: 12%; right: 12%; top: 50%; height: 26%; transform: translateY(-50%); border: 2px solid var(--accent); border-radius: 12px; box-shadow: 0 0 0 1000px color-mix(in srgb, var(--bg-app) 35%, transparent); }
          .bc-err { padding: 40px 16px; text-align: center; color: var(--status-warn); font-size: 15px; }
          .bc-hint { font-size: 13px; text-align: center; }
          @media (max-width: 640px) { .bc-backdrop { align-items: flex-end; padding: 0; } .bc-sheet { max-width: 100%; border-radius: var(--radius-lg) var(--radius-lg) 0 0; } }
        `}</style>
      </motion.div>
    </div>
  )
}
