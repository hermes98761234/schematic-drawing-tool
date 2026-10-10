import { uid, type Comp, type Doc, type Label, type Rot, type Wire } from './model'
import { SYMBOLS, symbolFor, type LabelPos, type Prim, type Pt } from './symbols'
import { textWidth } from './text'

export interface Bounds {
  x1: number
  y1: number
  x2: number
  y2: number
}
export type Seg = [number, number, number, number]

const z = (v: number) => (v === 0 ? 0 : v)

/** Local symbol coordinates to world coordinates: mirror (x flip), rotate clockwise on screen, translate. */
export function xf(c: Pick<Comp, 'x' | 'y' | 'rot' | 'mirror'>, px: number, py: number): Pt {
  if (c.mirror) px = -px
  let x = px
  let y = py
  if (c.rot === 90) [x, y] = [-py, px]
  else if (c.rot === 180) [x, y] = [-px, -py]
  else if (c.rot === 270) [x, y] = [py, -px]
  return [z(c.x + x), z(c.y + y)]
}

export interface WorldPin {
  x: number
  y: number
  name: string
}
export function pinsOf(c: Comp): WorldPin[] {
  return symbolFor(c).pins.map((p) => {
    const [x, y] = xf(c, p.x, p.y)
    return { x, y, name: p.name }
  })
}

export const snapTo = (v: number, on: boolean): number => (on ? Math.round(v) : Math.round(v * 20) / 20)
export const key = (x: number, y: number): string => `${+x.toFixed(3)},${+y.toFixed(3)}`

/** World-space drawing primitive. Text carries its anchor; it is never rotated. */
export type WPrim = Prim & { role?: 'ref' | 'value' | 'symbol' }

function mapPrim(c: Comp, p: Prim): WPrim {
  if (p.k === 'l') return { ...p, p: p.p.map(([x, y]) => xf(c, x, y)) }
  const [x, y] = xf(c, p.x, p.y)
  return { ...p, x, y }
}

export function compBounds(c: Comp): Bounds {
  const sym = symbolFor(c)
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  const add = (x: number, y: number) => {
    x1 = Math.min(x1, x)
    y1 = Math.min(y1, y)
    x2 = Math.max(x2, x)
    y2 = Math.max(y2, y)
  }
  for (const p of sym.prims) {
    if (p.k === 'l') for (const [x, y] of p.p) add(...xf(c, x, y))
    else if (p.k === 'c') {
      const [x, y] = xf(c, p.x, p.y)
      add(x - p.r, y - p.r)
      add(x + p.r, y + p.r)
    }
  }
  for (const p of sym.pins) add(...xf(c, p.x, p.y))
  if (!isFinite(x1)) return { x1: c.x, y1: c.y, x2: c.x, y2: c.y }
  return { x1, y1, x2, y2 }
}

export const LABEL_SIZE = 1

/** Reference and value texts for a component, placed beside the symbol. */
export function compLabels(c: Comp): WPrim[] {
  const sym = symbolFor(c)
  const out: WPrim[] = []
  const b = compBounds(c)
  const cx = (b.x1 + b.x2) / 2
  const cy = (b.y1 + b.y2) / 2
  const vertical = b.y2 - b.y1 > (b.x2 - b.x1) * 1.15
  const place = (s: string, at: LabelPos | null | undefined, slot: 'ref' | 'value') => {
    if (!s || at === null) return
    if (at) {
      const [x, y] = xf(c, at[0], at[1])
      // A text that grows to the right in local space must grow to the left once the part is flipped.
      const flipped = xf(c, at[0] + 1, at[1])[0] < x
      const a = at[2] ?? 'middle'
      const anchor = flipped && a !== 'middle' ? (a === 'start' ? 'end' : 'start') : a
      // Text that sat above its anchor (baseline at the anchor) must drop below it once the part is turned upside down.
      const upsideDown = at[1] < 0 && xf(c, at[0], at[1] + 1)[1] < y
      out.push({ k: 't', s, x, y: upsideDown ? y + 0.85 * LABEL_SIZE : y, size: LABEL_SIZE, anchor, role: slot })
    } else if (vertical) {
      out.push({ k: 't', s, x: b.x2 + 0.6, y: slot === 'ref' ? cy - 0.2 : cy + 1.0, size: LABEL_SIZE, anchor: 'start', role: slot })
    } else {
      out.push({ k: 't', s, x: cx, y: slot === 'ref' ? b.y1 - 0.5 : b.y2 + 1.3, size: LABEL_SIZE, anchor: 'middle', role: slot })
    }
  }
  place(c.ref, sym.refAt, 'ref')
  place(c.value, sym.valAt, 'value')
  return out
}

