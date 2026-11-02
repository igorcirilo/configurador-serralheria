import { rect } from '../core/bounds.js';
import { insetRect, mergeSpan, subdivideRect } from '../core/geometry.js';
import { resolveJoineryConfig } from '../models/schema.js';
import { validateJoineryConfig } from '../models/validation.js';
function isLeafType(type) {
    return type !== 'fixed';
}
function slidingLeafCount(type) {
    if (type === 'sliding_2')
        return 2;
    if (type === 'sliding_3')
        return 3;
    if (type === 'sliding_4')
        return 4;
    return 0;
}
function slidingGeometry(host, count, activeLeaf, config) {
    const overlap = Math.max(18, Math.min(config.divider * 0.8, host.width * 0.06));
    const leafWidth = (host.width + overlap * (count - 1)) / count;
    // Todas as folhas correm: as das pontas para o centro, a central (3 folhas) para os dois lados.
    const directions = count === 2
        ? ['right', 'left']
        : count === 3
            ? ['right', 'both', 'left']
            : ['right', 'right', 'left', 'left'];
    return Array.from({ length: count }, (_, index) => {
        const bounds = rect(host.x + index * (leafWidth - overlap), host.y, leafWidth, host.height);
        const namedPosition = index === 0 ? 'left' : index === count - 1 ? 'right' : 'center';
        return {
            id: `S${index + 1}`,
            bounds,
            glassBounds: insetRect(bounds, Math.max(12, config.leaf)),
            track: count === 2 ? index + 1 : index + 1,
            direction: directions[index],
            active: activeLeaf ? activeLeaf === namedPosition : directions[index] !== 'fixed',
            overlap
        };
    });
}
// Os módulos são medidos ao eixo dos montantes/travessas; folhas e vidros ficam no vão livre entre perfis.
function clearOpening(bounds, inner, divider) {
    const eps = 0.5;
    const half = divider / 2;
    return insetRect(bounds, {
        left: bounds.x > inner.x + eps ? half : 0,
        right: bounds.x + bounds.width < inner.x + inner.width - eps ? half : 0,
        top: bounds.y > inner.y + eps ? half : 0,
        bottom: bounds.y + bounds.height < inner.y + inner.height - eps ? half : 0
    });
}
function moduleGeometry(bounds, inner, cell, config) {
    const moduleGap = Math.max(5, config.frame * 0.14);
    const opening = clearOpening(bounds, inner, config.divider);
    const leafBounds = isLeafType(cell.type) ? insetRect(opening, moduleGap) : null;
    const glassHost = leafBounds ?? opening;
    const glassInset = leafBounds ? config.leaf + config.glassInset : config.glassInset;
    const slidingCount = slidingLeafCount(cell.type);
    return {
        cell,
        bounds,
        leafBounds,
        glassBounds: insetRect(glassHost, Math.max(5, glassInset)),
        slidingLeaves: slidingCount && leafBounds ? slidingGeometry(leafBounds, slidingCount, cell.activeLeaf, config) : undefined
    };
}
export function calculateJoineryGeometry(input) {
    const validation = validateJoineryConfig(input);
    if (!validation.valid)
        throw new Error(validation.errors.join(' '));
    const config = resolveJoineryConfig(input);
    const outerBounds = rect(0, 0, config.width, config.height);
    const innerBounds = insetRect(outerBounds, config.frame);
    const grid = subdivideRect(innerBounds, config.layout.rows, config.layout.cols);
    const mullions = [];
    const transoms = [];
    for (let colIndex = 1; colIndex < grid[0].length; colIndex += 1) {
        const x = grid[0][colIndex].x - config.divider / 2;
        mullions.push(rect(x, innerBounds.y, config.divider, innerBounds.height));
    }
    for (let rowIndex = 1; rowIndex < grid.length; rowIndex += 1) {
        const y = grid[rowIndex][0].y - config.divider / 2;
        transoms.push(rect(innerBounds.x, y, innerBounds.width, config.divider));
    }
    const modules = config.cells.map((cell) => moduleGeometry(mergeSpan(grid, cell.row, cell.col, cell.rowSpan ?? 1, cell.colSpan ?? 1), innerBounds, cell, config));
    return { config, outerBounds, innerBounds, grid, modules, mullions, transoms };
}
