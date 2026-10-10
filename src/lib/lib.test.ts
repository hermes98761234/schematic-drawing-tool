import { describe, expect, it } from 'vitest'
import { EXAMPLES } from './examples'
import {
  cleanWires, compBounds, connectionNodes, deleteItems, duplicateItems, hitTest, isConnectionPoint, itemsInRect, junctions, mirrorItems, moveItems,
  nextRef, pinsOf, placeComp, rotateComps, route, snapTo, xf,
} from './geometry'
import { commit, initHistory, redo, undo } from './history'
import { emptyDoc, normalizeDoc, serializeDoc, type Comp, type Doc } from './model'
import { renderPdf, pdfText } from './pdf'
import { renderSvg } from './svg'
import { CATEGORIES, SYMBOL_LIST, SYMBOLS, symbolFor } from './symbols'
import { textWidth } from './text'

const comp = (o: Partial<Comp> = {}): Comp => ({ id: 'c', type: 'resistor', x: 10, y: 10, rot: 0, mirror: false, ref: 'R1', value: '1k', ...o })
const docWith = (o: Partial<Doc>): Doc => ({ ...emptyDoc(), ...o })

describe('transforms', () => {
  it('rotates clockwise on screen', () => {
    expect(xf(comp({ rot: 90 }), 2, 0)).toEqual([10, 12])
    expect(xf(comp({ rot: 180 }), 2, 0)).toEqual([8, 10])
    expect(xf(comp({ rot: 270 }), 2, 0)).toEqual([10, 8])
  })
  it('mirrors left-right before rotating', () => {
    expect(xf(comp({ mirror: true }), 2, 1)).toEqual([8, 11])
    expect(xf(comp({ mirror: true, rot: 90 }), 2, 0)).toEqual([10, 8])
  })
  it('keeps pins on integer grid points for every symbol and rotation', () => {
    for (const s of SYMBOL_LIST) {
      for (const rot of [0, 90, 180, 270] as const) {
        for (const mirror of [false, true]) {
          for (const p of pinsOf(comp({ type: s.id, rot, mirror, pins: s.configurable ? 8 : undefined }))) {
            expect(Number.isInteger(p.x) && Number.isInteger(p.y), `${s.id} ${rot} ${mirror}`).toBe(true)
          }
        }
      }
    }
  })
  it('snaps', () => {
    expect(snapTo(2.6, true)).toBe(3)
    expect(snapTo(2.62, false)).toBe(2.6)
  })
})

describe('symbols', () => {
  it('has every category populated and unique ids', () => {
    expect(new Set(SYMBOL_LIST.map((s) => s.id)).size).toBe(SYMBOL_LIST.length)
    for (const c of CATEGORIES) expect(SYMBOL_LIST.some((s) => s.category === c)).toBe(true)
  })
  it('gives each fixed symbol at least one pin and a drawing', () => {
    for (const s of SYMBOL_LIST) {
      const sym = symbolFor({ type: s.id })
      expect(sym.pins.length, s.id).toBeGreaterThan(0)
      expect(sym.prims.length, s.id).toBeGreaterThan(0)
    }
  })
  it('builds a DIP-numbered IC box', () => {
    const sym = symbolFor({ type: 'ic', pins: 8, pinNames: 'a,b,c,d,e,f,g,h' })
    expect(sym.pins).toHaveLength(8)
    const at = (name: string) => sym.pins.find((p) => p.name === name)!
    expect([at('1').x, at('1').y]).toEqual([-5, -3])
    expect([at('4').x, at('4').y]).toEqual([-5, 3])
    expect([at('5').x, at('5').y]).toEqual([5, 3])
    expect([at('8').x, at('8').y]).toEqual([5, -3])
  })
  it('sizes a connector from its pin count', () => {
    expect(symbolFor({ type: 'connector', pins: 5 }).pins).toHaveLength(5)
  })
  it('places the NPN pins as collector up, emitter down', () => {
    const p = pinsOf(comp({ type: 'npn', x: 0, y: 0 }))
    expect(p.map((q) => q.name + q.x + ',' + q.y)).toEqual(['C1,-2', 'B-2,0', 'E1,2'])
  })
})

