// Photo compression for the nutrition photo diary (via canvas, no dependencies):
//  • a thumbnail for the "eaten today" feed, stored locally (albert-intake-thumbs);
//  • a version to send to the AI — fewer pixels → a faster and cheaper vision request.

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
    return dataUrl   // couldn't compress it — hand it back as is
  }
}

// A small thumbnail for the feed (kept in localStorage under its own key)
export function compressToThumb(dataUrl, { maxPx = 320, quality = 0.6 } = {}) {
  return resizeToDataUrl(dataUrl, maxPx, quality)
}

// The version sent to the AI (a moderate size — faster and cheaper, still accurate enough)
export function compressForUpload(dataUrl, { maxPx = 1024, quality = 0.72 } = {}) {
  return resizeToDataUrl(dataUrl, maxPx, quality)
}
