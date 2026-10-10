import { SYMBOLS, symbolFor } from '../lib/symbols'
import type { Doc, Lang, Settings, Theme } from '../lib/model'
import type { T } from '../i18n'

interface Props {
  doc: Doc
  selection: string[]
  settings: Settings
  onDoc: (doc: Doc, key?: string) => void
  onSettings: (s: Settings) => void
  onRotate: () => void
  onMirror: () => void
  onDelete: () => void
  onDuplicate: () => void
  t: T
}

export default function Inspector({ doc, selection, settings, onDoc, onSettings, onRotate, onMirror, onDelete, onDuplicate, t }: Props) {
  const ids = new Set(selection)
  const comps = doc.comps.filter((c) => ids.has(c.id))
  const labels = doc.labels.filter((l) => ids.has(l.id))
  const wires = doc.wires.filter((w) => ids.has(w.id))
  const total = comps.length + labels.length + wires.length
  const one = total === 1
  const comp = one ? comps[0] : undefined
  const label = one ? labels[0] : undefined
  const def = comp ? SYMBOLS[comp.type] : undefined
  const patchComp = (patch: Partial<NonNullable<typeof comp>>, key: string) =>
    onDoc({ ...doc, comps: doc.comps.map((c) => (c.id === comp?.id ? { ...c, ...patch } : c)) }, `${comp?.id}:${key}`)

  return (
    <div className="panel">
      <div className="section">
        <h3>{t('Drawing')}</h3>
        <div className="field">
          <label htmlFor="title">{t('Title')}</label>
          <input id="title" type="text" value={doc.title} placeholder={t('Untitled schematic')} onChange={(e) => onDoc({ ...doc, title: e.target.value }, 'title')} />
        </div>
        <p className="hint">
          {t('{0} parts, {1} wires', doc.comps.length, doc.wires.length)}
        </p>
      </div>

      <div className="section">
        <h3>{t('Selection')}</h3>
        {total === 0 && <p className="hint">{t('Nothing selected. Click a part, wire or label, or drag a box around several.')}</p>}
        {total > 1 && <p className="hint">{t('{0} items selected', total)}</p>}
        {comp && def && (
          <>
            <p className="verdict small">{t(def.name)}</p>
            {def.refAt !== null && (
              <div className="field">
                <label htmlFor="ref">{t('Reference')}</label>
                <input id="ref" type="text" value={comp.ref} onChange={(e) => patchComp({ ref: e.target.value }, 'ref')} />
              </div>
            )}
            {def.valAt !== null && (
              <div className="field">
                <label htmlFor="value">{t('Value')}</label>
                <input id="value" type="text" value={comp.value} onChange={(e) => patchComp({ value: e.target.value }, 'value')} />
              </div>
            )}
            {def.configurable && (
              <div className="field">
                <label htmlFor="pins">{t('Pins')}</label>
                <input
                  id="pins"
                  type="number"
                  min={def.id === 'ic' ? 4 : 1}
                  max={def.id === 'ic' ? 40 : 20}
                  step={def.id === 'ic' ? 2 : 1}
                  value={symbolFor(comp).pins.length}
                  onChange={(e) => {
                    const v = Math.round(+e.target.value)
                    if (Number.isFinite(v) && v >= 1) patchComp({ pins: Math.min(def.id === 'ic' ? 40 : 20, def.id === 'ic' ? Math.max(4, v + (v % 2)) : v) }, 'pins')
                  }}
                />
              </div>
            )}
            {def.id === 'ic' && (
              <div className="field">
                <label htmlFor="pinnames">{t('Pin names, comma separated')}</label>
                <input id="pinnames" type="text" value={comp.pinNames ?? ''} placeholder="GND,TRIG,OUT,RESET,..." onChange={(e) => patchComp({ pinNames: e.target.value }, 'pinNames')} />
              </div>
            )}
          </>
        )}
        {label && (
          <>
            <p className="verdict small">{label.kind === 'net' ? t('Net label') : t('Text')}</p>
            <div className="field">
              <label htmlFor="label">{t('Text')}</label>
              <input
                id="label"
                key={label.id}
                autoFocus
                type="text"
                value={label.text}
                onChange={(e) => onDoc({ ...doc, labels: doc.labels.map((l) => (l.id === label.id ? { ...l, text: e.target.value } : l)) }, `${label.id}:text`)}
              />
            </div>
          </>
        )}
        {total > 0 && (
          <div className="row">
            <button className="small" onClick={onRotate} disabled={comps.length === 0} title="R">
              {t('Rotate')}
            </button>
            <button className="small" onClick={onMirror} disabled={comps.length + labels.length === 0} title="M">
              {t('Mirror')}
            </button>
            <button className="small" onClick={onDuplicate} title="Ctrl+D">
              {t('Duplicate')}
            </button>
            <button className="small danger" onClick={onDelete} title="Del">
              {t('Delete')}
            </button>
          </div>
        )}
      </div>

      <div className="section">
        <h3>{t('Settings')}</h3>
        <div className="grid2">
          <div className="field">
            <label htmlFor="lang">{t('Language')}</label>
            <select id="lang" value={settings.lang} onChange={(e) => onSettings({ ...settings, lang: e.target.value as Lang })}>
              <option value="en">English</option>
              <option value="uk">Українська</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="theme">{t('Theme')}</label>
            <select id="theme" value={settings.theme} onChange={(e) => onSettings({ ...settings, theme: e.target.value as Theme })}>
              <option value="auto">{t('System')}</option>
              <option value="light">{t('Light')}</option>
              <option value="dark">{t('Dark')}</option>
            </select>
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={settings.snap} onChange={(e) => onSettings({ ...settings, snap: e.target.checked })} /> {t('Snap to grid')}
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.grid} onChange={(e) => onSettings({ ...settings, grid: e.target.checked })} /> {t('Show grid')}
        </label>
      </div>

      <div className="section">
        <h3>{t('Shortcuts')}</h3>
        <p className="hint">{t('W wire, L net label, T text, R rotate, M mirror, Del delete, Ctrl+Z undo, Ctrl+Y redo, Ctrl+D duplicate, Space + drag to pan, wheel to zoom, Esc to cancel.')}</p>
      </div>
    </div>
  )
}
