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
const LAST_KEY = 'last'

export interface StoredFile {
  name: string
  data: Blob
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE))
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
