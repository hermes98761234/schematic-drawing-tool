import type { Doc } from './model'

export interface History {
  past: Doc[]
  present: Doc
  future: Doc[]
  /** Edits sharing a key (typing in one field) collapse into one undo step. */
  key: string | null
}

const LIMIT = 200

export const initHistory = (doc: Doc): History => ({ past: [], present: doc, future: [], key: null })

export function commit(h: History, doc: Doc, key: string | null = null): History {
  if (doc === h.present) return h
  if (key !== null && key === h.key) return { ...h, present: doc, future: [] }
  return { past: [...h.past.slice(-(LIMIT - 1)), h.present], present: doc, future: [], key }
}

export function undo(h: History): History {
  if (!h.past.length) return h
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], key: null }
}

export function redo(h: History): History {
  if (!h.future.length) return h
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), key: null }
}
