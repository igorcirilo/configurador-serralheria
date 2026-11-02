import {
  renderCommercialJoinery,
  renderTechnicalJoinery,
  renderJoineryDxf,
  buildCadScene,
  validateJoineryConfig,
  OPENING_SYSTEM_CATALOG,
  getOpeningSystem
} from './joinery-engine/index.js';
import {
  GLASS_PRODUCTS,
  GLASS_FUNCTIONS,
  SUN_OPTIONS,
  PRIORITY_OPTIONS,
  BRAND_OPTIONS,
  recommendGlass,
  getGlassProduct,
  requiredFunctions,
  glassAppearance,
  glassScores
} from './glass-catalog.js';

export { GLASS_PRODUCTS, GLASS_FUNCTIONS, SUN_OPTIONS, PRIORITY_OPTIONS, BRAND_OPTIONS, recommendGlass, glassScores };

function engineTypeLabel(system, type) {
  if (type.endsWith('_left')) return `${system.label.replace('Abrir 1 folha', 'Batente').replace('Oscilo-batente', 'Oscilobatente')} à esquerda`;
  if (type.endsWith('_right')) return `${system.label.replace('Abrir 1 folha', 'Batente').replace('Oscilo-batente', 'Oscilobatente')} à direita`;
  if (type === 'double_casement') return 'Duas folhas de batente';
  return system.label;
}

export const CONFIGURATOR_RULES = {
  productTypes: [
    { value: 'window', label: 'Janela', category: 'joinery' },
    { value: 'door', label: 'Porta', category: 'joinery' },
    { value: 'glass', label: 'Vidro', category: 'decorative_glass' },
    { value: 'mirror', label: 'Espelho', category: 'decorative_glass' },
    { value: 'maintenance', label: 'Manutenção / reparação', category: 'service' },
    { value: 'other', label: 'Outro trabalho', category: 'related' }
  ],
  joineryOpeningTypes: OPENING_SYSTEM_CATALOG
    .filter((system) => system.availableInConfigurator)
    .map((system) => ({
      value: system.id,
      label: system.label,
      leaves: system.leaves,
      requiresHand: system.requiresHand,
      requiresDirection: system.requiresDirection,
      requiresActiveLeaf: system.requiresActiveLeaf,
      validationStatus: system.status
    })),
  moduleTypes: OPENING_SYSTEM_CATALOG
    .filter((system) => system.availableInConfigurator)
    .flatMap((system) => system.engineTypes.map((type) => ({
      value: type,
      label: engineTypeLabel(system, type),
      validationStatus: system.status
    }))),
  openingHands: [
    { value: 'left', label: 'Mão esquerda' },
    { value: 'right', label: 'Mão direita' }
  ],
  openingDirections: [
    { value: 'inside', label: 'Abertura para dentro' },
    { value: 'outside', label: 'Abertura para fora' }
  ],
  activeLeafOptions: [
    { value: 'left', label: 'Folha ativa esquerda' },
    { value: 'center', label: 'Folha ativa central' },
    { value: 'right', label: 'Folha ativa direita' }
  ],
  colors: [
    { value: 'black', label: 'Preto', hex: '#1f232b' },
    { value: 'white', label: 'Branco', hex: '#f4f5f5' },
    { value: 'graphite', label: 'Cinza antracite', hex: '#5a626f' },
    { value: 'bronze', label: 'Bronze anodizado', hex: '#8a6644', finish: 'anodized' },
    { value: 'natural', label: 'Anodizado natural', hex: '#bfc5cb', finish: 'anodized' }
  ],
  profileSystems: [
    { value: 'cold', label: 'Série fria' },
    { value: 'thermal', label: 'Rotura térmica' }
  ],
  glassKinds: [
    { value: 'clear', label: 'Vidro incolor' },
    { value: 'tempered', label: 'Vidro temperado' },
    { value: 'laminated', label: 'Vidro laminado' },
    { value: 'double_glazed', label: 'Vidro duplo' },
    { value: 'reflective', label: 'Vidro refletivo' }
  ],
  finishes: [
    { value: 'clear', label: 'Transparente' },
    { value: 'frosted', label: 'Fosco' },
    { value: 'other', label: 'Outro' }
  ],
  mirrorEdges: [
    { value: 'polished', label: 'Borda polida' },
    { value: 'beveled', label: 'Biselada' },
    { value: 'raw', label: 'Corte reto' }
  ],
  shapes: [
    { value: 'rectangular', label: 'Retangular' },
    { value: 'round', label: 'Redondo' },
    { value: 'other', label: 'Outra forma' }
  ],
  hardware: [
    { value: 'handle', label: 'Puxador standard' },
    { value: 'lock', label: 'Fechadura com chave' },
    { value: 'hidden_hinges', label: 'Dobradiças ocultas' },
    { value: 'soft_close', label: 'Fecho suave' }
  ]
};

