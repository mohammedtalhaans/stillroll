import { clone, uid, validateProject } from './model.js';
import { mediaLibrary } from './media.js';
import { ASSETS } from './assets.js';
const packs = new Map();
function localPath(path) {
    return typeof path === 'string' && path.startsWith('./') && !path.includes('..') && !/[\u0000\\]/.test(path);
}
export async function localJSON(path) {
    if (!localPath(path))
        throw new Error('The catalog contains an invalid local path.');
    const embedded = globalThis.__STILLROLL_DATA__?.[path];
    if (embedded !== undefined)
        return clone(typeof embedded === 'string' ? JSON.parse(embedded) : embedded);
    const response = await fetch(path);
    if (!response.ok)
        throw new Error('This collection could not load. Reconnect or open the complete site bundle.');
    return response.json();
}
export async function loadCatalog() {
    const data = await localJSON('./catalog/index.json');
    if (data.version !== 2 || !Array.isArray(data.entries) || !Array.isArray(data.collections) || data.entries.length > 2000)
        throw new Error('The catalog version is unsupported.');
    const ids = new Set(), collections = new Set(data.collections.map(c => c.id));
    for (const entry of data.entries) {
        if (!entry.id || ids.has(entry.id) || !collections.has(entry.collectionId) || !localPath(entry.pack) || !localPath(entry.cover) || !localPath(entry.spread))
            throw new Error('The catalog index is incomplete.');
        if (!Array.isArray(entry.slides) || entry.slides.length !== entry.slideCount || entry.slides.some(path => !localPath(path)))
            throw new Error('A template preview is incomplete.');
        for (const key of ['aliases', 'tags', 'styles', 'moods', 'occasions', 'mechanics', 'palette', 'songs'])
            if (!Array.isArray(entry[key]) || entry[key].some(value => typeof value !== 'string'))
                throw new Error('Template discovery metadata is invalid.');
        ids.add(entry.id);
    }
    return data;
}
export async function loadPack(entry) {
    let pending = packs.get(entry.pack);
    if (!pending) {
        pending = localJSON(entry.pack).then(pack => {
            if (pack.version !== 2 || pack.collectionId !== entry.collectionId || !Array.isArray(pack.media) || !Array.isArray(pack.assets) || !pack.projects)
                throw new Error('This collection pack is invalid.');
            for (const id of Object.keys(pack.projects))
                pack.projects[id] = validateProject(pack.projects[id]);
            for (const media of pack.media) {
                if (!media.id || !localPath(media.src) || !Number.isFinite(media.width) || !Number.isFinite(media.height) || media.width <= 0 || media.height <= 0 || media.width * media.height > 64000000)
                    throw new Error('A collection photo is invalid.');
                if (!mediaLibrary.has(media.id))
                    mediaLibrary.set(media.id, media);
            }
            for (const asset of pack.assets) {
                if (!asset.id || !localPath(asset.src))
                    throw new Error('A collection element is invalid.');
                if (!ASSETS.some(existing => existing.id === asset.id))
                    ASSETS.push(asset);
            }
            return pack;
        }).catch(error => { packs.delete(entry.pack); throw error; });
        packs.set(entry.pack, pending);
    }
    return pending;
}
export async function instantiateEntry(entry) {
    const pack = await loadPack(entry), stored = pack.projects[entry.id];
    if (!stored)
        throw new Error('This template is missing from its collection.');
    const project = validateProject(stored);
    if (project.slides.length !== entry.slideCount || project.width !== entry.width || project.height !== entry.height || project.output !== entry.output)
        throw new Error('Template metadata does not match its editable composition.');
    project.id = uid();
    project.created = project.updated = Date.now();
    project.templateId = entry.id;
    project.collectionId = entry.collectionId;
    const groups = new Map();
    project.slides.forEach(slide => slide.id = uid());
    project.nodes.forEach(node => { node.id = uid(); if (node.groupId) {
        if (!groups.has(node.groupId))
            groups.set(node.groupId, uid());
        node.groupId = groups.get(node.groupId);
    } });
    return project;
}
export function ratioLabel(width, height) {
    return width === height ? '1:1' : width * 5 === height * 4 ? '4:5' : width * 4 === height * 3 ? '3:4' : width * 16 === height * 9 ? '9:16' : width > height ? 'Landscape' : 'Custom';
}
export const outputLabel = (output) => ({ carousel: 'Carousel', story: 'Stories', grid: 'Profile grid', single: 'Collage' })[output];
export function getPreference(key, fallback) {
    try {
        const value = JSON.parse(localStorage.getItem('stillroll:' + key) || 'null');
        if (Array.isArray(fallback))
            return (Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.length <= 200).slice(0, 2000) : fallback);
        return value !== null && typeof value === typeof fallback ? value : fallback;
    }
    catch {
        return fallback;
    }
}
export function setPreference(key, value) {
    try {
        localStorage.setItem('stillroll:' + key, JSON.stringify(value));
        return true;
    }
    catch {
        return false;
    }
}
export const preference = getPreference;
export const savePreference = setPreference;
export const formatLabel = (entry) => ratioLabel(entry.width, entry.height);
