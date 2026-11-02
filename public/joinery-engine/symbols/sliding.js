import { rect } from '../core/bounds.js';
import { point } from '../core/points.js';
import { relLine, renderHandle, renderLeafWithGlass, renderTracks } from './common.js';
export const drawSliding2 = (ctx) => {
    const inset = Math.max(10, ctx.config.frame * 0.16);
    const overlap = ctx.bounds.width * 0.08;
    const activeLeft = (ctx.cell.activeLeaf ?? 'left') === 'left';
    const leftPanel = rect(ctx.bounds.x + inset, ctx.bounds.y + inset, ctx.bounds.width / 2 + overlap - inset, ctx.bounds.height - inset * 2);
    const rightPanel = rect(ctx.bounds.x + ctx.bounds.width / 2 - overlap, ctx.bounds.y + inset, ctx.bounds.width / 2 + overlap - inset, ctx.bounds.height - inset * 2);
    return [
        ...renderTracks(ctx.bounds, ctx.theme.trackColor, ctx.theme.stroke, 2),
        ...(activeLeft ? renderLeafWithGlass(ctx, rightPanel) : renderLeafWithGlass(ctx, leftPanel)),
        ...(activeLeft ? renderLeafWithGlass(ctx, leftPanel) : renderLeafWithGlass(ctx, rightPanel)),
        relLine(ctx.bounds, point(0.12, 0.18), point(0.42, 0.82), ctx.theme.lineColor, ctx.theme.stroke * 0.9),
        relLine(ctx.bounds, point(0.42, 0.18), point(0.12, 0.82), ctx.theme.lineColor, ctx.theme.stroke * 0.9),
        relLine(ctx.bounds, point(0.58, 0.18), point(0.88, 0.82), ctx.theme.lineColor, ctx.theme.stroke * 0.9),
        relLine(ctx.bounds, point(0.88, 0.18), point(0.58, 0.82), ctx.theme.lineColor, ctx.theme.stroke * 0.9),
        ...renderHandle(activeLeft ? leftPanel : rightPanel, activeLeft ? 'right' : 'left', ctx.theme.lineColor, ctx.theme.stroke)
    ];
};
export const drawSliding3 = (ctx) => {
    const inset = Math.max(10, ctx.config.frame * 0.16);
    const overlap = ctx.bounds.width * 0.05;
    const panelWidth = ctx.bounds.width / 3 + overlap;
    const left = rect(ctx.bounds.x + inset, ctx.bounds.y + inset, panelWidth - inset, ctx.bounds.height - inset * 2);
    const center = rect(ctx.bounds.x + ctx.bounds.width / 3 - overlap / 2, ctx.bounds.y + inset, panelWidth - inset * 0.5, ctx.bounds.height - inset * 2);
    const right = rect(ctx.bounds.x + (ctx.bounds.width / 3) * 2 - overlap, ctx.bounds.y + inset, panelWidth - inset, ctx.bounds.height - inset * 2);
    const active = ctx.cell.activeLeaf ?? 'center';
    return [
        ...renderTracks(ctx.bounds, ctx.theme.trackColor, ctx.theme.stroke, 3),
        ...renderLeafWithGlass(ctx, left),
        ...renderLeafWithGlass(ctx, center),
        ...renderLeafWithGlass(ctx, right),
        relLine(left, point(0.18, 0.16), point(0.82, 0.84), ctx.theme.lineColor, ctx.theme.stroke * 0.85),
        relLine(center, point(0.5, 0.12), point(0.5, 0.88), ctx.theme.lineColor, ctx.theme.stroke * 0.85),
        relLine(right, point(0.82, 0.16), point(0.18, 0.84), ctx.theme.lineColor, ctx.theme.stroke * 0.85),
        ...renderHandle(active === 'left' ? left : active === 'right' ? right : center, active === 'right' ? 'left' : 'right', ctx.theme.lineColor, ctx.theme.stroke)
    ];
};
