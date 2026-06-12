import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, Trash2, X, BookmarkPlus, Plus } from 'lucide-react'
import CircularChart from '../CircularChart.jsx'
import { useT } from '../../context/LanguageContext.jsx'
import { nutritionHealthBrief } from '../../utils/siteSnapshot.js'
import { compressToThumb, compressForUpload } from '../../utils/image.js'
import {
  addPhotoIntake, removePhotoEntry, saveIntake, setThumb, getThumb, pruneIntakeThumbs,
  loadSavedDishes, saveSavedDishes, addSavedDish
} from '../../utils/nutrition.js'

/*
  Вкладка «Дневник» — фотолог (свой CalAI). Кольцо «съедено/цель» + плитки Б/Ж/У +
  лента «съедено сегодня» с фото. Захват: «Сфотографировать еду» → ИИ оценивает КБЖУ
  по позициям с ПЕРСОНАЛЬНОЙ оценкой полезности (по состоянию владельца) → экран правки →
  подтверждение прибавляет приём (несколько фото за день суммируются).
  Общее состояние (intake/plan/target/selectedDay) приходит пропсами — единый источник
  истины со вкладкой «Меню».
*/

const fmtTime = (ts) => {
  try { return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts)) }
  catch { return '' }
}
const fileToDataUrl = (file) => new Promise((res, rej) => {
  const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file)
})
const num = (v) => Math.max(0, Math.round(+v || 0))

