// Tiny IndexedDB store shared by the service worker and the page. The SW receives files
// from the Android share sheet and parks them here; the add page picks them up.
// Raw IndexedDB (not Dexie) so the service worker bundle stays small.

const DB_NAME = 'padaan-share-inbox';
const STORE = 'files';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function putSharedFiles(files: File[]): Promise<void> {
  const db = await open();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  for (const file of files) store.add(file);
  await done(tx);
  db.close();
}

export async function takeSharedFiles(): Promise<File[]> {
  const db = await open();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const all = await new Promise<unknown[]>((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  store.clear();
  await done(tx);
  db.close();
  return all.filter((item): item is File => item instanceof Blob) as File[];
}
