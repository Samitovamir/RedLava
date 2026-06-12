// Open Food Facts: штрих-код (EAN/UPC) → название + КБЖУ на 100 г. Бесплатно, без ключа.
// Покрытие РФ-товаров неполное → вызывающий код делает фолбэк на фото еды.
export async function lookupBarcode(ean) {
  const code = String(ean || '').replace(/\D/g, '')
  if (code.length < 8) return null
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_ru,brands,nutriments`
    const r = await fetch(url)
    if (!r.ok) return null
    const d = await r.json()
    if (d.status !== 1 || !d.product) return null
    const p = d.product
    const n = p.nutriments || {}
    const kcal = n['energy-kcal_100g'] != null ? n['energy-kcal_100g']
      : (n['energy_100g'] != null ? n['energy_100g'] / 4.184 : 0)   // кДж → ккал
    const per100 = {
      kcal: Math.round(kcal || 0),
      protein: Math.round(n.proteins_100g || 0),
      fat: Math.round(n.fat_100g || 0),
      carb: Math.round(n.carbohydrates_100g || 0)
    }
    if (!per100.kcal && !per100.protein && !per100.fat && !per100.carb) return null
    const name = p.product_name_ru || p.product_name || p.brands || 'Продукт'
    return { name, per100 }
  } catch { return null }
}