const PRODUCT_META = Object.fromEntries(CONFIGURATOR_RULES.productTypes.map((item) => [item.value, item]));
const OPENING_META = Object.fromEntries(CONFIGURATOR_RULES.joineryOpeningTypes.map((item) => [item.value, item]));
const COLOR_META = Object.fromEntries(CONFIGURATOR_RULES.colors.map((item) => [item.value, item]));
const GLASS_META = Object.fromEntries(CONFIGURATOR_RULES.glassKinds.map((item) => [item.value, item]));
const FINISH_META = Object.fromEntries(CONFIGURATOR_RULES.finishes.map((item) => [item.value, item]));
const SHAPE_META = Object.fromEntries(CONFIGURATOR_RULES.shapes.map((item) => [item.value, item]));

const DEFAULT_INPUT = {
  productType: 'window',
  openingType: 'tilt_turn',
  openingHand: 'left',
  openingDirection: 'inside',
  activeLeaf: 'right',
  width: 1600,
  height: 1200,
  unit: 'mm',
  color: 'white',
  thickness: 6,
  profileDepth: 45,
  profileSystem: 'cold',
  thermalBreak: false,
  glassKind: 'tempered',
  glassFinish: 'clear',
  edge: 'polished',
  shape: 'rectangular',
  hardware: [],
  notes: '',
  customerName: '',
  customerPhone: '',
  customerEmail: ''
};

const ENGINE_TYPES = new Set([
  'fixed', 'casement_left', 'casement_right', 'double_casement', 'sliding_2', 'sliding_3',
  'sliding_4', 'tilt_turn_left', 'tilt_turn_right', 'awning', 'hopper', 'pivot_vertical'
]);

function toNumber(value, fallback) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function toBoolean(value) {
  return value === true || value === 'true' || value === 'on' || value === 1 || value === '1';
}

function ensureArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function parseNumberList(value) {
  const values = Array.isArray(value) ? value : String(value ?? '').split(',');
  return values.map((item) => Number(String(item).trim())).filter((item) => Number.isFinite(item) && item > 0);
}

function distribute(total, count) {
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, index) => index === count - 1 ? total - base * (count - 1) : base);
}

function resolveCategory(productType) {
  return PRODUCT_META[productType]?.category ?? 'related';
}

function resolveJoineryOpeningType(openingType, openingHand) {
  switch (openingType) {
    case 'casement_1':
      return openingHand === 'left' ? 'casement_1_left' : 'casement_1_right';
    case 'casement_2':
      return 'casement_2';
    case 'sliding_2':
      return 'sliding_2';
    case 'sliding_3':
      return 'sliding_3';
    case 'sliding_4':
      return 'sliding_4';
    case 'tilt_turn':
      return openingHand === 'left' ? 'tilt_turn_left' : 'tilt_turn_right';
    case 'hopper':
      return 'hopper';
    default:
      return 'fixed';
  }
}

function resolveEngineType(joineryOpeningType) {
  switch (joineryOpeningType) {
    case 'casement_1_left':
      return 'casement_left';
    case 'casement_1_right':
      return 'casement_right';
    case 'casement_2':
      return 'double_casement';
    default:
      return joineryOpeningType;
  }
}

function resolveLeafCount(openingType, explicitLeafCount) {
  if (Number.isFinite(explicitLeafCount) && explicitLeafCount > 0) return explicitLeafCount;
  return OPENING_META[openingType]?.leaves ?? 1;
}

const FUNCTION_IDS = new Set(GLASS_FUNCTIONS.map((item) => item.id));

/** Vidro duplo para caixilharia: a partir das necessidades do cliente (ou escolha manual). */
export function resolveGlazing(input = {}, productType = 'window') {
  const needs = {
    sun: SUN_OPTIONS.some((item) => item.value === input.glassSun) ? input.glassSun : 'unknown',
    priority: PRIORITY_OPTIONS.some((item) => item.value === input.glassPriority) ? input.glassPriority : 'balanced',
    brand: BRAND_OPTIONS.some((item) => item.value === input.glassBrand) ? input.glassBrand : 'any'
  };
  const ranking = recommendGlass(needs);
  const recommended = ranking[0]?.product ?? GLASS_PRODUCTS[1];
  const manual = input.glassProductId ? getGlassProduct(input.glassProductId) : null;
  const product = manual ?? recommended;
  const required = requiredFunctions({ productType });
  const functions = [...new Set([...ensureArray(input.glassFunctions).filter((id) => FUNCTION_IDS.has(id)), ...required])];
  const functionDetails = functions.map((id) => {
    const item = GLASS_FUNCTIONS.find((fn) => fn.id === id);
    return { id, label: item.short, solution: product.brand === 'Guardian' ? (item.gd || item.sg) : item.sg, required: required.includes(id) };
  });
  return {
    productId: product.id,
    brand: product.brand,
    name: product.name,
    family: product.family,
    composition: product.composition,
    tl: product.tl,
    rl: product.rl,
    g: product.g,
    ug: product.ug,
    summary: product.summary,
    selection: manual ? 'manual' : 'recommended',
    recommendedId: recommended.id,
    alternatives: ranking.slice(1, 3).map((item) => item.product.id),
    needs,
    functions: functionDetails,
    appearance: glassAppearance(null, functions)
  };
}

