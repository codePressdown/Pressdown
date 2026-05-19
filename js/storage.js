// storage.js — IndexedDB wrapper. The only module that talks to the database.
// Nothing here ever leaves the machine. No network, no sync, no telemetry.

const DB_NAME = 'pressdown';
const VERSION = 1;

// Stores:
//   issues   — every published issue (auto-incremented `number`), full record
//   brands   — named brand presets (logo base64, colors, font, footer)
//   blocks   — reusable content blocks; each has a `slash` trigger name
//   settings — single record (id:1): defaults, live draft, ui prefs
// Built-in templates live in code (templates.js), not the DB.

let _db = null;

function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('issues')) {
        const s = db.createObjectStore('issues', { keyPath: 'number' });
        s.createIndex('updated', 'updated');
      }
      if (!db.objectStoreNames.contains('brands')) {
        db.createObjectStore('brands', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('blocks')) {
        const b = db.createObjectStore('blocks', { keyPath: 'id', autoIncrement: true });
        b.createIndex('slash', 'slash', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode = 'readonly') {
  return open().then((db) => db.transaction(store, mode).objectStore(store));
}

function done(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function all(store) {
  return tx(store).then((s) => done(s.getAll()));
}

function get(store, key) {
  return tx(store).then((s) => done(s.get(key)));
}

function put(store, value) {
  return tx(store, 'readwrite').then((s) => done(s.put(value)));
}

function del(store, key) {
  return tx(store, 'readwrite').then((s) => done(s.delete(key)));
}

// ---- Settings (single record) -------------------------------------------

const DEFAULT_SETTINGS = {
  id: 1,
  defaultBrandId: null,
  defaultTemplate: 'single',
  editorFont: 'mono',     // mono | sans
  device: 'desktop',      // desktop | mobile
  dark: false,            // dark-mode preview
  preview: true,          // preview pane visible
  draft: { md: '', brandId: null, template: 'single', name: '' },
};

export async function loadSettings() {
  const rec = await get('settings', 1);
  return { ...DEFAULT_SETTINGS, ...(rec || {}) };
}

export async function saveSettings(patch) {
  const cur = await loadSettings();
  const next = { ...cur, ...patch, id: 1 };
  await put('settings', next);
  return next;
}

// ---- Brands -------------------------------------------------------------

export const brands = {
  all: () => all('brands'),
  get: (id) => get('brands', id),
  save: (b) => put('brands', { ...b, updated: Date.now() }),
  remove: (id) => del('brands', id),
};

// ---- Blocks -------------------------------------------------------------

export const blocks = {
  all: () => all('blocks'),
  save: (b) => put('blocks', { ...b, updated: Date.now() }),
  remove: (id) => del('blocks', id),
};

// ---- Issues -------------------------------------------------------------

export const issues = {
  all: () => all('issues'),
  get: (number) => get('issues', number),
  remove: (number) => del('issues', number),

  // Persist an issue. The `number` auto-increments off the highest existing
  // issue unless one is supplied (re-saving an opened past issue).
  async save(rec) {
    const list = await all('issues');
    let number = rec.number;
    if (!number) {
      number = list.reduce((m, i) => Math.max(m, i.number), 0) + 1;
    }
    const full = { ...rec, number, updated: Date.now() };
    if (!full.created) full.created = full.updated;
    await put('issues', full);
    return full;
  },

  // Local full-text search across name + markdown of every issue.
  async search(q) {
    const list = await all('issues');
    const t = q.trim().toLowerCase();
    if (!t) return list.sort((a, b) => b.number - a.number);
    return list
      .filter((i) =>
        (i.name || '').toLowerCase().includes(t) ||
        (i.md || '').toLowerCase().includes(t))
      .sort((a, b) => b.number - a.number);
  },
};

// ---- Wipe (privacy: user-initiated data deletion) -----------------------

export async function wipeEverything() {
  const db = await open();
  const names = ['issues', 'brands', 'blocks', 'settings'];
  await Promise.all(names.map((n) => new Promise((res, rej) => {
    const r = db.transaction(n, 'readwrite').objectStore(n).clear();
    r.onsuccess = res; r.onerror = () => rej(r.error);
  })));
}
