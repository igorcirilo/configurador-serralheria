import { insetRect } from '../core/geometry.js';
import { point } from '../core/points.js';
import { relArc, relLine, renderLeafWithGlass } from './common.js';
export const drawHopper = (ctx) => {
    const leafBounds = insetRect(ctx.bounds, Math.max(10, ctx.config.frame * 0.16));
    const symbolBounds = insetRect(leafBounds, ctx.config.leaf + ctx.config.glassInset * 0.25);
    return [
        ...renderLeafWithGlass(ctx, leafBounds),
        relLine(symbolBounds, point(0.12, 0.88), point(0.88, 0.88), ctx.theme.lineColor, ctx.theme.stroke * 0.95),
        relLine(symbolBounds, point(0.12, 0.88), point(0.28, 0.18), ctx.theme.lineColor, ctx.theme.stroke * 0.95),
        relLine(symbolBounds, point(0.88, 0.88), point(0.72, 0.18), ctx.theme.lineColor, ctx.theme.stroke * 0.95),
        relLine(symbolBounds, point(0.28, 0.18), point(0.72, 0.18), ctx.theme.lineColor, ctx.theme.stroke * 0.95),
        relArc(symbolBounds, point(0.18, 0.8), point(0.5, 0.98), point(0.82, 0.8), ctx.theme.guideColor, ctx.theme.stroke * 0.8)
    ];
};