export function describeGlazing(glazing) {
  if (!glazing) return '';
  const fmt = (value, digits) => value.toFixed(digits).replace('.', ',');
  const extras = glazing.functions.length ? ` + ${glazing.functions.map((fn) => fn.label).join(', ')}` : '';
  return `${glazing.brand} ${glazing.name} (${glazing.composition}) · Ug ${fmt(glazing.ug, 1)} W/m²K · g ${fmt(glazing.g, 2)} · TL ${glazing.tl}%${extras}`;
}

export function normalizeConfiguratorInput(input = {}) {
  const productType = PRODUCT_META[input.productType]?.value ?? DEFAULT_INPUT.productType;
  const category = resolveCategory(productType);
  const openingType = OPENING_META[input.openingType]?.value ?? DEFAULT_INPUT.openingType;
  const openingSystem = getOpeningSystem(openingType);
  const openingHand = input.openingHand === 'left' ? 'left' : 'right';
  const openingDirection = input.openingDirection === 'outside' ? 'outside' : 'inside';
  const activeLeaf = ['left', 'center', 'right'].includes(input.activeLeaf) ? input.activeLeaf : 'right';
  const unit = input.unit === 'cm' ? 'cm' : 'mm';
  const unitFactor = unit === 'cm' ? 10 : 1;
  const width = Math.max(200, toNumber(input.width, DEFAULT_INPUT.width) * unitFactor);
  const height = Math.max(200, toNumber(input.height, DEFAULT_INPUT.height) * unitFactor);
  // O cliente não indica espessura: fica a definir pelo técnico (o valor de referência só serve o desenho).
  const thickness = input.thickness ? Math.max(3, toNumber(input.thickness, DEFAULT_INPUT.thickness)) : null;
  const profileDepth = Math.max(20, toNumber(input.profileDepth, DEFAULT_INPUT.profileDepth));
  const thermalByDepth = profileDepth > 60;
  const requestedThermal = toBoolean(input.thermalBreak) || input.profileSystem === 'thermal';
  const thermalBreak = category === 'joinery' ? (thermalByDepth || requestedThermal) : false;
  const profileSystem = category === 'joinery'
    ? (thermalBreak ? 'thermal' : (input.profileSystem === 'thermal' ? 'thermal' : 'cold'))
    : null;
  const leafCount = category === 'joinery' ? resolveLeafCount(openingType, Number(input.leafCount)) : 0;
  const joineryOpeningType = category === 'joinery' ? resolveJoineryOpeningType(openingType, openingHand) : null;
  const engineType = joineryOpeningType ? resolveEngineType(joineryOpeningType) : null;
  const color = COLOR_META[input.color]?.value ?? DEFAULT_INPUT.color;
  const glassKind = GLASS_META[input.glassKind]?.value ?? DEFAULT_INPUT.glassKind;
  const glassFinish = FINISH_META[input.glassFinish]?.value ?? DEFAULT_INPUT.glassFinish;
  const shape = SHAPE_META[input.shape]?.value ?? DEFAULT_INPUT.shape;
  const hardware = ensureArray(input.hardware).filter(Boolean);
  const notes = toText(input.notes);
  const moduleCount = category === 'joinery' ? Math.min(3, Math.max(1, Math.round(toNumber(input.moduleCount, 2)))) : 1;
  // Module widths are always entered in millimetres, regardless of the display unit.
  const requestedWidths = parseNumberList(input.moduleWidths);
  const moduleWidths = requestedWidths.length === moduleCount && Math.abs(requestedWidths.reduce((sum, value) => sum + value, 0) - width) <= 1
    ? requestedWidths
    : distribute(width, moduleCount);
  const requestedTypes = ensureArray(input.moduleTypes);
  const defaultTypes = moduleCount === 2 ? ['tilt_turn_left', 'fixed'] : Array.from({ length: moduleCount }, () => engineType);
  const moduleTypes = Array.from({ length: moduleCount }, (_, index) => ENGINE_TYPES.has(requestedTypes[index]) ? requestedTypes[index] : defaultTypes[index] || 'fixed');
  const hasTopLight = category === 'joinery' && toBoolean(input.hasTopLight);
  const requestedTopHeight = toNumber(input.topLightHeight, Math.round(height * 0.25));
  const topLightHeight = hasTopLight ? Math.min(height - 200, Math.max(150, requestedTopHeight)) : 0;
  const rows = hasTopLight ? [topLightHeight, height - topLightHeight] : [height];
  const layout = { rows, cols: moduleWidths };
  // Portas: folhas em vidro ou em painel de alumínio (porta inteiriça). Partes fixas ficam sempre em vidro.
  const doorInfill = productType === 'door' && input.doorInfill === 'panel' ? 'panel' : 'glass';
  // Porta inteiriça sem partes fixas nem bandeira: não leva vidro, por isso não há vidro a sugerir.
  const allLeavesPanel = doorInfill === 'panel' && moduleTypes.every((type) => type !== 'fixed') && !toBoolean(input.hasTopLight);
  const glazing = category === 'joinery' && !allLeavesPanel ? resolveGlazing(input, productType) : null;
  const panels = category === 'joinery'
    ? [
        ...(hasTopLight ? moduleWidths.map((_, col) => ({ row: 0, col, type: 'fixed', hand: null, activeLeaf: null })) : []),
        ...moduleWidths.map((_, col) => ({ row: hasTopLight ? 1 : 0, col, type: moduleTypes[col], hand: openingHand, activeLeaf }))
      ]
    : [];

  const geometryConfig = category === 'joinery'
    ? {
        id: toText(input.configurationId, `CFG-${Date.now()}`),
        reference: toText(input.reference, 'VAO-01'),
        name: toText(input.configurationName, productType === 'door' ? 'Porta configurada' : 'Janela configurada'),
        kind: productType === 'door' ? 'door' : 'window',
        width,
        height,
        quantity: Math.max(1, Math.round(toNumber(input.quantity, 1))),
        system: toText(input.systemName, 'INDALSU · DOMO'),
        manufacturer: 'INDALSU',
        series: 'DOMO',
        finish: color,
        glassDescription: describeGlazing(glazing),
        notes,
        viewSide: input.viewSide === 'exterior' ? 'exterior' : 'interior',
        dimensionMode: ['none', 'overall', 'full'].includes(input.dimensionMode) ? input.dimensionMode : 'overall',
        frame: 32,
        leaf: 24,
        glassInset: 10,
        divider: 42,
        style: {
          stroke: 1.6,
          lineColor: color === 'white' ? '#7f858b' : '#20262d',
          guideColor: '#66727b',
          glassFill: resolveGlassFill(glassKind, glassFinish),
          frameFill: COLOR_META[color]?.hex ?? '#d1d5db',
          leafFill: COLOR_META[color]?.hex ?? '#d1d5db',
          background: '#ffffff',
          trackColor: '#6b7280',
          glassAppearance: glazing?.appearance,
          frameFinish: COLOR_META[color]?.finish ?? 'lacquered'
        },
        leafInfill: doorInfill,
        commercial: {
          dimensions: input.showDimensions === undefined ? true : toBoolean(input.showDimensions),
          openingSymbols: toBoolean(input.showOpeningSymbols)
        },
        layout,
        cells: panels.map((panel, index) => ({
          id: `M${index + 1}`,
          row: panel.row,
          col: panel.col,
          type: resolveEngineType(panel.type),
          activeLeaf: panel.activeLeaf ?? undefined,
          hardware: { handle: panel.type !== 'fixed' }
        }))
      }
    : null;

  const validation = geometryConfig ? validateJoineryConfig(geometryConfig) : { valid: true, errors: [], warnings: [] };

  return {
    productType,
    category,
    subtype: productType,
    width,
    height,
    unit: 'mm',
    displayUnit: unit,
    color,
    thickness,
    notes,
    openingType,
    openingSystem: openingSystem ? {
      id: openingSystem.id,
      family: openingSystem.family,
      status: openingSystem.status,
      movement: openingSystem.movement
    } : null,
    openingHand: category === 'joinery' && OPENING_META[openingType]?.requiresHand ? openingHand : null,
    openingDirection: category === 'joinery' && OPENING_META[openingType]?.requiresDirection ? openingDirection : null,
    leafCount,
    activeLeaf: category === 'joinery' && OPENING_META[openingType]?.requiresActiveLeaf ? activeLeaf : null,
    profileDepth: category === 'joinery' ? profileDepth : null,
    profileSystem,
    manufacturer: category === 'joinery' ? 'INDALSU' : null,
    series: category === 'joinery' ? 'DOMO' : null,
    thermalBreak,
    glass: {
      kind: glassKind,
      thickness,
      finish: glassFinish
    },
    mirror: productType === 'mirror' ? { shape } : null,
    decorative: category === 'decorative_glass'
      ? { shape, finish: productType === 'mirror' ? null : glassFinish }
      : null,
    hardware,
    doorInfill: productType === 'door' ? doorInfill : null,
    glazing,
    moduleCount,
    moduleWidths,
    moduleTypes,
    hasTopLight,
    topLightHeight,
    validation,
    customer: {
      name: toText(input.customerName),
      phone: toText(input.customerPhone),
      email: toText(input.customerEmail)
    },
    layout,
    panels,
    geometryConfig,
    previewConfig: geometryConfig
  };
}

