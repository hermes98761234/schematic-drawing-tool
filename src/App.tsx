import { useEffect, useMemo, useRef, useState } from 'react'
import { deleteItems, duplicateItems, mirrorItems, rotateComps } from './lib/geometry'
import { commit, initHistory, redo, undo, type History } from './lib/history'
import { EXAMPLES } from './lib/examples'
import { emptyDoc, loadState, normalizeDoc, saveState, serializeDoc, uid, type Doc, type Rot, type Settings } from './lib/model'
import { download, fileBase, renderPng } from './lib/download'
import { renderPdf } from './lib/pdf'
import { renderSvg } from './lib/svg'
import { tr, type T } from './i18n'
import Canvas, { type Ghost, type Tool } from './components/Canvas'
import Palette from './components/Palette'
import Inspector from './components/Inspector'

const REPO = 'https://github.com/hermes98761234/schematic-drawing-tool'

export default function App() {
  const [initial] = useState(() => loadState(EXAMPLES[0].build))
  const [h, setH] = useState<History>(() => initHistory(initial.doc))
  const [settings, setSettings] = useState<Settings>(initial.settings)
  const [rawSelection, setSelection] = useState<string[]>([])
  const [tool, setTool] = useState<Tool>('select')
  const [ghost, setGhost] = useState<Ghost>({ type: 'resistor', rot: 0, mirror: false })
  const [fitSignal, setFitSignal] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const doc = h.present
  // Ids that no longer exist (after undo or delete) drop out of the selection.
  const selection = useMemo(() => {
    const ids = new Set([...doc.comps.map((c) => c.id), ...doc.wires.map((w) => w.id), ...doc.labels.map((l) => l.id)])
    return rawSelection.filter((i) => ids.has(i))
  }, [doc, rawSelection])
  const t: T = (s, ...a) => tr(settings.lang, s, ...a)

  const apply = (next: Doc, key?: string) => setH((cur) => commit(cur, next, key ?? null))
  const replaceDoc = (next: Doc) => {
    apply(next)
    setSelection([])
    setTool('select')
    setFitSignal((n) => n + 1)
  }
  const selSet = () => new Set(selection)
  const rotate = () => {
    if (tool === 'place') setGhost((g) => ({ ...g, rot: ((g.rot + 90) % 360) as Rot }))
    else if (selection.length) apply(rotateComps(doc, selSet()))
  }
  const mirror = () => {
    if (tool === 'place') setGhost((g) => ({ ...g, mirror: !g.mirror }))
    else if (selection.length) apply(mirrorItems(doc, selSet()))
  }
  const remove = () => {
    if (!selection.length) return
    apply(deleteItems(doc, selSet()))
    setSelection([])
  }
  const duplicate = () => {
    if (!selection.length) return
    const r = duplicateItems(doc, selSet(), 2, 2)
    apply(r.doc)
    setSelection(r.ids)
  }
  const doUndo = () => setH(undo)
  const doRedo = () => setH(redo)

  useEffect(() => {
    const id = setTimeout(() => saveState(doc, settings), 300)
    return () => clearTimeout(id)
  }, [doc, settings])
  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'auto') delete root.dataset.theme
    else root.dataset.theme = settings.theme
    root.lang = settings.lang
  }, [settings.theme, settings.lang])
  useEffect(() => {
    if (!message) return
    const id = setTimeout(() => setMessage(null), 6000)
    return () => clearTimeout(id)
  }, [message])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
        if (e.key === 'Escape') e.target.blur()
        return
      }
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (mod && k === 'z') {
        e.preventDefault()
        if (e.shiftKey) doRedo()
        else doUndo()
      } else if (mod && k === 'y') {
        e.preventDefault()
        doRedo()
      } else if (mod && k === 'd') {
        e.preventDefault()
        duplicate()
      } else if (mod && k === 'a') {
        e.preventDefault()
        setSelection([...doc.comps.map((c) => c.id), ...doc.wires.map((w) => w.id), ...doc.labels.map((l) => l.id)])
      } else if (mod || e.altKey) {
        return
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        remove()
      } else if (e.key === 'Escape') {
        setTool('select')
        setSelection([])
      } else if (k === 'r') rotate()
      else if (k === 'm' || k === 'f') mirror()
      else if (k === 'w') setTool('wire')
      else if (k === 'l') setTool('label')
      else if (k === 't') setTool('text')
      else if (k === 'v' || k === 's') setTool('select')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const addLabel = (kind: 'net' | 'text', x: number, y: number) => {
    const n = doc.labels.filter((l) => l.kind === 'net').length + 1
    const label = { id: uid(), x, y, kind, text: kind === 'net' ? `NET${n}` : t('Text') }
    apply({ ...doc, labels: [...doc.labels, label] })
    setSelection([label.id])
  }

  const openFile = async (file: File) => {
    try {
      replaceDoc(normalizeDoc(JSON.parse(await file.text())))
    } catch (err) {
      setMessage(t('Could not open the file: {0}', err instanceof Error ? t(err.message) : String(err)))
    }
  }

  const exportAs = async (kind: 'json' | 'svg' | 'png' | 'pdf') => {
    const base = fileBase(doc)
    try {
      if (kind === 'json') download(new Blob([serializeDoc(doc)], { type: 'application/json' }), `${base}.json`)
      else if (kind === 'svg') download(new Blob([renderSvg(doc)], { type: 'image/svg+xml' }), `${base}.svg`)
      else if (kind === 'pdf') download(new Blob([renderPdf(doc).buffer as ArrayBuffer], { type: 'application/pdf' }), `${base}.pdf`)
      else download(await renderPng(doc), `${base}.png`)
    } catch (err) {
      setMessage(t('Export failed: {0}', err instanceof Error ? err.message : String(err)))
    }
  }

  const toolBtn = (id: Tool, label: string, keyHint: string) => (
    <button className={tool === id ? 'tool active' : 'tool'} onClick={() => setTool(id)} title={keyHint} aria-pressed={tool === id}>
      {label}
    </button>
  )

  return (
    <div className="app">
      <header className="toolbar">
        <span className="brand">{t('Schematic drawing tool')}</span>
        <div className="group">
          <button className="small" onClick={() => replaceDoc(emptyDoc())}>
            {t('New')}
          </button>
          <button className="small" onClick={() => fileRef.current?.click()}>
            {t('Open')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void openFile(f)
              e.target.value = ''
            }}
          />
          <button className="small" onClick={() => void exportAs('json')}>
            {t('Save JSON')}
          </button>
          <span className="sep" />
          <button className="small" onClick={() => void exportAs('svg')}>
            SVG
          </button>
          <button className="small" onClick={() => void exportAs('png')}>
            PNG
          </button>
          <button className="small" onClick={() => void exportAs('pdf')}>
            PDF
          </button>
          <select
            aria-label={t('Examples')}
            value=""
            onChange={(e) => {
              const ex = EXAMPLES.find((x) => x.id === e.target.value)
              if (ex) replaceDoc(ex.build())
            }}
          >
            <option value="">{t('Examples')}</option>
            {EXAMPLES.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {t(ex.name)}
              </option>
            ))}
          </select>
        </div>
        <div className="group tools">
          {toolBtn('select', t('Select'), 'V')}
          {toolBtn('wire', t('Wire'), 'W')}
          {toolBtn('label', t('Net label'), 'L')}
          {toolBtn('text', t('Text'), 'T')}
          <span className="sep" />
          <button className="small" onClick={doUndo} disabled={!h.past.length} title="Ctrl+Z">
            {t('Undo')}
          </button>
          <button className="small" onClick={doRedo} disabled={!h.future.length} title="Ctrl+Y">
            {t('Redo')}
          </button>
        </div>
      </header>
      {message && (
        <div className="banner" role="alert">
          {message}
        </div>
      )}
      <div className="body">
        <aside className="side left">
          <Palette
            active={tool === 'place' ? ghost.type : null}
            onPick={(type) => {
              setGhost((g) => ({ ...g, type }))
              setTool('place')
              setSelection([])
            }}
            t={t}
          />
        </aside>
        <main className="main">
          <Canvas
            doc={doc}
            settings={settings}
            tool={tool}
            ghost={ghost}
            selection={selection}
            fitSignal={fitSignal}
            onSelect={setSelection}
            onCommit={apply}
            onTool={setTool}
            onAddLabel={addLabel}
            t={t}
          />
        </main>
        <aside className="side right">
          <Inspector
            doc={doc}
            selection={selection}
            settings={settings}
            onDoc={apply}
            onSettings={setSettings}
            onRotate={rotate}
            onMirror={mirror}
            onDelete={remove}
            onDuplicate={duplicate}
            t={t}
          />
        </aside>
      </div>
      <p className="hint foot">
        {t('Your drawing stays in this browser. Nothing is uploaded.')} <a href={REPO}>{t('Source on GitHub')}</a>
      </p>
    </div>
  )
}
