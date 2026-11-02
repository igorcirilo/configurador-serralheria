const defaultTheme = {
    stroke: 2,
    lineColor: '#1b1f23',
    guideColor: '#6b7280',
    glassFill: '#bfe3f5',
    frameFill: '#ffffff',
    leafFill: '#ffffff',
    background: '#ffffff',
    trackColor: '#7c8792'
};
export function resolveJoineryConfig(config) {
    if (!config.width || !config.height)
        throw new Error('Joinery config requires width and height');
    if (!config.layout?.rows?.length || !config.layout?.cols?.length)
        throw new Error('Joinery config requires layout.rows and layout.cols');
    if (!Array.isArray(config.cells))
        throw new Error('Joinery config requires cells array');
    return {
        ...config,
        kind: config.kind ?? 'window',
        quantity: config.quantity ?? 1,
        viewSide: config.viewSide ?? 'interior',
        dimensionMode: config.dimensionMode ?? 'full',
        frame: config.frame ?? 32,
        leaf: config.leaf ?? 24,
        glassInset: config.glassInset ?? 10,
        divider: config.divider ?? 42,
        style: {
            ...defaultTheme,
            ...config.style
        }
    };
}
export function getDefaultTheme() {
    return { ...defaultTheme };
}