export function buildPreviewSvg(config, mode = 'commercial') {
  if (config.category === 'joinery' && config.geometryConfig) {
    return mode === 'technical'
      ? renderTechnicalJoinery(config.geometryConfig)
      : renderCommercialJoinery(config.geometryConfig);
  }
  return buildDecorativePreviewSvg(config);
}

/** Legenda técnica para o orçamentista (DXF e viewport CAD). */
function technicalNotes(config) {
  const summary = buildSummaryData(config);
  const reference = config.geometryConfig?.reference ? `${config.geometryConfig.reference} · ` : '';
  return {
    title: `${reference}${summary.title} · ${config.width} x ${config.height} mm · Qtd ${config.geometryConfig?.quantity ?? 1}`,
    notes: [
      ...summary.lines.filter((line) => !/^(Produto|Categoria|Dimensões|Espessura):/.test(line)),
      'Alçado 2D esquemático para orçamento. Medidas em mm. Não é desenho de fabrico.'
    ]
  };
}

export function buildCadSceneForConfig(config) {
  if (config.category !== 'joinery' || !config.geometryConfig || !config.validation.valid) return null;
  return buildCadScene(config.geometryConfig, technicalNotes(config));
}

export function buildTechnicalSvg(config) {
  return config.category === 'joinery' && config.geometryConfig
    ? renderTechnicalJoinery(config.geometryConfig)
    : buildDecorativePreviewSvg(config);
}

