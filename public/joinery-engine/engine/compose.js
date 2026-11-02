import { rect } from '../core/bounds.js';
import { insetRect, mergeSpan, subdivideRect } from '../core/geometry.js';
import { point } from '../core/points.js';
import { resolveJoineryConfig } from '../models/schema.js';
import { renderFrame } from '../render/frame.js';
import { renderMullion } from '../render/mullion.js';
import { renderTransom } from '../render/transom.js';
import { renderCell } from './renderModule.js';
export function composeJoinery(input) {
    const config = resolveJoineryConfig(input);
    const outerBounds = rect(0, 0, config.width, config.height);
    const innerBounds = insetRect(outerBounds, config.frame);
    const grid = subdivideRect(innerBounds, config.layout.rows, config.layout.cols);
    const nodes = [...renderFrame(outerBounds, config.frame, config.style)];
    for (let rowIndex = 1; rowIndex < grid.length; rowIndex += 1) {
        const y = grid[rowIndex][0].y;
        nodes.push(...renderTransom(point(innerBounds.x, y), point(innerBounds.x + innerBounds.width, y), config.style));
    }
    for (let colIndex = 1; colIndex < grid[0].length; colIndex += 1) {
        const x = grid[0][colIndex].x;
        nodes.push(...renderMullion(point(x, innerBounds.y), point(x, innerBounds.y + innerBounds.height), config.style));
    }
    for (const cell of config.cells) {
        const bounds = mergeSpan(grid, cell.row, cell.col, cell.rowSpan ?? 1, cell.colSpan ?? 1);
        nodes.push(...renderCell({ bounds, cell, config, theme: config.style }));
    }
    return { config, outerBounds, innerBounds, grid, nodes };
}
