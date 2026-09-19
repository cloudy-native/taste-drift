const DB_NAME = 'taste-drift'
const DB_VER = 1

function openDb() {
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
    req.onerror = () => reject(req.error)
  })
}

async function tx(store, mode, fn) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const s = t.objectStore(store)
    const result = fn(s)
    t.oncomplete = () => resolve(result)
    t.onerror = () => reject(t.error)
  })
}

export async function getWeights(packName) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction('weights', 'readonly')
    const s = t.objectStore('weights')
    const req = s.getAll()
    const keys = s.getAllKeys()
    t.onerror = () => reject(t.error)
    t.oncomplete = () => {
      const out = {}
      const prefix = `${packName}::`
      keys.result.forEach((k, i) => {
        if (String(k).startsWith(prefix)) out[String(k).slice(prefix.length)] = req.result[i]
      })
      resolve(out)
    }
  })
}

export async function setWeight(packName, chipId, w) {
  return tx('weights', 'readwrite', (s) => s.put(w, `${packName}::${chipId}`))
}

export async function resetWeights(packName) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction('weights', 'readwrite')
    const s = t.objectStore('weights')
    const req = s.getAllKeys()
    req.onsuccess = () => {
      const prefix = packName ? `${packName}::` : ''
      for (const k of req.result) {
        if (!packName || String(k).startsWith(prefix)) s.delete(k)
      }
    }
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
}

export async function addHistory(entry) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction('history', 'readwrite')
    const s = t.objectStore('history')
    s.add(entry)
    const all = s.index('ts').getAll()
    t.onerror = () => reject(t.error)
    t.oncomplete = () => {
      const rows = all.result || []
      if (rows.length <= 100) return resolve()
      const extra = rows.sort((a, b) => a.ts - b.ts).slice(0, rows.length - 100)
      openDb().then((db2) => {
        const t2 = db2.transaction('history', 'readwrite')
        for (const r of extra) t2.objectStore('history').delete(r.id)
        t2.oncomplete = () => resolve()
        t2.onerror = () => reject(t2.error)
      })
    }
  })
}

export async function listHistory() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction('history', 'readonly')
    const s = t.objectStore('history')
    const req = s.index('ts').getAll()
    req.onsuccess = () => resolve((req.result || []).reverse())
    t.onerror = () => reject(t.error)
  })
}

export async function savePack(pack) {
  return tx('packs', 'readwrite', (s) => s.put(pack, pack.pack))
}

export async function loadPack(name) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction('packs', 'readonly')
    const req = t.objectStore('packs').get(name)
    req.onsuccess = () => resolve(req.result || null)
    t.onerror = () => reject(t.error)
  })
}

export async function listPacks() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction('packs', 'readonly')
    const req = t.objectStore('packs').getAll()
    req.onsuccess = () => resolve(req.result || [])
    t.onerror = () => reject(t.error)
  })
}

export async function getBanned() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction('banned', 'readonly')
    const req = t.objectStore('banned').getAllKeys()
    req.onsuccess = () => resolve(new Set(req.result.map(String)))
    t.onerror = () => reject(t.error)
  })
}

export async function banChip(id) {
  return tx('banned', 'readwrite', (s) => s.put(true, id))
}

export async function unbanChip(id) {
  return tx('banned', 'readwrite', (s) => s.delete(id))
}

const PREFS = 'taste-drift-prefs'

export function getPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS) || '{}')
  } catch {
    return {}
  }
}

export function setPrefs(p) {
  const next = { ...getPrefs(), ...p }
  localStorage.setItem(PREFS, JSON.stringify(next))
  return next
}
