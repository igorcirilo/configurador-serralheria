export const sampleConfigs = {
    mandatoryTwoModule: {
        reference: 'VAO-TESTE-01',
        kind: 'window',
        width: 1600,
        height: 1200,
        finish: 'white',
        viewSide: 'interior',
        dimensionMode: 'full',
        frame: 32,
        leaf: 24,
        glassInset: 10,
        divider: 42,
        style: { frameFill: '#f3f0e8', leafFill: '#f3f0e8', lineColor: '#7f858b' },
        layout: { rows: [1200], cols: [800, 800] },
        cells: [
            { id: 'M1', row: 0, col: 0, type: 'tilt_turn_left', hardware: { handle: true } },
            { id: 'M2', row: 0, col: 1, type: 'fixed' }
        ]
    },
    asymmetric3: {
        kind: 'window', width: 2100, height: 1200, dimensionMode: 'full',
        layout: { rows: [1200], cols: [500, 900, 700] },
        cells: [
            { row: 0, col: 0, type: 'fixed' },
            { row: 0, col: 1, type: 'casement_right' },
            { row: 0, col: 2, type: 'fixed' }
        ]
    },
    horizontalDivision: {
        kind: 'window', width: 1600, height: 1500, dimensionMode: 'full',
        layout: { rows: [300, 1200], cols: [800, 800] },
        cells: [
            { row: 0, col: 0, type: 'fixed' }, { row: 0, col: 1, type: 'fixed' },
            { row: 1, col: 0, type: 'tilt_turn_left' }, { row: 1, col: 1, type: 'fixed' }
        ]
    },
    fixed: {
        kind: 'window',
        width: 1200,
        height: 1200,
        frame: 40,
        leaf: 28,
        glassInset: 18,
        layout: { rows: [1200], cols: [1200] },
        cells: [{ row: 0, col: 0, type: 'fixed' }]
    },
    casementLeft: {
        kind: 'window',
        width: 1200,
        height: 1200,
        frame: 40,
        leaf: 28,
        glassInset: 18,
        layout: { rows: [1200], cols: [1200] },
        cells: [{ row: 0, col: 0, type: 'casement_left', hardware: { handle: true } }]
    },
    sliding2: {
        kind: 'window',
        width: 1600,
        height: 1200,
        frame: 40,
        leaf: 26,
        glassInset: 18,
        layout: { rows: [1200], cols: [1600] },
        cells: [{ row: 0, col: 0, type: 'sliding_2', activeLeaf: 'left' }]
    },
    mixed3: {
        kind: 'window',
        width: 1800,
        height: 1200,
        frame: 40,
        leaf: 30,
        glassInset: 18,
        layout: { rows: [1200], cols: [600, 600, 600] },
        cells: [
            { id: 'A', row: 0, col: 0, type: 'fixed' },
            { id: 'B', row: 0, col: 1, type: 'casement_left' },
            { id: 'C', row: 0, col: 2, type: 'sliding_2', activeLeaf: 'right' }
        ]
    },
    doorRight: {
        kind: 'door',
        width: 1000,
        height: 2200,
        frame: 45,
        leaf: 32,
        glassInset: 22,
        layout: { rows: [2200], cols: [1000] },
        cells: [{ row: 0, col: 0, type: 'casement_right' }]
    }
};