export function buildTechnicalDxf(config) {
  if (config.category === 'joinery' && config.geometryConfig) {
    return renderJoineryDxf(config.geometryConfig, technicalNotes(config));
  }
  return buildDecorativeDxf(config);
}

export function buildTechnicalDwg(config) {
  const dxf = buildTechnicalDxf(config);
  return `0\n999\nSIMPLIFIED DWG EXPORT GENERATED FROM PARAMETRIC CONFIG\n999\nPRODUCT:${config.productType}\n${dxf}`;
}

/** Nome natural da abertura para títulos ("Janela oscilobatente", "Porta de abrir"). */
export const OPENING_TITLES = {
  fixed: 'fixa',
  casement_1: 'de abrir',
  tilt_turn: 'oscilobatente',
  casement_2: 'de abrir, 2 folhas',
  sliding_2: 'de correr, 2 folhas',
  sliding_3: 'de correr, 3 folhas',
  sliding_4: 'de correr, 4 folhas',
  hopper: 'basculante'
};

function labelOf(options, value) {
  return options.find((item) => item.value === value)?.label ?? value;
}

export function buildSummaryData(config) {
  const productLabel = PRODUCT_META[config.productType]?.label ?? config.productType;
  const openingLabel = OPENING_META[config.openingType]?.label ?? null;
  const colorLabel = COLOR_META[config.color]?.label ?? config.color;
  const systemLabel = config.profileSystem === 'thermal' ? 'Rotura térmica' : config.profileSystem === 'cold' ? 'Série fria' : null;
  const finishLabel = FINISH_META[config.glass.finish]?.label ?? config.glass.finish;
  const shapeLabel = SHAPE_META[config.decorative?.shape || config.mirror?.shape || 'rectangular']?.label ?? 'Retangular';

  const lines = [
    `Produto: ${productLabel}`,
    `Categoria: ${config.category}`,
    `Dimensões: ${config.width} x ${config.height} ${config.unit}`,
  ];
  if (config.category === 'joinery') lines.push(`Cor / tom: ${colorLabel}`);
  if (config.category === 'decorative_glass') lines.push(`Espessura: ${config.thickness ? `${config.thickness} mm` : 'a definir pelo técnico'}`);

  if (config.category === 'joinery') {
    lines.push(`Tipologia: ${openingLabel}`);
    lines.push(`Folhas: ${config.leafCount}`);
    const moduleLabel = (type) => labelOf(CONFIGURATOR_RULES.moduleTypes, type);
    lines.push(`Módulos: ${config.moduleWidths.map((width, index) => `${index + 1}: ${width} mm (${moduleLabel(config.moduleTypes[index])})`).join(' | ')}`);
    if (config.hasTopLight) lines.push(`Bandeira superior: ${config.topLightHeight} mm`);
    if (config.openingHand) lines.push(`Mão de abertura: ${labelOf(CONFIGURATOR_RULES.openingHands, config.openingHand)} (vista interior)`);
    if (config.openingDirection) lines.push(`Sentido: ${labelOf(CONFIGURATOR_RULES.openingDirections, config.openingDirection)}`);
    if (config.activeLeaf) lines.push(`Folha ativa: ${labelOf(CONFIGURATOR_RULES.activeLeafOptions, config.activeLeaf)}`);
    lines.push(`Perfil: ${config.profileDepth} mm`);
    if (systemLabel) lines.push(`Sistema: ${systemLabel}`);
    if (config.doorInfill === 'panel') {
      const glassParts = config.hasTopLight || config.moduleTypes.some((type) => type === 'fixed');
      lines.push(`Enchimento das folhas: painel de alumínio opaco (porta inteiriça)${glassParts ? '; partes fixas em vidro' : ', sem vidro'}`);
    }
    if (config.glazing) {
      lines.push(`Vidro sugerido (para o orçamentista, o cliente não vê): ${describeGlazing(config.glazing)}`);
      const alternatives = config.glazing.alternatives.map((id) => GLASS_PRODUCTS.find((item) => item.id === id)).filter(Boolean);
      if (alternatives.length) lines.push(`Alternativas: ${alternatives.map((item) => `${item.brand} ${item.name}`).join(' | ')}`);
      if (config.glazing.functions.length) lines.push(`Funções pedidas: ${config.glazing.functions.map((fn) => `${fn.label}${fn.required ? ' (obrigatório)' : ''} → ${fn.solution}`).join(' | ')}`);
      const sun = SUN_OPTIONS.find((item) => item.value === config.glazing.needs.sun)?.label;
      const priority = PRIORITY_OPTIONS.find((item) => item.value === config.glazing.needs.priority)?.label;
      lines.push(`Necessidades do cliente: ${priority} · ${sun}${config.glazing.selection === 'manual' ? ' · escolha manual' : ''}`);
    }
  }

  if (config.productType === 'glass') {
    lines.push('Tipo e espessura do vidro: a definir pelo técnico');
    lines.push(`Acabamento: ${finishLabel}`);
    lines.push(`Forma: ${shapeLabel}`);
  }

  if (config.productType === 'mirror') {
    lines.push(`Forma: ${shapeLabel}`);
  }

  if (config.notes) lines.push(`Observações: ${config.notes}`);

  return {
    title: config.category === 'joinery'
      ? `${productLabel} ${OPENING_TITLES[config.openingType] || openingLabel || ''}`.trim()
      : productLabel,
    lines
  };
}

