import { normalizeInsets, rect } from './bounds.js';
import { point } from './points.js';
export function insetRect(bounds, value) {
    const insets = normalizeInsets(value);
    return rect(bounds.x + insets.left, bounds.y + insets.top, bounds.width - insets.left - insets.right, bounds.height - insets.top - insets.bottom);
}
export function relativeToAbsolute(bounds, relative) {
    return point(bounds.x + bounds.width * relative.x, bounds.y + bounds.height * relative.y);
}
export function mapRelativePoints(bounds, points) {
    return points.map((p) => relativeToAbsolute(bounds, p));
}
export function subdivideRect(bounds, rows, cols) {
    const rowScale = bounds.height / rows.reduce((sum, value) => sum + value, 0);
    const colScale = bounds.width / cols.reduce((sum, value) => sum + value, 0);
    const rowOffsets = [bounds.y];
    const colOffsets = [bounds.x];
    rows.forEach((row) => rowOffsets.push(rowOffsets[rowOffsets.length - 1] + row * rowScale));
    cols.forEach((col) => colOffsets.push(colOffsets[colOffsets.length - 1] + col * colScale));
    return rows.map((_, rowIndex) => cols.map((__, colIndex) => rect(colOffsets[colIndex], rowOffsets[rowIndex], colOffsets[colIndex + 1] - colOffsets[colIndex], rowOffsets[rowIndex + 1] - rowOffsets[rowIndex])));
}
export function mergeSpan(grid, row, col, rowSpan = 1, colSpan = 1) {
    const start = grid[row]?.[col];
    const end = grid[row + rowSpan - 1]?.[col + colSpan - 1];
    if (!start || !end)
        throw new Error(`Invalid cell span row=${row} col=${col}`);
    return rect(start.x, start.y, end.x + end.width - start.x, end.y + end.height - start.y);
}
