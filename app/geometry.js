import { clone, UNIT } from './model.js';
export function localPoint(n, p) { const r = -n.rotation * Math.PI / 180, dx = p.x - (n.x + n.w / 2), dy = p.y - (n.y + n.h / 2); return { x: dx * Math.cos(r) - dy * Math.sin(r) + n.w / 2, y: dx * Math.sin(r) + dy * Math.cos(r) + n.h / 2 }; }
export function worldPoint(n, p) { const r = n.rotation * Math.PI / 180, dx = p.x - n.w / 2, dy = p.y - n.h / 2; return { x: n.x + n.w / 2 + dx * Math.cos(r) - dy * Math.sin(r), y: n.y + n.h / 2 + dx * Math.sin(r) + dy * Math.cos(r) }; }
export function corners(n) { return [{ x: 0, y: 0 }, { x: n.w, y: 0 }, { x: n.w, y: n.h }, { x: 0, y: n.h }].map(p => worldPoint(n, p)); }
export function bounds(nodes) {
    if (!nodes.length)
        return { x: 0, y: 0, w: 0, h: 0 };
    const pts = nodes.flatMap(corners);
    const x = Math.min(...pts.map(p => p.x)), y = Math.min(...pts.map(p => p.y));
    return { x, y, w: Math.max(...pts.map(p => p.x)) - x, h: Math.max(...pts.map(p => p.y)) - y };
}
export function contains(n, p, padding = 0) {
    const q = localPoint(n, p);
    if (n.kind === 'photo' && n.mask === 'circle')
        return ((q.x - n.w / 2) / (n.w / 2 + padding)) ** 2 + ((q.y - n.h / 2) / (n.h / 2 + padding)) ** 2 <= 1;
    return q.x >= -padding && q.y >= -padding && q.x <= n.w + padding && q.y <= n.h + padding;
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function snapPosition(n, others, height, threshold = 4, originY = 0) {
    const slide = Math.floor((n.x + n.w / 2) / UNIT);
    const xs = [slide * UNIT, slide * UNIT + 24, slide * UNIT + UNIT / 2, (slide + 1) * UNIT - 24, (slide + 1) * UNIT];
    const ys = [0, 24, height / 2, height - 24, height].map(y => y + originY);
    for (const o of others) {
        if (o.id === n.id)
            continue;
        xs.push(o.x, o.x + o.w / 2, o.x + o.w);
        ys.push(o.y, o.y + o.h / 2, o.y + o.h);
    }
    let dx = threshold, dy = threshold, gx, gy;
    for (const a of [n.x, n.x + n.w / 2, n.x + n.w])
        for (const b of xs)
            if (Math.abs(b - a) < Math.abs(dx)) {
                dx = b - a;
                gx = b;
            }
    for (const a of [n.y, n.y + n.h / 2, n.y + n.h])
        for (const b of ys)
            if (Math.abs(b - a) < Math.abs(dy)) {
                dy = b - a;
                gy = b;
            }
    const guides = [];
    if (gx !== undefined)
        guides.push({ axis: 'x', value: gx });
    if (gy !== undefined)
        guides.push({ axis: 'y', value: gy });
    return { x: n.x + (gx !== undefined ? dx : 0), y: n.y + (gy !== undefined ? dy : 0), guides };
}
export class History {
    limit;
    stack = [];
    cursor = -1;
    constructor(p, limit = 50) {
        this.limit = limit;
        this.reset(p);
    }
    reset(p) { this.stack = [clone(p)]; this.cursor = 0; }
    get canUndo() { return this.cursor > 0; }
    get canRedo() { return this.cursor < this.stack.length - 1; }
    push(p) {
        const last = this.stack[this.cursor];
        const a = { ...p, updated: 0 }, b = { ...last, updated: 0 };
        if (JSON.stringify(a) === JSON.stringify(b))
            return false;
        this.stack.splice(this.cursor + 1);
        this.stack.push(clone(p));
        if (this.stack.length > this.limit)
            this.stack.shift();
        this.cursor = this.stack.length - 1;
        return true;
    }
    undo() {
        if (this.canUndo)
            this.cursor--;
        return clone(this.stack[this.cursor]);
    }
    redo() {
        if (this.canRedo)
            this.cursor++;
        return clone(this.stack[this.cursor]);
    }
}
