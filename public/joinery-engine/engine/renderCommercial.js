import { calculateJoineryGeometry } from './geometryModel.js';
import { openingSegments } from './symbolGeometry.js';
/**
 * Vista comercial "de catálogo": alçado frontal com leve projeção oblíqua (profundidade do aro
 * visível à esquerda), perfis com volume em meia-esquadria, junta de vidro, dobradiças e puxador.
 * Luz vinda de cima/esquerda: gradientes por face, sombras de contacto e reflexos no vidro.
 * A face frontal mantém-se ortogonal para que as proporções continuem fiéis às medidas.
 */
let svgSequence = 0;
function n(value) { return String(Math.round(value * 100) / 100); }
function rectNode(bounds, attrs) {
    return `<rect x="${n(bounds.x)}" y="${n(bounds.y)}" width="${n(bounds.width)}" height="${n(bounds.height)}" ${attrs}/>`;
}
function poly(points, attrs) {
    return `<polygon points="${points.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}" ${attrs}/>`;
}
function inset(bounds, value) {
    const width = Math.max(0, bounds.width - value * 2);
    const height = Math.max(0, bounds.height - value * 2);
    return { x: bounds.x + (bounds.width - width) / 2, y: bounds.y + (bounds.height - height) / 2, width, height };
}
const uniform = (value) => ({ top: value, right: value, bottom: value, left: value });
function insetSides(bounds, faces) {
    const width = Math.max(0, bounds.width - faces.left - faces.right);
    const height = Math.max(0, bounds.height - faces.top - faces.bottom);
    return { x: bounds.x + faces.left, y: bounds.y + faces.top, width, height };
}
function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.padEnd(6, '0').slice(0, 6);
    const value = parseInt(full, 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
/** amount > 0 mistura com branco, amount < 0 com preto. */
function shade(hex, amount) {
    const target = amount >= 0 ? 255 : 0;
    const t = Math.min(1, Math.abs(amount));
    const [r, g, b] = hexToRgb(hex).map((c) => Math.round(c + (target - c) * t));
    return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
function isDark(hex) {
    const [r, g, b] = hexToRgb(hex);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110;
}
function palette(base, metallic = false) {
    const dark = isDark(base);
    // Luz de cima/esquerda: o topo recebe mais luz, a base fica na sombra.
    const k = dark ? 1.4 : 1;
    return {
        base,
        dark,
        metallic,
        faces: {
            top: shade(base, dark ? 0.14 : 0.5),
            left: shade(base, dark ? 0.07 : 0.28),
            right: shade(base, -0.05 * k),
            bottom: shade(base, -0.08 * k)
        },
        edge: shade(base, dark ? -0.5 : -0.32),
        mitre: shade(base, dark ? -0.35 : -0.16),
        side: shade(base, dark ? -0.18 : -0.09),
        sideBack: shade(base, dark ? -0.42 : -0.26),
        reveal: shade(base, dark ? -0.32 : -0.2),
        gasket: dark ? '#121418' : '#6e747a'
    };
}
const HUE_TINT = {
    neutral: '#c9e2e6',
    blue: '#b9d2e6',
    silver: '#c9d3db',
    grey: '#adb7be',
    green: '#cbe2d6',
    bronze: '#d8c6b2'
};
/** Material do vidro a partir da transmissão, reflexão e tom do produto escolhido. */
function glassLook(appearance, fallbackTint) {
    if (appearance?.satin) {
        return { stops: [[0, '#f3f6f7'], [0.5, '#eaeff1'], [1, '#e0e7ea']], side: 0.05, sheenA: 0.12, sheenB: 0.06, satin: true };
    }
    const tint = appearance ? HUE_TINT[appearance.hue] : shade(fallbackTint, 0.45);
    const transmission = appearance?.transmission ?? 0.8;
    const reflection = appearance?.reflection ?? 0.12;
    const dark = Math.max(0, Math.min(1, (0.82 - transmission) / 0.4)) * 0.55;
    const strength = Math.max(0.35, Math.min(1.25, reflection / 0.2));
    const c = (amount) => shade(tint, amount - dark);
    const h = 0.03 + 0.05 * strength;
    const stops = [
        [0, c(0.45 - h)],
        [0.32, c(0.72)],
        [0.55, c(0.78)],
        [0.64, shade(c(0.62), -h * 0.6)],
        [0.82, c(0.68)],
        [1, shade(c(0.55), -0.03)]
    ];
    return {
        stops,
        side: 0.04 + dark * 0.15,
        sheenA: Math.min(0.6, 0.3 * strength + 0.12),
        sheenB: Math.min(0.42, 0.2 * strength + 0.08),
        satin: false
    };
}
const id = (ctx, name) => `cm${ctx.seq}${name}`;
/** Gradientes de perfil: cada face tem relevo ao longo da espessura (aresta, face, ranhura do bite). */
function profileGradients(ctx) {
    const { p } = ctx;
    const vectors = {
        top: 'x1="0" y1="0" x2="0" y2="1"',
        bottom: 'x1="0" y1="1" x2="0" y2="0"',
        left: 'x1="0" y1="0" x2="1" y2="0"',
        right: 'x1="1" y1="0" x2="0" y2="0"'
    };
    return Object.keys(vectors).map((side) => {
        const face = p.faces[side];
        const lit = side === 'top' || side === 'left';
        const outerEdge = lit ? shade(face, p.dark ? 0.35 : 0.75) : shade(face, p.dark ? -0.35 : -0.18);
        const stops = p.metallic
            // Anodizado: reflexo especular estreito e contraste forte ao longo da secção.
            ? [
                [0, outerEdge],
                [0.05, shade(face, -0.08)],
                [0.2, shade(face, lit ? 0.62 : 0.4)],
                [0.3, shade(face, 0.18)],
                [0.52, shade(face, -0.16)],
                [0.7, shade(face, 0.05)],
                [0.78, shade(face, lit ? 0.35 : 0.18)],
                [0.83, shade(face, -0.42)],
                [0.88, shade(face, lit ? 0.45 : 0.15)],
                [1, shade(face, -0.12)]
            ]
            : [
                [0, outerEdge],
                [0.05, face],
                [0.45, shade(face, p.dark ? 0.05 : 0.12)],
                [0.78, face],
                [0.83, shade(face, p.dark ? -0.45 : -0.2)],
                [0.88, shade(face, lit ? (p.dark ? 0.1 : 0.4) : (p.dark ? 0.02 : 0.1))],
                [1, shade(face, p.dark ? -0.15 : -0.06)]
            ];
        return `<linearGradient id="${id(ctx, `pf${side}`)}" ${vectors[side]}>${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
    }).join('');
}
/** Moldura em meia-esquadria: quatro trapézios com relevo e linhas de corte a 45º. */
function mitredRing(ctx, outer, face) {
    const i = insetSides(outer, typeof face === 'number' ? uniform(face) : face);
    const o = outer;
    const ox2 = o.x + o.width;
    const oy2 = o.y + o.height;
    const ix2 = i.x + i.width;
    const iy2 = i.y + i.height;
    const attrs = (side) => `fill="url(#${id(ctx, `pf${side}`)})"`;
    const mitre = `stroke="${ctx.p.mitre}" stroke-width="0.6" vector-effect="non-scaling-stroke" opacity=".8"`;
    return [
        poly([[o.x, o.y], [ox2, o.y], [ix2, i.y], [i.x, i.y]], attrs('top')),
        poly([[o.x, o.y], [i.x, i.y], [i.x, iy2], [o.x, oy2]], attrs('left')),
        poly([[ox2, o.y], [ox2, oy2], [ix2, iy2], [ix2, i.y]], attrs('right')),
        poly([[o.x, oy2], [i.x, iy2], [ix2, iy2], [ox2, oy2]], attrs('bottom')),
        `<path d="M ${n(o.x)} ${n(o.y)} L ${n(i.x)} ${n(i.y)} M ${n(ox2)} ${n(o.y)} L ${n(ix2)} ${n(i.y)} M ${n(o.x)} ${n(oy2)} L ${n(i.x)} ${n(iy2)} M ${n(ox2)} ${n(oy2)} L ${n(ix2)} ${n(iy2)}" ${mitre}/>`,
        rectNode(o, `fill="none" stroke="${ctx.p.edge}" stroke-width="0.8" vector-effect="non-scaling-stroke"`)
    ].join('');
}
/** Montante/travessa: mesmo relevo dos perfis, em secção simétrica. */
function bar(ctx, bounds, vertical) {
    const gid = id(ctx, `bar${vertical ? 'v' : 'h'}`);
    if (!ctx.defs.some((d) => d.includes(`id="${gid}"`))) {
        const { p } = ctx;
        const a = vertical ? p.faces.left : p.faces.top;
        const b = vertical ? p.faces.right : p.faces.bottom;
        const vector = vertical ? 'x1="0" y1="0" x2="1" y2="0"' : 'x1="0" y1="0" x2="0" y2="1"';
        ctx.defs.push(p.metallic
            ? `<linearGradient id="${gid}" ${vector}>
      <stop offset="0" stop-color="${shade(a, -0.25)}"/><stop offset=".1" stop-color="${shade(a, 0.5)}"/>
      <stop offset=".24" stop-color="${shade(a, 0.1)}"/><stop offset=".45" stop-color="${shade(p.base, -0.12)}"/>
      <stop offset=".62" stop-color="${shade(p.base, 0.3)}"/><stop offset=".8" stop-color="${b}"/>
      <stop offset=".92" stop-color="${shade(b, -0.3)}"/><stop offset="1" stop-color="${shade(b, 0.2)}"/>
    </linearGradient>`
            : `<linearGradient id="${gid}" ${vector}>
      <stop offset="0" stop-color="${shade(a, p.dark ? -0.3 : -0.14)}"/><stop offset=".08" stop-color="${shade(a, p.dark ? 0.12 : 0.4)}"/>
      <stop offset=".16" stop-color="${a}"/><stop offset=".5" stop-color="${shade(p.base, p.dark ? 0.06 : 0.3)}"/>
      <stop offset=".84" stop-color="${b}"/><stop offset=".92" stop-color="${shade(b, p.dark ? -0.3 : -0.12)}"/><stop offset="1" stop-color="${shade(b, p.dark ? 0.05 : 0.2)}"/>
    </linearGradient>`);
    }
    return rectNode(bounds, `fill="url(#${gid})" stroke="${ctx.p.edge}" stroke-width="0.6" vector-effect="non-scaling-stroke"`);
}
/** Interior do vão em ligeira perspetiva: face interior do lado direito e do topo. */
function reveal(ctx, opening, depth) {
    const r = Math.min(depth * 0.32, opening.width * 0.08);
    const t = r * 0.45;
    const x2 = opening.x + opening.width;
    const y2 = opening.y + opening.height;
    return [
        poly([[x2, opening.y], [x2, y2], [x2 - r, y2 - t * 0.2], [x2 - r, opening.y + t]], `fill="url(#${id(ctx, 'revealR')})"`),
        poly([[opening.x, opening.y], [x2, opening.y], [x2 - r, opening.y + t], [opening.x, opening.y + t]], `fill="${ctx.p.reveal}" opacity=".5"`)
    ].join('');
}
/** Vidro: junta, reflexo de céu/horizonte, brilho diagonal e sombra do bite no vidro. */
/**
 * Painel de alumínio (porta inteiriça): chapa na cor do perfil, rebaixada no aro da folha,
 * com frisos horizontais e o mesmo jogo de luz dos perfis.
 */
function panel(ctx, bounds) {
    const { p } = ctx;
    const gid = id(ctx, 'panel');
    if (!ctx.defs.some((d) => d.includes(`id="${gid}"`))) {
        ctx.defs.push(p.metallic
            ? `<linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(p.base, 0.35)}"/><stop offset=".35" stop-color="${shade(p.base, -0.05)}"/><stop offset=".6" stop-color="${shade(p.base, 0.22)}"/><stop offset="1" stop-color="${shade(p.base, -0.14)}"/></linearGradient>`
            : `<linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(p.base, p.dark ? 0.08 : 0.35)}"/><stop offset=".6" stop-color="${p.base}"/><stop offset="1" stop-color="${shade(p.base, p.dark ? -0.12 : -0.07)}"/></linearGradient>`);
    }
    const lip = Math.max(6, Math.min(14, bounds.width * 0.02));
    const inner = inset(bounds, lip);
    const light = shade(p.base, p.dark ? 0.25 : 0.7);
    const dark = shade(p.base, p.dark ? -0.45 : -0.22);
    const line = 'vector-effect="non-scaling-stroke"';
    // Frisos horizontais espaçados ~ 1/7 da altura, longe das travessas.
    const grooves = Array.from({ length: 5 }, (_, i) => inner.y + inner.height * (0.2 + i * 0.15));
    return [
        rectNode(bounds, `fill="${dark}"`),
        rectNode(inner, `fill="url(#${gid})"`),
        // Rebaixo: sombra em cima/esquerda, luz em baixo/direita (o painel fica atrás do aro da folha).
        `<path d="M ${n(inner.x)} ${n(inner.y + inner.height)} V ${n(inner.y)} H ${n(inner.x + inner.width)}" fill="none" stroke="${dark}" stroke-width="1.4" ${line}/>`,
        `<path d="M ${n(inner.x)} ${n(inner.y + inner.height)} H ${n(inner.x + inner.width)} V ${n(inner.y)}" fill="none" stroke="${light}" stroke-width="1.2" ${line}/>`,
        rectNode({ x: inner.x, y: inner.y, width: inner.width, height: ctx.unit * 1.5 }, `fill="#0f1a22" opacity=".18" filter="url(#${id(ctx, 'blurXS')})"`),
        ...grooves.map((gy) => `<line x1="${n(inner.x + lip)}" y1="${n(gy)}" x2="${n(inner.x + inner.width - lip)}" y2="${n(gy)}" stroke="${dark}" stroke-width="1.2" ${line}/><line x1="${n(inner.x + lip)}" y1="${n(gy + ctx.unit * 0.5)}" x2="${n(inner.x + inner.width - lip)}" y2="${n(gy + ctx.unit * 0.5)}" stroke="${light}" stroke-width="1" ${line}/>`)
    ].join('');
}
/** Enchimento de uma folha móvel: painel (porta inteiriça) ou vidro. */
function leafInfill(ctx, bounds) {
    return ctx.panelLeaves ? panel(ctx, bounds) : glass(ctx, bounds);
}
function glass(ctx, bounds) {
    const gasket = Math.max(6, Math.min(11, Math.min(bounds.width, bounds.height) * 0.014));
    const pane = inset(bounds, gasket);
    const clipId = id(ctx, `clip${++ctx.clip}`);
    const u = ctx.unit;
    const sheenA = `M ${n(pane.x + pane.width * 0.08)} ${n(pane.y - u)} L ${n(pane.x + pane.width * 0.36)} ${n(pane.y - u)} L ${n(pane.x - pane.width * 0.02)} ${n(pane.y + pane.height * 0.78)} L ${n(pane.x - pane.width * 0.3)} ${n(pane.y + pane.height * 0.78)} Z`;
    const sheenB = `M ${n(pane.x + pane.width * 0.44)} ${n(pane.y - u)} L ${n(pane.x + pane.width * 0.52)} ${n(pane.y - u)} L ${n(pane.x + pane.width * 0.14)} ${n(pane.y + pane.height * 0.78)} L ${n(pane.x + pane.width * 0.06)} ${n(pane.y + pane.height * 0.78)} Z`;
    const shadowWidth = gasket * 2.6;
    return [
        `<clipPath id="${clipId}">${rectNode(pane, '')}</clipPath>`,
        rectNode(bounds, `fill="${ctx.p.gasket}"`),
        rectNode({ x: bounds.x, y: bounds.y, width: bounds.width, height: gasket * 0.35 }, `fill="#000" opacity=".25"`),
        `<g clip-path="url(#${clipId})">`,
        rectNode(pane, `fill="url(#${id(ctx, 'glass')})"`),
        rectNode(pane, `fill="url(#${id(ctx, 'glassSide')})"`),
        `<path d="${sheenA}" fill="#ffffff" opacity="${n(ctx.look.sheenA)}" filter="url(#${id(ctx, 'blurM')})"/>`,
        `<path d="${sheenB}" fill="#ffffff" opacity="${n(ctx.look.sheenB)}" filter="url(#${id(ctx, 'blurM')})"/>`,
        // Sombra projetada pelo bite superior/esquerdo sobre o vidro.
        rectNode({ x: pane.x - shadowWidth / 2 + gasket * 0.5, y: pane.y - shadowWidth / 2 + gasket * 0.8, width: pane.width + shadowWidth, height: pane.height + shadowWidth }, `fill="none" stroke="#1d2a33" stroke-width="${n(shadowWidth)}" opacity=".22" filter="url(#${id(ctx, 'blurS')})"`),
        '</g>',
        rectNode(inset(pane, 0.5), `fill="none" stroke="rgba(255,255,255,.8)" stroke-width="0.8" vector-effect="non-scaling-stroke"`)
    ].join('');
}
/** Sombra suave projetada por uma peça saliente (folha) sobre o que está atrás. */
function castShadow(ctx, bounds, strength = 0.28) {
    const u = ctx.unit;
    return rectNode({ x: bounds.x + u * 0.6, y: bounds.y + u * 0.6, width: bounds.width, height: bounds.height }, `fill="#0f1a22" opacity="${strength}" filter="url(#${id(ctx, 'blurS')})"`);
}
function hinge(ctx, x, y, size) {
    const w = size * 0.22;
    const h = size;
    const cap = w * 0.28;
    return [
        rectNode({ x: x - w / 2 + ctx.unit * 0.3, y: y + ctx.unit * 0.6, width: w, height: h }, `fill="#000" opacity=".25" rx="${n(w / 2)}" filter="url(#${id(ctx, 'blurXS')})"`),
        rectNode({ x: x - w / 2, y, width: w, height: h }, `fill="url(#${id(ctx, 'metalX')})" rx="${n(w / 2)}" stroke="#6d757c" stroke-width="0.6" vector-effect="non-scaling-stroke"`),
        rectNode({ x: x - w / 2, y, width: w, height: cap }, `fill="#8c949b" rx="${n(w / 2)}"`),
        rectNode({ x: x - w / 2, y: y + h - cap, width: w, height: cap }, `fill="#7a8289" rx="${n(w / 2)}"`),
        `<line x1="${n(x - w / 2)}" y1="${n(y + h / 2)}" x2="${n(x + w / 2)}" y2="${n(y + h / 2)}" stroke="#5f666d" stroke-width="0.8" vector-effect="non-scaling-stroke"/>`
    ].join('');
}
/**
 * Manípulo com espelho.
 * - Janela: alavanca vertical, a apontar para baixo (ou horizontal nas basculantes/projetantes).
 * - Porta (`doorLever` = -1 esquerda / 1 direita): espelho vertical alongado com canhão de chave
 *   e alavanca horizontal, virada para o centro da folha (lado das dobradiças).
 */
function leverHandle(ctx, x, y, scale, horizontal = false, doorLever = 0) {
    const door = doorLever !== 0;
    const rose = { w: (door ? 38 : 30) * scale, h: (door ? 230 : 74) * scale };
    const lever = { w: 17 * scale, l: (door ? 145 : 130) * scale };
    const roseRect = horizontal
        ? { x: x - rose.h / 2, y: y - rose.w / 2, width: rose.h, height: rose.w }
        : { x: x - rose.w / 2, y: y - rose.h * (door ? 0.22 : 0.5), width: rose.w, height: rose.h };
    const leverRect = horizontal
        ? { x, y: y - lever.w / 2, width: lever.l, height: lever.w }
        : door
            ? { x: doorLever > 0 ? x : x - lever.l, y: y - lever.w / 2, width: lever.l, height: lever.w }
            : { x: x - lever.w / 2, y, width: lever.w, height: lever.l };
    const u = ctx.unit;
    const shadow = (r, rx) => rectNode({ ...r, x: r.x + u * 0.5, y: r.y + u * 1.1 }, `fill="#000" opacity=".3" rx="${n(rx)}" filter="url(#${id(ctx, 'blurXS')})"`);
    const metal = `fill="url(#${id(ctx, 'metal')})" stroke="#6a7279" stroke-width="0.6" vector-effect="non-scaling-stroke"`;
    const shine = (x1, y1, x2, y2) => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="#fff" stroke-width="1" vector-effect="non-scaling-stroke" opacity=".85"/>`;
    const highlight = horizontal || door
        ? shine(leverRect.x + lever.w * 0.6, y - lever.w * 0.22, leverRect.x + leverRect.width - lever.w * 0.6, y - lever.w * 0.22)
        : shine(x - lever.w * 0.22, y + lever.w, x - lever.w * 0.22, y + lever.l - lever.w * 0.5);
    const keyY = roseRect.y + roseRect.height * 0.78;
    return [
        shadow(roseRect, rose.w / 2), shadow(leverRect, lever.w / 2),
        rectNode(roseRect, `${metal} rx="${n(rose.w / 2)}"`),
        rectNode(leverRect, `${metal} rx="${n(lever.w / 2)}"`),
        `<circle cx="${n(x)}" cy="${n(y)}" r="${n(lever.w * 0.62)}" ${metal}/>`,
        highlight,
        door ? `<circle cx="${n(x)}" cy="${n(keyY)}" r="${n(rose.w * 0.22)}" fill="#59616a"/><rect x="${n(x - rose.w * 0.05)}" y="${n(keyY)}" width="${n(rose.w * 0.1)}" height="${n(rose.w * 0.4)}" fill="#59616a"/>` : ''
    ].join('');
}
function pullHandle(ctx, x, y, height, scale) {
    const w = 16 * scale;
    const r = { x: x - w / 2, y: y - height / 2, width: w, height };
    return [
        rectNode({ ...r, x: r.x + ctx.unit * 0.4, y: r.y + ctx.unit * 0.9 }, `fill="#000" opacity=".28" rx="${n(w / 2)}" filter="url(#${id(ctx, 'blurXS')})"`),
        rectNode(r, `fill="url(#${id(ctx, 'metalX')})" rx="${n(w / 2)}" stroke="#6a7279" stroke-width="0.6" vector-effect="non-scaling-stroke"`)
    ].join('');
}
function hingeSide(module, config) {
    const type = module.cell.type;
    const mirror = (config.viewSide === 'exterior') !== Boolean(module.cell.mirrorX);
    const flip = (side) => (mirror ? (side === 'left' ? 'right' : 'left') : side);
    if (type === 'casement_left' || type === 'tilt_turn_left')
        return flip('left');
    if (type === 'casement_right' || type === 'tilt_turn_right')
        return flip('right');
    if (type === 'awning')
        return 'top';
    if (type === 'hopper')
        return 'bottom';
    return null;
}
/** Folha batente/oscilobatente/basculante: aro da folha, vidro, dobradiças e puxador. */
function leafFaces(config, face, leaf) {
    // Folha de porta: travessa inferior alta (rodapé), como nas séries de portas.
    return config.kind === 'door' ? { ...uniform(face), bottom: Math.min(Math.max(face * 2.4, 130), leaf.height * 0.2) } : uniform(face);
}
/** Altura do manípulo de porta: ~1050 mm acima do pavimento (y = altura do vão). */
function doorHandleY(config, leaf) {
    return Math.min(Math.max(config.height - 1050, leaf.y + leaf.height * 0.3), leaf.y + leaf.height * 0.7);
}
function swingLeaf(ctx, leaf, side, config, showHandle, faceWidth) {
    const scale = Math.max(0.6, Math.min(1.15, Math.min(leaf.width, leaf.height) / 700));
    const faces = leafFaces(config, faceWidth, leaf);
    const nodes = [
        '<g class="leaf-frame">',
        castShadow(ctx, leaf),
        mitredRing(ctx, leaf, faces),
        leafInfill(ctx, insetSides(leaf, faces))
    ];
    const hingeSize = 100 * scale;
    if (side === 'left' || side === 'right') {
        const x = side === 'left' ? leaf.x : leaf.x + leaf.width;
        ctx.overlay.push(hinge(ctx, x, leaf.y + leaf.height * 0.09, hingeSize), hinge(ctx, x, leaf.y + leaf.height * 0.91 - hingeSize, hingeSize));
        if (showHandle) {
            const hx = side === 'left' ? leaf.x + leaf.width - faceWidth / 2 : leaf.x + faceWidth / 2;
            const door = config.kind === 'door';
            nodes.push(leverHandle(ctx, hx, door ? doorHandleY(config, leaf) : leaf.y + leaf.height / 2, scale, false, door ? (side === 'left' ? -1 : 1) : 0));
        }
    }
    else if (side === 'top' || side === 'bottom') {
        const y = side === 'top' ? leaf.y : leaf.y + leaf.height;
        [0.12, 0.88].forEach((t) => {
            const cx = leaf.x + leaf.width * t;
            ctx.overlay.push(`<g transform="rotate(90 ${n(cx)} ${n(y)})">${hinge(ctx, cx, y - hingeSize / 2, hingeSize)}</g>`);
        });
        if (showHandle) {
            const hy = side === 'top' ? leaf.y + leaf.height - faceWidth / 2 : leaf.y + faceWidth / 2;
            nodes.push(leverHandle(ctx, leaf.x + leaf.width / 2, hy, scale, true));
        }
    }
    nodes.push('</g>');
    return nodes.join('');
}
function renderModule(ctx, module, opening, config, depth) {
    const type = module.cell.type;
    const interior = config.viewSide === 'interior';
    const gap = Math.max(4, config.frame * 0.12);
    // Perfis reais não encolhem, mas em vãos muito pequenos limitamos para manter vidro visível.
    const face = Math.min(Math.max(48, config.leaf + config.glassInset, Math.min(72, Math.min(opening.width, opening.height) * 0.07)), Math.min(opening.width, opening.height) * 0.26);
    if (type === 'fixed' || !module.leafBounds) {
        const bead = Math.max(10, config.glassInset);
        return `${reveal(ctx, opening, depth)}${glass(ctx, inset(opening, bead))}`;
    }
    const leafArea = inset(opening, gap);
    const nodes = [rectNode(opening, `fill="${ctx.p.reveal}"`)];
    if (config.commercial?.openingSymbols)
        ctx.overlay.push(openingSymbol(module, leafArea, config));
    if (module.slidingLeaves?.length) {
        return nodes.join('') + slidingModule(ctx, module, opening, config, face, gap);
    }
    if (type === 'double_casement') {
        const half = leafArea.width / 2;
        const left = { ...leafArea, width: half - gap / 2 };
        const right = { ...leafArea, x: leafArea.x + half + gap / 2, width: half - gap / 2 };
        nodes.push(swingLeaf(ctx, left, interior ? 'left' : 'right', config, false, face));
        nodes.push(swingLeaf(ctx, right, interior ? 'right' : 'left', config, false, face));
        if (interior) {
            const door = config.kind === 'door';
            nodes.push(leverHandle(ctx, right.x + face / 2, door ? doorHandleY(config, right) : right.y + right.height / 2, Math.max(0.6, Math.min(1.15, right.height / 1200)), false, door ? 1 : 0));
        }
        return nodes.join('');
    }
    if (type === 'pivot_vertical') {
        nodes.push(swingLeaf(ctx, leafArea, null, config, false, face));
        const cx = leafArea.x + leafArea.width / 2;
        nodes.push(`<circle cx="${n(cx)}" cy="${n(leafArea.y + face / 2)}" r="${n(face * 0.18)}" fill="url(#${id(ctx, 'metalX')})"/><circle cx="${n(cx)}" cy="${n(leafArea.y + leafArea.height - face / 2)}" r="${n(face * 0.18)}" fill="url(#${id(ctx, 'metalX')})"/>`);
        if (interior)
            nodes.push(leverHandle(ctx, leafArea.x + leafArea.width - face / 2, leafArea.y + leafArea.height / 2, Math.max(0.6, Math.min(1.15, leafArea.height / 1200))));
        return nodes.join('');
    }
    nodes.push(swingLeaf(ctx, leafArea, hingeSide(module, config), config, interior, face));
    return nodes.join('');
}
/**
 * Correr: calha inferior e guia superior visíveis, folhas em planos diferentes (a da frente
 * projeta sombra sobre a de trás) e montantes de encontro mais largos onde as folhas se sobrepõem.
 */
function slidingModule(ctx, module, opening, config, face, gap) {
    const leavesData = module.slidingLeaves;
    const nodes = [];
    const railH = Math.min(Math.max(26, face * 0.55), opening.height * 0.08);
    const guideH = railH * 0.45;
    const rail = { x: opening.x, y: opening.y + opening.height - railH, width: opening.width, height: railH };
    const guide = { x: opening.x, y: opening.y, width: opening.width, height: guideH };
    const area = { x: opening.x + gap, y: opening.y + guideH, width: opening.width - gap * 2, height: opening.height - railH - guideH };
    const original = module.leafBounds;
    const sx = area.width / original.width;
    const scale = Math.max(0.6, Math.min(1.1, area.height / 1200));
    const leafFace = face * 0.85;
    const interlock = leafFace * 1.35;
    const door = config.kind === 'door';
    const placed = leavesData.map((leaf, index) => ({
        leaf,
        index,
        bounds: { x: area.x + (leaf.bounds.x - original.x) * sx, y: area.y, width: leaf.bounds.width * sx, height: area.height }
    }));
    // Calhas: uma ranhura por folha, vistas de frente como linhas na soleira.
    nodes.push(bar(ctx, guide, false), bar(ctx, rail, false));
    const tracks = Math.max(...leavesData.map((leaf) => leaf.track));
    for (let t = 1; t <= tracks; t += 1) {
        const y = rail.y + (rail.height * t) / (tracks + 1);
        nodes.push(`<line x1="${n(rail.x)}" y1="${n(y)}" x2="${n(rail.x + rail.width)}" y2="${n(y)}" stroke="${ctx.p.mitre}" stroke-width="0.8" vector-effect="non-scaling-stroke" opacity=".8"/>`);
    }
    const handles = [];
    // Das folhas de trás para a frente.
    [...placed].sort((a, b) => b.leaf.track - a.leaf.track).forEach(({ leaf, index, bounds }) => {
        const left = placed[index - 1];
        const right = placed[index + 1];
        const faces = {
            top: leafFace,
            bottom: door ? Math.min(Math.max(leafFace * 2, 110), bounds.height * 0.18) : leafFace,
            left: left ? interlock : leafFace,
            right: right ? interlock : leafFace
        };
        nodes.push('<g class="leaf-frame">', castShadow(ctx, bounds, 0.24));
        nodes.push(mitredRing(ctx, bounds, faces), leafInfill(ctx, insetSides(bounds, faces)));
        if (leaf.track > 1)
            nodes.push(rectNode(insetSides(bounds, faces), 'fill="#0f1a22" opacity=".06"'));
        // Sombra de contacto sobre a folha vizinha que está atrás.
        [[left, bounds.x], [right, bounds.x + bounds.width]].forEach(([neighbour, edgeX]) => {
            const other = neighbour;
            if (!other || other.leaf.track <= leaf.track)
                return;
            const w = ctx.unit * 3;
            const x = edgeX === bounds.x ? bounds.x - w * 0.6 : edgeX - w * 0.4;
            nodes.push(rectNode({ x, y: bounds.y, width: w, height: bounds.height }, `fill="#0f1a22" opacity=".32" filter="url(#${id(ctx, 'blurS')})"`));
        });
        const side = closureSide(placed.length, index);
        if (side && leaf.direction !== 'fixed') {
            // Se o montante do fecho estiver parcialmente tapado pela folha da frente, o puxador fica na parte visível.
            const neighbour = side === 'left' ? left : right;
            const covered = neighbour && neighbour.leaf.track < leaf.track;
            const stileStart = side === 'left' ? bounds.x : bounds.x + bounds.width - faces.right;
            const stileEnd = side === 'left' ? bounds.x + faces.left : bounds.x + bounds.width;
            const hx = covered
                ? (side === 'left' ? (neighbour.bounds.x + neighbour.bounds.width + stileEnd) / 2 : (stileStart + neighbour.bounds.x) / 2)
                : (stileStart + stileEnd) / 2;
            const hy = door ? doorHandleY(config, bounds) : bounds.y + bounds.height / 2;
            handles.push(pullHandle(ctx, hx, hy, Math.min(door ? 420 : 300, bounds.height * 0.22), scale));
        }
        nodes.push('</g>');
    });
    // Puxadores no fim, para nenhum ficar por baixo de uma folha desenhada depois.
    return nodes.join('') + handles.join('');
}
/**
 * Lado do fecho de cada folha de correr:
 * - as folhas das pontas fecham contra o aro (lado exterior);
 * - 4 folhas: as duas centrais têm os fechos encontrados ao centro;
 * - 3 folhas: a central não tem fecho (fica presa entre as outras duas).
 */
function closureSide(count, index) {
    if (index === 0)
        return 'left';
    if (index === count - 1)
        return 'right';
    if (count === 4)
        return index === 1 ? 'right' : 'left';
    return null;
}
/** Símbolo de abertura (mesma convenção do alçado técnico), leve e tracejado sobre a folha. */
function openingSymbol(module, target, config) {
    const source = module.leafBounds;
    if (!source)
        return '';
    const map = (x, y) => [
        target.x + ((x - source.x) / source.width) * target.width,
        target.y + ((y - source.y) / source.height) * target.height
    ];
    const d = openingSegments(module, config.viewSide).map((segment) => {
        const [ax, ay] = map(segment.a.x, segment.a.y);
        const [bx, by] = map(segment.b.x, segment.b.y);
        return `M ${n(ax)} ${n(ay)} L ${n(bx)} ${n(by)}`;
    }).join(' ');
    return d ? `<path class="opening-symbol" d="${d}" fill="none" stroke="#3d4a55" stroke-width="1.1" stroke-dasharray="7 5" opacity=".5" vector-effect="non-scaling-stroke"/>` : '';
}
/** Cotas totais discretas (largura em baixo, altura à direita). */
function overallDimensions(width, height, bottomY, rightX, size) {
    const tick = size * 0.35;
    const line = 'stroke="#7d8790" stroke-width="0.9" vector-effect="non-scaling-stroke"';
    const text = `font-family="Manrope, 'Segoe UI', Arial, sans-serif" font-size="${n(size)}" fill="#4f5a64" text-anchor="middle"`;
    const y = bottomY;
    const x = rightX;
    const tx = x + size * 1.15;
    return `<g class="commercial-dimensions">
    <path d="M 0 ${n(y - tick * 2)} V ${n(y + tick)} M ${n(width)} ${n(y - tick * 2)} V ${n(y + tick)} M 0 ${n(y)} H ${n(width)} M ${n(-tick)} ${n(y + tick)} L ${n(tick)} ${n(y - tick)} M ${n(width - tick)} ${n(y + tick)} L ${n(width + tick)} ${n(y - tick)}" ${line}/>
    <text x="${n(width / 2)}" y="${n(y + size * 1.25)}" ${text}>${Math.round(width)} mm</text>
    <path d="M ${n(x - tick * 2)} 0 H ${n(x + tick)} M ${n(x - tick * 2)} ${n(height)} H ${n(x + tick)} M ${n(x)} 0 V ${n(height)} M ${n(x - tick)} ${n(tick)} L ${n(x + tick)} ${n(-tick)} M ${n(x - tick)} ${n(height + tick)} L ${n(x + tick)} ${n(height - tick)}" ${line}/>
    <text x="${n(tx)}" y="${n(height / 2)}" ${text} transform="rotate(90 ${n(tx)} ${n(height / 2)})">${Math.round(height)} mm</text>
  </g>`;
}
/** Vão livre do módulo: os módulos são medidos ao eixo dos perfis intermédios. */
function clearOpening(bounds, inner, divider) {
    const eps = 0.5;
    const half = divider / 2;
    const left = bounds.x > inner.x + eps ? half : 0;
    const right = bounds.x + bounds.width < inner.x + inner.width - eps ? half : 0;
    const top = bounds.y > inner.y + eps ? half : 0;
    const bottom = bounds.y + bounds.height < inner.y + inner.height - eps ? half : 0;
    return { x: bounds.x + left, y: bounds.y + top, width: bounds.width - left - right, height: bounds.height - top - bottom };
}
function baseDefs(ctx) {
    const { p, look, unit: u } = ctx;
    const blur = (name, std) => `<filter id="${id(ctx, name)}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${n(std)}"/></filter>`;
    return [
        profileGradients(ctx),
        // Vidro: reflexo de céu claro em cima, horizonte suave a ~60% e chão mais neutro em baixo.
        `<linearGradient id="${id(ctx, 'glass')}" x1="0" y1="0" x2="0" y2="1">${look.stops.map(([o, color]) => `<stop offset="${o}" stop-color="${color}"/>`).join('')}</linearGradient>`,
        `<linearGradient id="${id(ctx, 'glassSide')}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".25"/><stop offset=".5" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#0d2533" stop-opacity="${n(look.side)}"/>
    </linearGradient>`,
        `<linearGradient id="${id(ctx, 'metal')}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3a3d40"/><stop offset=".3" stop-color="#17191b"/><stop offset=".72" stop-color="#08090a"/><stop offset="1" stop-color="#24272a"/>
    </linearGradient>`,
        `<linearGradient id="${id(ctx, 'metalX')}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#090a0b"/><stop offset=".3" stop-color="#35383b"/><stop offset=".55" stop-color="#141618"/><stop offset="1" stop-color="#050607"/>
    </linearGradient>`,
        `<linearGradient id="${id(ctx, 'revealR')}" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stop-color="${shade(p.reveal, -0.15)}"/><stop offset="1" stop-color="${shade(p.reveal, 0.25)}"/>
    </linearGradient>`,
        `<linearGradient id="${id(ctx, 'sideL')}" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stop-color="${p.side}"/><stop offset="1" stop-color="${p.sideBack}"/>
    </linearGradient>`,
        `<linearGradient id="${id(ctx, 'floor')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3e6e8"/><stop offset="1" stop-color="#ffffff"/></linearGradient>`,
        `<radialGradient id="${id(ctx, 'ground')}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#1b2630" stop-opacity=".28"/><stop offset="1" stop-color="#1b2630" stop-opacity="0"/></radialGradient>`,
        blur('blurXS', u * 0.5),
        blur('blurS', u * 1.1),
        blur('blurM', u * 3.5),
        `<filter id="${id(ctx, 'drop')}" x="-20%" y="-20%" width="150%" height="160%"><feDropShadow dx="${n(u * 3)}" dy="${n(u * 5)}" stdDeviation="${n(u * 6)}" flood-color="#17222b" flood-opacity=".14"/></filter>`
    ].join('');
}
export function renderCommercialJoinery(input) {
    const geometry = calculateJoineryGeometry(input);
    const { config, outerBounds, innerBounds, modules, mullions, transoms } = geometry;
    const W = config.width;
    const H = config.height;
    const ctx = {
        seq: ++svgSequence,
        p: palette(config.style.frameFill, config.style.frameFinish === 'anodized'),
        panelLeaves: config.leafInfill === 'panel',
        defs: [],
        overlay: [],
        clip: 0,
        look: glassLook(config.style.glassAppearance, config.style.glassFill || '#bfe2f5'),
        unit: Math.max(4, Math.min(W, H) * 0.006)
    };
    const depth = Math.max(55, Math.min(110, Math.min(W, H) * 0.06));
    const dx = -depth * 0.55;
    // Vista à altura dos olhos: só a lateral do aro mostra profundidade. Uma face inferior visível
    // somava-se ao perfil de baixo e fazia-o parecer mais largo do que os outros.
    const dy = 0;
    const frameFace = Math.min(Math.max(config.frame, 52, Math.min(80, Math.min(W, H) * 0.04)), Math.min(W, H) * 0.14);
    const isDoor = config.kind === 'door';
    // Portas: soleira baixa em vez do perfil inferior do aro.
    const frameFaces = isDoor ? { ...uniform(frameFace), bottom: Math.max(18, frameFace * 0.32) } : uniform(frameFace);
    const padding = Math.max(60, Math.min(W, H) * 0.08);
    const p = ctx.p;
    // Profundidade do aro (face lateral esquerda e aresta inferior).
    const sideFaces = [
        poly([[0, 0], [dx, dy], [dx, H + dy], [0, H]], `fill="url(#${id(ctx, 'sideL')})" stroke="${p.edge}" stroke-width="0.7" vector-effect="non-scaling-stroke"`),
        `<line x1="0" y1="0" x2="0" y2="${n(H)}" stroke="${shade(p.base, p.dark ? 0.25 : 0.8)}" stroke-width="1" vector-effect="non-scaling-stroke"/>`
    ].join('');
    const frameOpening = insetSides(outerBounds, frameFaces);
    const scaleX = frameOpening.width / innerBounds.width;
    const scaleY = frameOpening.height / innerBounds.height;
    const remap = (r) => ({
        x: frameOpening.x + (r.x - innerBounds.x) * scaleX,
        y: frameOpening.y + (r.y - innerBounds.y) * scaleY,
        width: r.width * scaleX,
        height: r.height * scaleY
    });
    const divider = Math.max(config.divider, 58);
    const moduleNodes = modules.map((module) => renderModule(ctx, module, clearOpening(remap(module.bounds), frameOpening, divider), config, depth)).join('');
    const profileNodes = [
        ...transoms.map((r) => { const m = remap(r); return bar(ctx, { x: frameOpening.x, y: m.y + m.height / 2 - divider / 2, width: frameOpening.width, height: divider }, false); }),
        ...mullions.map((r) => { const m = remap(r); return bar(ctx, { x: m.x + m.width / 2 - divider / 2, y: frameOpening.y, width: divider, height: frameOpening.height }, true); })
    ].join('');
    // Sombra que montantes/travessas projetam sobre o vão.
    const profileShadows = [
        ...transoms.map((r) => { const m = remap(r); return castShadow(ctx, { x: frameOpening.x, y: m.y + m.height / 2 - divider / 2, width: frameOpening.width, height: divider }, 0.18); }),
        ...mullions.map((r) => { const m = remap(r); return castShadow(ctx, { x: m.x + m.width / 2 - divider / 2, y: frameOpening.y, width: divider, height: frameOpening.height }, 0.18); })
    ].join('');
    const showDims = Boolean(config.commercial?.dimensions);
    const dimSize = Math.max(40, Math.min(W, H) * 0.045);
    const dimBottom = H + dy + dimSize * 1.6;
    const dimRight = W + dimSize * 1.4;
    const extraB = showDims ? dimSize * 2.6 : 0;
    const extraR = showDims ? dimSize * 2.4 : 0;
    const vbX = -padding + dx;
    const vbY = -padding;
    const vbW = W + padding * 2 - dx + extraR;
    const vbH = H + padding * 2 + dy + extraB;
    const frameRing = mitredRing(ctx, outerBounds, frameFaces);
    const frameShadowInner = rectNode(frameOpening, `fill="none" stroke="#0f1a22" stroke-width="${n(ctx.unit * 2)}" opacity=".18" filter="url(#${id(ctx, 'blurS')})"`);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(vbX)} ${n(vbY)} ${n(vbW)} ${n(vbH)}" role="img" aria-label="Vista comercial da caixilharia">
    <defs>${baseDefs(ctx)}${ctx.defs.join('')}</defs>
    <rect x="${n(vbX)}" y="${n(vbY)}" width="${n(vbW)}" height="${n(vbH)}" fill="#ffffff"/>
    ${isDoor
        ? `<rect x="${n(vbX)}" y="${n(H)}" width="${n(vbW)}" height="${n(vbY + vbH - H)}" fill="url(#${id(ctx, 'floor')})"/><line x1="${n(vbX)}" y1="${n(H)}" x2="${n(vbX + vbW)}" y2="${n(H)}" stroke="#c4cacf" stroke-width="1" vector-effect="non-scaling-stroke"/><ellipse cx="${n(W / 2 + dx / 2)}" cy="${n(H)}" rx="${n(W * 0.55)}" ry="${n(ctx.unit * 3)}" fill="url(#${id(ctx, 'ground')})"/>`
        : `<ellipse cx="${n(W / 2 + dx / 2)}" cy="${n(H + dy + ctx.unit * 2)}" rx="${n(W * 0.56)}" ry="${n(Math.max(ctx.unit * 4, padding * 0.35))}" fill="url(#${id(ctx, 'ground')})"/>`}
    <g filter="url(#${id(ctx, 'drop')})">
      ${sideFaces}
      ${rectNode(frameOpening, `fill="${p.reveal}"`)}
      ${moduleNodes}
      ${profileShadows}
      ${profileNodes}
      ${frameShadowInner}
      ${frameRing}
      ${ctx.overlay.join('')}
    </g>
    ${showDims ? overallDimensions(W, H, dimBottom, dimRight, dimSize) : ''}
  </svg>`;
}
