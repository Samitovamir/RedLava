// Сжатие фото для фото-дневника питания (через canvas, без зависимостей):
//  • миниатюра — для ленты «съедено сегодня», хранится локально (albert-intake-thumbs);
//  • версия для отправки в ИИ — меньше пикселей → быстрее и дешевле vision-запрос.

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = dataUrl
  })
}

async function resizeToDataUrl(dataUrl, maxPx, quality) {
  try {
    const img = await loadImage(dataUrl)
    const big = Math.max(img.width || maxPx, img.height || maxPx)
    const scale = Math.min(1, maxPx / big)
    const w = Math.max(1, Math.round((img.width || maxPx) * scale))
    const h = Math.max(1, Math.round((img.height || maxPx) * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    canvas.getContext('2d').drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    return dataUrl   // не смогли сжать — отдаём как есть
  }
}

// Маленькая миниатюра для ленты (хранится в localStorage отдельным ключом)
export function compressToThumb(dataUrl, { maxPx = 320, quality = 0.6 } = {}) {
  return resizeToDataUrl(dataUrl, maxPx, quality)
}

// Версия для отправки в ИИ (умеренный размер — быстрее/дешевле, точности хватает)
export function compressForUpload(dataUrl, { maxPx = 1024, quality = 0.72 } = {}) {
  return resizeToDataUrl(dataUrl, maxPx, quality)
}
