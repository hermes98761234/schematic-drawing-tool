import { compWorld, junctions, labelWorld, type WPrim } from './geometry'
import type { Doc } from './model'
import { exportBounds, STROKE } from './svg'
import { textWidth } from './text'

/** Text for the built-in Helvetica font (WinAnsi): maps a few symbols, replaces anything else with '?'. */
export function pdfText(s: string): string {
  let out = ''
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 63
    if (ch === '−') out += '-'
    else if (ch === 'Ω' || ch === 'Ω') out += 'ohm'
    else if (ch === 'μ') out += 'µ'
    else if (c < 32) out += ' '
    else if (c > 255) out += '?'
    else out += ch
  }
  return out
}

function pdfString(s: string): string {
  let out = '('
  for (const ch of pdfText(s)) {
    const c = ch.charCodeAt(0)
    if (ch === '\\' || ch === '(' || ch === ')') out += '\\' + ch
    else if (c > 126) out += '\\' + c.toString(8).padStart(3, '0')
    else out += ch
  }
  return out + ')'
}

const f = (v: number) => String(+v.toFixed(2))
const K = 0.5523

/** Vector PDF (one page, A4, landscape or portrait to suit the drawing) built without any library. */
export function renderPdf(doc: Doc): Uint8Array {
  const b = exportBounds(doc, 1.5)
  const dw = b.x2 - b.x1
  const dh = b.y2 - b.y1
  const landscape = dw >= dh
  const pw = landscape ? 841.89 : 595.28
  const ph = landscape ? 595.28 : 841.89
  const pad = 36
  const top = doc.title ? 28 : 0
  const s = Math.min((pw - 2 * pad) / dw, (ph - 2 * pad - top) / dh, 14)
  const ox = (pw - dw * s) / 2
  const oy = pad + top + (ph - 2 * pad - top - dh * s) / 2
  const X = (x: number) => f(ox + (x - b.x1) * s)
  const Y = (y: number) => f(ph - (oy + (y - b.y1) * s))

  const c: string[] = ['1 J 1 j', `${f(STROKE * s)} w`]
  const prim = (p: WPrim, ink: string) => {
    if (p.k === 'l') {
      c.push(ink)
      p.p.forEach(([x, y], i) => c.push(`${X(x)} ${Y(y)} ${i ? 'l' : 'm'}`))
      if (p.closed) c.push('h')
      c.push(p.fill ? 'B' : 'S')
    } else if (p.k === 'c') {
      const r = p.r * s
      const cx = ox + (p.x - b.x1) * s
      const cy = ph - (oy + (p.y - b.y1) * s)
      c.push(ink)
      c.push(`${f(cx + r)} ${f(cy)} m`)
      c.push(`${f(cx + r)} ${f(cy + K * r)} ${f(cx + K * r)} ${f(cy + r)} ${f(cx)} ${f(cy + r)} c`)
      c.push(`${f(cx - K * r)} ${f(cy + r)} ${f(cx - r)} ${f(cy + K * r)} ${f(cx - r)} ${f(cy)} c`)
      c.push(`${f(cx - r)} ${f(cy - K * r)} ${f(cx - K * r)} ${f(cy - r)} ${f(cx)} ${f(cy - r)} c`)
      c.push(`${f(cx + K * r)} ${f(cy - r)} ${f(cx + r)} ${f(cy - K * r)} ${f(cx + r)} ${f(cy)} c`)
      c.push(p.fill ? 'B' : 'S')
    } else {
      const shown = pdfText(p.s)
      const w = textWidth(shown, p.size)
      const x = p.anchor === 'start' ? p.x : p.anchor === 'end' ? p.x - w : p.x - w / 2
      c.push('0.07 0.07 0.07 rg', 'BT', `/F1 ${f(p.size * s)} Tf`, `${X(x)} ${Y(p.y)} Td`, `${pdfString(p.s)} Tj`, 'ET')
    }
  }
  const INK = '0.07 0.07 0.07 RG 0.07 0.07 0.07 rg'
  const WIRE = '0.04 0.36 0.16 RG 0.04 0.36 0.16 rg'
  if (doc.title) c.push('0.07 0.07 0.07 rg', 'BT', '/F1 14 Tf', `${f(pad)} ${f(ph - pad)} Td`, `${pdfString(doc.title)} Tj`, 'ET')
  for (const w of doc.wires) prim({ k: 'l', p: [[w.x1, w.y1], [w.x2, w.y2]] }, WIRE)
  for (const [x, y] of junctions(doc)) prim({ k: 'c', x, y, r: 0.28, fill: true }, WIRE)
  for (const comp of doc.comps) for (const p of compWorld(comp)) prim(p, INK)
  for (const l of doc.labels) for (const p of labelWorld(l)) prim(p, INK)

  const stream = c.join('\n')
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(pw)} ${f(ph)}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  const bytes = new Uint8Array(out.length)
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255
  return bytes
}
