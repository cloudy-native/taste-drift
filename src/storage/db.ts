import type { Beta, HistoryEntry, Pack, Prefs, WeightMap } from '../types'

const DB_NAME = 'taste-drift'
const DB_VER = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('weights')) db.createObjectStore('weights')
      if (!db.objectStoreNames.contains('history')) {
        const s = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true })
        s.createIndex('ts', 'ts')
      }
      if (!db.objectStoreNames.contains('packs')) db.createObjectStore('packs')
      if (!db.objectStoreNames.contains('banned')) db.createObjectStore('banned')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('idb open failed'))
  })
}

async function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => T,
): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const s = t.objectStore(store)
    const result = fn(s)
    t.oncomplete = () => resolve(result)
    t.onerror = () => reject(t.error ?? new Error('idb tx failed'))
  })
}

export async function getWeights(packName: string): Promise<WeightMap> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction('weights', 'readonly')
    const s = t.objectStore('weights')
    const req = s.getAll()
    const keys = s.getAllKeys()
    t.onerror = () => reject(t.error ?? new Error('idb'))
    t.oncomplete = () => {
      const out: WeightMap = {}
      const prefix = `${packName}::`
      keys.result.forEach((k, i) => {
        if (String(k).startsWith(prefix)) out[String(k).slice(prefix.length)] = req.result[i] as Beta
      })
      resolve(out)
    }
  })
}

export async function setWeight(packName: string, chipId: string, w: Beta): Promise<IDBRequest> {
  return tx('weights', 'readwrite', (s) => s.put(w, `${packName}::${chipId}`))
}

export async function resetWeights(packName?: string): Promise<void> {
  const db = await openDb()
  const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
    const t = db.transaction('weights', 'readonly')
    const req = t.objectStore('weights').getAllKeys()
    req.onsuccess = () => resolve(req.result || [])
    t.onerror = () => reject(t.error ?? new Error('idb'))
  })
  const prefix = packName ? `${packName}::` : ''
  const drop = keys.filter((k) => !packName || String(k).startsWith(prefix))
  if (!drop.length) return
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction('weights', 'readwrite')
    const s = t.objectStore('weights')
    for (const k of drop) s.delete(k)
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error ?? new Error('idb'))
  })
}

export async function addHistory(entry: HistoryEntry): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction('history', 'readwrite')
    const s = t.objectStore('history')
    s.add(entry)
    const all = s.index('ts').getAll()
    t.onerror = () => reject(t.error ?? new Error('idb'))
    t.oncomplete = () => {
      const rows = (all.result || []) as HistoryEntry[]
      if (rows.length <= 100) return resolve()
      const extra = rows.sort((a, b) => a.ts - b.ts).slice(0, rows.length - 100)
      openDb().then((db2) => {
        const t2 = db2.transaction('history', 'readwrite')
        for (const r of extra) {
          if (r.id != null) t2.objectStore('history').delete(r.id)
        }
        t2.oncomplete = () => resolve()
        t2.onerror = () => reject(t2.error ?? new Error('idb'))
      })
    }
  })
}

export async function listHistory(): Promise<HistoryEntry[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction('history', 'readonly')
    const s = t.objectStore('history')
    const req = s.index('ts').getAll()
    req.onsuccess = () => resolve(((req.result || []) as HistoryEntry[]).reverse())
    t.onerror = () => reject(t.error ?? new Error('idb'))
  })
}

export async function savePack(pack: Pack): Promise<IDBRequest> {
  return tx('packs', 'readwrite', (s) => s.put(pack, pack.pack))
}

export async function loadPack(name: string): Promise<Pack | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction('packs', 'readonly')
    const req = t.objectStore('packs').get(name)
    req.onsuccess = () => resolve((req.result as Pack) || null)
    t.onerror = () => reject(t.error ?? new Error('idb'))
  })
}

export async function listPacks(): Promise<Pack[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction('packs', 'readonly')
    const req = t.objectStore('packs').getAll()
    req.onsuccess = () => resolve((req.result || []) as Pack[])
    t.onerror = () => reject(t.error ?? new Error('idb'))
  })
}

export async function getBanned(): Promise<Set<string>> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction('banned', 'readonly')
    const req = t.objectStore('banned').getAllKeys()
    req.onsuccess = () => resolve(new Set(req.result.map(String)))
    t.onerror = () => reject(t.error ?? new Error('idb'))
  })
}

export async function banChip(id: string): Promise<IDBRequest> {
  return tx('banned', 'readwrite', (s) => s.put(true, id))
}

export async function unbanChip(id: string): Promise<IDBRequest> {
  return tx('banned', 'readwrite', (s) => s.delete(id))
}

export async function clearBanned(): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction('banned', 'readwrite')
    t.objectStore('banned').clear()
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error ?? new Error('idb'))
  })
}

const PREFS = 'taste-drift-prefs'

export function getPrefs(): Prefs {
  try {
    return JSON.parse(localStorage.getItem(PREFS) || '{}') as Prefs
  } catch {
    return {}
  }
}

export function setPrefs(p: Partial<Prefs>): Prefs {
  const next = { ...getPrefs(), ...p }
  localStorage.setItem(PREFS, JSON.stringify(next))
  return next
}
