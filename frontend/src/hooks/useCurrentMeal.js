import { useState, useEffect } from 'react'
import { currentMeal } from '../utils/nutrition.js'

/*
  The current meal by time of day, updated LIVE: the component re-renders when the meal
  CHANGES (lunch → snack at 15:30, say), not only on the next visit. No per-minute work:
  setState fires only when the bucket actually changes (a 60 s timer + returning to the tab).
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
