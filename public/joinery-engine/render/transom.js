import { svgLine } from '../core/svg.js';
export function renderTransom(a, b, theme) {
    return [
        svgLine(a, b, {
            stroke: theme.lineColor,
            'stroke-width': theme.stroke * 0.85
        })
    ];
}