describe('wiring', () => {
  it('routes orthogonally', () => {
    expect(route([0, 0], [0, 0], true)).toEqual([])
    expect(route([0, 0], [4, 0], true)).toEqual([[0, 0, 4, 0]])
    expect(route([0, 0], [4, 3], true)).toEqual([[0, 0, 4, 0], [4, 0, 4, 3]])
    expect(route([0, 0], [4, 3], false)).toEqual([[0, 0, 0, 3], [0, 3, 4, 3]])
  })
  it('adds junctions for T and 4-way meetings but not for bends or crossings', () => {
    const w = (id: string, x1: number, y1: number, x2: number, y2: number) => ({ id, x1, y1, x2, y2 })
    const tee = docWith({ wires: [w('a', 0, 0, 10, 0), w('b', 5, 0, 5, 5)] })
    expect(junctions(tee)).toEqual([[5, 0]])
    const bend = docWith({ wires: [w('a', 0, 0, 5, 0), w('b', 5, 0, 5, 5)] })
    expect(junctions(bend)).toEqual([])
    const cross = docWith({ wires: [w('a', 0, 5, 10, 5), w('b', 5, 0, 5, 10)] })
    expect(junctions(cross)).toEqual([])
    const star = docWith({ wires: [w('a', 0, 5, 5, 5), w('b', 5, 5, 10, 5), w('c', 5, 0, 5, 5), w('d', 5, 5, 5, 10)] })
    expect(junctions(star)).toEqual([[5, 5]])
  })
  it('counts a pin plus two wire ends as a junction', () => {
    const d = docWith({ comps: [comp({ x: 12 })], wires: [{ id: 'a', x1: 6, y1: 10, x2: 10, y2: 10 }, { id: 'b', x1: 10, y1: 10, x2: 10, y2: 4 }] })
    expect(connectionNodes(d).find((n) => n.x === 10 && n.y === 10)?.n).toBe(3)
  })
  it('detects connection points', () => {
    const d = docWith({ comps: [comp()], wires: [{ id: 'a', x1: 0, y1: 0, x2: 10, y2: 0 }] })
    expect(isConnectionPoint(d, 8, 10)).toBe(true)
    expect(isConnectionPoint(d, 4, 0)).toBe(true)
    expect(isConnectionPoint(d, 4, 1)).toBe(false)
  })
  it('removes zero-length and duplicate wires', () => {
    const d = docWith({ wires: [{ id: 'a', x1: 0, y1: 0, x2: 0, y2: 0 }, { id: 'b', x1: 0, y1: 0, x2: 5, y2: 0 }, { id: 'c', x1: 5, y1: 0, x2: 0, y2: 0 }] })
    expect(cleanWires(d).wires.map((w) => w.id)).toEqual(['b'])
  })
})

