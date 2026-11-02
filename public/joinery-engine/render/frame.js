import { insetRect } from '../core/geometry.js';
import { svgRect } from '../core/svg.js';
export function renderFrame(bounds, frameDepth, theme) {
    const inner = insetRect(bounds, frameDepth);
    return [
        svgRect(bounds, {
            fill: theme.frameFill,
            stroke: theme.lineColor,
            'stroke-width': theme.stroke
        }),
        svgRect(inner, {
            fill: theme.background,
            stroke: theme.lineColor,
            'stroke-width': theme.stroke * 0.7
        })
    ];
}