export default function DiaryTab({ target, eaten, remaining, intake, setIntake, selectedDay, flash }) {
  const t = useT({
    ru: {
      eaten: 'Съедено', of: 'из', kcal: 'ккал', left: 'осталось', over: 'перебор',
      protein: 'Белки', fat: 'Жиры', carb: 'Углеводы', g: 'г',
      shoot: 'Сфотографировать еду', reading: 'ИИ считает КБЖУ…',
      emptyTitle: 'Сегодня пока ничего не записано', emptyText: 'Сфотографируй еду — ИИ посчитает калории и БЖУ с учётом твоих данных',
      estTitle: 'Проверь и добавь', name: 'Название', portion: 'Порция', reset: 'сброс',
      items: 'Распознано', guess: 'прикидка', health: 'Польза для тебя', note: 'Примечание',
      cancel: 'Отмена', add: 'Добавить в дневник', failRecognize: 'Не удалось распознать еду',
      failPhoto: 'Ошибка обработки фото', added: 'Добавлено в дневник',
      save: 'Сохранить блюдо', del: 'Удалить', saved: 'Блюдо сохранено', removed: 'Запись удалена',
    },
    en: {
      eaten: 'Eaten', of: 'of', kcal: 'kcal', left: 'left', over: 'over',
      protein: 'Protein', fat: 'Fat', carb: 'Carbs', g: 'g',
      shoot: 'Photograph food', reading: 'AI is counting…',
      emptyTitle: 'Nothing logged today yet', emptyText: 'Photograph your food — AI estimates calories using your data',
      estTitle: 'Check and add', name: 'Name', portion: 'Portion', reset: 'reset',
      items: 'Detected', guess: 'guess', health: 'Good for you', note: 'Note',
      cancel: 'Cancel', add: 'Add to diary', failRecognize: 'Could not recognize food',
      failPhoto: 'Photo processing error', added: 'Added to diary',
      save: 'Save dish', del: 'Delete', saved: 'Dish saved', removed: 'Entry removed',
    },
  })

  const fileRef = useRef(null)
  const [estBusy, setEstBusy] = useState(false)
  const [estimate, setEstimate] = useState(null)   // оценка для экрана правки
  const [detail, setDetail] = useState(null)        // просмотр записи

  // Чистим миниатюры старше вчера при входе
  useEffect(() => { pruneIntakeThumbs(intake) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const rec = intake[selectedDay]?.source === 'photo' ? intake[selectedDay] : null
  const entries = rec ? [...(rec.entries || [])].sort((a, b) => (b.ts || 0) - (a.ts || 0)) : []
  const eatenP = intake[selectedDay]?.protein || 0
  const eatenF = intake[selectedDay]?.fat || 0
  const eatenC = intake[selectedDay]?.carb || 0
  const pct = target.kcal > 0 ? Math.min(100, Math.round(eaten / target.kcal * 100)) : 0
  const over = eaten > target.kcal
  const ringColor = over ? 'var(--status-warn)' : 'var(--accent)'

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (e.target) e.target.value = ''
    if (!file) return
    setEstBusy(true)
    try {
      const dataUrl = await fileToDataUrl(file)
      const upload = await compressForUpload(dataUrl)
      const res = await fetch('/api/nutrition/intake-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: upload, mode: 'food', health: nutritionHealthBrief() })
      })
      const data = await res.json()
      if (!data.ok || !data.intake) { flash(data.message || t.failRecognize); setEstBusy(false); return }
      const thumb = await compressToThumb(dataUrl)
      const ink = data.intake
      setEstimate({
        name: ink.name || (ink.items?.[0]?.name) || 'Приём пищи',
        kcal: num(ink.kcal), protein: num(ink.protein), fat: num(ink.fat), carb: num(ink.carb),
        items: (ink.items || []).map(it => ({ name: it.name || '—', kcal: num(it.kcal), guess: !!it.guess })),
        health: Number.isFinite(+ink.health) ? Math.round(+ink.health) : null,
        note: ink.note || '', photo: thumb
      })
    } catch { flash(t.failPhoto) }
    setEstBusy(false)
  }

  function confirmEstimate(edit) {
    const id = `e${Date.now()}${Math.round(Math.random() * 1000)}`
    const entry = {
      id, ts: Date.now(), name: edit.name || 'Приём пищи',
      kcal: num(edit.kcal), protein: num(edit.protein), fat: num(edit.fat), carb: num(edit.carb),
      items: estimate.items, health: estimate.health, hasPhoto: !!estimate.photo
    }
    const next = addPhotoIntake(intake, selectedDay, entry)
    setIntake(next); saveIntake(next)
    if (estimate.photo) setThumb(id, estimate.photo)
    pruneIntakeThumbs(next)
    setEstimate(null)
    flash(t.added)
  }

  function deleteEntry(id) {
    const next = removePhotoEntry(intake, selectedDay, id)
    setIntake(next); saveIntake(next)
    setDetail(null)
    flash(t.removed)
  }

  function saveDish(entry) {
    const list = addSavedDish(loadSavedDishes(), { name: entry.name, kcal: entry.kcal, protein: entry.protein, fat: entry.fat, carb: entry.carb })
    saveSavedDishes(list)
    flash(t.saved)
  }

  return (
    <motion.div className="nu-diary" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      {/* Кольцо «съедено / цель» + плитки Б/Ж/У */}
      <div className="card nd-summary">
        <div className="nd-sum-top">
          <div className="nd-sum-nums">
            <div className="nd-eaten"><span className="nd-eaten-n">{eaten}</span><span className="nd-eaten-of"> {t.of} {target.kcal} {t.kcal}</span></div>
            <div className={`nd-left ${over ? 'over' : ''}`}>{over ? `${t.over} ${eaten - target.kcal}` : `${t.left} ${remaining}`} {t.kcal}</div>
          </div>
          <CircularChart value={pct} size={108} color={ringColor} centerText={`${pct}%`} />
        </div>
        <div className="nd-macros">
          {[{ l: t.protein, e: eatenP, g: target.protein }, { l: t.fat, e: eatenF, g: target.fat }, { l: t.carb, e: eatenC, g: target.carb }].map((m, i) => (
            <div key={i} className="nd-macro">
              <span className="nd-macro-v">{Math.round(m.e)}<span className="nd-macro-of">/{m.g} {t.g}</span></span>
              <span className="nd-macro-l">{m.l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Кнопка съёмки */}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: 'none' }} />
      <button className="nd-shoot" onClick={() => fileRef.current?.click()} disabled={estBusy}>
        <Camera size={18} strokeWidth={1.8} />{estBusy ? t.reading : t.shoot}
      </button>

      {/* Лента «съедено сегодня» */}
      {entries.length === 0 ? (
        <div className="card nd-empty">
          <span className="nd-empty-ic"><Plus size={26} strokeWidth={1.6} /></span>
          <div className="nd-empty-title">{t.emptyTitle}</div>
          <div className="nd-empty-text muted">{t.emptyText}</div>
        </div>
      ) : (
        <div className="nd-feed">
          {entries.map(en => {
            const thumb = en.hasPhoto ? getThumb(en.id) : null
            return (
              <button key={en.id} className="card nd-item" onClick={() => setDetail(en)}>
                {thumb ? <span className="nd-item-img" style={{ backgroundImage: `url(${thumb})` }} /> : <span className="nd-item-img nd-item-img-empty"><Camera size={18} strokeWidth={1.5} /></span>}
                <span className="nd-item-body">
                  <span className="nd-item-name">{en.name}</span>
                  <span className="nd-item-macros">{en.kcal} {t.kcal} · {t.protein[0]} {en.protein} · {t.fat[0]} {en.fat} · {t.carb[0]} {en.carb}</span>
                </span>
                <span className="nd-item-time muted">{fmtTime(en.ts)}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Экран правки оценки перед добавлением */}
      <AnimatePresence>
        {estimate && <EstimateEditScreen est={estimate} t={t} onCancel={() => setEstimate(null)} onConfirm={confirmEstimate} />}
      </AnimatePresence>

      {/* Деталь записи */}
      <AnimatePresence>
        {detail && <EntryDetailModal entry={detail} t={t} onClose={() => setDetail(null)} onDelete={() => deleteEntry(detail.id)} onSave={() => saveDish(detail)} />}
      </AnimatePresence>

      <style>{`
        .nu-diary { display: flex; flex-direction: column; gap: 14px; }
        .nd-summary { display: flex; flex-direction: column; gap: 16px; }
        .nd-sum-top { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
        .nd-sum-nums { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .nd-eaten { font-variant-numeric: tabular-nums; }
        .nd-eaten-n { font-size: 40px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em; }
        .nd-eaten-of { font-size: 15px; color: var(--text-muted); }
        .nd-left { font-size: 14px; font-weight: 600; color: var(--text-secondary); }
        .nd-left.over { color: var(--status-warn); }
        .nd-macros { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .nd-macro { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; padding: 12px 14px; background: var(--bg-tile); border: 1px solid var(--border-soft); border-radius: var(--radius-md); }
        .nd-macro-v { font-size: 18px; font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
        .nd-macro-of { font-size: 12px; font-weight: 500; color: var(--text-muted); }
        .nd-macro-l { font-size: 12px; color: var(--text-secondary); }

        .nd-shoot {
          display: flex; align-items: center; justify-content: center; gap: 10px;
          padding: 15px; border: none; border-radius: var(--radius-md); cursor: pointer; font-family: inherit;
          font-size: 16px; font-weight: 700; color: var(--on-accent);
          background: linear-gradient(180deg, var(--accent-btn-top), var(--accent-btn-bot));
          box-shadow: var(--shadow-btn); transition: filter 0.15s, transform 0.1s;
        }
        .nd-shoot:hover { filter: brightness(1.05); }
        .nd-shoot:active { transform: translateY(1px); }
        .nd-shoot:disabled { opacity: 0.7; cursor: default; }

        .nd-empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; padding: 40px 24px; }
        .nd-empty-ic { width: 54px; height: 54px; border-radius: 15px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--accent) 13%, transparent); color: var(--accent); }
        .nd-empty-title { font-size: 16px; font-weight: 700; color: var(--text-primary); }
        .nd-empty-text { font-size: 13.5px; max-width: 340px; line-height: 1.55; }

        .nd-feed { display: flex; flex-direction: column; gap: 10px; }
        .nd-item { display: flex; align-items: center; gap: 14px; width: 100%; text-align: left; padding: 12px 14px; cursor: pointer; font-family: inherit; transition: border-color 0.15s; }
        .nd-item:hover { border-color: var(--accent); }
        .nd-item-img { width: 56px; height: 56px; flex-shrink: 0; border-radius: 12px; background-size: cover; background-position: center; background-color: var(--bg-tile); }
        .nd-item-img-empty { display: flex; align-items: center; justify-content: center; color: var(--text-faint); }
        .nd-item-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
        .nd-item-name { font-size: 15.5px; font-weight: 700; color: var(--text-primary); overflow-wrap: anywhere; }
        .nd-item-macros { font-size: 12.5px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
        .nd-item-time { font-size: 12px; flex-shrink: 0; align-self: flex-start; }
      `}</style>
    </motion.div>
  )
}

// ── Экран правки оценки ──
function EstimateEditScreen({ est, t, onCancel, onConfirm }) {
  const [edit, setEdit] = useState({ name: est.name, kcal: est.kcal, protein: est.protein, fat: est.fat, carb: est.carb })
  const set = (k, v) => setEdit(e => ({ ...e, [k]: k === 'name' ? v : num(v) }))
  const scale = (f) => setEdit(e => ({ ...e, kcal: num(e.kcal * f), protein: num(e.protein * f), fat: num(e.fat * f), carb: num(e.carb * f) }))
  const resetVals = () => setEdit({ name: est.name, kcal: est.kcal, protein: est.protein, fat: est.fat, carb: est.carb })

  return (
    <div className="nd-backdrop" onClick={onCancel}>
      <motion.div className="card nd-modal" onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}>
        <div className="nd-modal-head">
          <h3>{t.estTitle}</h3>
          <button className="nd-x" onClick={onCancel} aria-label={t.cancel}><X size={18} /></button>
        </div>
        {est.photo && <div className="nd-modal-img" style={{ backgroundImage: `url(${est.photo})` }} />}

        <label className="nd-field">
          <span className="nd-field-l muted">{t.name}</span>
          <input className="nd-input" value={edit.name} onChange={e => set('name', e.target.value)} />
        </label>

        <div className="nd-kcal-row">
          <label className="nd-field nd-field-kcal">
            <span className="nd-field-l muted">{t.kcal}</span>
            <input className="nd-input nd-input-big" type="number" inputMode="numeric" value={edit.kcal} onChange={e => set('kcal', e.target.value)} />
          </label>
          <div className="nd-portion">
            <span className="nd-field-l muted">{t.portion}</span>
            <div className="nd-portion-btns">
              <button onClick={() => scale(0.8)}>−20%</button>
              <button onClick={() => scale(1.25)}>+25%</button>
              <button className="nd-reset" onClick={resetVals}>{t.reset}</button>
            </div>
          </div>
        </div>

        <div className="nd-macros-edit">
          {[['protein', t.protein], ['fat', t.fat], ['carb', t.carb]].map(([k, l]) => (
            <label key={k} className="nd-field">
              <span className="nd-field-l muted">{l}, {t.g}</span>
              <input className="nd-input" type="number" inputMode="numeric" value={edit[k]} onChange={e => set(k, e.target.value)} />
            </label>
          ))}
        </div>

        {est.health != null && (
          <div className="nd-health"><span className="nd-health-l">{t.health}</span><span className="nd-health-v">{est.health}/10</span></div>
        )}

        {est.items?.length > 0 && (
          <div className="nd-items">
            <div className="nd-items-h muted">{t.items}</div>
            {est.items.map((it, i) => (
              <div key={i} className="nd-item-row">
                <span className="nd-item-row-name">{it.name}{it.guess && <span className="nd-guess">{t.guess}</span>}</span>
                <span className="muted">{it.kcal} {t.kcal}</span>
              </div>
            ))}
          </div>
        )}
        {est.note && <div className="nd-note muted">{est.note}</div>}

        <div className="nd-modal-actions">
          <button className="nd-btn-ghost" onClick={onCancel}>{t.cancel}</button>
          <button className="nd-btn-primary" onClick={() => onConfirm(edit)}>{t.add}</button>
        </div>
        <ModalStyles />
      </motion.div>
    </div>
  )
}

// ── Деталь записи дневника ──
function EntryDetailModal({ entry, t, onClose, onDelete, onSave }) {
  const thumb = entry.hasPhoto ? getThumb(entry.id) : null
  return (
    <div className="nd-backdrop" onClick={onClose}>
      <motion.div className="card nd-modal" onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}>
        <div className="nd-modal-head">
          <h3>{entry.name}</h3>
          <button className="nd-x" onClick={onClose} aria-label={t.cancel}><X size={18} /></button>
        </div>
        {thumb && <div className="nd-modal-img" style={{ backgroundImage: `url(${thumb})` }} />}
        <div className="nd-detail-macros">
          <div className="nd-dm"><span className="nd-dm-v">{entry.kcal}</span><span className="nd-dm-l muted">{t.kcal}</span></div>
          <div className="nd-dm"><span className="nd-dm-v">{entry.protein}</span><span className="nd-dm-l muted">{t.protein}</span></div>
          <div className="nd-dm"><span className="nd-dm-v">{entry.fat}</span><span className="nd-dm-l muted">{t.fat}</span></div>
          <div className="nd-dm"><span className="nd-dm-v">{entry.carb}</span><span className="nd-dm-l muted">{t.carb}</span></div>
        </div>
        {entry.health != null && (
          <div className="nd-health"><span className="nd-health-l">{t.health}</span><span className="nd-health-v">{entry.health}/10</span></div>
        )}
        {entry.items?.length > 0 && (
          <div className="nd-items">
            <div className="nd-items-h muted">{t.items}</div>
            {entry.items.map((it, i) => (
              <div key={i} className="nd-item-row"><span className="nd-item-row-name">{it.name}{it.guess && <span className="nd-guess">{t.guess}</span>}</span><span className="muted">{it.kcal} {t.kcal}</span></div>
            ))}
          </div>
        )}
        <div className="nd-modal-actions">
          <button className="nd-btn-ghost" onClick={onSave}><BookmarkPlus size={16} strokeWidth={1.7} /> {t.save}</button>
          <button className="nd-btn-danger" onClick={onDelete}><Trash2 size={16} strokeWidth={1.7} /> {t.del}</button>
        </div>
        <ModalStyles />
      </motion.div>
    </div>
  )
}

function ModalStyles() {
  return (
    <style>{`
      .nd-backdrop { position: fixed; inset: 0; z-index: 500; background: color-mix(in srgb, var(--bg-app) 70%, transparent); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 20px; }
      .nd-modal { width: 100%; max-width: 440px; max-height: 90dvh; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
      .nd-modal-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .nd-modal-head h3 { margin: 0; font-size: 19px; font-weight: 700; color: var(--text-primary); overflow-wrap: anywhere; }
      .nd-x { border: none; background: var(--bg-tile); color: var(--text-secondary); width: 34px; height: 34px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .nd-x:hover { color: var(--text-primary); }
      .nd-modal-img { width: 100%; height: 180px; border-radius: var(--radius-md); background-size: cover; background-position: center; background-color: var(--bg-tile); }
      .nd-field { display: flex; flex-direction: column; gap: 5px; }
      .nd-field-l { font-size: 12px; font-weight: 600; }
      .nd-input { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: var(--radius-md); border: 1px solid var(--border-med); background: var(--bg-tile); color: var(--text-primary); font-family: inherit; font-size: 15px; }
      .nd-input:focus { outline: none; border-color: var(--accent); }
      .nd-input-big { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .nd-kcal-row { display: flex; gap: 12px; align-items: flex-end; }
      .nd-field-kcal { flex: 1; }
      .nd-portion { display: flex; flex-direction: column; gap: 5px; }
      .nd-portion-btns { display: flex; gap: 6px; }
      .nd-portion-btns button { padding: 9px 11px; border-radius: 10px; border: 1px solid var(--border-med); background: var(--bg-tile); color: var(--text-secondary); font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
      .nd-portion-btns button:hover { color: var(--text-primary); border-color: var(--accent); }
      .nd-portion-btns .nd-reset { color: var(--text-muted); }
      .nd-macros-edit { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
      .nd-health { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 14px; background: var(--bg-tile); border: 1px solid var(--border-soft); border-radius: var(--radius-md); }
      .nd-health-l { font-size: 13.5px; font-weight: 600; color: var(--text-secondary); }
      .nd-health-v { font-size: 16px; font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
      .nd-items { display: flex; flex-direction: column; gap: 7px; }
      .nd-items-h { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
      .nd-item-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 14px; color: var(--text-body); font-variant-numeric: tabular-nums; }
      .nd-item-row-name { display: flex; align-items: center; gap: 8px; }
      .nd-guess { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: var(--status-warn); background: color-mix(in srgb, var(--status-warn) 16%, transparent); padding: 2px 6px; border-radius: 6px; }
      .nd-note { font-size: 13px; line-height: 1.5; }
      .nd-detail-macros { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
      .nd-dm { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 12px 6px; background: var(--bg-tile); border: 1px solid var(--border-soft); border-radius: var(--radius-md); }
      .nd-dm-v { font-size: 19px; font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
      .nd-dm-l { font-size: 11px; }
      .nd-modal-actions { display: flex; gap: 10px; }
      .nd-modal-actions button { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 13px; border-radius: var(--radius-md); font-family: inherit; font-size: 15px; font-weight: 700; cursor: pointer; border: 1px solid transparent; }
      .nd-btn-primary { color: var(--on-accent); background: linear-gradient(180deg, var(--accent-btn-top), var(--accent-btn-bot)); box-shadow: var(--shadow-btn); }
      .nd-btn-ghost { color: var(--text-secondary); background: var(--bg-tile); border-color: var(--border-med); }
      .nd-btn-ghost:hover { color: var(--text-primary); }
      .nd-btn-danger { color: var(--status-crit); background: color-mix(in srgb, var(--status-crit) 12%, transparent); border-color: color-mix(in srgb, var(--status-crit) 30%, transparent); }
      @media (max-width: 640px) {
        .nd-backdrop { align-items: flex-end; padding: 0; }
        .nd-modal { max-width: 100%; max-height: 94dvh; border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
      }
    `}</style>
  )
}
