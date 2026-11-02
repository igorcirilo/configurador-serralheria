export function point(x, y) {
    return { x, y };
}
export function round(value, precision = 2) {
    const power = 10 ** precision;
    return Math.round(value * power) / power;
}
export function formatPoint(p) {
    return `${round(p.x)},${round(p.y)}`;
}
