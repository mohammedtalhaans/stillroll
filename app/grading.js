const base = { temperature: 0, tint: 0, contrast: 1, saturation: 1, gamma: 1, lift: 0, highlights: 0, shadow: [0, 0, 0], highlight: [0, 0, 0], grain: 0, vignette: 0, hueGreen: 0, hueBlue: 0 };
const g = (id, name, family, description, v) => ({ ...base, id, name, family, description, ...v });
export const GRADES = [
    g('original', 'Original', 'Clean', 'Your photo, just as it is.', {}),
    g('daylight', 'Daylight', 'Clean', 'Clear whites and balanced, open shadows.', { contrast: 1.04, gamma: .98, highlights: -.015, saturation: 1.03 }),
    g('editorial', 'Editorial', 'Clean', 'Quiet colour with a restrained magazine finish.', { contrast: 1.06, saturation: .87, shadow: [-.007, .002, .008], highlights: -.02 }),
    g('soft-flash', 'Soft flash', 'Clean', 'Clean midtones, airy highlights, gently lifted blacks.', { gamma: .92, lift: .018, contrast: 1.025, saturation: .96 }),
    g('honey', 'Honey', 'Warm', 'Soft gold without pushing skin orange.', { temperature: .038, contrast: 1.04, saturation: 1.04, gamma: .98, highlights: -.028, shadow: [.005, .003, -.005], grain: .008 }),
    g('golden-hour', 'Golden hour', 'Warm', 'A warm, low-contrast glow with protected highlights.', { temperature: .06, tint: .008, contrast: .96, gamma: .93, highlights: -.045, highlight: [.018, .008, -.012], grain: .006 }),
    g('warm-film', 'Warm film', 'Film', 'Warm mids, cooler shadows, a tactile 35mm finish.', { temperature: .025, contrast: 1.09, saturation: .94, lift: .018, shadow: [-.016, .002, .019], highlight: [.015, .007, -.008], grain: .014 }),
    g('faded-35', 'Faded 35', 'Film', 'Softened blacks, washed colour, subtle grain.', { temperature: .017, contrast: .94, saturation: .79, lift: .065, highlights: -.025, shadow: [.005, .012, .02], grain: .019 }),
    g('alpine', 'Alpine', 'Outside', 'Cool whites and blue shadows without clipped snow.', { temperature: -.035, contrast: 1.04, saturation: .93, highlights: -.06, shadow: [-.006, .008, .022], hueBlue: -.025 }),
    g('forest', 'Forest', 'Outside', 'Rich green detail and soft, earthy shadows.', { temperature: .009, contrast: 1.08, saturation: .93, gamma: 1.03, shadow: [-.016, .012, -.006], hueGreen: .025, highlights: -.025, grain: .007 }),
    g('seafoam', 'Seafoam', 'Outside', 'Airy coastal blues, sun-washed greens.', { temperature: -.014, tint: -.009, contrast: .97, saturation: .97, gamma: .95, lift: .015, highlight: [.007, .019, .012], hueBlue: -.045 }),
    g('desert', 'Desert', 'Outside', 'Dusty amber, dry greens, clean desert light.', { temperature: .043, contrast: 1.085, saturation: .84, lift: .01, hueGreen: -.045, shadow: [.014, .002, -.012], grain: .009 }),
    g('rosewater', 'Rosewater', 'Romance', 'Muted rose tones and gentle, cinematic melancholy.', { temperature: .01, tint: .024, contrast: .965, saturation: .76, gamma: .97, lift: .025, shadow: [.014, -.003, .012], grain: .012 }),
    g('peach', 'Peach', 'Romance', 'Light warm pastels with soft skin transitions.', { temperature: .022, tint: .009, contrast: .96, saturation: .91, gamma: .92, highlights: -.03, lift: .015 }),
    g('velvet', 'Velvet', 'Romance', 'Deep romantic tones with lifted plum shadows.', { temperature: .014, tint: .019, contrast: 1.13, saturation: .8, gamma: 1.05, lift: .02, shadow: [.01, -.01, .013], vignette: .13, grain: .012 }),
    g('midnight', 'Midnight', 'After dark', 'Steel-blue shadows; highlights keep their colour.', { temperature: -.029, contrast: 1.1, saturation: .84, gamma: 1.06, lift: .008, shadow: [-.012, .001, .026], vignette: .18 }),
    g('neon', 'Neon', 'After dark', 'Cyan shadows and lively night-time colour.', { temperature: -.01, contrast: 1.12, saturation: 1.12, shadow: [-.028, .014, .022], highlight: [.015, -.004, .008], vignette: .08 }),
    g('lab-notes', 'Lab notes', 'Cinema', 'Green-yellow tension with restrained warm highlights.', { temperature: .018, tint: -.026, contrast: 1.1, saturation: .8, shadow: [-.013, .025, -.014], highlight: [.018, .015, -.015], grain: .012 }),
    g('silver', 'Silver', 'Monochrome', 'Luminous monochrome with gentle skin and sky.', { mono: [.29, .59, .12], contrast: 1.035, gamma: .96, lift: .008, grain: .007 }),
    g('noir', 'Noir', 'Monochrome', 'Bold blacks, controlled whites, subtle film grain.', { mono: [.27, .6, .13], contrast: 1.22, gamma: 1.04, highlights: -.03, vignette: .14, grain: .016 }),
    g('graphite', 'Graphite', 'Monochrome', 'Matte, cool-toned black and white.', { mono: [.23, .64, .13], contrast: .99, lift: .065, shadow: [-.004, .003, .009], grain: .02 }),
    g('sepia', 'Sepia paper', 'Monochrome', 'A warm archival print, never just a flat overlay.', { mono: [.3, .59, .11], temperature: .068, tint: -.008, contrast: 1.02, lift: .018, highlight: [.018, .008, -.009], grain: .016 })
];
const clamp = (v) => Math.max(0, Math.min(1, v));
function random(x, y) { let n = Math.imul(x + 313, y + 7187) ^ 0x45d9f3b; n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0) / 4294967295 - .5; }
/** Pixel transforms used in preview AND export. Grain is anchored to source coordinates. */
export function processPixels(data, width, height, s) {
    const p = GRADES.find(p => p.id === s.preset) || GRADES[0], mix = s.intensity / 100;
    if (p.id === 'original' && !s.exposure && !s.contrast && !s.saturation && !s.warmth && !s.grain && !s.vignette && !s.fade)
        return data;
    const exp = 2 ** s.exposure, con = p.contrast * (1 + s.contrast / 100), sat = p.saturation * (1 + s.saturation / 100), warm = p.temperature + s.warmth / 1500, grain = p.grain + s.grain / 2500, vig = p.vignette + s.vignette / 100, lift = p.lift + s.fade / 500;
    for (let i = 0; i < data.length; i += 4) {
        const or = data[i] / 255, og = data[i + 1] / 255, ob = data[i + 2] / 255;
        let r = or, g = og, b = ob;
        const skin = r > g && g > b && r - b > .045 && r - b < .5;
        if (p.mono) {
            const v = r * p.mono[0] + g * p.mono[1] + b * p.mono[2];
            r = g = b = v;
        }
        else {
            const green = Math.max(0, g - Math.max(r, b)), blue = Math.max(0, b - Math.max(r, g));
            r += green * p.hueGreen * .7;
            g -= green * p.hueGreen * .6;
            g += blue * p.hueBlue;
            b -= blue * p.hueBlue * .5;
        }
        const lum = r * .2126 + g * .7152 + b * .0722;
        const safeSat = skin && !p.mono ? 1 + (sat - 1) * .55 : sat;
        r = lum + (r - lum) * safeSat;
        g = lum + (g - lum) * safeSat;
        b = lum + (b - lum) * safeSat;
        const warmSafe = skin ? warm * .55 : warm;
        r += warmSafe;
        g += warmSafe * .12 - p.tint * .45;
        b -= warmSafe * .72;
        r += p.tint * .3;
        b += p.tint * .3;
        const shadow = (1 - clamp(lum * 2)) ** 2, hi = clamp((lum - .4) / .6) ** 2;
        r += p.shadow[0] * shadow + p.highlight[0] * hi;
        g += p.shadow[1] * shadow + p.highlight[1] * hi;
        b += p.shadow[2] * shadow + p.highlight[2] * hi;
        const curve = (v) => { v = clamp(v * exp); v = Math.pow(v, p.gamma); v = (v - .5) * con + .5; v = v * (1 - lift) + lift; v += p.highlights * hi; return clamp(v); };
        r = curve(r);
        g = curve(g);
        b = curve(b);
        const x = (i / 4) % width, y = Math.floor(i / 4 / width), nx = (x / width - .5) * 2, ny = (y / height - .5) * 2, shade = 1 - vig * Math.min(1, (nx * nx + ny * ny) * .45);
        const noise = random(Math.floor(x / width * 1200), Math.floor(y / height * 1200 * height / width)) * grain * (.4 + .6 * (1 - lum));
        r = clamp(r * shade + noise);
        g = clamp(g * shade + noise);
        b = clamp(b * shade + noise);
        data[i] = Math.round((or + (r - or) * mix) * 255);
        data[i + 1] = Math.round((og + (g - og) * mix) * 255);
        data[i + 2] = Math.round((ob + (b - ob) * mix) * 255);
    }
    return data;
}
