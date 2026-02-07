// ============================================
// IndexedDB Database Layer
// ============================================

const DB = (() => {
  const DB_NAME = 'wa-scheduler';
  const DB_VERSION = 1;
  let db = null;

  const STORES = {
    messages: 'messages',
    contacts: 'contacts',
    groups: 'groups',
    templates: 'templates',
    tags: 'tags'
  };

  function open() {
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const d = e.target.result;

        // Messages store
        if (!d.objectStoreNames.contains(STORES.messages)) {
          const ms = d.createObjectStore(STORES.messages, { keyPath: 'id' });
          ms.createIndex('status', 'status', { unique: false });
          ms.createIndex('scheduledAt', 'scheduledAt', { unique: false });
          ms.createIndex('contactId', 'contactId', { unique: false });
        }

        // Contacts store
        if (!d.objectStoreNames.contains(STORES.contacts)) {
          const cs = d.createObjectStore(STORES.contacts, { keyPath: 'id' });
          cs.createIndex('name', 'name', { unique: false });
          cs.createIndex('phone', 'phone', { unique: false });
        }

        // Groups store
        if (!d.objectStoreNames.contains(STORES.groups)) {
          d.createObjectStore(STORES.groups, { keyPath: 'id' });
        }

        // Templates store
        if (!d.objectStoreNames.contains(STORES.templates)) {
          const ts = d.createObjectStore(STORES.templates, { keyPath: 'id' });
          ts.createIndex('category', 'category', { unique: false });
        }

        // Tags store
        if (!d.objectStoreNames.contains(STORES.tags)) {
          d.createObjectStore(STORES.tags, { keyPath: 'id' });
        }
      };

      req.onsuccess = (e) => {
        db = e.target.result;
        resolve(db);
      };

      req.onerror = (e) => reject(e.target.error);
    });
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // Generic CRUD operations
  async function add(storeName, data) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      if (!data.id) data.id = generateId();
      data.createdAt = data.createdAt || new Date().toISOString();
      data.updatedAt = new Date().toISOString();
      const req = store.put(data);
      req.onsuccess = () => resolve(data);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function get(storeName, id) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function getAll(storeName) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function update(storeName, data) {
    data.updatedAt = new Date().toISOString();
    return add(storeName, data);
  }

  async function remove(storeName, id) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function getByIndex(storeName, indexName, value) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      const req = index.getAll(value);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function clear(storeName) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function count(storeName) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // Export all data for backup
  async function exportAll() {
    const data = {};
    for (const name of Object.values(STORES)) {
      data[name] = await getAll(name);
    }
    return data;
  }

  // Import data from backup
  async function importAll(data) {
    for (const [name, items] of Object.entries(data)) {
      if (STORES[name] || Object.values(STORES).includes(name)) {
        for (const item of items) {
          await add(name, item);
        }
      }
    }
  }

  return {
    open, add, get, getAll, update, remove, getByIndex,
    clear, count, exportAll, importAll, generateId, STORES
  };
})();
