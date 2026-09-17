import { useState } from 'react'
import { ACTIVITY_LEVELS, GOALS, DEFAULT_PROFILE, computeTarget } from '../utils/nutrition.js'
import { Button } from '../ui'
import { useLang, useT } from '../context/LanguageContext.jsx'

/*
  Анкета при первом заходе в «Питание»: пол, возраст, рост, вес, сколько тренируется, цель.
  Без неё норма считалась бы по усреднённой заглушке — то есть не про этого человека.
  Показывается, пока профиль не заполнен (profile.isPlaceholder), и больше не возвращается.
  onDone(profile) — сохранить и перейти к разделу.
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
    },
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const filled = +form.age > 0 && +form.height > 0 && +form.weight > 0
  const preview = filled
    ? computeTarget({ ...form, age: +form.age, height: +form.height, weight: +form.weight }, { hasGarmin })
    : null

  function submit(e) {
    e.preventDefault()
    if (!filled) return
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
  // У GOALS английских подписей нет (они живут в словаре страницы) — держим их здесь.
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
          <input type="number" inputMode="numeric" min="14" max="100" value={form.age} onChange={e => set('age', e.target.value)} /></label>
        <label className="ns-field"><span>{t.height}</span>
          <input type="number" inputMode="numeric" min="120" max="230" value={form.height} onChange={e => set('height', e.target.value)} /></label>
        <label className="ns-field"><span>{t.weight}</span>
          <input type="number" inputMode="decimal" min="30" max="250" value={form.weight} onChange={e => set('weight', e.target.value)} /></label>
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

      <div className="ns-preview">
        {preview
          ? <>{t.preview} <b>{preview.kcal}</b> {t.kcal}</>
          : <span className="ns-hint">{t.fill}</span>}
      </div>

      <Button type="submit" variant="primary" disabled={!filled}>{t.submit}</Button>

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
        .ns-preview { font-size: 14.5px; color: var(--text-body); padding-top: 2px; }
        .ns-preview b { font-size: 19px; color: var(--text-primary); }
        @media (max-width: 480px) { .ns-fields { grid-template-columns: 1fr 1fr; } }
      `}</style>
    </form>
  )
}
