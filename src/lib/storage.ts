// Persistencia local: posición de lectura (localStorage) y último PDF abierto (IndexedDB).
// Nada se envía a ningún servidor.

const PREFIX = 'lector-pdf:'

export interface ReadingPosition {
  page: number
  scale: string
  updatedAt: number
}

export function getPosition(fingerprint: string): ReadingPosition | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}pos:${fingerprint}`)
    return raw ? (JSON.parse(raw) as ReadingPosition) : null
  } catch {
    return null
  }
}

export function savePosition(fingerprint: string, page: number, scale: string) {
  try {
    const value: ReadingPosition = { page, scale, updatedAt: Date.now() }
    localStorage.setItem(`${PREFIX}pos:${fingerprint}`, JSON.stringify(value))
  } catch {
    /* almacenamiento lleno o bloqueado: se ignora */
  }
}

export function getPref(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key)
  } catch {
    return null
  }
}

export function setPref(key: string, value: string) {
  try {
    localStorage.setItem(PREFIX + key, value)
  } catch {
    /* ignorado */
  }
}

// ---------- IndexedDB: último archivo ----------

const DB_NAME = 'lector-pdf'
const STORE = 'files'
const TICKETS = 'tickets'
const LAST_KEY = 'last'

export interface StoredFile {
  name: string
  data: Blob
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      if (!db.objectStoreNames.contains(TICKETS)) db.createObjectStore(TICKETS, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>, store = STORE): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(store, mode).objectStore(store))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

export async function saveLastFile(file: StoredFile) {
  try {
    await tx('readwrite', (s) => s.put(file, LAST_KEY))
  } catch {
    /* modo privado o sin espacio: se ignora */
  }
}

export async function loadLastFile(): Promise<StoredFile | null> {
  try {
    return ((await tx('readonly', (s) => s.get(LAST_KEY))) as StoredFile | undefined) ?? null
  } catch {
    return null
  }
}

export async function clearLastFile() {
  try {
    await tx('readwrite', (s) => s.delete(LAST_KEY))
  } catch {
    /* ignorado */
  }
}

// ---------- IndexedDB: tickets guardados ----------

export interface SavedTicket {
  id: string
  createdAt: number
  fileName: string
  merchant: string
  nif: string
  date: string // ISO yyyy-mm-dd o ''
  time: string
  total: number | null
  text: string
  thumb: string // miniatura JPEG en data URL
}

export async function listTickets(): Promise<SavedTicket[]> {
  try {
    const all = (await tx('readonly', (s) => s.getAll(), TICKETS)) as SavedTicket[]
    return all.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

export async function putTicket(t: SavedTicket) {
  await tx('readwrite', (s) => s.put(t), TICKETS)
}

export async function deleteTicket(id: string) {
  await tx('readwrite', (s) => s.delete(id), TICKETS)
}
