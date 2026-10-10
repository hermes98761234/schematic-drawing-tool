import { useMemo } from 'react'
import { compBounds, compWorld } from '../lib/geometry'
import { CATEGORIES, SYMBOL_LIST } from '../lib/symbols'
import type { Comp } from '../lib/model'
import type { T } from '../i18n'
import { PrimEl } from './Canvas'

function Preview({ type }: { type: string }) {
  const { prims, vb } = useMemo(() => {
    const c: Comp = { id: 'p', type, x: 0, y: 0, rot: 0, mirror: false, ref: '', value: '', ...(type === 'ic' ? { pins: 4 } : type === 'connector' ? { pins: 3 } : {}) }
    const b = compBounds(c)
    const pad = 0.6
    return { prims: compWorld(c, false), vb: `${b.x1 - pad} ${b.y1 - pad} ${b.x2 - b.x1 + 2 * pad} ${b.y2 - b.y1 + 2 * pad}` }
  }, [type])
  return (
    <svg viewBox={vb} className="preview-svg" aria-hidden="true">
      <g className="sch-comp">
        {prims.map((p, i) => (
          <PrimEl key={i} p={p} />
        ))}
      </g>
    </svg>
  )
}

export default function Palette({ active, onPick, t }: { active: string | null; onPick: (type: string) => void; t: T }) {
  return (
    <div className="palette">
      {CATEGORIES.map((cat) => (
        <div key={cat} className="section">
          <h3>{t(cat)}</h3>
          <div className="symbols">
            {SYMBOL_LIST.filter((s) => s.category === cat).map((s) => (
              <button key={s.id} className={active === s.id ? 'symbol active' : 'symbol'} title={t(s.name)} onClick={() => onPick(s.id)}>
                <Preview type={s.id} />
                <span>{t(s.name)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