export function compWorld(c: Comp, withLabels = true): WPrim[] {
  const out: WPrim[] = symbolFor(c).prims.map((p) => ({ ...mapPrim(c, p), role: 'symbol' as const }))
  return withLabels ? [...out, ...compLabels(c)] : out
}

export function labelWorld(l: Label): WPrim[] {
  const size = l.kind === 'net' ? 1 : 1.1
  const w = textWidth(l.text || ' ', size)
  if (l.kind === 'text') return [{ k: 't', s: l.text, x: l.x, y: l.y, size, anchor: l.flip ? 'end' : 'start' }]
  const d = l.flip ? -1 : 1
  const x0 = l.x
  const x1 = l.x + d * (w + 0.9)
  return [
    { k: 'l', p: [[x0, l.y], [x0 + d * 0.5, l.y - 0.65], [x1, l.y - 0.65], [x1, l.y + 0.65], [x0 + d * 0.5, l.y + 0.65]], closed: true },
    { k: 't', s: l.text, x: x0 + d * 0.65, y: l.y + 0.35, size, anchor: l.flip ? 'end' : 'start' },
  ]
}

function primsBounds(prims: WPrim[]): Bounds | null {
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  const add = (x: number, y: number) => {
    x1 = Math.min(x1, x)
    y1 = Math.min(y1, y)
    x2 = Math.max(x2, x)
    y2 = Math.max(y2, y)
  }
  for (const p of prims) {
    if (p.k === 'l') for (const [x, y] of p.p) add(x, y)
    else if (p.k === 'c') {
      add(p.x - p.r, p.y - p.r)
      add(p.x + p.r, p.y + p.r)
    } else {
      const w = textWidth(p.s, p.size)
      const l = p.anchor === 'start' ? p.x : p.anchor === 'end' ? p.x - w : p.x - w / 2
      add(l, p.y - p.size * 0.8)
      add(l + w, p.y + p.size * 0.25)
    }
  }
  return isFinite(x1) ? { x1, y1, x2, y2 } : null
}

export const labelBounds = (l: Label): Bounds => primsBounds(labelWorld(l)) ?? { x1: l.x, y1: l.y, x2: l.x, y2: l.y }

/** Bounds of the whole drawing including text, or a default area for an empty document. */
export function docBounds(doc: Doc): Bounds {
  const parts: Bounds[] = []
  for (const c of doc.comps) {
    const b = primsBounds(compWorld(c))
    if (b) parts.push(b)
    parts.push(compBounds(c))
  }
  for (const w of doc.wires) parts.push({ x1: Math.min(w.x1, w.x2), y1: Math.min(w.y1, w.y2), x2: Math.max(w.x1, w.x2), y2: Math.max(w.y1, w.y2) })
  for (const l of doc.labels) parts.push(labelBounds(l))
  if (!parts.length) return { x1: 0, y1: 0, x2: 40, y2: 24 }
  return {
    x1: Math.min(...parts.map((p) => p.x1)),
    y1: Math.min(...parts.map((p) => p.y1)),
    x2: Math.max(...parts.map((p) => p.x2)),
    y2: Math.max(...parts.map((p) => p.y2)),
  }
}

