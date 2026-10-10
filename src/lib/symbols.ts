import { N } from '../i18n'
import type { Comp } from './model'

export type Pt = [number, number]
/** Symbol drawing primitives in grid units (1 unit = one grid step), y pointing down. */
export type Prim =
  | { k: 'l'; p: Pt[]; closed?: boolean; fill?: boolean }
  | { k: 'c'; x: number; y: number; r: number; fill?: boolean }
  | { k: 't'; x: number; y: number; s: string; size: number; anchor: 'start' | 'middle' | 'end' }

/** Local label position with an optional text anchor (default middle). */
export type LabelPos = [number, number, ('start' | 'middle' | 'end')?]

export interface Pin {
  x: number
  y: number
  name: string
}

export type Category = 'Passive' | 'Semiconductors' | 'ICs' | 'Sources' | 'Power' | 'Connectors'

export interface SymbolDef {
  id: string
  name: string
  category: Category
  prefix: string
  value: string
  pins: Pin[]
  prims: Prim[]
  /** Local position of the reference text; null hides it. Undefined = automatic placement. */
  refAt?: LabelPos | null
  valAt?: LabelPos | null
  /** Whether the pin count is editable. */
  configurable?: boolean
}

const line = (...p: Pt[]): Prim => ({ k: 'l', p })
const poly = (fill: boolean, ...p: Pt[]): Prim => ({ k: 'l', p, closed: true, fill })
const text = (s: string, x: number, y: number, size = 1, anchor: 'start' | 'middle' | 'end' = 'middle'): Prim => ({ k: 't', s, x, y, size, anchor })

/** Filled arrow head with its tip at (tx, ty) pointing along (dx, dy). */
function head(tx: number, ty: number, dx: number, dy: number, len = 0.45, w = 0.2): Prim {
  const l = Math.hypot(dx, dy)
  const ux = dx / l
  const uy = dy / l
  const bx = tx - ux * len
  const by = ty - uy * len
  return poly(true, [tx, ty], [bx - uy * w, by + ux * w], [bx + uy * w, by - ux * w])
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number, n = 10): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Pt
  })
}

const pin = (x: number, y: number, name = ''): Pin => ({ x, y, name })
const two: Pin[] = [pin(-2, 0, '1'), pin(2, 0, '2')]
const vert: Pin[] = [pin(0, -2, '+'), pin(0, 2, '-')]

function inductor(): Prim[] {
  const p: Pt[] = [[-2, 0], [-1.5, 0]]
  for (let h = 0; h < 4; h++) p.push(...arc(-1.5 + 0.75 * h + 0.375, 0, 0.375, Math.PI, 2 * Math.PI, 8).slice(1))
  p.push([2, 0])
  return [{ k: 'l', p }]
}

function diodeBody(): Prim[] {
  return [line([-2, 0], [-0.7, 0]), poly(false, [-0.7, -0.8], [-0.7, 0.8], [0.7, 0]), line([0.7, -0.8], [0.7, 0.8]), line([0.7, 0], [2, 0])]
}

function bjt(npn: boolean): Prim[] {
  // emitter line from (-0.5, 0.5) to (1, 1.5)
  const dx = 1.5
  const dy = 1
  const at = (t: number): Pt => [-0.5 + dx * t, 0.5 + dy * t]
  const arrow = npn ? head(...at(0.82), dx, dy) : head(...at(0.2), -dx, -dy)
  return [
    { k: 'c', x: 0.1, y: 0, r: 1.85 },
    line([-2, 0], [-0.5, 0]),
    line([-0.5, -1], [-0.5, 1]),
    line([-0.5, -0.5], [1, -1.5], [1, -2]),
    line([-0.5, 0.5], [1, 1.5], [1, 2]),
    arrow,
  ]
}

function mosfet(n: boolean): Prim[] {
  return [
    line([-2, 0], [-0.9, 0]),
    line([-0.9, -1], [-0.9, 1]),
    line([-0.4, -1], [-0.4, -0.55]),
    line([-0.4, -0.3], [-0.4, 0.3]),
    line([-0.4, 0.55], [-0.4, 1]),
    line([-0.4, -0.8], [1, -0.8], [1, -2]),
    line([-0.4, 0.8], [1, 0.8], [1, 2]),
    line([-0.4, 0], [1, 0], [1, 0.8]),
    n ? head(-0.4, 0, -1, 0) : head(0.55, 0, 1, 0),
  ]
}

