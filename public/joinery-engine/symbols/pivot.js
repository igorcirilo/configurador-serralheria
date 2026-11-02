import { insetRect, relativeToAbsolute } from '../core/geometry.js';
import { point } from '../core/points.js';
import { svgLine } from '../core/svg.js';
import { relArc, relLine, renderLeafWithGlass } from './common.js';
export const drawPivotVertical = (ctx) => {
    const leafBounds = insetRect(ctx.bounds, Math.max(10, ctx.config.frame * 0.16));
    const symbolBounds = insetRect(leafBounds, ctx.config.leaf + ctx.config.glassInset * 0.25);
    const axisA = relativeToAbsolute(symbolBounds, point(0.34, 0.08));
    const axisB = relativeToAbsolute(symbolBounds, point(0.34, 0.92));
    return [
        ...renderLeafWithGlass(ctx, leafBounds),
        svgLine(axisA, axisB, {
            stroke: ctx.theme.guideColor,
            'stroke-width': ctx.theme.stroke * 0.8,
            'stroke-dasharray': '8 6'
        }),
        relLine(symbolBounds, point(0.34, 0.16), point(0.84, 0.84), ctx.theme.lineColor, ctx.theme.stroke * 0.95),
        relLine(symbolBounds, point(0.34, 0.84), point(0.84, 0.16), ctx.theme.lineColor, ctx.theme.stroke * 0.95),
        relArc(symbolBounds, point(0.38, 0.2), point(1.02, 0.5), point(0.38, 0.8), ctx.theme.guideColor, ctx.theme.stroke * 0.8)
    ];
};