describe('editing', () => {
  const base = (): Doc => docWith({ comps: [comp({ id: 'r' })], wires: [{ id: 'w', x1: 4, y1: 10, x2: 8, y2: 10 }] })
  it('moves a part and stretches the wire on its pin, adding a corner when needed', () => {
    const moved = moveItems(base(), new Set(['r']), 0, 3)
    expect(moved.comps[0].y).toBe(13)
    expect(moved.wires).toHaveLength(2)
    const total = moved.wires.map((w) => [w.x1, w.y1, w.x2, w.y2])
    expect(total).toContainEqual([8, 13, 8, 10])
    expect(total).toContainEqual([8, 10, 4, 10])
    for (const w of moved.wires) expect(w.x1 === w.x2 || w.y1 === w.y2).toBe(true)
  })
  it('translates a wire without a corner when it moves along its own axis', () => {
    const moved = moveItems(base(), new Set(['r']), 2, 0)
    expect(moved.wires).toEqual([{ id: 'w', x1: 4, y1: 10, x2: 10, y2: 10 }])
  })
  it('moves selected wires and the wires attached to them', () => {
    const d = docWith({ wires: [{ id: 'a', x1: 0, y1: 0, x2: 4, y2: 0 }, { id: 'b', x1: 4, y1: 0, x2: 4, y2: 6 }] })
    const moved = moveItems(d, new Set(['a']), 0, 2)
    const a = moved.wires.find((w) => w.id === 'a')!
    expect([a.x1, a.y1, a.x2, a.y2]).toEqual([0, 2, 4, 2])
    const b = moved.wires.find((w) => w.id === 'b')!
    expect([b.x1, b.y1, b.x2, b.y2]).toEqual([4, 2, 4, 6])
  })
  it('rotates a part and keeps wires attached to the new pin positions', () => {
    const rotated = rotateComps(base(), new Set(['r']))
    expect(rotated.comps[0].rot).toBe(90)
    const pins = pinsOf(rotated.comps[0]).map((p) => `${p.x},${p.y}`)
    for (const w of rotated.wires) for (const k of [`${w.x1},${w.y1}`, `${w.x2},${w.y2}`]) if (k === '8,10') expect(pins).toContain(k)
    expect(rotated.wires.some((w) => (w.x2 === 10 && w.y2 === 8) || (w.x1 === 10 && w.y1 === 8))).toBe(true)
  })
  it('cycles rotation back to 0', () => {
    let d = base()
    for (let i = 0; i < 4; i++) d = rotateComps(d, new Set(['r']))
    expect(d.comps[0].rot).toBe(0)
  })
  it('mirrors parts and flips labels', () => {
    const d = docWith({ comps: [comp({ id: 'r' })], labels: [{ id: 'l', x: 0, y: 0, text: 'a', kind: 'net' }] })
    const m = mirrorItems(d, new Set(['r', 'l']))
    expect(m.comps[0].mirror).toBe(true)
    expect(m.labels[0].flip).toBe(true)
  })
  it('deletes selected items', () => {
    const d = deleteItems(base(), new Set(['r']))
    expect(d.comps).toHaveLength(0)
    expect(d.wires).toHaveLength(1)
  })
  it('numbers references per prefix', () => {
    let d = emptyDoc()
    for (let i = 0; i < 3; i++) d = placeComp(d, 'resistor', i * 6, 0).doc
    d = placeComp(d, 'capacitor', 0, 6).doc
    d = placeComp(d, 'ground', 0, 12).doc
    expect(d.comps.map((c) => c.ref)).toEqual(['R1', 'R2', 'R3', 'C1', ''])
    expect(nextRef(d, 'R')).toBe('R4')
  })
  it('duplicates with new ids and refs', () => {
    const d = placeComp(emptyDoc(), 'resistor', 0, 0).doc
    const out = duplicateItems(d, new Set([d.comps[0].id]), 2, 2)
    expect(out.doc.comps).toHaveLength(2)
    expect(out.doc.comps[1].ref).toBe('R2')
    expect(out.doc.comps[1].id).not.toBe(d.comps[0].id)
    expect([out.doc.comps[1].x, out.doc.comps[1].y]).toEqual([2, 2])
  })
  it('hit-tests parts, wires and empty space', () => {
    const d = docWith({ comps: [comp({ id: 'r' })], wires: [{ id: 'w', x1: 0, y1: 0, x2: 6, y2: 0 }] })
    expect(hitTest(d, 10, 10)).toEqual({ kind: 'comp', id: 'r' })
    expect(hitTest(d, 3, 0.2)).toEqual({ kind: 'wire', id: 'w' })
    expect(hitTest(d, 30, 30)).toBeNull()
  })
  it('selects by rectangle', () => {
    const d = docWith({ comps: [comp({ id: 'r' })], wires: [{ id: 'w', x1: 0, y1: 0, x2: 6, y2: 0 }] })
    expect(itemsInRect(d, { x1: 7, y1: 8, x2: 13, y2: 12 })).toEqual(['r'])
    expect(itemsInRect(d, { x1: -1, y1: -1, x2: 20, y2: 20 }).sort()).toEqual(['r', 'w'])
  })
  it('computes component bounds', () => {
    expect(compBounds(comp())).toEqual({ x1: 8, y1: 9.5, x2: 12, y2: 10.5 })
  })
})

describe('history', () => {
  it('undoes, redoes and drops the redo branch on a new edit', () => {
    const a = emptyDoc()
    const b = { ...a, title: 'b' }
    const c = { ...a, title: 'c' }
    let h = initHistory(a)
    h = commit(h, b)
    h = commit(h, c)
    h = undo(h)
    expect(h.present).toBe(b)
    h = redo(h)
    expect(h.present).toBe(c)
    h = undo(undo(h))
    expect(h.present).toBe(a)
    h = commit(h, { ...a, title: 'd' })
    expect(h.future).toHaveLength(0)
    expect(undo(undo(h)).present.title).toBe('')
  })
  it('collapses edits sharing a key and ignores no-ops', () => {
    let h = initHistory(emptyDoc())
    h = commit(h, { ...h.present, title: 'a' }, 'title')
    h = commit(h, { ...h.present, title: 'ab' }, 'title')
    h = commit(h, { ...h.present, title: 'abc' }, 'title')
    expect(h.past).toHaveLength(1)
    expect(commit(h, h.present)).toBe(h)
    expect(undo(h).present.title).toBe('')
  })
})

