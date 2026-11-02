import { getRegistry } from './registry.js';
export function renderCell(ctx) {
    return getRegistry().get(ctx.cell.type)(ctx);
}
