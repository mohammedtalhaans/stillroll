import { ratioLabel } from './catalog.js';
export const emptyFilters = () => ({});
export const normalize = (text) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const ignored = new Set(['the', 'and', 'a', 'of', 'for', 'with', 'in']);
const words = (text) => normalize(text).split(' ').filter(word => word && !ignored.has(word));
function distance(a, b, limit) {
    if (Math.abs(a.length - b.length) > limit)
        return limit + 1;
    let prior, row = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
        const next = [i];
        let minimum = i;
        for (let j = 1; j <= b.length; j++) {
            next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            if (prior && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
                next[j] = Math.min(next[j], prior[j - 2] + 1);
            minimum = Math.min(minimum, next[j]);
        }
        if (minimum > limit)
            return limit + 1;
        prior = row;
        row = next;
    }
    return row[b.length];
}
function inRange(value, filter) {
    if (!filter)
        return true;
    const [low, high] = filter.replace('+', '-999').split('-').map(Number);
    return value >= low && value <= (high || low);
}
export class DiscoveryIndex {
    cards;
    indexed;
    constructor(cards) {
        this.cards = cards;
        this.indexed = cards.map(card => {
            const terms = new Map();
            const fields = [
                [[card.name, card.collection, ...card.aliases], 12],
                [[card.era, ...card.tags, ...card.occasions, ...card.mechanics], 7],
                [[...card.styles, ...card.moods, ratioLabel(card.width, card.height), card.output], 4],
                [['photo photos slide slides'], 1]
            ];
            for (const [values, weight] of fields)
                for (const value of values)
                    for (const word of words(value))
                        terms.set(word, Math.max(weight, terms.get(word) || 0));
            return { card, terms, phrases: [card.name, card.collection, ...card.aliases].map(normalize) };
        });
    }
    search(query, filters = {}) {
        // Use typo tolerance only when literal matching found no results.
        const literal = this.match(query, filters, false);
        return literal.length ? literal : this.match(query, filters, true);
    }
    match(query, filters, fuzzy) {
        const exactLength = query.match(/\b(\d{1,3})\s*(?:slides?|pages?)\b/i), exactPhotos = query.match(/\b(\d{1,3})\s*(?:photos?|slots?)\b/i);
        const story = /\bstor(?:y|ies)\b/i.test(query);
        const cleaned = query.replace(/\b\d{1,3}\s*(?:slides?|pages?|photos?|slots?)\b/gi, '').replace(/\bstor(?:y|ies)\b/gi, '');
        const tokens = words(cleaned), phrase = normalize(cleaned), matches = [];
        for (const entry of this.indexed) {
            const card = entry.card;
            if (filters.collection && card.collectionId !== filters.collection || filters.kind && !card.tags.includes(filters.kind))
                continue;
            if (filters.style && !card.styles.includes(filters.style) || filters.mood && !card.moods.includes(filters.mood))
                continue;
            if (filters.occasion && !card.occasions.includes(filters.occasion))
                continue;
            if (filters.ratio && ratioLabel(card.width, card.height) !== filters.ratio || filters.output && card.output !== filters.output)
                continue;
            if (story && card.output !== 'story' || !inRange(card.slideCount, filters.length) || !inRange(card.slotCount, filters.photos))
                continue;
            if (exactLength && card.slideCount !== Number(exactLength[1]) || exactPhotos && card.slotCount !== Number(exactPhotos[1]))
                continue;
            let score = 0, hitAll = true;
            for (const token of tokens) {
                let hit = entry.terms.get(token) || 0;
                if (!hit && token.length >= 2)
                    for (const [word, weight] of entry.terms)
                        if (word.startsWith(token))
                            hit = Math.max(hit, weight * .65);
                if (!hit && fuzzy && token.length >= 3) {
                    const limit = token.length > 7 ? 2 : 1;
                    for (const [word, weight] of entry.terms)
                        if (distance(token, word, limit) <= limit)
                            hit = Math.max(hit, weight * .45);
                }
                if (!hit) {
                    hitAll = false;
                    break;
                }
                score += hit;
            }
            if (!hitAll)
                continue;
            if (phrase && entry.phrases.some(value => value === phrase))
                score += 70;
            else if (phrase && entry.phrases.some(value => value.includes(phrase)))
                score += 30;
            matches.push({ card, score });
        }
        return matches.sort((a, b) => b.score - a.score || b.card.curation - a.card.curation || a.card.name.localeCompare(b.card.name)).map(match => match.card);
    }
    related(card, limit = 6) {
        const score = (other) => (other.collectionId === card.collectionId ? 100 : 0)
            + other.occasions.filter(value => card.occasions.includes(value)).length * 12
            + other.mechanics.filter(value => card.mechanics.includes(value)).length * 5
            + other.styles.filter(value => card.styles.includes(value)).length * 4
            + other.moods.filter(value => card.moods.includes(value)).length * 2;
        return this.cards.filter(other => other.id !== card.id).sort((a, b) => score(b) - score(a) || b.curation - a.curation).slice(0, limit);
    }
}
export function relatedTemplates(entry, entries, limit = 6) {
    return new DiscoveryIndex(entries).related(entry, limit);
}