function resolveGlassFill(glassKind, glassFinish) {
  const base = {
    clear: '#bfe2f5',
    tempered: '#9ed8e8',
    laminated: '#aac7e3',
    double_glazed: '#88bddd',
    reflective: '#9ba8d6'
  }[glassKind] || '#bfe2f5';

  if (glassFinish === 'frosted') return '#dfe8ef';
  if (glassFinish === 'smoked') return '#a9b4c4';
  if (glassFinish === 'bronze') return '#c6a68a';
  return base;
}

let decorativeSequence = 0;

/**
 * Pré-visualização de vidro e espelho à medida: o objeto encostado a uma parede,
 * com proporção real, espessura visível, reflexos e sombra.
 * - Vidro transparente deixa ver a parede e o quadro por trás (ligeiramente esverdeado, como o vidro float).
 * - Vidro fosco desfoca e clareia o que está por trás.
 * - Espelho reflete uma divisão: janela iluminada, parede e chão, com bisel prateado.
 */
function buildDecorativePreviewSvg(config) {
  const W = 1200;
  const H = 900;
  const id = `dp${++decorativeSequence}`;
  const mirror = config.productType === 'mirror';
  const shape = (mirror ? config.mirror?.shape : config.decorative?.shape) || 'rectangular';
  const finish = mirror ? null : (config.decorative?.finish || 'clear');
  const frosted = finish === 'frosted';

  // Objeto com a proporção real das medidas, centrado na parede.
  const ratio = Math.max(0.2, Math.min(5, config.width / config.height));
  const maxW = 760;
  const maxH = 560;
  let w = maxW;
  let h = maxW / ratio;
  if (h > maxH) { h = maxH; w = maxH * ratio; }
  if (shape === 'round') { w = Math.min(w, h); h = w; }
  const x = (W - w) / 2 - 30;
  const y = 120 + (maxH - h) / 2;
  const floorY = 790;
  const depth = mirror ? 10 : 7;

  const outline = shape === 'round'
    ? `<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${w / 2}"/>`
    : `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${mirror ? 6 : 3}"/>`;
  const outlineAt = (dx, dy, attrs) => shape === 'round'
    ? `<circle cx="${x + w / 2 + dx}" cy="${y + h / 2 + dy}" r="${w / 2}" ${attrs}/>`
    : `<rect x="${x + dx}" y="${y + dy}" width="${w}" height="${h}" rx="${mirror ? 6 : 3}" ${attrs}/>`;

  // Cena por trás: parede, rodapé, chão e, no vidro, um quadro (para se perceber a transparência).
  const art = { x: x + w * 0.52, y: y + h * 0.18, w: Math.max(150, w * 0.42), h: Math.max(120, h * 0.42) };
  const scene = `
    <rect width="${W}" height="${floorY}" fill="url(#${id}wall)"/>
    ${Array.from({ length: 11 }, (_, i) => `<line x1="${i * 120 + 60}" y1="0" x2="${i * 120 + 60}" y2="${floorY}" stroke="#000" stroke-opacity=".025" stroke-width="2"/>`).join('')}
    ${mirror ? '' : `
    <rect x="${art.x}" y="${art.y}" width="${art.w}" height="${art.h}" fill="#f6f1e7" stroke="#6b5a45" stroke-width="10"/>
    <rect x="${art.x + 22}" y="${art.y + 22}" width="${art.w - 44}" height="${art.h - 44}" fill="#dcd3c2"/>
    <circle cx="${art.x + art.w * 0.38}" cy="${art.y + art.h * 0.5}" r="${Math.min(art.w, art.h) * 0.2}" fill="#c9873e" opacity=".85"/>
    <path d="M ${art.x + 22} ${art.y + art.h - 22} L ${art.x + art.w * 0.45} ${art.y + art.h * 0.55} L ${art.x + art.w * 0.7} ${art.y + art.h * 0.72} L ${art.x + art.w - 22} ${art.y + art.h * 0.45} L ${art.x + art.w - 22} ${art.y + art.h - 22} Z" fill="#5f7d6a"/>`}
    <rect y="${floorY - 26}" width="${W}" height="26" fill="#e7e2d8"/>
    <rect y="${floorY}" width="${W}" height="${H - floorY}" fill="url(#${id}floor)"/>`;

  const surface = mirror
    ? `
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${id}mirrorBase)"/>
      <g filter="url(#${id}blurL)">
        <rect x="${x + w * 0.12}" y="${y + h * 0.1}" width="${w * 0.26}" height="${h * 0.48}" fill="#ffffff" opacity=".85"/>
        <rect x="${x + w * 0.12}" y="${y + h * 0.33}" width="${w * 0.26}" height="4" fill="#c8d2da"/>
        <rect x="${x + w * 0.245}" y="${y + h * 0.1}" width="4" height="${h * 0.48}" fill="#c8d2da"/>
        <rect x="${x - 20}" y="${y + h * 0.72}" width="${w + 40}" height="${h * 0.4}" fill="#9a8f82" opacity=".55"/>
        <rect x="${x + w * 0.6}" y="${y + h * 0.3}" width="${w * 0.22}" height="${h * 0.44}" fill="#7f8a7d" opacity=".35"/>
      </g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${id}vignette)"/>
      <path d="M ${x + w * 0.55} ${y - 10} L ${x + w * 0.72} ${y - 10} L ${x + w * 0.3} ${y + h + 10} L ${x + w * 0.13} ${y + h + 10} Z" fill="#ffffff" opacity=".28" filter="url(#${id}blurM)"/>`
    : `
      <g ${frosted ? `filter="url(#${id}frost)"` : ''}>${scene}</g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${frosted ? '#f4f7f7' : '#9cc9bd'}" opacity="${frosted ? 0.62 : 0.16}"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${id}sky)"/>
      <path d="M ${x + w * 0.08} ${y - 10} L ${x + w * 0.3} ${y - 10} L ${x - w * 0.05} ${y + h * 0.85} L ${x - w * 0.27} ${y + h * 0.85} Z" fill="#ffffff" opacity="${frosted ? 0.12 : 0.38}" filter="url(#${id}blurM)"/>
      <path d="M ${x + w * 0.38} ${y - 10} L ${x + w * 0.45} ${y - 10} L ${x + w * 0.1} ${y + h * 0.85} L ${x + w * 0.03} ${y + h * 0.85} Z" fill="#ffffff" opacity="${frosted ? 0.06 : 0.25}" filter="url(#${id}blurM)"/>`;

  const edge = mirror
    ? `${outlineAt(0, 0, `fill="none" stroke="url(#${id}bevel)" stroke-width="14"`)}${outlineAt(0, 0, 'fill="none" stroke="#5d656c" stroke-width="1.5"')}`
    : `${outlineAt(0, 0, 'fill="none" stroke="#7fb3a4" stroke-width="3"')}${outlineAt(0, 0, 'fill="none" stroke="#ffffff" stroke-opacity=".85" stroke-width="1.2"')}`;

  const otherShape = shape === 'other'
    ? `<rect x="${x - 14}" y="${y - 14}" width="${w + 28}" height="${h + 28}" rx="10" fill="none" stroke="#4b5563" stroke-width="2" stroke-dasharray="14 10"/>
       <rect x="${x + w / 2 - 190}" y="${y + h / 2 - 26}" width="380" height="52" rx="26" fill="#ffffff" opacity=".9"/>
       <text x="${x + w / 2}" y="${y + h / 2 + 8}" text-anchor="middle" fill="#374151" font-family="Manrope, 'Segoe UI', Arial, sans-serif" font-size="24">Forma a definir com o técnico</text>`
    : '';

  // Cotas discretas, como na vista das janelas.
  const dimY = y + h + depth + 46;
  const dimX = x + w + depth + 46;
  const dims = `
    <g stroke="#7d8790" stroke-width="2" fill="none">
      <path d="M ${x} ${dimY - 14} V ${dimY + 8} M ${x + w} ${dimY - 14} V ${dimY + 8} M ${x} ${dimY} H ${x + w} M ${x - 8} ${dimY + 8} L ${x + 8} ${dimY - 8} M ${x + w - 8} ${dimY + 8} L ${x + w + 8} ${dimY - 8}"/>
      <path d="M ${dimX - 14} ${y} H ${dimX + 8} M ${dimX - 14} ${y + h} H ${dimX + 8} M ${dimX} ${y} V ${y + h} M ${dimX - 8} ${y + 8} L ${dimX + 8} ${y - 8} M ${dimX - 8} ${y + h + 8} L ${dimX + 8} ${y + h - 8}"/>
    </g>
    <g fill="#4f5a64" font-family="Manrope, 'Segoe UI', Arial, sans-serif" font-size="26" text-anchor="middle">
      <rect x="${x + w / 2 - 80}" y="${dimY + 8}" width="160" height="34" fill="#ffffff" opacity=".75" rx="6"/>
      <text x="${x + w / 2}" y="${dimY + 34}">${Math.round(config.width)} mm</text>
      <text x="${dimX + 34}" y="${y + h / 2}" transform="rotate(90 ${dimX + 34} ${y + h / 2})">${Math.round(config.height)} mm</text>
    </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${escapeXml(mirror ? 'Pré-visualização do espelho' : 'Pré-visualização do vidro')}">
  <defs>
    <linearGradient id="${id}wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f1ea"/><stop offset="1" stop-color="#e6e0d4"/></linearGradient>
    <linearGradient id="${id}floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9b9a0"/><stop offset="1" stop-color="#e2d6c3"/></linearGradient>
    <linearGradient id="${id}sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="${frosted ? 0.1 : 0.32}"/><stop offset=".55" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset=".62" stop-color="#5c7a80" stop-opacity="${frosted ? 0.02 : 0.06}"/><stop offset="1" stop-color="#ffffff" stop-opacity="${frosted ? 0.05 : 0.12}"/>
    </linearGradient>
    <linearGradient id="${id}mirrorBase" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e9eef1"/><stop offset=".45" stop-color="#c9d1d7"/><stop offset=".7" stop-color="#b3bcc3"/><stop offset="1" stop-color="#d9dfe3"/>
    </linearGradient>
    <radialGradient id="${id}vignette" cx=".45" cy=".4" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#1c2328" stop-opacity=".22"/></radialGradient>
    <linearGradient id="${id}bevel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#cfd6dc"/><stop offset=".55" stop-color="#f4f7f9"/><stop offset=".8" stop-color="#9aa5ae"/><stop offset="1" stop-color="#e6ebee"/>
    </linearGradient>
    <linearGradient id="${id}edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9fd0c0"/><stop offset="1" stop-color="#5f9c8a"/></linearGradient>
    <clipPath id="${id}clip">${outline}</clipPath>
    <filter id="${id}frost" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="9"/></filter>
    <filter id="${id}blurM" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
    <filter id="${id}blurL" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="22"/></filter>
    <filter id="${id}shadow" x="-20%" y="-20%" width="150%" height="160%"><feGaussianBlur stdDeviation="${mirror ? 16 : 10}"/></filter>
  </defs>
  ${scene}
  ${outlineAt(mirror ? 18 : 12, mirror ? 22 : 14, `fill="#1b2630" opacity="${mirror ? 0.28 : 0.12}" filter="url(#${id}shadow)"`)}
  ${outlineAt(depth, depth, `fill="${mirror ? '#7c868e' : `url(#${id}edge)`}" opacity="${mirror ? 1 : 0.9}"`)}
  <g clip-path="url(#${id}clip)">${surface}</g>
  ${edge}
  ${otherShape}
  ${dims}
</svg>`;
}

