import { useState } from 'react'
import { ACTIVITY_LEVELS, GOALS, DEFAULT_PROFILE, computeTarget } from '../utils/nutrition.js'
import { Button } from '../ui'
import { useLang, useT } from '../context/LanguageContext.jsx'

/*
  The questionnaire on the first visit to "Nutrition": sex, age, height, weight, training load, goal.
  Without it the target would be computed from an averaged stub — i.e. not about this person.
  Shown while the profile is unfilled (profile.isPlaceholder), and never comes back afterwards.
  onDone(profile) — save and move on to the section.
*/
export default function NutritionSetup({ hasGarmin = false, onDone }) {
  const { lang } = useLang()
  const [form, setForm] = useState(() => ({
    sex: DEFAULT_PROFILE.sex,
    age: '',
    height: '',
    weight: '',
    activity: 'light',
    goal: 'maintain',
  }))
  const t = useT({
    ru: {
      title: 'Давайте посчитаем вашу норму',
      sub: 'Пять коротких вопросов — дальше дневник будет считать калории под вас, а не «в среднем».',
      sex: 'Пол', male: 'Мужской', female: 'Женский',
      age: 'Возраст, лет', height: 'Рост, см', weight: 'Вес, кг',
      activity: 'Сколько тренируетесь',
      activityGarmin: 'Тренировки подтянутся из Garmin — их считать не нужно',
      goal: 'Цель',
      submit: 'Посчитать мою норму',
      preview: 'Ваша норма получится примерно',
      kcal: 'ккал в день',
      fill: 'Заполните возраст, рост и вес',
      checkPre: 'Проверьте: ',
      range: { age: 'возраст от 14 до 100 лет', height: 'рост от 120 до 230 см', weight: 'вес от 30 до 250 кг' },
    },
    en: {
      title: 'Let’s work out your daily target',
      sub: 'Five quick questions — after that the diary counts calories for you, not for an average person.',
      sex: 'Sex', male: 'Male', female: 'Female',
      age: 'Age', height: 'Height, cm', weight: 'Weight, kg',
      activity: 'How often do you train',
      activityGarmin: 'Workouts come from Garmin — no need to count them here',
      goal: 'Goal',
      submit: 'Calculate my target',
      preview: 'Your target will be about',
      kcal: 'kcal per day',
      fill: 'Fill in age, height and weight',
      checkPre: 'Please check: ',
      range: { age: 'age between 14 and 100', height: 'height between 120 and 230 cm', weight: 'weight between 30 and 250 kg' },
    },
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const filled = +form.age > 0 && +form.height > 0 && +form.weight > 0
  // The same bounds as the fields' min/max: beyond them the Mifflin formula gives a meaningless
  // target, and the form is filled in once — we can't silently accept "5 years old / 300 cm".
  const LIMITS = { age: [14, 100], height: [120, 230], weight: [30, 250] }
  const outOfRange = filled
    ? Object.keys(LIMITS).filter(k => +form[k] < LIMITS[k][0] || +form[k] > LIMITS[k][1])
    : []
  const valid = filled && !outOfRange.length
  const preview = valid
    ? computeTarget({ ...form, age: +form.age, height: +form.height, weight: +form.weight }, { hasGarmin })
    : null

  function submit(e) {
    e.preventDefault()
    if (!valid) return
    onDone({
      sex: form.sex,
      age: +form.age,
      height: +form.height,
      weight: +form.weight,
      activity: form.activity,
      goal: form.goal,
    })
  }

  const activityLabel = (a) => (lang === 'en' ? a.labelEn : a.label)
  // GOALS carries no English labels (those live in the page's dictionary) — we keep them here.
  const GOALS_EN = { lose: 'Lose weight', maintain: 'Maintain', gain: 'Gain mass' }
  const goalLabel = (g) => (lang === 'en' ? (GOALS_EN[g.key] || g.label) : g.label)

  return (
    <form className="card ns-card" onSubmit={submit}>
      <h2 className="ns-title">{t.title}</h2>
      <p className="ns-sub">{t.sub}</p>

      <div className="ns-seg-row">
        <span className="ns-label">{t.sex}</span>
        <div className="ns-seg">
          <button type="button" className={`ns-seg-btn ${form.sex === 'male' ? 'active' : ''}`} onClick={() => set('sex', 'male')}>{t.male}</button>
          <button type="button" className={`ns-seg-btn ${form.sex === 'female' ? 'active' : ''}`} onClick={() => set('sex', 'female')}>{t.female}</button>
        </div>
      </div>

      <div className="ns-fields">
        <label className="ns-field"><span>{t.age}</span>
          <input type="number" inputMode="numeric" min="14" max="100" className={outOfRange.includes('age') ? 'bad' : ''}
            value={form.age} onChange={e => set('age', e.target.value)} /></label>
        <label className="ns-field"><span>{t.height}</span>
          <input type="number" inputMode="numeric" min="120" max="230" className={outOfRange.includes('height') ? 'bad' : ''}
            value={form.height} onChange={e => set('height', e.target.value)} /></label>
        <label className="ns-field"><span>{t.weight}</span>
          <input type="number" inputMode="decimal" min="30" max="250" className={outOfRange.includes('weight') ? 'bad' : ''}
            value={form.weight} onChange={e => set('weight', e.target.value)} /></label>
      </div>

      <div className="ns-block">
        <span className="ns-label">{t.activity}</span>
        {hasGarmin && <span className="ns-hint">{t.activityGarmin}</span>}
        <div className="ns-options">
          {ACTIVITY_LEVELS.map(a => (
            <button key={a.key} type="button"
              className={`ns-opt ${form.activity === a.key ? 'active' : ''}`}
              onClick={() => set('activity', a.key)}>{activityLabel(a)}</button>
          ))}
        </div>
      </div>

      <div className="ns-block">
        <span className="ns-label">{t.goal}</span>
        <div className="ns-options">
          {GOALS.map(g => (
            <button key={g.key} type="button"
              className={`ns-opt ${form.goal === g.key ? 'active' : ''}`}
              onClick={() => set('goal', g.key)}>{goalLabel(g)}</button>
          ))}
        </div>
      </div>

      {/* The result and the button as one sticky block: the form is long, and on a phone its
          end falls exactly under the floating tab bar. The reason the button is disabled has
          to travel with the button — otherwise it stays hidden under that bar. */}
      <div className="ns-submit">
        <div className="ns-preview">
          {preview
            ? <>{t.preview} <b>{preview.kcal}</b> {t.kcal}</>
            : outOfRange.length
              ? <span className="ns-bad">{t.checkPre}{outOfRange.map(k => t.range[k]).join(', ')}</span>
              : <span className="ns-hint">{t.fill}</span>}
        </div>
        <Button type="submit" variant="primary" disabled={!valid}>{t.submit}</Button>
      </div>

      <style>{`
        .ns-card { max-width: 560px; margin-inline: auto; display: flex; flex-direction: column; gap: 16px; }
        .ns-title { font-size: 21px; font-weight: 700; color: var(--text-primary); margin: 0; }
        .ns-sub { font-size: 14.5px; line-height: 1.55; color: var(--text-secondary); margin: -8px 0 0; }
        .ns-label { font-size: 13px; font-weight: 600; color: var(--text-secondary); }
        .ns-hint { font-size: 12.5px; color: var(--text-muted); line-height: 1.45; }
        .ns-block { display: flex; flex-direction: column; gap: 8px; }
        .ns-seg-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .ns-seg { display: flex; gap: 6px; }
        .ns-seg-btn, .ns-opt {
          background: var(--bg-tile); border: 1px solid var(--border-soft); border-radius: 10px;
          padding: 9px 14px; font-family: inherit; font-size: 14px; color: var(--text-body);
          cursor: pointer; transition: border-color .15s, color .15s, background .15s;
        }
        .ns-seg-btn.active, .ns-opt.active {
          border-color: var(--accent); color: var(--text-primary);
          background: color-mix(in srgb, var(--accent) 14%, transparent);
        }
        .ns-options { display: flex; flex-wrap: wrap; gap: 8px; }
        .ns-fields { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .ns-field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--text-secondary); }
        .ns-field input {
          width: 100%; box-sizing: border-box; background: var(--bg-tile);
          border: 1px solid var(--border-soft); border-radius: 10px; padding: 11px 12px;
          font-family: inherit; font-size: 16px; color: var(--text-primary); outline: none;
        }
        .ns-field input:focus { border-color: var(--accent); }
        .ns-field input.bad { border-color: var(--status-warn); }
        .ns-preview { font-size: 14.5px; color: var(--text-body); }
        .ns-preview b { font-size: 19px; color: var(--text-primary); }
        .ns-bad { font-size: 13px; line-height: 1.45; color: var(--status-warn); }
        .ns-submit { display: flex; flex-direction: column; gap: 12px; }
        .ns-submit .ds-btn { justify-content: center; }
        @media (max-width: 480px) { .ns-fields { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 900px) {
          .ns-submit {
            position: sticky;
            /* над плавающей панелью вкладок: её низ 10px + высота ~64px = 74px */
            bottom: calc(84px + env(safe-area-inset-bottom));
            z-index: 2;
            background: linear-gradient(to top, var(--bg-card-bot, var(--bg-surface)) 72%, transparent);
            margin: 0 -20px -20px;
            padding: 14px 20px 20px;
            border-radius: 0 0 var(--radius) var(--radius);
          }
        }
      `}</style>
    </form>
  )
}