function sine(): Prim {
  const p: Pt[] = Array.from({ length: 21 }, (_, i) => {
    const x = -0.85 + (1.7 * i) / 20
    return [x, -0.45 * Math.sin((Math.PI * x) / 0.85)] as Pt
  })
  return { k: 'l', p }
}

function sym(s: Omit<SymbolDef, 'id'> & { id: string }): SymbolDef {
  return s
}

const list: SymbolDef[] = [
  sym({
    id: 'resistor', name: N('Resistor'), category: 'Passive', prefix: 'R', value: '10k', pins: two,
    prims: [line([-2, 0], [-1.5, 0]), poly(false, [-1.5, -0.5], [1.5, -0.5], [1.5, 0.5], [-1.5, 0.5]), line([1.5, 0], [2, 0])],
  }),
  sym({
    id: 'capacitor', name: N('Capacitor'), category: 'Passive', prefix: 'C', value: '100n', pins: two,
    prims: [line([-2, 0], [-0.25, 0]), line([-0.25, -1], [-0.25, 1]), line([0.25, -1], [0.25, 1]), line([0.25, 0], [2, 0])],
  }),
  sym({
    id: 'capacitor-pol', name: N('Polarized capacitor'), category: 'Passive', prefix: 'C', value: '10u', pins: [pin(-2, 0, '+'), pin(2, 0, '-')],
    prims: [
      line([-2, 0], [-0.25, 0]),
      line([-0.25, -1], [-0.25, 1]),
      { k: 'l', p: Array.from({ length: 11 }, (_, i) => [0.1 + 0.35 * (((i - 5) / 5) ** 2), (i - 5) / 5] as Pt) },
      line([0.1, 0], [2, 0]),
      text('+', -0.95, -0.55, 0.9),
    ],
  }),
  sym({ id: 'inductor', name: N('Inductor'), category: 'Passive', prefix: 'L', value: '10u', pins: two, prims: inductor() }),
  sym({
    id: 'potentiometer', name: N('Potentiometer'), category: 'Passive', prefix: 'RV', value: '10k', pins: [pin(-2, 0, '1'), pin(2, 0, '3'), pin(0, -2, '2')],
    prims: [line([-2, 0], [-1.5, 0]), poly(false, [-1.5, -0.5], [1.5, -0.5], [1.5, 0.5], [-1.5, 0.5]), line([1.5, 0], [2, 0]), line([0, -2], [0, -0.9]), head(0, -0.5, 0, 1, 0.5, 0.2)],
  }),
  sym({
    id: 'crystal', name: N('Crystal'), category: 'Passive', prefix: 'Y', value: '8MHz', pins: two,
    prims: [line([-2, 0], [-0.8, 0]), line([-0.8, -0.9], [-0.8, 0.9]), poly(false, [-0.35, -0.9], [0.35, -0.9], [0.35, 0.9], [-0.35, 0.9]), line([0.8, -0.9], [0.8, 0.9]), line([0.8, 0], [2, 0])],
  }),
  sym({
    id: 'switch', name: N('Switch (SPST)'), category: 'Passive', prefix: 'SW', value: '', pins: two,
    prims: [line([-2, 0], [-1, 0]), { k: 'c', x: -0.85, y: 0, r: 0.15 }, { k: 'c', x: 0.85, y: 0, r: 0.15 }, line([-0.85, 0], [0.9, -1.1]), line([1, 0], [2, 0])],
  }),
  sym({ id: 'diode', name: N('Diode'), category: 'Semiconductors', prefix: 'D', value: '1N4148', pins: [pin(-2, 0, 'A'), pin(2, 0, 'K')], prims: diodeBody() }),
  sym({
    id: 'led', name: N('LED'), category: 'Semiconductors', prefix: 'D', value: 'LED', pins: [pin(-2, 0, 'A'), pin(2, 0, 'K')],
    prims: [...diodeBody(), line([-0.1, -1.05], [0.7, -1.85]), head(0.85, -2, 1, -1), line([0.7, -0.85], [1.5, -1.65]), head(1.65, -1.8, 1, -1)],
  }),
  sym({
    id: 'zener', name: N('Zener diode'), category: 'Semiconductors', prefix: 'D', value: '5V1', pins: [pin(-2, 0, 'A'), pin(2, 0, 'K')],
    prims: [line([-2, 0], [-0.7, 0]), poly(false, [-0.7, -0.8], [-0.7, 0.8], [0.7, 0]), line([0.3, -0.8], [0.7, -0.8], [0.7, 0.8], [1.1, 0.8]), line([0.7, 0], [2, 0])],
  }),
  sym({ id: 'npn', name: N('NPN transistor'), category: 'Semiconductors', prefix: 'Q', value: '2N3904', pins: [pin(1, -2, 'C'), pin(-2, 0, 'B'), pin(1, 2, 'E')], prims: bjt(true), refAt: [2.3, -0.3, 'start'], valAt: [2.3, 0.9, 'start'] }),
  sym({ id: 'pnp', name: N('PNP transistor'), category: 'Semiconductors', prefix: 'Q', value: '2N3906', pins: [pin(1, -2, 'C'), pin(-2, 0, 'B'), pin(1, 2, 'E')], prims: bjt(false), refAt: [2.3, -0.3, 'start'], valAt: [2.3, 0.9, 'start'] }),
  sym({ id: 'nmos', name: N('N-MOSFET'), category: 'Semiconductors', prefix: 'Q', value: 'IRLZ44N', pins: [pin(1, -2, 'D'), pin(-2, 0, 'G'), pin(1, 2, 'S')], prims: mosfet(true), refAt: [1.8, -0.3, 'start'], valAt: [1.8, 0.9, 'start'] }),
  sym({ id: 'pmos', name: N('P-MOSFET'), category: 'Semiconductors', prefix: 'Q', value: 'IRF9540', pins: [pin(1, -2, 'D'), pin(-2, 0, 'G'), pin(1, 2, 'S')], prims: mosfet(false), refAt: [1.8, -0.3, 'start'], valAt: [1.8, 0.9, 'start'] }),
  sym({
    id: 'opamp', name: N('Op-amp'), category: 'ICs', prefix: 'U', value: 'LM358',
    pins: [pin(-4, -1, '-'), pin(-4, 1, '+'), pin(4, 0, 'OUT'), pin(0, -3, 'V+'), pin(0, 3, 'V-')],
    prims: [
      poly(false, [-2, -3], [-2, 3], [3, 0]),
      line([-4, -1], [-2, -1]),
      line([-4, 1], [-2, 1]),
      line([3, 0], [4, 0]),
      line([0, -3], [0, -1.8]),
      line([0, 3], [0, 1.8]),
      text('−', -1.55, -0.65, 1, 'start'),
      text('+', -1.55, 1.35, 1, 'start'),
    ],
    refAt: [1.2, -1.6, 'start'], valAt: [1.2, 2.6, 'start'],
  }),
  sym({ id: 'ic', name: N('IC box'), category: 'ICs', prefix: 'U', value: 'NE555', pins: [], prims: [], configurable: true }),
  sym({
    id: 'vdc', name: N('DC voltage source'), category: 'Sources', prefix: 'V', value: '5V', pins: vert,
    prims: [line([0, -2], [0, -1.4]), { k: 'c', x: 0, y: 0, r: 1.4 }, line([0, 1.4], [0, 2]), text('+', 0, -0.2, 1.2), text('−', 0, 1.15, 1.2)],
  }),
  sym({
    id: 'battery', name: N('Battery'), category: 'Sources', prefix: 'BT', value: '9V', pins: vert,
    prims: [line([0, -2], [0, -0.3]), line([-1, -0.3], [1, -0.3]), line([-0.55, 0.3], [0.55, 0.3]), line([0, 0.3], [0, 2]), text('+', 0.95, -0.7, 0.9, 'start')],
  }),
  sym({
    id: 'vac', name: N('AC voltage source'), category: 'Sources', prefix: 'V', value: '1Vpk', pins: vert,
    prims: [line([0, -2], [0, -1.4]), { k: 'c', x: 0, y: 0, r: 1.4 }, sine(), line([0, 1.4], [0, 2])],
  }),
  sym({
    id: 'idc', name: N('Current source'), category: 'Sources', prefix: 'I', value: '1mA', pins: vert,
    prims: [line([0, -2], [0, -1.4]), { k: 'c', x: 0, y: 0, r: 1.4 }, line([0, 0.85], [0, -0.3]), head(0, -0.85, 0, -1, 0.6, 0.25), line([0, 1.4], [0, 2])],
  }),
  sym({
    id: 'ground', name: N('Ground'), category: 'Power', prefix: 'GND', value: 'GND', pins: [pin(0, 0, 'GND')],
    prims: [line([0, 0], [0, 0.7]), line([-1, 0.7], [1, 0.7]), line([-0.65, 1.1], [0.65, 1.1]), line([-0.3, 1.5], [0.3, 1.5])],
    refAt: null, valAt: null,
  }),
  sym({
    id: 'vcc', name: N('Power rail'), category: 'Power', prefix: 'PWR', value: '+5V', pins: [pin(0, 0, 'VCC')],
    prims: [line([0, 0], [0, -0.8]), line([-0.8, -0.8], [0.8, -0.8])],
    refAt: null, valAt: [0, -1.25],
  }),
  sym({ id: 'connector', name: N('Connector'), category: 'Connectors', prefix: 'J', value: 'Conn', pins: [], prims: [], configurable: true }),
]

