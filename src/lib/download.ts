import type { Doc } from './model'
import { exportBounds, renderSvg } from './svg'

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function fileBase(doc: Doc): string {
  const slug = doc.title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'schematic'
}

/** Rasterises the drawing at about 24 px per grid unit (capped for very large drawings). */
export async function renderPng(doc: Doc): Promise<Blob> {
  const b = exportBounds(doc, 2)
  const scale = Math.min(24, 8000 / Math.max(b.x2 - b.x1, b.y2 - b.y1))
  const svg = renderSvg(doc, { scale })
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    await new Promise<void>((res, rej) => {
      img.onload = () => res()
      img.onerror = () => rej(new Error('image'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round((b.x2 - b.x1) * scale)
    canvas.height = Math.round((b.y2 - b.y1) * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((res, rej) => canvas.toBlob((blob) => (blob ? res(blob) : rej(new Error('png'))), 'image/png'))
  } finally {
    URL.revokeObjectURL(url)
  }
}
