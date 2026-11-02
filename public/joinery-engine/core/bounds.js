export function rect(x, y, width, height) {
    return { x, y, width, height };
}
export function inset(all) {
    return { top: all, right: all, bottom: all, left: all };
}
export function normalizeInsets(value) {
    if (typeof value === 'number')
        return inset(value);
    return {
        top: value.top ?? 0,
        right: value.right ?? 0,
        bottom: value.bottom ?? 0,
        left: value.left ?? 0
    };
}