/** Orthogonal route from a to b; horizontal first or vertical first. Zero, one or two segments. */
export function route(a: Pt, b: Pt, hFirst: boolean): Seg[] {
  if (a[0] === b[0] && a[1] === b[1]) return []
  if (a[0] === b[0] || a[1] === b[1]) return [[a[0], a[1], b[0], b[1]]]
  const m: Pt = hFirst ? [b[0], a[1]] : [a[0], b[1]]
  return [
    [a[0], a[1], m[0], m[1]],
    [m[0], m[1], b[0], b[1]],
  ]
}

export function distToSeg(px: number, py: number, w: Pick<Wire, 'x1' | 'y1' | 'x2' | 'y2'>): number {
  const dx = w.x2 - w.x1
  const dy = w.y2 - w.y1
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - w.x1) * dx + (py - w.y1) * dy) / l2))
  return Math.hypot(px - (w.x1 + t * dx), py - (w.y1 + t * dy))
}

const strictlyInside = (w: Wire, x: number, y: number): boolean => {
  if (distToSeg(x, y, w) > 1e-6) return false
  const atEnd = (w.x1 === x && w.y1 === y) || (w.x2 === x && w.y2 === y)
  return !atEnd
}

interface Node {
  x: number
  y: number
  n: number
}

/** Number of connection items at each point: pins and wire ends count 1, a wire passing straight through counts 2. */
export function connectionNodes(doc: Doc): Node[] {
  const map = new Map<string, Node>()
  const bump = (x: number, y: number) => {
    const k = key(x, y)
    const node = map.get(k)
    if (node) node.n++
    else map.set(k, { x, y, n: 1 })
  }
  for (const c of doc.comps) for (const p of pinsOf(c)) bump(p.x, p.y)
  for (const w of doc.wires) {
    bump(w.x1, w.y1)
    bump(w.x2, w.y2)
  }
  const nodes = [...map.values()]
  for (const node of nodes) for (const w of doc.wires) if (strictlyInside(w, node.x, node.y)) node.n += 2
  return nodes
}

/** Points where three or more connections meet and a junction dot belongs. */
export function junctions(doc: Doc): Pt[] {
  return connectionNodes(doc)
    .filter((n) => n.n >= 3)
    .map((n) => [n.x, n.y] as Pt)
}

/** True if a pin, wire end or wire interior is at the point (a wire in progress should stop there). */
export function isConnectionPoint(doc: Doc, x: number, y: number): boolean {
  for (const c of doc.comps) for (const p of pinsOf(c)) if (p.x === x && p.y === y) return true
  for (const w of doc.wires) if (distToSeg(x, y, w) < 1e-6) return true
  return false
}

export type Hit = { kind: 'comp' | 'wire' | 'label'; id: string }

const inside = (b: Bounds, x: number, y: number, pad: number) => x >= b.x1 - pad && x <= b.x2 + pad && y >= b.y1 - pad && y <= b.y2 + pad

export function hitTest(doc: Doc, x: number, y: number, tol = 0.35): Hit | null {
  for (let i = doc.labels.length - 1; i >= 0; i--) if (inside(labelBounds(doc.labels[i]), x, y, 0.1)) return { kind: 'label', id: doc.labels[i].id }
  for (let i = doc.comps.length - 1; i >= 0; i--) {
    const b = compBounds(doc.comps[i])
    // Shrink long dimensions so wires that end at a pin are not swallowed by the symbol.
    const sx = b.x2 - b.x1 > 3 ? 0.4 : 0
    const sy = b.y2 - b.y1 > 3 ? 0.4 : 0
    if (inside({ x1: b.x1 + sx, y1: b.y1 + sy, x2: b.x2 - sx, y2: b.y2 - sy }, x, y, 0.2)) return { kind: 'comp', id: doc.comps[i].id }
  }
  let best: Hit | null = null
  let bestD = tol
  for (const w of doc.wires) {
    const d = distToSeg(x, y, w)
    if (d <= bestD) {
      bestD = d
      best = { kind: 'wire', id: w.id }
    }
  }
  if (best) return best
  for (let i = doc.comps.length - 1; i >= 0; i--) if (inside(compBounds(doc.comps[i]), x, y, tol)) return { kind: 'comp', id: doc.comps[i].id }
  return null
}

