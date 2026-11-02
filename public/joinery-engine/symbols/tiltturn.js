import { insetRect } from '../core/geometry.js';
import { point } from '../core/points.js';
import { relArc, relLine, renderHandle, renderLeafWithGlass } from './common.js';
function drawTiltTurn(mirrorX) {
    return (ctx) => {
        const leafBounds = insetRect(ctx.bounds, Math.max(10, ctx.config.frame * 0.16));
        const symbolBounds = insetRect(leafBounds, ctx.config.leaf + ctx.config.glassInset * 0.25);
        const handleSide = mirrorX ? 'left' : 'right';
        return [
            ...renderLeafWithGlass(ctx, leafBounds),
            relLine(symbolBounds, mirrorX ? point(0.08, 0.86) : point(0.92, 0.86), mirrorX ? point(0.58, 0.14) : point(0.42, 0.14), ctx.theme.lineColor, ctx.theme.stroke * 0.95),
            relLine(symbolBounds, mirrorX ? point(0.58, 0.14) : point(0.42, 0.14), mirrorX ? point(0.88, 0.86) : point(0.12, 0.86), ctx.theme.lineColor, ctx.theme.stroke * 0.95),
            relArc(symbolBounds, point(0.18, 0.2), point(0.5, 0), point(0.82, 0.2), ctx.theme.guideColor, ctx.theme.stroke * 0.8),
            relLine(symbolBounds, point(0.18, 0.2), point(0.5, 0.36), ctx.theme.guideColor, ctx.theme.stroke * 0.8),
            relLine(symbolBounds, point(0.82, 0.2), point(0.5, 0.36), ctx.theme.guideColor, ctx.theme.stroke * 0.8),
            ...renderHandle(leafBounds, handleSide, ctx.theme.lineColor, ctx.theme.stroke)
        ];
    };
}
export const drawTiltTurnLeft = drawTiltTurn(true);
export const drawTiltTurnRight = drawTiltTurn(false);
