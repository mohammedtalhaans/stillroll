import * as db from './vendor/idb.js';
import { clone, uid } from './model.js';
export function projectMediaIds(project) {
    return [...new Set([...(project.mediaIds || []), ...project.nodes.flatMap(node => node.kind === 'photo' || node.kind === 'video' ? [node.assetId] : [])].filter(Boolean))];
}
const projectAssetIds = (project) => [...new Set(project.nodes.flatMap(node => node.kind === 'sticker' ? [node.assetId] : []))];
/** A saved status is only allowed after the single document/media transaction commits. */
export async function saveProject(project, media, thumbnail = '', asTemplate = false, assets = []) {
    const existing = await loadProject(project.id);
    const snapshot = clone(project);
    const entries = [['project:' + snapshot.id, { project: snapshot, thumbnail, asTemplate: asTemplate || !!existing?.asTemplate }], ['lastProject', snapshot.id]];
    const records = [...media.map(value => ({ key: 'media:' + value.id, value })), ...assets.map(value => ({ key: 'asset:' + value.id, value }))];
    for (const record of records) {
        if (!record.value.blob && record.value.src?.startsWith('blob:'))
            throw new Error('A temporary image URL cannot be saved. Import the original photo again.');
        if ((record.value.blob || record.value.src) && !await db.has(record.key))
            entries.push([record.key, record.value]);
    }
    await db.setMany(entries);
}
export async function projects() { return (await db.entries('project:')).map(([, value]) => value).sort((a, b) => b.project.updated - a.project.updated); }
export const loadProject = (id) => db.get('project:' + id);
export const loadMedia = (id) => db.get('media:' + id);
export const loadAsset = (id) => db.get('asset:' + id);
export const lastProject = () => db.get('lastProject');
export async function probeStorage() { const key = 'probe:' + uid(); await db.set(key, true); await db.del(key); }
export async function deleteProject(id) {
    const all = await projects(), target = all.find(item => item.project.id === id);
    if (!target)
        return;
    const others = all.filter(item => item.project.id !== id), usedMedia = new Set(others.flatMap(item => projectMediaIds(item.project))), usedAssets = new Set(others.flatMap(item => projectAssetIds(item.project)));
    await db.deleteMany(['project:' + id, ...projectMediaIds(target.project).filter(key => !usedMedia.has(key)).map(key => 'media:' + key), ...projectAssetIds(target.project).filter(key => !usedAssets.has(key)).map(key => 'asset:' + key)]);
}
export async function storageInfo() { try {
    return await navigator.storage?.estimate();
}
catch {
    return undefined;
} }