const overlap = (a: Bounds, b: Bounds) => a.x1 <= b.x2 && a.x2 >= b.x1 && a.y1 <= b.y2 && a.y2 >= b.y1

/** Ids of everything that touches the rectangle. */
export function itemsInRect(doc: Doc, r: Bounds): string[] {
  const out: string[] = []
  for (const c of doc.comps) if (overlap(compBounds(c), r)) out.push(c.id)
  for (const w of doc.wires) if (overlap({ x1: Math.min(w.x1, w.x2), y1: Math.min(w.y1, w.y2), x2: Math.max(w.x1, w.x2), y2: Math.max(w.y1, w.y2) }, r)) out.push(w.id)
  for (const l of doc.labels) if (overlap(labelBounds(l), r)) out.push(l.id)
  return out
}

/** Drops zero-length and duplicate wires. */
export function cleanWires(doc: Doc): Doc {
  const seen = new Set<string>()
  const wires: Wire[] = []
  for (const w of doc.wires) {
    if (w.x1 === w.x2 && w.y1 === w.y2) continue
    const a = key(w.x1, w.y1)
    const b = key(w.x2, w.y2)
    const k = a < b ? `${a}|${b}` : `${b}|${a}`
    if (seen.has(k)) continue
    seen.add(k)
    wires.push(w)
  }
  return wires.length === doc.wires.length ? doc : { ...doc, wires }
}

/**
 * Stretches wires that end on a point in `map` to the mapped point, keeping them orthogonal
 * by inserting a corner when needed. Wires in `skip` are left untouched.
 */
export function reconnect(doc: Doc, map: Map<string, Pt>, skip: ReadonlySet<string>): Doc {
  if (!map.size) return doc
  const out: Wire[] = []
  for (const w of doc.wires) {
    const m1 = skip.has(w.id) ? undefined : map.get(key(w.x1, w.y1))
    const m2 = skip.has(w.id) ? undefined : map.get(key(w.x2, w.y2))
    if (!m1 && !m2) {
      out.push(w)
      continue
    }
    const a: Pt = m1 ?? [w.x1, w.y1]
    const b: Pt = m2 ?? [w.x2, w.y2]
    if ((m1 && m2) || a[0] === b[0] || a[1] === b[1]) {
      out.push({ ...w, x1: a[0], y1: a[1], x2: b[0], y2: b[1] })
      continue
    }
    const moved = m1 ? a : b
    const fixed = m1 ? b : a
    const horizontal = w.y1 === w.y2
    const corner: Pt = horizontal ? [moved[0], fixed[1]] : [fixed[0], moved[1]]
    out.push({ id: w.id, x1: moved[0], y1: moved[1], x2: corner[0], y2: corner[1] })
    out.push({ id: w.id + '~', x1: corner[0], y1: corner[1], x2: fixed[0], y2: fixed[1] })
  }
  return { ...doc, wires: out }
}

/** Moves the selected items by (dx, dy); wires attached to moved pins or wire ends follow. */
export function moveItems(doc: Doc, ids: ReadonlySet<string>, dx: number, dy: number): Doc {
  if (!ids.size || (dx === 0 && dy === 0)) return doc
  const map = new Map<string, Pt>()
  const track = (x: number, y: number) => map.set(key(x, y), [x + dx, y + dy])
  const comps = doc.comps.map((c) => {
    if (!ids.has(c.id)) return c
    for (const p of pinsOf(c)) track(p.x, p.y)
    return { ...c, x: c.x + dx, y: c.y + dy }
  })
  const wires = doc.wires.map((w) => {
    if (!ids.has(w.id)) return w
    track(w.x1, w.y1)
    track(w.x2, w.y2)
    return { ...w, x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy }
  })
  const labels = doc.labels.map((l) => (ids.has(l.id) ? { ...l, x: l.x + dx, y: l.y + dy } : l))
  // Anchors are matched against the original wire ends, so reconnect on the untouched wires.
  const moved = reconnect(doc, map, ids)
  const byId = new Map(wires.filter((w) => ids.has(w.id)).map((w) => [w.id, w]))
  const merged = moved.wires.map((w) => byId.get(w.id) ?? w)
  return cleanWires({ ...doc, comps, labels, wires: merged })
}