export const SYMBOLS: Record<string, SymbolDef> = Object.fromEntries(list.map((s) => [s.id, s]))
export const SYMBOL_LIST = list
export const CATEGORIES: Category[] = ['Passive', 'Semiconductors', 'ICs', 'Sources', 'Power', 'Connectors']

export const IC_DEFAULT_PINS = 8
export const CONN_DEFAULT_PINS = 2

function icSymbol(base: SymbolDef, total: number, names: string[]): SymbolDef {
  const n = Math.max(1, Math.round(total / 2))
  const pins: Pin[] = []
  const prims: Prim[] = [poly(false, [-3, -n], [3, -n], [3, n], [-3, n])]
  for (let i = 0; i < n; i++) {
    const y = -n + 1 + 2 * i
    const left = i + 1
    const right = 2 * n - i
    pins.push(pin(-5, y, String(left)), pin(5, y, String(right)))
    prims.push(line([-5, y], [-3, y]), line([3, y], [5, y]))
    prims.push(text(String(left), -4, y - 0.25, 0.7), text(String(right), 4, y - 0.25, 0.7))
    const ln = names[left - 1]
    const rn = names[right - 1]
    if (ln) prims.push(text(ln, -2.7, y + 0.28, 0.8, 'start'))
    if (rn) prims.push(text(rn, 2.7, y + 0.28, 0.8, 'end'))
  }
  return { ...base, pins, prims, refAt: [0, -n - 0.5], valAt: [0, n + 1.3] }
}

function connSymbol(base: SymbolDef, n: number): SymbolDef {
  const pins: Pin[] = []
  const prims: Prim[] = [poly(false, [-1.2, -n], [0.4, -n], [0.4, n], [-1.2, n])]
  for (let i = 0; i < n; i++) {
    const y = -(n - 1) + 2 * i
    pins.push(pin(-3, y, String(i + 1)))
    prims.push(line([-3, y], [-0.8, y]), { k: 'c', x: -0.5, y, r: 0.3, fill: true }, text(String(i + 1), -2.1, y - 0.25, 0.7))
  }
  return { ...base, pins, prims, refAt: [-1.2, -n - 0.5], valAt: [-1.2, n + 1.3] }
}

/** The concrete symbol for a placed component (IC box and connector depend on their pin count). */
export function symbolFor(c: Pick<Comp, 'type' | 'pins' | 'pinNames'>): SymbolDef {
  const base = SYMBOLS[c.type]
  if (c.type === 'ic') return icSymbol(base, c.pins ?? IC_DEFAULT_PINS, (c.pinNames ?? '').split(',').map((s) => s.trim()))
  if (c.type === 'connector') return connSymbol(base, c.pins ?? CONN_DEFAULT_PINS)
  return base
}
