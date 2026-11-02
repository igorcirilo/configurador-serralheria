import { buildCadScene, dimensionGeometry } from './cadScene.js';
/**
 * DXF 2D gerado a partir da mesma cena CAD do viewport (mm, Y para cima).
 * Formato R12 (AC1009): o mais compatível (AutoCAD, BricsCAD, DraftSight, LibreCAD, QCAD).
 * As cotas são exportadas explodidas (linhas, setas SOLID e TEXT) no layer COTAS,
 * para abrirem iguais em qualquer programa sem depender de estilos de cota.
 */
function num(value) {
    const rounded = Math.round(value * 10000) / 10000;
    return Object.is(rounded, -0) ? '0' : String(rounded);
}
/** Caracteres fora de ASCII como \U+XXXX (convenção de texto do AutoCAD). */
function dxfText(value) {
    return [...value].map((char) => {
        const code = char.codePointAt(0);
        return code < 128 ? char : `\\U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
    }).join('');
}
class DxfWriter {
    out = [];
    pair(code, value) { this.out.push(String(code), typeof value === 'number' ? num(value) : value); }
    toString() { return this.out.join('\n'); }
}
const LINETYPES = {
    CONTINUOUS: { description: 'Solid line', pattern: [] },
    DASHED: { description: '__ __ __', pattern: [12, -6] },
    HIDDEN: { description: '_ _ _ _', pattern: [6, -3] }
};
function writeTables(w, scene) {
    w.pair(0, 'SECTION');
    w.pair(2, 'TABLES');
    w.pair(0, 'TABLE');
    w.pair(2, 'LTYPE');
    w.pair(70, Object.keys(LINETYPES).length);
    Object.entries(LINETYPES).forEach(([name, def]) => {
        w.pair(0, 'LTYPE');
        w.pair(2, name);
        w.pair(70, 0);
        w.pair(3, def.description);
        w.pair(72, 65);
        w.pair(73, def.pattern.length);
        w.pair(40, def.pattern.reduce((sum, value) => sum + Math.abs(value), 0));
        def.pattern.forEach((value) => w.pair(49, value));
    });
    w.pair(0, 'ENDTAB');
    w.pair(0, 'TABLE');
    w.pair(2, 'LAYER');
    w.pair(70, scene.layers.length + 1);
    w.pair(0, 'LAYER');
    w.pair(2, '0');
    w.pair(70, 0);
    w.pair(62, 7);
    w.pair(6, 'CONTINUOUS');
    scene.layers.forEach((layer) => {
        w.pair(0, 'LAYER');
        w.pair(2, layer.name);
        w.pair(70, 0);
        w.pair(62, layer.aci);
        w.pair(6, layer.linetype);
    });
    w.pair(0, 'ENDTAB');
    w.pair(0, 'TABLE');
    w.pair(2, 'STYLE');
    w.pair(70, 1);
    w.pair(0, 'STYLE');
    w.pair(2, 'STANDARD');
    w.pair(70, 0);
    w.pair(40, 0);
    w.pair(41, 1);
    w.pair(50, 0);
    w.pair(71, 0);
    w.pair(42, 2.5);
    w.pair(3, 'txt');
    w.pair(4, '');
    w.pair(0, 'ENDTAB');
    w.pair(0, 'ENDSEC');
}
function line(w, layer, a, b) {
    w.pair(0, 'LINE');
    w.pair(8, layer);
    w.pair(10, a.x);
    w.pair(20, a.y);
    w.pair(30, 0);
    w.pair(11, b.x);
    w.pair(21, b.y);
    w.pair(31, 0);
}
function polyline(w, layer, points, closed) {
    w.pair(0, 'POLYLINE');
    w.pair(8, layer);
    w.pair(66, 1);
    w.pair(10, 0);
    w.pair(20, 0);
    w.pair(30, 0);
    w.pair(70, closed ? 1 : 0);
    points.forEach((point) => { w.pair(0, 'VERTEX'); w.pair(8, layer); w.pair(10, point.x); w.pair(20, point.y); w.pair(30, 0); });
    w.pair(0, 'SEQEND');
    w.pair(8, layer);
}
function text(w, layer, at, height, value, rotation = 0, centered = false) {
    w.pair(0, 'TEXT');
    w.pair(8, layer);
    w.pair(10, at.x);
    w.pair(20, at.y);
    w.pair(30, 0);
    w.pair(40, height);
    w.pair(1, dxfText(value));
    if (rotation)
        w.pair(50, rotation);
    if (centered) {
        w.pair(72, 1);
        w.pair(11, at.x);
        w.pair(21, at.y);
        w.pair(31, 0);
    }
}
function arrow(w, layer, tip, towards, size) {
    const angle = Math.atan2(towards.y - tip.y, towards.x - tip.x);
    const spread = 0.17;
    const a = { x: tip.x + size * Math.cos(angle - spread), y: tip.y + size * Math.sin(angle - spread) };
    const b = { x: tip.x + size * Math.cos(angle + spread), y: tip.y + size * Math.sin(angle + spread) };
    // SOLID triangular: o 4.º vértice repete o 3.º.
    w.pair(0, 'SOLID');
    w.pair(8, layer);
    w.pair(10, tip.x);
    w.pair(20, tip.y);
    w.pair(30, 0);
    w.pair(11, a.x);
    w.pair(21, a.y);
    w.pair(31, 0);
    w.pair(12, b.x);
    w.pair(22, b.y);
    w.pair(32, 0);
    w.pair(13, b.x);
    w.pair(23, b.y);
    w.pair(33, 0);
}
function writeEntity(w, entity) {
    switch (entity.kind) {
        case 'line':
            line(w, entity.layer, entity.a, entity.b);
            break;
        case 'polyline':
            polyline(w, entity.layer, entity.points, entity.closed);
            break;
        case 'text':
            text(w, entity.layer, entity.at, entity.height, entity.value);
            break;
        case 'dimension': {
            const g = dimensionGeometry(entity);
            line(w, entity.layer, g.dimLine[0], g.dimLine[1]);
            g.extLines.forEach(([a, b]) => line(w, entity.layer, a, b));
            const [d1, d2] = g.dimLine;
            const size = entity.textHeight * 0.75;
            arrow(w, entity.layer, d1, d2, size);
            arrow(w, entity.layer, d2, d1, size);
            text(w, entity.layer, g.text, entity.textHeight, String(Math.round(entity.value)), g.rotation, true);
            break;
        }
        default: break;
    }
}
export function cadSceneToDxf(scene) {
    const w = new DxfWriter();
    w.pair(999, 'Gerado pelo configurador parametrico - alcado 2D para orcamento (nao e desenho de fabrico)');
    w.pair(0, 'SECTION');
    w.pair(2, 'HEADER');
    w.pair(9, '$ACADVER');
    w.pair(1, 'AC1009');
    w.pair(9, '$EXTMIN');
    w.pair(10, scene.extents.min.x);
    w.pair(20, scene.extents.min.y);
    w.pair(30, 0);
    w.pair(9, '$EXTMAX');
    w.pair(10, scene.extents.max.x);
    w.pair(20, scene.extents.max.y);
    w.pair(30, 0);
    w.pair(9, '$LTSCALE');
    w.pair(40, Math.max(1, Math.max(scene.meta.width, scene.meta.height) * 0.0012));
    w.pair(0, 'ENDSEC');
    writeTables(w, scene);
    w.pair(0, 'SECTION');
    w.pair(2, 'ENTITIES');
    scene.entities.forEach((entity) => writeEntity(w, entity));
    w.pair(0, 'ENDSEC');
    w.pair(0, 'EOF');
    return w.toString();
}
export function renderJoineryDxf(config, options = {}) {
    return cadSceneToDxf(buildCadScene(config, options));
}
