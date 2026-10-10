import { SYMBOLS } from './symbols'

export type Lang = 'en' | 'uk'
export type Theme = 'auto' | 'light' | 'dark'
export type Rot = 0 | 90 | 180 | 270

export interface Comp {
  id: string
  type: string
  x: number
  y: number
  rot: Rot
  mirror: boolean
  ref: string
  value: string
  /** Pin count for configurable symbols (IC box, connector). */
  pins?: number
  /** Comma-separated pin names for the IC box, in pin-number order. */
  pinNames?: string
}
export interface Wire {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
}
export interface Label {
  id: string
  x: number
  y: number
  text: string
  kind: 'net' | 'text'
  /** Net labels normally extend to the right of their anchor; flip puts them on the left. */
  flip?: boolean
}
export interface Doc {
  title: string
  comps: Comp[]
  wires: Wire[]
  labels: Label[]
}
export interface Settings {
  lang: Lang
  theme: Theme
  snap: boolean
  grid: boolean
}

export const DEFAULT_SETTINGS: Settings = { lang: 'en', theme: 'auto', snap: true, grid: true }
export const emptyDoc = (): Doc => ({ title: '', comps: [], wires: [], labels: [] })

let counter = 0
export function uid(): string {
  counter++
  return counter.toString(36) + Math.random().toString(36).slice(2, 7)
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)

/** Validates untrusted JSON into a Doc. Unknown symbols and malformed items are dropped. Throws if it is not a schematic. */
export function normalizeDoc(raw: unknown): Doc {
  let r = raw as Record<string, unknown> | null
  if (r && typeof r === 'object' && r.app === 'schematic-drawing-tool' && r.doc) r = r.doc as Record<string, unknown>
  if (!r || typeof r !== 'object' || !Array.isArray(r.comps) || !Array.isArray(r.wires)) throw new Error('Not a schematic file')
  const comps: Comp[] = []
  for (const c of r.comps as Record<string, unknown>[]) {
    if (!c || typeof c.type !== 'string' || !(c.type in SYMBOLS) || !num(c.x) || !num(c.y)) continue
    const rot = [0, 90, 180, 270].includes(c.rot as number) ? (c.rot as Rot) : 0
    const comp: Comp = { id: str(c.id) || uid(), type: c.type, x: c.x, y: c.y, rot, mirror: c.mirror === true, ref: str(c.ref), value: str(c.value) }
    if (num(c.pins)) comp.pins = Math.max(2, Math.min(40, Math.round(c.pins)))
    if (typeof c.pinNames === 'string') comp.pinNames = c.pinNames
    comps.push(comp)
  }
  const wires: Wire[] = []
  for (const w of r.wires as Record<string, unknown>[]) {
    if (!w || !num(w.x1) || !num(w.y1) || !num(w.x2) || !num(w.y2)) continue
    wires.push({ id: str(w.id) || uid(), x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 })
  }
  const labels: Label[] = []
  for (const l of Array.isArray(r.labels) ? (r.labels as Record<string, unknown>[]) : []) {
    if (!l || !num(l.x) || !num(l.y)) continue
    labels.push({ id: str(l.id) || uid(), x: l.x, y: l.y, text: str(l.text), kind: l.kind === 'text' ? 'text' : 'net', ...(l.flip === true ? { flip: true } : {}) })
  }
  return { title: str(r.title), comps, wires, labels }
}

export function serializeDoc(doc: Doc): string {
  return JSON.stringify({ app: 'schematic-drawing-tool', version: 1, doc }, null, 2)
}

const KEY = 'schematic-drawing-tool:v1'

export function loadState(fallback: () => Doc): { doc: Doc; settings: Settings } {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { doc?: unknown; settings?: Partial<Settings> } | null
    const s = raw?.settings ?? {}
    const settings: Settings = {
      lang: s.lang === 'uk' ? 'uk' : s.lang === 'en' ? 'en' : DEFAULT_SETTINGS.lang,
      theme: s.theme === 'light' || s.theme === 'dark' || s.theme === 'auto' ? s.theme : DEFAULT_SETTINGS.theme,
      snap: s.snap !== false,
      grid: s.grid !== false,
    }
    if (!raw) {
      const navUk = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('uk')
      return { doc: fallback(), settings: { ...DEFAULT_SETTINGS, lang: navUk ? 'uk' : 'en' } }
    }
    return { doc: raw.doc ? normalizeDoc(raw.doc) : fallback(), settings }
  } catch {
    return { doc: fallback(), settings: DEFAULT_SETTINGS }
  }
}

export function saveState(doc: Doc, settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ doc, settings }))
  } catch {
    // storage full or unavailable: the drawing just won't persist
  }
}
