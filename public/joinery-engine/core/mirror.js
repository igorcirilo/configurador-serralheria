export function mirrorPointX(point) {
    return { x: 1 - point.x, y: point.y };
}
export function mirrorPointY(point) {
    return { x: point.x, y: 1 - point.y };
}
export function mirrorRelativePointsX(points) {
    return points.map(mirrorPointX);
}
export function mirrorAbsoluteX(bounds, point) {
    return { x: bounds.x + bounds.width - (point.x - bounds.x), y: point.y };
}
