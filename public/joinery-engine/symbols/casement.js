import { insetRect } from '../core/geometry.js';
import { point } from '../core/points.js';
import { getLeafBounds, relLine, renderHandle, renderLeafWithGlass } from './common.js';
function drawCasement(mirrorX) {
    return (ctx) => {
        const leafBounds = getLeafBounds(ctx);
        const symbolBounds = insetRect(leafBounds, ctx.config.leaf + ctx.config.glassInset * 0.25);
        const side = mirrorX ? 'left' : 'right';
        return [
            ...renderLeafWithGlass(ctx, leafBounds),
            relLine(symbolBounds, mirrorX ? point(0.08, 0.88) : point(0.92, 0.88), mirrorX ? point(0.6, 0.08) : point(0.4, 0.08), ctx.theme.lineColor, ctx.theme.stroke * 0.95),
            relLine(symbolBounds, mirrorX ? point(0.6, 0.08) : point(0.4, 0.08), mirrorX ? point(0.92, 0.92) : point(0.08, 0.92), ctx.theme.lineColor, ctx.theme.stroke * 0.95),
            relLine(symbolBounds, mirrorX ? point(0.9, 0.42) : point(0.1, 0.42), mirrorX ? point(0.42, 0.1) : point(0.58, 0.1), ctx.theme.lineColor, ctx.theme.stroke * 0.95),
            ...renderHandle(leafBounds, side, ctx.theme.lineColor, ctx.theme.stroke)
        ];
    };
}
export const drawCasementLeft = drawCasement(true);
export const drawCasementRight = drawCasement(false);
export const drawDoubleCasement = (ctx) => {
    const leftBounds = { ...ctx.bounds, width: ctx.bounds.width / 2 };
    const rightBounds = { ...ctx.bounds, x: ctx.bounds.x + ctx.bounds.width / 2, width: ctx.bounds.width / 2 };
    return [
        ...drawCasementLeft({ ...ctx, bounds: leftBounds }),
        ...drawCasementRight({ ...ctx, bounds: rightBounds })
    ];
};
