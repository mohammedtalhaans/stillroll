const session = new Map();
let durable = true;
function read(key, fallback) {
    if (session.has(key))
        return session.get(key);
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    }
    catch {
        durable = false;
        return fallback;
    }
}
function write(key, value) {
    session.set(key, value);
    try {
        localStorage.setItem(key, JSON.stringify(value));
    }
    catch {
        durable = false;
    }
}
const validIds = (input) => Array.isArray(input) ? input.filter((id) => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,149}$/.test(id)).slice(0, 1000) : [];
export function getFavorites() { return new Set(validIds(read('stillroll:favorites', []))); }
export function toggleFavorite(id) {
    const ids = getFavorites();
    ids.has(id) ? ids.delete(id) : ids.add(id);
    write('stillroll:favorites', [...ids]);
    return ids.has(id);
}
export function getRecent() { return validIds(read('stillroll:recent', [])); }
export function recordUsed(id) { write('stillroll:recent', [id, ...getRecent().filter(item => item !== id)].slice(0, 40)); }
export function preferencePersistence() { return durable; }
window.addEventListener('storage', event => { if (event.key)
    session.delete(event.key);
else
    session.clear(); });
