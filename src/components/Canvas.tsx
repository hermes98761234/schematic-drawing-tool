import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import {
  compBounds, compWorld, docBounds, hitTest, isConnectionPoint, itemsInRect, junctions, labelBounds, labelWorld, moveItems, pinsOf, placeComp, route, snapTo,
  type Bounds, type WPrim,
} from '../lib/geometry'
import { uid, type Comp, type Doc, type Rot, type Settings, type Wire } from '../lib/model'
import type { Pt } from '../lib/symbols'
import type { T } from '../i18n'

export type Tool = 'select' | 'wire' | 'place' | 'label' | 'text'
export interface Ghost {
  type: string
  rot: Rot
  mirror: boolean
}

interface View {
  tx: number
  ty: number
  s: number
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; v: View }
  | { kind: 'box'; x0: number; y0: number; x1: number; y1: number; add: boolean }
  | { kind: 'move'; sx: number; sy: number; base: Doc; ids: Set<string>; preview: Doc; moved: boolean }

interface Props {
  doc: Doc
  settings: Settings
  tool: Tool
  ghost: Ghost
  selection: string[]
  fitSignal: number
  onSelect: (ids: string[]) => void
  onCommit: (doc: Doc, key?: string) => void
  onTool: (t: Tool) => void
  onAddLabel: (kind: 'net' | 'text', x: number, y: number) => void
  t: T
}

const MIN_S = 3
const MAX_S = 80

export function PrimEl({ p, cls }: { p: WPrim; cls?: string }) {
  if (p.k === 'l') {
    const pts = p.p.map(([x, y]) => `${x},${y}`).join(' ')
    return p.closed ? <polygon points={pts} className={p.fill ? `${cls ?? ''} fill` : cls} /> : <polyline points={pts} className={cls} />
  }
  if (p.k === 'c') return <circle cx={p.x} cy={p.y} r={p.r} className={p.fill ? `${cls ?? ''} fill` : cls} />
  return (
    <text x={p.x} y={p.y} fontSize={p.size} textAnchor={p.anchor} className="sch-text">
      {p.s}
    </text>
  )
}

const rectOf = (a: Pt, b: Pt): Bounds => ({ x1: Math.min(a[0], b[0]), y1: Math.min(a[1], b[1]), x2: Math.max(a[0], b[0]), y2: Math.max(a[1], b[1]) })

