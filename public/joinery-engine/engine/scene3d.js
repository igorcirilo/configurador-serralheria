import { insetRect } from '../core/geometry.js';
import { calculateJoineryGeometry } from './geometryModel.js';
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function ringParts(outer, inner) {
    const sides = [
        { side: 'top', bounds: { x: outer.x, y: outer.y, width: outer.width, height: Math.max(0, inner.y - outer.y) } },
        { side: 'bottom', bounds: { x: outer.x, y: inner.y + inner.height, width: outer.width, height: Math.max(0, outer.y + outer.height - inner.y - inner.height) } },
        { side: 'left', bounds: { x: outer.x, y: inner.y, width: Math.max(0, inner.x - outer.x), height: inner.height } },
        { side: 'right', bounds: { x: inner.x + inner.width, y: inner.y, width: Math.max(0, outer.x + outer.width - inner.x - inner.width), height: inner.height } }
    ];
    return sides.filter((part) => part.bounds.width > 0 && part.bounds.height > 0);
}
function expandRect(bounds, value) {
    return {
        x: bounds.x - value,
        y: bounds.y - value,
        width: bounds.width + value * 2,
        height: bounds.height + value * 2
    };
}
export function buildJoinery3DScene(config, options = {}) {
    const geometry = calculateJoineryGeometry(config);
    const profileDepth = clamp(options.profileDepth ?? Math.max(55, geometry.config.frame * 2), 35, 120);
    const leafDepth = profileDepth * 0.72;
    const glassDepth = clamp(options.glassThickness ?? 6, 4, 24);
    const parts = [];
    const motions = [];
    let sequence = 0;
    const add = (role, bounds, depth, z, groupId, mitre) => {
        parts.push({ id: `P${++sequence}`, role, bounds, depth, z, groupId, ...(mitre ? { mitre } : {}) });
    };
    const addRing = (role, outer, inner, depth, z, groupId) => {
        ringParts(outer, inner).forEach(({ side, bounds }) => add(role, bounds, depth, z, groupId, { side, outer, inner }));
    };
    const addHandle = (host, glass, side, z, groupId) => {
        const baseWidth = clamp(host.width * 0.014, 10, 15);
        const baseHeight = clamp(host.height * 0.065, 48, 72);
        const stileCenter = side === 'left'
            ? (host.x + glass.x) / 2
            : (glass.x + glass.width + host.x + host.width) / 2;
        const centerY = host.y + host.height / 2;
        const frontZ = z + leafDepth / 2 + 11;
        add('handle', {
            x: stileCenter - baseWidth / 2,
            y: centerY - baseHeight / 2,
            width: baseWidth,
            height: baseHeight
        }, 14, frontZ, groupId);
        // Alavanca curta, orientada para a área envidraçada e apoiada no espelho vertical.
        const leverLength = clamp(host.width * 0.065, 42, 68);
        const leverHeight = clamp(baseWidth * 0.72, 7, 11);
        add('handle', {
            x: side === 'right' ? stileCenter - leverLength : stileCenter,
            y: centerY - leverHeight / 2,
            width: leverLength,
            height: leverHeight
        }, 18, frontZ + 5, groupId);
    };
    const addGlazing = (glass, z, groupId) => {
        const bead = clamp(geometry.config.glassInset * 0.78, 6, 12);
        const gasket = clamp(bead * 0.38, 3, 5);
        addRing('bead', expandRect(glass, bead), expandRect(glass, gasket), 8, z + 4, groupId);
        addRing('gasket', expandRect(glass, gasket), glass, 6, z + 8, groupId);
        add('glass', glass, glassDepth, z, groupId);
    };
    const addHinges = (host, side, z, groupId) => {
        const width = clamp(host.width * 0.022, 12, 20);
        const height = clamp(host.height * 0.075, 70, 100);
        // Centrada na junta folha/aro, onde fica o eixo da dobradiça.
        const x = (side === 'left' ? host.x : host.x + host.width) - width / 2;
        for (const factor of [0.22, 0.78]) {
            add('hinge', { x, y: host.y + host.height * factor - height / 2, width, height }, 18, z + leafDepth / 2 + 6, groupId);
        }
    };
    const addLeaf = (id, outer, glass, z, motion, handleSide) => {
        addRing('leaf', outer, glass, leafDepth, z, id);
        // Vedante de batente atrás da folha: só aparece na folga folha/aro, como a junta escura do caixilho real.
        addRing('gasket', expandRect(outer, 8), outer, 4, z - leafDepth * 0.2, id);
        if (geometry.config.leafInfill === 'panel')
            add('panel', glass, leafDepth * 0.48, z + leafDepth * 0.08, id);
        else
            addGlazing(glass, z + leafDepth * 0.08, id);
        addHandle(outer, glass, handleSide, z, id);
        motions.push({ groupId: id, ...motion });
    };
    addRing('frame', geometry.outerBounds, geometry.innerBounds, profileDepth, 0);
    geometry.mullions.forEach((bounds) => add('divider', bounds, profileDepth * 0.86, 2));
    geometry.transoms.forEach((bounds) => add('divider', bounds, profileDepth * 0.86, 2));
    geometry.modules.forEach((module, moduleIndex) => {
        const type = module.cell.type;
        const prefix = `M${moduleIndex + 1}`;
        if (module.slidingLeaves?.length) {
            const trackGap = clamp(profileDepth * 0.26, 12, 26);
            const centerTrack = (module.slidingLeaves.length + 1) / 2;
            module.slidingLeaves.forEach((leaf, leafIndex) => {
                const groupId = `${prefix}-S${leafIndex + 1}`;
                const z = (leaf.track - centerTrack) * trackGap + profileDepth * 0.08;
                const direction = leaf.direction === 'left' ? -1 : 1;
                const travel = direction * Math.min(leaf.bounds.width * 0.62, geometry.config.width * 0.28);
                addLeaf(groupId, leaf.bounds, leaf.glassBounds, z, {
                    kind: 'slide', pivot: { x: leaf.bounds.x, y: leaf.bounds.y }, axis: 'x', amount: travel
                }, direction < 0 ? 'right' : 'left');
            });
            return;
        }
        if (!module.leafBounds) {
            addGlazing(module.glassBounds, 0);
            return;
        }
        const leaf = module.leafBounds;
        if (type === 'double_casement') {
            const gap = Math.max(6, geometry.config.divider * 0.16);
            const half = (leaf.width - gap) / 2;
            const left = { ...leaf, width: half };
            const right = { ...leaf, x: leaf.x + half + gap, width: half };
            const leftGlass = insetRect(left, geometry.config.leaf + geometry.config.glassInset);
            const rightGlass = insetRect(right, geometry.config.leaf + geometry.config.glassInset);
            addLeaf(`${prefix}-L`, left, leftGlass, profileDepth * 0.12, {
                kind: 'hinge', pivot: { x: left.x, y: left.y + left.height / 2 }, axis: 'y', amount: -1.05
            }, 'right');
            addLeaf(`${prefix}-R`, right, rightGlass, profileDepth * 0.12, {
                kind: 'hinge', pivot: { x: right.x + right.width, y: right.y + right.height / 2 }, axis: 'y', amount: 1.05
            }, 'left');
            addHinges(left, 'left', profileDepth * 0.12, `${prefix}-L`);
            addHinges(right, 'right', profileDepth * 0.12, `${prefix}-R`);
            return;
        }
        const leftHinged = type.endsWith('_left');
        const rightHinged = type.endsWith('_right');
        if (leftHinged || rightHinged) {
            const hingeX = leftHinged ? leaf.x : leaf.x + leaf.width;
            addLeaf(`${prefix}-L`, leaf, module.glassBounds, profileDepth * 0.12, {
                kind: 'hinge', pivot: { x: hingeX, y: leaf.y + leaf.height / 2 }, axis: 'y', amount: leftHinged ? -1.05 : 1.05
            }, leftHinged ? 'right' : 'left');
            addHinges(leaf, leftHinged ? 'left' : 'right', profileDepth * 0.12, `${prefix}-L`);
            return;
        }
        if (type === 'hopper' || type === 'awning') {
            const pivotY = type === 'hopper' ? leaf.y + leaf.height : leaf.y;
            addLeaf(`${prefix}-T`, leaf, module.glassBounds, profileDepth * 0.12, {
                kind: 'tilt', pivot: { x: leaf.x + leaf.width / 2, y: pivotY }, axis: 'x', amount: type === 'hopper' ? -0.42 : 0.42
            }, 'right');
            return;
        }
        addRing('leaf', leaf, module.glassBounds, leafDepth, profileDepth * 0.12);
        if (geometry.config.leafInfill === 'panel')
            add('panel', module.glassBounds, leafDepth * 0.48, profileDepth * 0.18);
        else
            addGlazing(module.glassBounds, profileDepth * 0.18);
    });
    return {
        units: 'mm',
        width: geometry.config.width,
        height: geometry.config.height,
        profileDepth,
        frameColor: geometry.config.style.frameFill,
        frameFinish: geometry.config.style.frameFinish ?? 'lacquered',
        glassAppearance: geometry.config.style.glassAppearance,
        parts,
        motions
    };
}
