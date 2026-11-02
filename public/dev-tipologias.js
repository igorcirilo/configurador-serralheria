import { OPENING_SYSTEM_CATALOG, renderCommercialJoinery, renderTechnicalJoinery } from './joinery-engine/index.js';

const examples = [
  { id: 'fixed', title: 'Fixo', type: 'fixed', hand: null },
  { id: 'casement_1', title: 'Batente esquerda', type: 'casement_left', hand: 'left' },
  { id: 'casement_1', title: 'Batente direita', type: 'casement_right', hand: 'right' },
  { id: 'tilt_turn', title: 'Oscilobatente esquerda', type: 'tilt_turn_left', hand: 'left' },
  { id: 'tilt_turn', title: 'Oscilobatente direita', type: 'tilt_turn_right', hand: 'right' }
];
const slidingExamples = [
  { id: 'sliding_2', title: 'Correr 2 folhas', type: 'sliding_2', width: 1800 },
  { id: 'sliding_3', title: 'Correr 3 folhas', type: 'sliding_3', width: 2400 },
  { id: 'sliding_4', title: 'Correr 4 folhas', type: 'sliding_4', width: 3200 }
];

function configFor(example, viewSide) {
  return {
    reference: `DEV-${example.type.toUpperCase()}`,
    kind: 'window', width: example.width || 1200, height: 1200, quantity: 1, viewSide, dimensionMode: 'overall',
    frame: 32, leaf: 24, glassInset: 10, divider: 42,
    style: { frameFill: '#f3f0e8', leafFill: '#f3f0e8', lineColor: '#7f858b' },
    layout: { rows: [1200], cols: [example.width || 1200] },
    cells: [{ id: 'M1', row: 0, col: 0, type: example.type, activeLeaf: 'left', hardware: { handle: example.type !== 'fixed' } }]
  };
}

function cardsFor(items, viewSide) {
  return items.map((example) => {
    const definition = OPENING_SYSTEM_CATALOG.find((system) => system.id === example.id);
    const config = configFor(example, viewSide);
    return `<article class="type-card">
      <header class="type-head"><div><h3>${example.title}</h3><p>${definition.movement} · vista ${viewSide}</p></div><span class="status ${definition.status}">${definition.status === 'validated' ? 'validado' : 'em revisão'}</span></header>
      <div class="render-pair"><div class="render"><strong>Comercial</strong>${renderCommercialJoinery(config)}</div><div class="render"><strong>Técnico</strong>${renderTechnicalJoinery(config)}</div></div>
      <div class="type-rule">${definition.technicalConvention}</div>
    </article>`;
  }).join('');
}

function renderGallery() {
  const viewSide = document.getElementById('viewSide').value;
  document.getElementById('validatedGallery').innerHTML = cardsFor(examples, viewSide);
  document.getElementById('slidingGallery').innerHTML = cardsFor(slidingExamples, viewSide);
}

function renderRoadmap() {
  const systems = OPENING_SYSTEM_CATALOG.filter((system) => system.status !== 'validated' && system.family !== 'sliding');
  document.getElementById('roadmap').innerHTML = systems.map((system) => `<article class="roadmap-card">
    <h3>${system.label}</h3><p>${system.geometryRule}</p><span class="status ${system.status}">${system.status === 'review' ? 'em revisão' : 'planeado'}</span>
  </article>`).join('');
}

document.getElementById('viewSide').addEventListener('change', renderGallery);
renderGallery();
renderRoadmap();