function buildDecorativeDxf(config) {
  const width = config.width;
  const height = config.height;
  const shape = config.productType === 'mirror' ? config.mirror?.shape : config.decorative?.shape;
  const entities = [];

  if (shape === 'round') {
    const radius = Math.round(Math.min(width, height) / 2);
    entities.push(dxfCircle(Math.round(width / 2), Math.round(height / 2), radius));
  } else if (shape === 'oval') {
    entities.push(dxfEllipse(Math.round(width / 2), Math.round(height / 2), Math.round(width / 2), 0, 0.62));
  } else if (shape === 'arched') {
    entities.push(dxfPolyline([
      [0, 0],
      [0, Math.round(height * 0.72)],
      [Math.round(width * 0.2), height],
      [Math.round(width * 0.8), height],
      [width, Math.round(height * 0.72)],
      [width, 0],
      [0, 0]
    ]));
  } else {
    entities.push(dxfPolyline([
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
      [0, 0]
    ]));
  }

  return [
    '0',
    'SECTION',
    '2',
    'HEADER',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'ENTITIES',
    ...entities,
    '0',
    'ENDSEC',
    '0',
    'EOF'
  ].join('\n');
}

function dxfPolyline(points) {
  const rows = ['0', 'LWPOLYLINE', '8', '0', '90', String(points.length), '70', '1'];
  points.forEach(([x, y]) => {
    rows.push('10', String(x), '20', String(y));
  });
  return rows.join('\n');
}

function dxfCircle(cx, cy, radius) {
  return ['0', 'CIRCLE', '8', '0', '10', String(cx), '20', String(cy), '40', String(radius)].join('\n');
}

function dxfEllipse(cx, cy, majorX, majorY, ratio) {
  return ['0', 'ELLIPSE', '8', '0', '10', String(cx), '20', String(cy), '11', String(majorX), '21', String(majorY), '40', String(ratio)].join('\n');
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