describe('file format', () => {
  it('round-trips through JSON', () => {
    const doc = EXAMPLES[0].build()
    expect(normalizeDoc(JSON.parse(serializeDoc(doc)))).toEqual(doc)
  })
  it('rejects non-schematic input and drops bad items', () => {
    expect(() => normalizeDoc({ nope: 1 })).toThrow()
    expect(() => normalizeDoc(null)).toThrow()
    const d = normalizeDoc({
      comps: [{ type: 'resistor', x: 1, y: 2 }, { type: 'warp-drive', x: 1, y: 2 }, { type: 'resistor', x: 'a', y: 2 }],
      wires: [{ x1: 0, y1: 0, x2: 1 }],
    })
    expect(d.comps).toHaveLength(1)
    expect(d.comps[0].rot).toBe(0)
    expect(d.wires).toHaveLength(0)
  })
})

describe('examples', () => {
  for (const ex of EXAMPLES) {
    it(`${ex.id}: has no dangling wire ends and only known symbols`, () => {
      const doc = ex.build()
      expect(doc.comps.length).toBeGreaterThan(2)
      for (const c of doc.comps) expect(c.type in SYMBOLS).toBe(true)
      const nodes = new Map(connectionNodes(doc).map((n) => [`${n.x},${n.y}`, n.n]))
      for (const l of doc.labels) nodes.set(`${l.x},${l.y}`, (nodes.get(`${l.x},${l.y}`) ?? 0) + 1)
      for (const w of doc.wires) {
        for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) {
          expect(nodes.get(`${x},${y}`) ?? 0, `${ex.id} wire end ${x},${y}`).toBeGreaterThanOrEqual(2)
        }
      }
    })
    it(`${ex.id}: every pin is wired`, () => {
      const doc = ex.build()
      const ends = new Set(doc.wires.flatMap((w) => [`${w.x1},${w.y1}`, `${w.x2},${w.y2}`]))
      const unwired: string[] = []
      for (const c of doc.comps) {
        if (c.type === 'opamp' || c.type === 'ic') continue
        for (const p of pinsOf(c)) if (!ends.has(`${p.x},${p.y}`)) unwired.push(`${c.ref || c.type}:${p.x},${p.y}`)
      }
      // Grounds/rails drawn directly on a pin and nothing else may be unwired; passives must not be.
      expect(unwired.filter((u) => !u.startsWith('ground') && !u.startsWith('vcc'))).toEqual([])
    })
  }
})

describe('export', () => {
  const doc = EXAMPLES[0].build()
  it('renders a self-contained SVG', () => {
    const svg = renderSvg(doc)
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).toContain('2N3904')
    expect((svg.match(/<line /g) ?? []).length).toBe(doc.wires.length)
    expect(svg.trim().endsWith('</svg>')).toBe(true)
    expect(renderSvg({ ...emptyDoc(), labels: [{ id: 'l', x: 0, y: 0, text: 'a<b&"c"', kind: 'text' }] })).toContain('a&lt;b&amp;&quot;c&quot;')
  })
  it('renders a transparent SVG on request', () => {
    expect(renderSvg(doc, { background: null })).not.toContain('<rect')
  })
  it('writes a structurally valid PDF', () => {
    const bytes = renderPdf({ ...doc, title: 'Test (1)' })
    const s = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
    expect(s.startsWith('%PDF-1.4')).toBe(true)
    expect(s.trim().endsWith('%%EOF')).toBe(true)
    const xref = +/startxref\n(\d+)/.exec(s)![1]
    expect(s.slice(xref, xref + 4)).toBe('xref')
    const offsets = [...s.slice(xref).matchAll(/(\d{10}) 00000 n/g)].map((m) => +m[1])
    expect(offsets).toHaveLength(5)
    offsets.forEach((o, i) => expect(s.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`))
    const len = +/\/Length (\d+)/.exec(s)![1]
    const start = s.indexOf('stream\n') + 7
    expect(s.slice(start + len, start + len + 10)).toBe('\nendstream')
    expect(s).toContain('(Test \\(1\\)) Tj')
  })
  it('maps text to the PDF font encoding', () => {
    expect(pdfText('10kΩ − 5µF 中')).toBe('10kohm - 5µF ?')
  })
  it('measures Helvetica text', () => {
    expect(textWidth('iii', 10)).toBeCloseTo(6.66, 5)
    expect(textWidth('M', 1)).toBeCloseTo(0.833, 5)
  })
})
