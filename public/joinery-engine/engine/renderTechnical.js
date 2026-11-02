import { calculateJoineryGeometry } from './geometryModel.js';
import { openingSegments } from './symbolGeometry.js';
const TEMPLATE = { x: 16, y: 16, width: 400, height: 270, innerInset: 14, divider: 14, leafInset: 5 };
function n(value) { return String(Math.round(value * 100) / 100); }
function rectNode(bounds, cls) { return `<rect x="${n(bounds.x)}" y="${n(bounds.y)}" width="${n(bounds.width)}" height="${n(bounds.height)}" class="${cls}"/>`; }
function lineNode(segment, cls) { return `<line x1="${n(segment.a.x)}" y1="${n(segment.a.y)}" x2="${n(segment.b.x)}" y2="${n(segment.b.y)}" class="${cls}"/>`; }
function inset(bounds, amount) { return { x: bounds.x + amount, y: bounds.y + amount, width: bounds.width - amount * 2, height: bounds.height - amount * 2 }; }
function corners(outer, inner, cls = 'seam') {
    return [
        { a: { x: outer.x, y: outer.y }, b: { x: inner.x, y: inner.y } },
        { a: { x: outer.x + outer.width, y: outer.y }, b: { x: inner.x + inner.width, y: inner.y } },
        { a: { x: outer.x, y: outer.y + outer.height }, b: { x: inner.x, y: inner.y + inner.height } },
        { a: { x: outer.x + outer.width, y: outer.y + outer.height }, b: { x: inner.x + inner.width, y: inner.y + inner.height } }
    ].map((segment) => lineNode(segment, cls)).join('');
}
function movementArrow(bounds, direction, track, count) {
    if (direction === 'fixed')
        return '';
    const y = bounds.y + bounds.height / 2 + (track - (count + 1) / 2) * 4;
    const left = bounds.x + bounds.width * 0.28;
    const right = bounds.x + bounds.width * 0.72;
    const head = (x, sign) => `M${n(x)} ${n(y)} l${n(sign * 6)} -4 M${n(x)} ${n(y)} l${n(sign * 6)} 4`;
    const heads = direction === 'both' ? `${head(right, -1)} ${head(left, 1)}` : direction === 'right' ? head(right, -1) : head(left, 1);
    return `<g class="movement"><line x1="${n(left)}" y1="${n(y)}" x2="${n(right)}" y2="${n(y)}"/><path d="${heads}"/></g>`;
}
export function renderTechnicalJoinery(input) {
    const geometry = calculateJoineryGeometry(input);
    const { config, modules, innerBounds } = geometry;
    const outerHeight = TEMPLATE.height * (config.height / 1200) * (1600 / config.width);
    const outer = { x: TEMPLATE.x, y: TEMPLATE.y, width: TEMPLATE.width, height: outerHeight };
    const inner = inset(outer, TEMPLATE.innerInset);
    const mapCell = (bounds) => ({
        x: inner.x + ((bounds.x - innerBounds.x) / innerBounds.width) * inner.width,
        y: inner.y + ((bounds.y - innerBounds.y) / innerBounds.height) * inner.height,
        width: (bounds.width / innerBounds.width) * inner.width,
        height: (bounds.height / innerBounds.height) * inner.height
    });
    const dividerNodes = [];
    for (let index = 1; index < config.layout.cols.length; index += 1) {
        const ratio = config.layout.cols.slice(0, index).reduce((sum, value) => sum + value, 0) / config.width;
        dividerNodes.push(rectNode({ x: inner.x + inner.width * ratio - TEMPLATE.divider / 2, y: inner.y, width: TEMPLATE.divider, height: inner.height }, 'divider'));
    }
    for (let index = 1; index < config.layout.rows.length; index += 1) {
        const ratio = config.layout.rows.slice(0, index).reduce((sum, value) => sum + value, 0) / config.height;
        dividerNodes.push(rectNode({ x: inner.x, y: inner.y + inner.height * ratio - TEMPLATE.divider / 2, width: inner.width, height: TEMPLATE.divider }, 'divider'));
    }
    const moduleNodes = modules.map((module) => {
        if (!module.leafBounds)
            return '';
        const mapped = mapCell(module.bounds);
        const touchesLeft = Math.abs(module.bounds.x - innerBounds.x) < 0.01;
        const touchesRight = Math.abs(module.bounds.x + module.bounds.width - innerBounds.x - innerBounds.width) < 0.01;
        const touchesTop = Math.abs(module.bounds.y - innerBounds.y) < 0.01;
        const touchesBottom = Math.abs(module.bounds.y + module.bounds.height - innerBounds.y - innerBounds.height) < 0.01;
        const cell = {
            x: mapped.x + (touchesLeft ? 0 : TEMPLATE.divider / 2),
            y: mapped.y + (touchesTop ? 0 : TEMPLATE.divider / 2),
            width: mapped.width - (touchesLeft ? 0 : TEMPLATE.divider / 2) - (touchesRight ? 0 : TEMPLATE.divider / 2),
            height: mapped.height - (touchesTop ? 0 : TEMPLATE.divider / 2) - (touchesBottom ? 0 : TEMPLATE.divider / 2)
        };
        const leaf = inset(cell, TEMPLATE.leafInset);
        if (module.slidingLeaves?.length) {
            const count = module.slidingLeaves.length;
            const overlap = Math.min(12, leaf.width * 0.08);
            const panelWidth = (leaf.width + overlap * (count - 1)) / count;
            const panels = module.slidingLeaves.map((source, index) => {
                const panel = { x: leaf.x + index * (panelWidth - overlap), y: leaf.y, width: panelWidth, height: leaf.height };
                return `${rectNode(panel, 'sliding-leaf')}${movementArrow(panel, source.direction, source.track, count)}`;
            }).join('');
            const trackGap = 3;
            const tracks = module.slidingLeaves.map((source) => `<line x1="${n(leaf.x)}" y1="${n(leaf.y + leaf.height - source.track * trackGap)}" x2="${n(leaf.x + leaf.width)}" y2="${n(leaf.y + leaf.height - source.track * trackGap)}" class="track"/>`).join('');
            return `${panels}${tracks}`;
        }
        const symbolModule = { ...module, bounds: cell, leafBounds: leaf, glassBounds: leaf };
        const symbols = openingSegments(symbolModule, config.viewSide).map((segment) => lineNode(segment, 'opening')).join('');
        return `${rectNode(leaf, 'leaf')}${corners(cell, leaf)}${symbols}`;
    }).join('');
    const bottom = outer.y + outer.height;
    const totalDimensionY = bottom + (config.dimensionMode === 'full' ? 45 : 17);
    const dimensions = [];
    if (config.dimensionMode !== 'none') {
        dimensions.push(`<g class="dimensions"><path d="M${n(outer.x)} ${n(totalDimensionY - 5)} V${n(totalDimensionY + 5)} M${n(outer.x + outer.width)} ${n(totalDimensionY - 5)} V${n(totalDimensionY + 5)} M${n(outer.x)} ${n(totalDimensionY)} H${n(outer.x + outer.width)}"/><path d="M${n(outer.x)} ${n(totalDimensionY)} l6 -3 v6 z M${n(outer.x + outer.width)} ${n(totalDimensionY)} l-6 -3 v6 z" class="arrow"/><text x="${n(outer.x + outer.width / 2)}" y="${n(totalDimensionY + 20)}">${config.width} mm</text><path d="M${n(outer.x + outer.width + 12)} ${n(outer.y)} H${n(outer.x + outer.width + 23)} M${n(outer.x + outer.width + 12)} ${n(bottom)} H${n(outer.x + outer.width + 23)} M${n(outer.x + outer.width + 18)} ${n(outer.y)} V${n(bottom)}"/><path d="M${n(outer.x + outer.width + 18)} ${n(outer.y)} l-3 6 h6 z M${n(outer.x + outer.width + 18)} ${n(bottom)} l-3 -6 h6 z" class="arrow"/><text x="${n(outer.x + outer.width + 38)}" y="${n(outer.y + outer.height / 2)}" transform="rotate(90 ${n(outer.x + outer.width + 38)} ${n(outer.y + outer.height / 2)})">${config.height} mm</text></g>`);
    }
    if (config.dimensionMode === 'full' && config.layout.cols.length > 1) {
        let cursor = inner.x;
        const y = bottom + 17;
        const parts = config.layout.cols.map((width) => {
            const next = cursor + inner.width * (width / config.width);
            const node = `<path d="M${n(cursor)} ${n(y - 5)} V${n(y + 5)} M${n(next)} ${n(y - 5)} V${n(y + 5)} M${n(cursor)} ${n(y)} H${n(next)}"/><text x="${n((cursor + next) / 2)}" y="${n(y - 5)}">${width} mm</text>`;
            cursor = next;
            return node;
        }).join('');
        dimensions.push(`<g class="dimensions partial">${parts}</g>`);
    }
    const viewBoxHeight = totalDimensionY + 32;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 470 ${n(viewBoxHeight)}" role="img" aria-label="Alçado técnico da caixilharia">
    <style>.outer{fill:#fff;stroke:#334155;stroke-width:1.4}.inner{fill:none;stroke:#64748b;stroke-width:1}.divider{fill:#fff;stroke:#334155;stroke-width:1.2}.leaf,.sliding-leaf{fill:none;stroke:#334155;stroke-width:1.2}.seam{stroke:#64748b;stroke-width:1}.opening{fill:none;stroke:#475569;stroke-width:1.4;stroke-dasharray:6 3}.track{stroke:#94a3b8;stroke-width:.7}.movement{fill:none;stroke:#475569;stroke-width:1.2}.dimensions{stroke:#64748b;stroke-width:.9;fill:none}.dimensions .arrow{fill:#64748b}.dimensions text{fill:#0d0d0d;stroke:none;font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-anchor:middle}.partial text{font-size:9px}</style>
    ${rectNode(outer, 'outer')}${rectNode(inner, 'inner')}${corners(outer, inner)}${dividerNodes.join('')}${moduleNodes}${dimensions.join('')}
  </svg>`;
}
