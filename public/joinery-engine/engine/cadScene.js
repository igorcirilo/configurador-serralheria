import { calculateJoineryGeometry } from './geometryModel.js';
import { openingSegments, slidingArrowSegments } from './symbolGeometry.js';
export const CAD_LAYERS = [
    { name: 'ARO', aci: 7, color: '#ffffff', lineweight: 0.5, linetype: 'CONTINUOUS', description: 'Aro / caixilho exterior' },
    { name: 'MONTANTES', aci: 7, color: '#d8dde3', lineweight: 0.35, linetype: 'CONTINUOUS', description: 'Montantes verticais' },
    { name: 'TRAVESSAS', aci: 7, color: '#d8dde3', lineweight: 0.35, linetype: 'CONTINUOUS', description: 'Travessas horizontais' },
    { name: 'FOLHAS', aci: 1, color: '#ff4d4d', lineweight: 0.35, linetype: 'CONTINUOUS', description: 'Folhas móveis' },
    { name: 'VIDROS', aci: 4, color: '#00ffff', lineweight: 0.18, linetype: 'CONTINUOUS', description: 'Vidro / área envidraçada' },
    { name: 'PAINEIS', aci: 6, color: '#ff00ff', lineweight: 0.18, linetype: 'CONTINUOUS', description: 'Painel opaco de alumínio (porta inteiriça)' },
    { name: 'ABERTURAS', aci: 2, color: '#ffff00', lineweight: 0.18, linetype: 'DASHED', description: 'Simbologia de abertura' },
    { name: 'CALHAS', aci: 8, color: '#8b949e', lineweight: 0.13, linetype: 'HIDDEN', description: 'Calhas de correr' },
    { name: 'COTAS', aci: 3, color: '#00ff00', lineweight: 0.13, linetype: 'CONTINUOUS', description: 'Cotagem' },
    { name: 'TEXTOS', aci: 7, color: '#e6e6e6', lineweight: 0.13, linetype: 'CONTINUOUS', description: 'Legenda e notas técnicas' }
];
/** Geometria de uma cota linear (estilo ISO-25): linha de cota, linhas de chamada, setas e posição do texto. */
export function dimensionGeometry(entity) {
    const th = entity.textHeight;
    const exo = th * 0.25; // afastamento da linha de chamada ao objeto
    const exe = th * 0.5; // prolongamento além da linha de cota
    if (entity.orientation === 'horizontal') {
        const y = entity.at.y;
        const sign1 = Math.sign(y - entity.p1.y) || 1;
        const sign2 = Math.sign(y - entity.p2.y) || 1;
        return {
            dimLine: [{ x: entity.p1.x, y }, { x: entity.p2.x, y }],
            extLines: [
                [{ x: entity.p1.x, y: entity.p1.y + sign1 * exo }, { x: entity.p1.x, y: y + sign1 * exe }],
                [{ x: entity.p2.x, y: entity.p2.y + sign2 * exo }, { x: entity.p2.x, y: y + sign2 * exe }]
            ],
            text: { x: (entity.p1.x + entity.p2.x) / 2, y: y + th * 0.35 },
            rotation: 0
        };
    }
    const x = entity.at.x;
    const sign1 = Math.sign(x - entity.p1.x) || 1;
    const sign2 = Math.sign(x - entity.p2.x) || 1;
    return {
        dimLine: [{ x, y: entity.p1.y }, { x, y: entity.p2.y }],
        extLines: [
            [{ x: entity.p1.x + sign1 * exo, y: entity.p1.y }, { x: x + sign1 * exe, y: entity.p1.y }],
            [{ x: entity.p2.x + sign2 * exo, y: entity.p2.y }, { x: x + sign2 * exe, y: entity.p2.y }]
        ],
        text: { x: x - th * 0.35, y: (entity.p1.y + entity.p2.y) / 2 },
        rotation: 90
    };
}
export function buildCadScene(config, options = {}) {
    const geometry = calculateJoineryGeometry(config);
    const H = geometry.config.height;
    const W = geometry.config.width;
    const entities = [];
    let seq = 0;
    const nextId = (prefix) => `${prefix}${++seq}`;
    // Geometria do motor está em Y para baixo; o mundo CAD tem Y para cima.
    const toWorld = (p) => ({ x: round(p.x), y: round(H - p.y) });
    const rectPoints = (r) => [
        toWorld({ x: r.x, y: r.y + r.height }),
        toWorld({ x: r.x + r.width, y: r.y + r.height }),
        toWorld({ x: r.x + r.width, y: r.y }),
        toWorld({ x: r.x, y: r.y })
    ];
    const addRect = (layer, r, owner) => entities.push({ id: nextId('E'), kind: 'polyline', layer, points: rectPoints(r), closed: true, owner });
    const addLine = (layer, s, owner) => entities.push({ id: nextId('E'), kind: 'line', layer, a: toWorld(s.a), b: toWorld(s.b), owner });
    const infillLayer = geometry.config.leafInfill === 'panel' ? 'PAINEIS' : 'VIDROS';
    addRect('ARO', geometry.outerBounds, 'Aro');
    addRect('ARO', geometry.innerBounds, 'Aro');
    // Uniões a 45º nos cantos do aro, como num alçado de caixilharia.
    const o = geometry.outerBounds;
    const i = geometry.innerBounds;
    addLine('ARO', { a: { x: o.x, y: o.y }, b: { x: i.x, y: i.y } }, 'Aro');
    addLine('ARO', { a: { x: o.x + o.width, y: o.y }, b: { x: i.x + i.width, y: i.y } }, 'Aro');
    addLine('ARO', { a: { x: o.x, y: o.y + o.height }, b: { x: i.x, y: i.y + i.height } }, 'Aro');
    addLine('ARO', { a: { x: o.x + o.width, y: o.y + o.height }, b: { x: i.x + i.width, y: i.y + i.height } }, 'Aro');
    geometry.mullions.forEach((r, index) => addRect('MONTANTES', r, `Montante ${index + 1}`));
    geometry.transoms.forEach((r, index) => addRect('TRAVESSAS', r, `Travessa ${index + 1}`));
    geometry.modules.forEach((module, index) => {
        const owner = `Módulo ${module.cell.id ?? index + 1} · ${module.cell.type}`;
        if (module.slidingLeaves?.length && module.leafBounds) {
            const host = module.leafBounds;
            module.slidingLeaves.forEach((leaf) => {
                const leafOwner = `${owner} · folha ${leaf.id}`;
                addRect('FOLHAS', leaf.bounds, leafOwner);
                addRect(infillLayer, leaf.glassBounds, leafOwner);
                slidingArrowSegments(leaf.bounds, leaf.direction).forEach((s) => addLine('ABERTURAS', s, leafOwner));
                const trackY = host.y + host.height - leaf.track * 10;
                addLine('CALHAS', { a: { x: host.x, y: trackY }, b: { x: host.x + host.width, y: trackY } }, `${owner} · calha ${leaf.track}`);
            });
            return;
        }
        if (module.leafBounds)
            addRect('FOLHAS', module.leafBounds, owner);
        addRect(module.leafBounds ? infillLayer : 'VIDROS', module.glassBounds, owner);
        openingSegments(module, geometry.config.viewSide).forEach((s) => addLine('ABERTURAS', s, owner));
    });
    // Cotagem (estilo ISO-25, escala de cota proporcional ao vão).
    const textHeight = round(Math.max(25, Math.min(80, Math.max(W, H) * 0.022)));
    const gap = textHeight * 2.4;
    if (geometry.config.dimensionMode !== 'none') {
        entities.push({
            id: nextId('D'), kind: 'dimension', layer: 'COTAS', orientation: 'horizontal',
            p1: { x: 0, y: 0 }, p2: { x: W, y: 0 }, at: { x: W / 2, y: -gap * (geometry.config.dimensionMode === 'full' ? 2 : 1) },
            value: W, param: 'width', textHeight
        });
        entities.push({
            id: nextId('D'), kind: 'dimension', layer: 'COTAS', orientation: 'vertical',
            p1: { x: W, y: 0 }, p2: { x: W, y: H }, at: { x: W + gap * (geometry.config.dimensionMode === 'full' ? 2 : 1), y: H / 2 },
            value: H, param: 'height', textHeight
        });
    }
    if (geometry.config.dimensionMode === 'full') {
        const cols = geometry.config.layout.cols;
        if (cols.length > 1) {
            let x = 0;
            cols.forEach((value, index) => {
                entities.push({
                    id: nextId('D'), kind: 'dimension', layer: 'COTAS', orientation: 'horizontal',
                    p1: { x, y: 0 }, p2: { x: x + value, y: 0 }, at: { x: x + value / 2, y: -gap },
                    value, param: `col:${index}`, textHeight
                });
                x += value;
            });
        }
        const rows = geometry.config.layout.rows;
        if (rows.length > 1) {
            let y = H;
            rows.forEach((value, index) => {
                entities.push({
                    id: nextId('D'), kind: 'dimension', layer: 'COTAS', orientation: 'vertical',
                    p1: { x: W, y: y - value }, p2: { x: W, y }, at: { x: W + gap, y: y - value / 2 },
                    value, param: index === 0 ? 'topLight' : undefined, textHeight
                });
                y -= value;
            });
        }
    }
    const margin = gap * 3;
    let minY = -margin;
    // Legenda técnica sob o desenho.
    const notes = [options.title, ...(options.notes ?? [])].filter((line) => Boolean(line && line.trim()));
    if (notes.length) {
        const noteHeight = textHeight * 0.75;
        let y = -gap * (geometry.config.dimensionMode === 'full' ? 3 : 2) - textHeight * 1.5;
        notes.forEach((line, index) => {
            entities.push({ id: nextId('T'), kind: 'text', layer: 'TEXTOS', at: { x: 0, y }, height: index === 0 && options.title ? noteHeight * 1.3 : noteHeight, value: line, owner: 'Legenda' });
            y -= noteHeight * (index === 0 && options.title ? 2.2 : 1.7);
        });
        minY = Math.min(minY, y - noteHeight);
    }
    const longest = notes.reduce((max, line) => Math.max(max, line.length), 0) * textHeight * 0.75 * 0.6;
    return {
        units: 'mm',
        extents: { min: { x: -margin * 0.6, y: minY }, max: { x: Math.max(W + margin, longest), y: H + margin * 0.6 } },
        layers: CAD_LAYERS,
        entities,
        meta: { reference: geometry.config.reference, width: W, height: H, viewSide: geometry.config.viewSide }
    };
}
function round(value) {
    return Math.round(value * 1000) / 1000;
}
