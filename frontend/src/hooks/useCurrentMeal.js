import { useState, useEffect } from 'react'
import { currentMeal } from '../utils/nutrition.js'

/*
  Текущий приём пищи по времени суток с ЖИВЫМ обновлением: компонент ре-рендерится при СМЕНЕ
  приёма (например, обед → перекус в 15:30), а не только при перезаходе. Без поминутной нагрузки —
  setState срабатывает только когда бакет реально изменился (таймер 60с + возврат на вкладку).
*/
export function useCurrentMeal() {
  const [meal, setMeal] = useState(currentMeal)
  useEffect(() => {
    const tick = () => setMeal(prev => { const m = currentMeal(); return prev === m ? prev : m })
    const id = setInterval(tick, 60000)
    const onVis = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [])
  return meal
}
