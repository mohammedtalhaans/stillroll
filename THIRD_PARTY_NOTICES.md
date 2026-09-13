# Stillroll — third-party and creative-asset notices

Release 0.1.0 · reviewed 9 September 2026. Original application code, templates,
identity and original SVG assets are MIT licensed; see LICENSE. Third-party
materials retain the licenses below. No proprietary Apple font, font file of any
kind, SF Symbol, television still, celebrity photograph, lyric, album cover or
commercial template pack is bundled.

## Code and interface

| Material | Included role and modifications | Upstream license / notice |
|---|---|---|
| JSZip 3.10.1, Stuart Knightley and contributors | Unmodified upstream browser distribution at `public/vendor/jszip-3.10.1.min.js`; project files and secondary ZIP image downloads. The MIT option of the dual license is selected. | https://github.com/Stuk/jszip/tree/v3.10.1 · `docs/licenses/JSZip.md`; bundled dependency notices retained separately. |
| idb-keyval source principles, Jake Archibald | Adapted small request/transaction wrapper in `src/vendor/idb.ts`; typed fixed store, batched writes/deletes, range-limited queries and database-close/version-change recovery. Not an unmodified npm distribution. | https://github.com/jakearchibald/idb-keyval · Copyright 2016 Jake Archibald, Apache-2.0. Complete license and modification notice in `docs/licenses/`. |
| shadcn/ui button source, shadcn | Native-DOM adaptation of variants, focus and disabled-state conventions in `src/ui.ts` and `public/styles.css`; not the React component runtime. | https://github.com/shadcn-ui/ui · Copyright (c) 2023 shadcn, MIT; `docs/licenses/shadcn.txt`. |
| Sam Asante, liquid-glass | Inspected GlassSlider/GlassNotification and browser-support documentation; adapted frosted-control, highlight and accessible-range principles. Full refraction/React engine is not bundled. | https://github.com/samasante/liquid-glass · Copyright (c) 2026 Sam Asante, MIT; `docs/licenses/Sam-Asante.txt`. |
| Font Awesome Free 6.7.2, Fonticons, Inc. | Selected solid icon SVG paths, renamed into a single application icon map; scaled at render time; no icon font. These are UI icons, not part of the 170 creative assets. | https://fontawesome.com/license/free · Icons CC BY 4.0; upstream notice in `docs/licenses/Font-Awesome.txt`. |
| TypeScript 5.8.3, Microsoft and contributors | Build-time compiler only; exact version and official integrity pinned in package-lock.json. Not shipped in the static site. | https://github.com/microsoft/TypeScript/tree/v5.8.3 · Apache-2.0. |

JSZip's prebuilt browser code includes pako, lie, immediate, setImmediate and
stream/utility components. Their retained notices are in
`docs/licenses/JSZip-bundled-dependencies.txt`. Its bytes are not rebuilt here.
`docs/VENDOR-MANIFEST.json` records checksums of the distributed vendor files and
local adaptations. Source snapshots inspected from moving main branches are
identified as such, not assigned invented upstream commit IDs.

## Demonstration photographs

All eight photographs are stored locally, re-encoded as JPEG. Cropping and colour
grading occur in editable compositions; originals are not hotlinked at runtime.
The per-file manifest records source, creator, license and modifications.

| Local file | Creator / license | Source |
|---|---|---|
| media/coffee.jpg | Rachel Michetti / Pikolo Espresso Bar · CC0-1.0 | https://scikit-image.org/docs/stable/api/skimage.data.html#skimage.data.coffee |
| media/garden.jpg | Daniel Büchele · CC BY 2.0 | https://www.flickr.com/photos/danielbuechele/6061409035/ |
| media/flower.jpg | vultilion · CC BY 2.0 | https://www.flickr.com/photos/vultilion/6056698931/ |
| media/cat.jpg | Stefan van der Walt · CC0-1.0 | https://scikit-image.org/docs/stable/api/skimage.data.html#skimage.data.chelsea |
| media/astronaut.jpg | NASA · public domain | https://flic.kr/p/r9qvLn |
| media/rocket.jpg | SpaceX · public domain | https://www.flickr.com/photos/spacexphotos/16511594820/ |
| media/cosmos.jpg | NASA / ESA · public-domain demonstration image | https://hubblesite.org/contents/media/images/2012/37/3060-Image.html |
| media/camera.jpg | Lav Varshney · CC0-1.0 replacement image, not the older copyrighted cameraman | https://scikit-image.org/docs/stable/api/skimage.data.html#skimage.data.camera |

CC BY 2.0: https://creativecommons.org/licenses/by/2.0/ . CC0:
https://creativecommons.org/publicdomain/zero/1.0/ . Follow the applicable photo
license when posting sample imagery. The two CC BY photos require credit, source,
license link and an indication of changes. The app provides per-project photo
credits; ZIPs and portable projects contain PHOTO-CREDITS.txt. Individual images
have no visible watermark: put the necessary photo credit in your post/caption or
another appropriate accompanying location. Replacing the samples with your own
photos removes their attribution obligations for that output.

Public-domain copyright status does not imply endorsement or waive every right
concerning a pictured person, agency, logo or trademark. No creator or agency
endorses this application. Imported user media remains the user's responsibility.

## Original art and fan directions

`public/creative/manifest.json` contains 170 original SVGs. Seven additional
800×1000 sample illustrations in `public/media/` are clearly named as illustrations,
not destination stock photographs. Their geometry, the 60 templates and the
identity are authored for Stillroll, MIT licensed. Original template and asset
source redistribution must preserve the MIT notice. Stillroll additionally grants
use of its original rendered artwork in personal and commercial exports without
required credit or watermark. This permission does not change external photo
licenses or rights in users' uploads.

Portal theory (Rick and Morty-inspired), Velvet Americana (Lana Del Rey-inspired),
Desert chemistry (Breaking Bad-inspired), and Screen dreams are unofficial original
art directions. Names identify inspiration, not affiliation or endorsement. No
protected source imagery, dialogue, lyrics, official logos or copied character art
is included. Working-name research is not trademark clearance.

## Distribution

The site includes `third-party-notices.txt`, accessible from Help → Photo & asset
credits → Open-source notices. The standalone HTML embeds those same notices.
Keep notices with redistributed source and static-site releases.
