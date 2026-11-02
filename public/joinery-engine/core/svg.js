import { formatPoint, round } from './points.js';
function attrs(attributes) {
    return Object.entries(attributes)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}="${String(value)}"`)
        .join(' ');
}
export function svgRect(bounds, attributes = {}) {
    return `<rect ${attrs({ x: round(bounds.x), y: round(bounds.y), width: round(bounds.width), height: round(bounds.height), ...attributes })} />`;
}
export function svgLine(a, b, attributes = {}) {
    return `<line ${attrs({ x1: round(a.x), y1: round(a.y), x2: round(b.x), y2: round(b.y), ...attributes })} />`;
}
export function svgPath(d, attributes = {}) {
    return `<path ${attrs({ d, ...attributes })} />`;
}
export function svgDocument(width, height, children, padding = 24) {
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${-padding} ${-padding} ${width + padding * 2} ${height + padding * 2}" fill="none">`,
        ...children,
        '</svg>'
    ].join('');
}
export function svgPolyline(points, attributes = {}) {
    return `<polyline ${attrs({ points: points.map(formatPoint).join(' '), ...attributes })} />`;
}
