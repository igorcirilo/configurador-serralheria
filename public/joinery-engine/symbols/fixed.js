import { insetRect } from '../core/geometry.js';
import { renderGlass } from '../render/glass.js';
export const drawFixed = (ctx) => {
    const panel = insetRect(ctx.bounds, Math.max(10, ctx.config.frame * 0.2));
    return renderGlass(panel, ctx.theme);
};
