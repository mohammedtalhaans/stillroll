import { clone, uid, UNIT, designHeight, tileOrigin, ownerSlide } from './model.js';
import { bounds } from './geometry.js';
/** Photo frames have a content role independent of layout locking. */
export function isPhotoSlot(node) {
    return (node.kind === 'photo' || node.kind === 'video') && node.role !== 'artwork';
}
export function isFilledSlot(node) {
    return !!node.assetId && (node.slotState === 'filled' || (!node.slotState && !node.assetId.startsWith('demo-')));
}
export function photoSlots(project, slide, emptyOnly = false) {
    const origin = tileOrigin(project, slide || 0), left = origin.x, right = left + UNIT;
    return project.nodes.filter(isPhotoSlot).filter(node => {
        const box = bounds([node]);
        return (!emptyOnly || !isFilledSlot(node)) && (slide === undefined || (box.x < right && box.x + box.w > left && box.y < origin.y + designHeight(project) && box.y + box.h > origin.y));
    }).sort((a, b) => ownerSlide(project, a) - ownerSlide(project, b) || a.y - b.y || a.x - b.x);
}
export function setSlotPhoto(project, id, assetId, kind = 'photo') {
    const node = project.nodes.find(n => n.id === id);
    if (!node || !isPhotoSlot(node))
        throw new Error('Choose an editable photo frame.');
    if (node.slotState === 'demo' && !node.demoAssetId)
        node.demoAssetId = node.assetId;
    node.assetId = assetId;
    node.kind = kind;
    node.role = 'slot';
    node.slotState = assetId ? 'filled' : 'empty';
    node.crop = { x: .5, y: .5, zoom: 1 };
    delete node.cutout;
    delete node.videoStart;
    return node;
}
export function swapSlotPhotos(project, first, second) {
    const a = project.nodes.find(n => n.id === first), b = project.nodes.find(n => n.id === second);
    if (!a || !b || !isPhotoSlot(a) || !isPhotoSlot(b))
        throw new Error('Choose two photo frames to swap.');
    const asset = a.assetId, kind = a.kind, state = a.slotState;
    setSlotPhoto(project, a.id, b.assetId, b.kind);
    a.slotState = b.slotState;
    setSlotPhoto(project, b.id, asset, kind);
    b.slotState = state;
}
export function templateRecipe(project) {
    const recipe = clone(project);
    recipe.id = uid();
    recipe.created = recipe.updated = Date.now();
    recipe.recipe = true;
    recipe.name = project.name.slice(0, 139) + ' — recipe';
    recipe.notes = '';
    delete recipe.planDate;
    delete recipe.mediaIds;
    let index = 0;
    for (const node of recipe.nodes.filter(isPhotoSlot)) {
        node.assetId = '';
        node.kind = 'photo';
        node.slotState = 'empty';
        node.name = `Photo ${++index}`;
        node.crop = { x: .5, y: .5, zoom: 1 };
        delete node.demoAssetId;
        delete node.cutout;
        delete node.videoStart;
    }
    return recipe;
}
