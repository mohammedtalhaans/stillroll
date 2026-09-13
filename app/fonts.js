let manifest;
const jobs = new Map();
const missing = new Set();
/** Fonts are fetched directly from their public provider. No font binaries are distributed. */
async function references() {
    return manifest ??= (async () => {
        const embedded = globalThis.__STILLROLL_DATA__?.['./catalog/font-references.json'];
        if (embedded)
            return (typeof embedded === 'string' ? JSON.parse(embedded) : embedded);
        const response = await fetch('./catalog/font-references.json');
        if (!response.ok)
            throw new Error('Typeface references could not load.');
        return response.json();
    })().catch(error => { manifest = undefined; throw error; });
}
function includesText(range, text) {
    const codes = [...text].map(char => char.codePointAt(0));
    return range.split(',').some(item => {
        const spec = item.trim().replace(/^U\+/i, '');
        const [low, high = low] = spec.split('-');
        const a = parseInt(low.replace(/\?/g, '0'), 16), b = parseInt(high.replace(/\?/g, 'f'), 16);
        return codes.some(code => code >= a && code <= b);
    });
}
export function fontFallbacks() { return [...missing]; }
export function retryFonts() { jobs.clear(); missing.clear(); }
const customKeys = new Set(['atelierSerif', 'atelierDisplay', 'atelierScript', 'playfair', 'bodoni', 'cormorant', 'anton', 'outfit', 'plex', 'caveat', 'kalam', 'spacegrotesk', 'bitter', 'pressstart']);
export async function ensureFonts(nodes) {
    const text = nodes.filter(node => node.kind === 'text' && customKeys.has(node.font));
    if (!text.length || typeof FontFace === 'undefined')
        return;
    let data;
    try {
        data = await references();
    }
    catch {
        text.forEach(node => { if (node.kind === 'text')
            missing.add(node.font); });
        return;
    }
    const tasks = [];
    for (const node of text) {
        if (node.kind !== 'text')
            continue;
        const spec = data[node.font];
        if (!spec) {
            missing.add(node.font);
            continue;
        }
        let faces = spec.faces.filter(face => face.style === (node.italic ? 'italic' : 'normal'));
        if (!faces.length)
            faces = spec.faces.filter(face => face.style === 'normal');
        const weightDistance = (face) => { const [a, b = a] = face.weight.split(' ').map(Number); return node.weight < a ? a - node.weight : node.weight > b ? node.weight - b : 0; };
        const best = Math.min(...faces.map(weightDistance));
        for (const face of faces.filter(face => weightDistance(face) === best && includesText(face.unicodeRange, node.text || 'A'))) {
            const key = node.font + ':' + face.url;
            if (!jobs.has(key))
                jobs.set(key, (async () => {
                    let timer = 0;
                    try {
                        if (!/^https:\/\/fonts\.gstatic\.com\//.test(face.url) && !/^\.\/fonts\/atelier\/[A-Za-z0-9-]+\.(?:ttf|otf|woff2)$/.test(face.url))
                            throw new Error('Invalid font provider.');
                        const font = new FontFace(spec.family, `url("${face.url}")`, { style: face.style, weight: face.weight, unicodeRange: face.unicodeRange });
                        await Promise.race([font.load(), new Promise((_, reject) => { timer = window.setTimeout(() => reject(new Error('Typeface connection timed out.')), 9000); })]);
                        document.fonts.add(font);
                    }
                    catch {
                        missing.add(spec.name);
                    }
                    finally {
                        clearTimeout(timer);
                    }
                })());
            tasks.push(jobs.get(key));
        }
    }
    await Promise.all(tasks);
}
