/** Seta de deslocamento de uma folha de correr (dupla quando corre para os dois lados). */
export function slidingArrowSegments(bounds, direction, offsetY = 0) {
    if (direction === 'fixed')
        return [];
    const y = bounds.y + bounds.height / 2 + offsetY;
    const left = bounds.x + bounds.width * 0.28;
    const right = bounds.x + bounds.width * 0.72;
    const head = Math.min(40, bounds.width * 0.08);
    const tip = (x, sign) => [
        { a: { x, y }, b: { x: x + sign * head, y: y - head * 0.7 } },
        { a: { x, y }, b: { x: x + sign * head, y: y + head * 0.7 } }
    ];
    const shaft = { a: { x: left, y }, b: { x: right, y } };
    if (direction === 'both')
        return [shaft, ...tip(right, -1), ...tip(left, 1)];
    return direction === 'right' ? [shaft, ...tip(right, -1)] : [shaft, ...tip(left, 1)];
}
function p(bounds, x, y) {
    return { x: bounds.x + bounds.width * x, y: bounds.y + bounds.height * y };
}
function segment(bounds, ax, ay, bx, by) {
    return { a: p(bounds, ax, ay), b: p(bounds, bx, by) };
}
function casement(bounds, hinges) {
    const left = hinges === 'left';
    const hingeX = left ? 0 : 1;
    const oppositeX = left ? 1 : 0;
    return [
        segment(bounds, hingeX, 0, oppositeX, 0.5),
        segment(bounds, hingeX, 1, oppositeX, 0.5)
    ];
}
function tilt(bounds) {
    return [
        segment(bounds, 0, 0, 0.5, 1),
        segment(bounds, 1, 0, 0.5, 1)
    ];
}
function projected(bounds) {
    return [
        segment(bounds, 0, 1, 0.5, 0),
        segment(bounds, 1, 1, 0.5, 0)
    ];
}
function resolvedHinges(side, module, viewSide) {
    const mirror = viewSide === 'exterior' !== Boolean(module.cell.mirrorX);
    return mirror ? (side === 'left' ? 'right' : 'left') : side;
}
export function openingSegments(module, viewSide = 'interior') {
    const bounds = module.leafBounds ?? module.glassBounds;
    switch (module.cell.type) {
        case 'casement_left': return casement(bounds, resolvedHinges('left', module, viewSide));
        case 'casement_right': return casement(bounds, resolvedHinges('right', module, viewSide));
        case 'tilt_turn_left': return [...casement(bounds, resolvedHinges('left', module, viewSide)), ...tilt(bounds)];
        case 'tilt_turn_right': return [...casement(bounds, resolvedHinges('right', module, viewSide)), ...tilt(bounds)];
        case 'awning': return projected(bounds);
        case 'hopper': return tilt(bounds);
        case 'pivot_vertical':
            return [segment(bounds, 0.5, 0.08, 0.5, 0.92)];
        case 'sliding_2':
        case 'sliding_3':
        case 'sliding_4':
            // Uma seta por folha, no sentido em que cada folha corre.
            return (module.slidingLeaves ?? []).flatMap((leaf) => slidingArrowSegments(leaf.bounds, leaf.direction));
        case 'double_casement': {
            const left = { ...bounds, width: bounds.width / 2 };
            const right = { ...bounds, x: bounds.x + bounds.width / 2, width: bounds.width / 2 };
            return [...casement(left, 'left'), ...casement(right, 'right')];
        }
        default: return [];
    }
}