export default function Canvas({ doc, settings, tool, ghost, selection, fitSignal, onSelect, onCommit, onTool, onAddLabel, t }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 800, h: 500 })
  const [view, setView] = useState<View>({ tx: 40, ty: 40, s: 14 })
  const [hover, setHover] = useState<Pt | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [wireChain, setWireStart] = useState<Pt | null>(null)
  const press = useRef<Pt | null>(null)
  const space = useRef(false)
  const [measured, setMeasured] = useState(false)
  const sizeRef = useRef({ w: 800, h: 500 })
  // The chain only exists while the wire tool is active.
  const wireStart = tool === 'wire' ? wireChain : null
  const sel = useMemo(() => new Set(selection), [selection])

  const shown = drag?.kind === 'move' ? drag.preview : doc

  const fit = useCallback((d: Doc) => {
      const { w, h } = sizeRef.current
      const b = docBounds(d)
      const pad = 24
      const bw = b.x2 - b.x1 + 2
      const bh = b.y2 - b.y1 + 2
      const s = Math.max(MIN_S, Math.min(MAX_S, 22, (w - 2 * pad) / bw, (h - 2 * pad) / bh))
      setView({ s, tx: (w - bw * s) / 2 - (b.x1 - 1) * s, ty: (h - bh * s) / 2 - (b.y1 - 1) * s })
  }, [])

  useLayoutEffect(() => {
    const el = svgRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) {
        sizeRef.current = { w: r.width, h: r.height }
        setSize({ w: r.width, h: r.height })
        setMeasured(true)
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const latestDoc = useRef(doc)
  useEffect(() => {
    latestDoc.current = doc
  })
  useEffect(() => {
    // Fit once the real size is known, and again whenever asked (new file, example, fit button).
    if (measured) fit(latestDoc.current)
  }, [fitSignal, measured, fit])

  const world = (e: { clientX: number; clientY: number }): Pt => {
    const r = svgRef.current!.getBoundingClientRect()
    return [(e.clientX - r.left - view.tx) / view.s, (e.clientY - r.top - view.ty) / view.s]
  }
  const snap = (p: Pt): Pt => [snapTo(p[0], settings.snap), snapTo(p[1], settings.snap)]

  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    setView((v) => {
      const s = Math.max(MIN_S, Math.min(MAX_S, v.s * factor))
      const k = s / v.s
      return { s, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k }
    })
  }, [])

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      if (e.shiftKey) setView((v) => ({ ...v, tx: v.tx - e.deltaY }))
      else zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !typing(e)) {
        space.current = true
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const hFirstFor = (a: Pt, b: Pt) => Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1])

  /** Adds the wire from the chain start to p; the chain continues unless p lands on something already connected. */
  const advance = (p: Pt) => {
    if (!wireStart) return
    if (p[0] === wireStart[0] && p[1] === wireStart[1]) {
      setWireStart(null)
      return
    }
    const segs = route(wireStart, p, hFirstFor(wireStart, p))
    const wires: Wire[] = segs.map(([x1, y1, x2, y2]) => ({ id: uid(), x1, y1, x2, y2 }))
    const next = { ...doc, wires: [...doc.wires, ...wires] }
    onCommit(next)
    setWireStart(isConnectionPoint(doc, p[0], p[1]) ? null : p)
  }

  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    const el = svgRef.current!
    if (e.button === 2) {
      setWireStart(null)
      return
    }
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      // synthetic or already-released pointer: dragging still works without capture
    }
    const w = world(e)
    const p = snap(w)
    setHover(p)
    if (e.button === 1 || space.current) {
      setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, v: view })
      return
    }
    if (tool === 'wire') {
      if (!wireStart) {
        setWireStart(p)
        press.current = p
      } else advance(p)
      return
    }
    if (tool === 'place') {
      const r = placeComp(doc, ghost.type, p[0], p[1], ghost.rot, ghost.mirror)
      onCommit(r.doc)
      onSelect([r.id])
      return
    }
    if (tool === 'label' || tool === 'text') {
      onAddLabel(tool === 'label' ? 'net' : 'text', p[0], p[1])
      onTool('select')
      return
    }
    const tol = Math.max(0.35, 6 / view.s)
    const hit = hitTest(doc, w[0], w[1], tol)
    if (hit) {
      let ids = selection
      if (e.shiftKey) ids = sel.has(hit.id) ? selection.filter((i) => i !== hit.id) : [...selection, hit.id]
      else if (!sel.has(hit.id)) ids = [hit.id]
      onSelect(ids)
      if (ids.includes(hit.id)) setDrag({ kind: 'move', sx: p[0], sy: p[1], base: doc, ids: new Set(ids), preview: doc, moved: false })
      return
    }
    if (e.pointerType === 'touch') {
      setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, v: view })
      if (!e.shiftKey) onSelect([])
      return
    }
    if (!e.shiftKey) onSelect([])
    setDrag({ kind: 'box', x0: w[0], y0: w[1], x1: w[0], y1: w[1], add: e.shiftKey })
  }

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const w = world(e)
    const p = snap(w)
    setHover((h) => (h && h[0] === p[0] && h[1] === p[1] ? h : p))
    if (!drag) return
    if (drag.kind === 'pan') setView({ ...drag.v, tx: drag.v.tx + e.clientX - drag.sx, ty: drag.v.ty + e.clientY - drag.sy })
    else if (drag.kind === 'box') setDrag({ ...drag, x1: w[0], y1: w[1] })
    else {
      const dx = p[0] - drag.sx
      const dy = p[1] - drag.sy
      if (dx === 0 && dy === 0 && !drag.moved) return
      setDrag({ ...drag, preview: moveItems(drag.base, drag.ids, dx, dy), moved: true })
    }
  }

  const onPointerUp = (e: RPointerEvent<SVGSVGElement>) => {
    const p = snap(world(e))
    if (press.current && wireStart && tool === 'wire') {
      if (p[0] !== press.current[0] || p[1] !== press.current[1]) advance(p)
    }
    press.current = null
    if (drag?.kind === 'move' && drag.moved) onCommit(drag.preview)
    if (drag?.kind === 'box') {
      const ids = itemsInRect(doc, rectOf([drag.x0, drag.y0], [drag.x1, drag.y1]))
      if (Math.hypot(drag.x1 - drag.x0, drag.y1 - drag.y0) * view.s > 3) onSelect(drag.add ? [...new Set([...selection, ...ids])] : ids)
    }
    setDrag(null)
  }

  const gridStep = view.s >= 9 ? 1 : 5
  const gpx = gridStep * view.s
  const ghostComp: Comp | null = tool === 'place' && hover ? { id: 'ghost', type: ghost.type, x: hover[0], y: hover[1], rot: ghost.rot, mirror: ghost.mirror, ref: '', value: '', ...(ghost.type === 'ic' ? { pins: 8 } : ghost.type === 'connector' ? { pins: 2 } : {}) } : null
  const preview = wireStart && hover && tool === 'wire' ? route(wireStart, hover, hFirstFor(wireStart, hover)) : []
  const dots = useMemo(() => junctions(shown), [shown])
  const showPins = tool === 'wire' || tool === 'place'

  const cursor = drag?.kind === 'pan' ? 'grabbing' : tool === 'select' ? 'default' : 'crosshair'

  return (
    <div className="canvas-wrap">
      <svg
        ref={svgRef}
        className="canvas"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
        onPointerLeave={() => setHover(null)}
        onContextMenu={(e) => e.preventDefault()}
        role="img"
        aria-label={t('Schematic canvas')}
      >
        {settings.grid && (
          <>
            <defs>
              <pattern id="grid" x={view.tx} y={view.ty} width={gpx} height={gpx} patternUnits="userSpaceOnUse">
                <circle cx={0} cy={0} r={1} className="grid-dot" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </>
        )}
        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.s})`}>
          <g className="sch-wires">
            {shown.wires.map((w) => (
              <line key={w.id} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} className={sel.has(w.id) ? 'sel' : undefined} />
            ))}
          </g>
          {dots.map(([x, y]) => (
            <circle key={`${x},${y}`} cx={x} cy={y} r={0.28} className="sch-dot" />
          ))}
          {shown.comps.map((c) => {
            const b = compBounds(c)
            return (
              <g key={c.id} className={sel.has(c.id) ? 'sch-comp sel' : 'sch-comp'}>
                {compWorld(c).map((p, i) => (
                  <PrimEl key={i} p={p} />
                ))}
                {sel.has(c.id) && <rect x={b.x1 - 0.4} y={b.y1 - 0.4} width={b.x2 - b.x1 + 0.8} height={b.y2 - b.y1 + 0.8} className="sel-box" />}
              </g>
            )
          })}
          {shown.labels.map((l) => {
            const b = labelBounds(l)
            return (
              <g key={l.id} className={sel.has(l.id) ? 'sch-comp sel' : 'sch-comp'}>
                {labelWorld(l).map((p, i) => (
                  <PrimEl key={i} p={p} />
                ))}
                {sel.has(l.id) && <rect x={b.x1 - 0.2} y={b.y1 - 0.2} width={b.x2 - b.x1 + 0.4} height={b.y2 - b.y1 + 0.4} className="sel-box" />}
                <circle cx={l.x} cy={l.y} r={0.18} className="anchor" />
              </g>
            )
          })}
          {showPins &&
            shown.comps.flatMap((c) =>
              pinsOf(c).map((p, i) => <circle key={`${c.id}:${i}`} cx={p.x} cy={p.y} r={0.25} className="pin" />),
            )}
          {ghostComp && (
            <g className="ghost">
              {compWorld(ghostComp, false).map((p, i) => (
                <PrimEl key={i} p={p} />
              ))}
            </g>
          )}
          {preview.length > 0 && (
            <g className="sch-wires preview">
              {preview.map((s, i) => (
                <line key={i} x1={s[0]} y1={s[1]} x2={s[2]} y2={s[3]} />
              ))}
            </g>
          )}
          {tool === 'wire' && hover && <circle cx={hover[0]} cy={hover[1]} r={0.3} className="cursor-ring" />}
          {tool !== 'select' && tool !== 'wire' && tool !== 'place' && hover && <circle cx={hover[0]} cy={hover[1]} r={0.3} className="cursor-ring" />}
          {drag?.kind === 'box' && (
            <rect
              x={Math.min(drag.x0, drag.x1)}
              y={Math.min(drag.y0, drag.y1)}
              width={Math.abs(drag.x1 - drag.x0)}
              height={Math.abs(drag.y1 - drag.y0)}
              className="rubber"
            />
          )}
        </g>
      </svg>
      <div className="zoom">
        <button className="small" title={t('Zoom in')} aria-label={t('Zoom in')} onClick={() => zoomAt(size.w / 2, size.h / 2, 1.25)}>
          +
        </button>
        <button className="small" title={t('Zoom out')} aria-label={t('Zoom out')} onClick={() => zoomAt(size.w / 2, size.h / 2, 0.8)}>
          &minus;
        </button>
        <button className="small" title={t('Fit to drawing')} aria-label={t('Fit to drawing')} onClick={() => fit(doc)}>
          &#9633;
        </button>
      </div>
      {doc.comps.length === 0 && doc.wires.length === 0 && doc.labels.length === 0 && <div className="empty-hint">{t('Pick a symbol on the left, then click to place it.')}</div>}
    </div>
  )
}