function transformComps(doc: Doc, ids: ReadonlySet<string>, f: (c: Comp) => Comp): Doc {
  const map = new Map<string, Pt>()
  const comps = doc.comps.map((c) => {
    if (!ids.has(c.id)) return c
    const n = f(c)
    const before = pinsOf(c)
    const after = pinsOf(n)
    before.forEach((p, i) => map.set(key(p.x, p.y), [after[i].x, after[i].y]))
    return n
  })
  return cleanWires(reconnect({ ...doc, comps }, map, ids))
}

export const rotateComps = (doc: Doc, ids: ReadonlySet<string>): Doc =>
  transformComps(doc, ids, (c) => ({ ...c, rot: ((c.rot + 90) % 360) as Rot }))

/** Mirrors components (left-right) and flips labels. */
export function mirrorItems(doc: Doc, ids: ReadonlySet<string>): Doc {
  const next = transformComps(doc, ids, (c) => ({ ...c, mirror: !c.mirror }))
  return { ...next, labels: next.labels.map((l) => (ids.has(l.id) ? { ...l, flip: !l.flip } : l)) }
}

export function deleteItems(doc: Doc, ids: ReadonlySet<string>): Doc {
  return {
    ...doc,
    comps: doc.comps.filter((c) => !ids.has(c.id)),
    wires: doc.wires.filter((w) => !ids.has(w.id)),
    labels: doc.labels.filter((l) => !ids.has(l.id)),
  }
}

export function nextRef(doc: Doc, prefix: string): string {
  let max = 0
  for (const c of doc.comps) {
    const m = /^([A-Za-z]+)(\d+)$/.exec(c.ref)
    if (m && m[1] === prefix) max = Math.max(max, +m[2])
  }
  return prefix + (max + 1)
}

export function placeComp(doc: Doc, type: string, x: number, y: number, rot: Rot = 0, mirror = false): { doc: Doc; id: string } {
  const def = SYMBOLS[type]
  const comp: Comp = {
    id: uid(), type, x, y, rot, mirror,
    ref: def.refAt === null ? '' : nextRef(doc, def.prefix),
    value: def.value,
  }
  if (type === 'ic') comp.pins = 8
  if (type === 'connector') comp.pins = 2
  return { doc: { ...doc, comps: [...doc.comps, comp] }, id: comp.id }
}

/** Copies the selected items offset by (dx, dy). Wires are copied only if selected; refs are renumbered. */
export function duplicateItems(doc: Doc, ids: ReadonlySet<string>, dx: number, dy: number): { doc: Doc; ids: string[] } {
  let next = doc
  const newIds: string[] = []
  for (const c of doc.comps) {
    if (!ids.has(c.id)) continue
    const def = SYMBOLS[c.type]
    const copy: Comp = { ...c, id: uid(), x: c.x + dx, y: c.y + dy, ref: def.refAt === null ? '' : nextRef(next, def.prefix) }
    next = { ...next, comps: [...next.comps, copy] }
    newIds.push(copy.id)
  }
  for (const w of doc.wires) {
    if (!ids.has(w.id)) continue
    const copy: Wire = { id: uid(), x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy }
    next = { ...next, wires: [...next.wires, copy] }
    newIds.push(copy.id)
  }
  for (const l of doc.labels) {
    if (!ids.has(l.id)) continue
    const copy: Label = { ...l, id: uid(), x: l.x + dx, y: l.y + dy }
    next = { ...next, labels: [...next.labels, copy] }
    newIds.push(copy.id)
  }
  return { doc: next, ids: newIds }
}
