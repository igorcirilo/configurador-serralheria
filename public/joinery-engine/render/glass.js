import { svgRect } from '../core/svg.js';
export function renderGlass(bounds, theme) {
    return [
        svgRect(bounds, {
            fill: theme.glassFill,
            stroke: theme.lineColor,
            'stroke-width': theme.stroke * 0.5
        })
    ];
}
