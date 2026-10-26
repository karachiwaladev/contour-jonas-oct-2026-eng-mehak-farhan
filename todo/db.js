// Client-side task store backed by IndexedDB.
// Each task: { id: number (auto), title: string, done: boolean, createdAt: number,
//              due: "YYYY-MM-DDTHH:mm" (local time) | null, tags: string[] }
// Records saved before due dates and tags existed lack those fields; normalize() fills them in.
const TaskDB = (() => {
  const DB_NAME = 'todo-app';
  const STORE = 'tasks';
  let dbPromise;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  // Runs fn against the object store inside one transaction and resolves with the request result.
  async function run(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  const normalize = (task) => task && { due: null, tags: [], ...task };

  return {
    all: async () => (await run('readonly', (s) => s.getAll())).map(normalize),
    add: ({ title, due = null, tags = [] }) =>
      run('readwrite', (s) => s.add({ title, due, tags, done: false, createdAt: Date.now() })),
    get: async (id) => normalize(await run('readonly', (s) => s.get(id))),
    put: (task) => run('readwrite', (s) => s.put(task)),
    remove: (id) => run('readwrite', (s) => s.delete(id)),
  };
})();
