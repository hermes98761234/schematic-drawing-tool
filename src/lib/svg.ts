import { compWorld, docBounds, junctions, labelWorld, type Bounds, type WPrim } from './geometry'
import type { Doc } from './model'

export interface SvgOptions {
  /** Pixels per grid unit. */
  scale?: number
  margin?: number
  background?: string | null
  ink?: string
  wire?: string
}

export const STROKE = 0.15
export const FONT = 'Helvetica, Arial, sans-serif'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const n = (v: number) => String(+v.toFixed(3))

export function primSvg(p: WPrim, ink: string): string {
  if (p.k === 'l') {
    const pts = p.p.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')
    const tag = p.closed ? 'polygon' : 'polyline'
    return `<${tag} points="${pts}"${p.fill ? ` fill="${ink}"` : ''}/>`
  }
  if (p.k === 'c') return `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(p.r)}"${p.fill ? ` fill="${ink}"` : ''}/>`
  return `<text x="${n(p.x)}" y="${n(p.y)}" font-size="${p.size}" text-anchor="${p.anchor}" fill="${ink}" stroke="none">${esc(p.s)}</text>`
}

export function exportBounds(doc: Doc, margin: number): Bounds {
  const b = docBounds(doc)
  return { x1: b.x1 - margin, y1: b.y1 - margin, x2: b.x2 + margin, y2: b.y2 + margin }
}

/** Stand-alone SVG of the drawing: black ink on white, independent of the app theme. */
export function renderSvg(doc: Doc, o: SvgOptions = {}): string {
  const { scale = 12, margin = 2, background = '#ffffff', ink = '#111111', wire = '#0a5c2a' } = o
  const b = exportBounds(doc, margin)
  const w = b.x2 - b.x1
  const h = b.y2 - b.y1
  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(b.x1)} ${n(b.y1)} ${n(w)} ${n(h)}" width="${Math.round(w * scale)}" height="${Math.round(h * scale)}" font-family="${FONT}">`,
  )
  if (doc.title) parts.push(`<title>${esc(doc.title)}</title>`)
  if (background) parts.push(`<rect x="${n(b.x1)}" y="${n(b.y1)}" width="${n(w)}" height="${n(h)}" fill="${background}"/>`)
  parts.push(`<g fill="none" stroke="${wire}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">`)
  for (const s of doc.wires) parts.push(`<line x1="${n(s.x1)}" y1="${n(s.y1)}" x2="${n(s.x2)}" y2="${n(s.y2)}"/>`)
  parts.push('</g>')
  parts.push(`<g fill="${wire}">`)
  for (const [x, y] of junctions(doc)) parts.push(`<circle cx="${n(x)}" cy="${n(y)}" r="0.28"/>`)
  parts.push('</g>')
  parts.push(`<g fill="none" stroke="${ink}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">`)
  for (const c of doc.comps) for (const p of compWorld(c)) parts.push(primSvg(p, ink))
  for (const l of doc.labels) for (const p of labelWorld(l)) parts.push(primSvg(p, ink))
  parts.push('</g></svg>')
  return parts.join('\n')
}
