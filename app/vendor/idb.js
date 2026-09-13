/** Adapted subset of idb-keyval, Copyright 2016 Jake Archibald, Apache-2.0.
 * Source: https://github.com/jakearchibald/idb-keyval/blob/main/src/index.ts
 * Modifications: explicit generic types, fixed app store, no legacy IE fallback.
 */
function request(r) { return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
function completed(t) { return new Promise((resolve, reject) => { t.oncomplete = () => resolve(); t.onerror = t.onabort = () => reject(t.error || new Error('Storage transaction interrupted.')); }); }
let dbp;
function database() {
    if (!dbp) {
        const r = indexedDB.open('stillroll-local', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('items');
        dbp = request(r);
        dbp.then(db => { db.onclose = () => dbp = undefined; db.onversionchange = () => { db.close(); dbp = undefined; }; }, () => { dbp = undefined; });
    }
    return dbp;
}
export async function get(key) { const db = await database(); return request(db.transaction('items').objectStore('items').get(key)); }
export async function setMany(entries) {
    const db = await database(), tx = db.transaction('items', 'readwrite');
    const done = completed(tx);
    try {
        const store = tx.objectStore('items');
        for (const [key, value] of entries)
            store.put(value, key);
    }
    catch (error) {
        try {
            tx.abort();
        }
        catch { /* The transaction may already be aborted. */ }
        await done.catch(() => { });
        throw error;
    }
    await done;
}
export const set = (key, value) => setMany([[key, value]]);
export async function del(key) { const db = await database(), tx = db.transaction('items', 'readwrite'), done = completed(tx); tx.objectStore('items').delete(key); await done; }
export async function entries(prefix = '') { const db = await database(), s = db.transaction('items').objectStore('items'); const range = prefix ? IDBKeyRange.bound(prefix, prefix + '\uffff') : undefined; const [ks, vs] = await Promise.all([request(s.getAllKeys(range)), request(s.getAll(range))]); return ks.map((k, i) => [String(k), vs[i]]); }
export async function has(key) { const db = await database(); return (await request(db.transaction('items').objectStore('items').getKey(key))) !== undefined; }
export async function deleteMany(keys) {
    if (!keys.length)
        return;
    const db = await database(), tx = db.transaction('items', 'readwrite'), done = completed(tx);
    for (const key of keys)
        tx.objectStore('items').delete(key);
    await done;
}
