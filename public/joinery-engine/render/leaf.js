import { insetRect } from '../core/geometry.js';
import { svgRect } from '../core/svg.js';
export function renderLeaf(bounds, leafDepth, theme) {
    const inner = insetRect(bounds, leafDepth);
    return [
        svgRect(bounds, {
            fill: theme.leafFill,
            stroke: theme.lineColor,
            'stroke-width': theme.stroke * 0.9
        }),
        svgRect(inner, {
            fill: 'none',
            stroke: theme.lineColor,
            'stroke-width': theme.stroke * 0.55
        })
    ];
}
