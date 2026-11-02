import { insetRect, mapRelativePoints, relativeToAbsolute } from '../core/geometry.js';
import { mirrorRelativePointsX } from '../core/mirror.js';
import { svgLine, svgPath, svgRect } from '../core/svg.js';
import { renderGlass } from '../render/glass.js';
import { renderLeaf } from '../render/leaf.js';
export function getModulePadding(ctx) {
    return Math.max(8, ctx.config.frame * 0.16);
}
export function getLeafBounds(ctx, bounds = ctx.bounds) {
    return insetRect(bounds, getModulePadding(ctx));
}
export function getGlassBounds(ctx, leafBounds) {
    return insetRect(leafBounds, ctx.config.leaf);
}
export function renderLeafWithGlass(ctx, leafBounds = getLeafBounds(ctx)) {
    const glassBounds = getGlassBounds(ctx, leafBounds);
    return [
        ...renderLeaf(leafBounds, ctx.config.leaf, ctx.theme),
        ...renderGlass(insetRect(glassBounds, ctx.config.glassInset * 0.15), ctx.theme)
    ];
}
export function relLine(bounds, a, b, color, strokeWidth) {
    return svgLine(relativeToAbsolute(bounds, a), relativeToAbsolute(bounds, b), {
        stroke: color,
        'stroke-width': strokeWidth,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
    });
}
export function relArc(bounds, from, control, to, color, strokeWidth, mirrorX = false) {
    const points = mirrorX ? mirrorRelativePointsX([from, control, to]) : [from, control, to];
    const [a, c, b] = mapRelativePoints(bounds, points);
    return svgPath(`M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`, {
        fill: 'none',
        stroke: color,
        'stroke-width': strokeWidth,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
    });
}
export function renderHandle(bounds, side, color, strokeWidth) {
    const handleWidth = Math.max(4, bounds.width * 0.03);
    const handleHeight = Math.max(24, bounds.height * 0.12);
    const x = side === 'left' ? bounds.x + bounds.width * 0.07 : bounds.x + bounds.width * 0.93 - handleWidth;
    const y = bounds.y + bounds.height * 0.44 - handleHeight / 2;
    return [
        svgRect({ x, y, width: handleWidth, height: handleHeight }, {
            fill: color,
            stroke: color,
            'stroke-width': strokeWidth * 0.35,
            rx: handleWidth / 2
        })
    ];
}
export function renderTracks(bounds, color, strokeWidth, count) {
    const nodes = [];
    for (let index = 0; index < count; index += 1) {
        const offset = index * 7;
        const topY = 0.02 + offset / bounds.height;
        const bottomY = 0.98 - offset / bounds.height;
        nodes.push(relLine(bounds, { x: 0.04, y: topY }, { x: 0.96, y: topY }, color, strokeWidth * 0.8), relLine(bounds, { x: 0.04, y: bottomY }, { x: 0.96, y: bottomY }, color, strokeWidth * 0.8));
    }
    return nodes;
}
