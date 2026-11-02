import {
  CONFIGURATOR_RULES,
  normalizeConfiguratorInput,
  buildPreviewSvg,
  buildSummaryData,
  GLASS_FUNCTIONS,
  SUN_OPTIONS,
  PRIORITY_OPTIONS,
  OPENING_TITLES as OPENING_TITLE
} from './configurator-core.js';
import { Joinery3DViewer } from './three-viewer/joinery-3d.js';

/*
 * Configurador do cliente: perguntas simples e pré-visualização comercial.
 * Tudo o que é técnico (CAD, DXF, ficha, vidro sugerido) é gerado no servidor e só aparece no admin.
 */

const PRODUCT_ICONS = { window: '🪟', door: '🚪', glass: '◫', mirror: '◇', maintenance: '🔧', other: '▦' };
const PRODUCT_TEXT = {
  window: 'Janela nova ou substituição.',
  door: 'Porta de entrada, varanda ou terraço.',
  glass: 'Só o vidro, cortado à medida.',
  mirror: 'Espelho à medida.',
  maintenance: 'Algo não funciona: não fecha, vidro partido, entra água…',
  other: 'Outro trabalho: descreva nas notas.'
};
const OPENING_TEXT = {
  fixed: 'Não abre. Só deixa entrar luz.',
  casement_1: 'Abre para dentro, como uma porta.',
  tilt_turn: 'Abre como uma porta ou só inclina em cima para arejar.',
  casement_2: 'Duas folhas que abrem ao centro.',
  sliding_2: 'Desliza para o lado. Ocupa pouco espaço.',
  sliding_3: 'Três folhas que deslizam.',
  sliding_4: 'Quatro folhas, ideal para vãos largos.',
  hopper: 'Inclina por cima para arejar (ex.: casa de banho).'
};
const SYSTEM_OPTIONS = [
  { value: 'thermal', label: 'Com corte térmico (recomendado)', hint: 'Isola melhor: menos frio e menos condensação junto à janela.' },
  { value: 'cold', label: 'Standard', hint: 'Para marquises, arrumos ou espaços sem aquecimento.' }
];
const INFILL_OPTIONS = [
  { value: 'glass', label: 'Com vidro', hint: 'Deixa entrar luz natural.' },
  { value: 'panel', label: 'Inteiriça (painel de alumínio)', hint: 'Opaca: mais privacidade e segurança. Ideal para porta de entrada.' }
];
const REPAIR_ITEMS = [
  { value: 'janela', label: 'Janela' },
  { value: 'porta', label: 'Porta' },
  { value: 'vidro', label: 'Vidro ou espelho' },
  { value: 'outro', label: 'Outro' }
];
const REPAIR_ISSUES = [
  'Não fecha ou fecha mal',
  'Custa a abrir ou a correr',
  'Vidro partido ou rachado',
  'Entra água ou ar',
  'Puxador ou fechadura avariados',
  'Condensação entre os vidros',
  'Outro problema'
];
/** Medidas e abertura sugeridas por produto (mm). Só se aplicam enquanto o cliente não as alterar. */
const PRODUCT_DEFAULTS = {
  window: { width: 1000, height: 1200, openingType: 'tilt_turn', parts: 1 },
  door: { width: 1000, height: 2150, openingType: 'casement_1', parts: 1 },
  glass: { width: 1000, height: 800 },
  mirror: { width: 600, height: 900 },
  other: { width: 1200, height: 1200 }
};
const MAX_PHOTOS = 10;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const SLIDING_OR_DOUBLE = /^(sliding_\d|casement_2)$/;

const form = document.getElementById('configurator-form');
const productChoices = document.getElementById('productChoices');
const openingChoices = document.getElementById('openingChoices');
const previewStage = document.getElementById('previewStage');
const previewTitle = document.getElementById('previewTitle');
const summaryList = document.getElementById('summaryList');
const submitButton = document.getElementById('submitButton');
const resultCard = document.getElementById('resultCard');
const resultKicker = document.getElementById('resultKicker');
const resultTitle = document.getElementById('resultTitle');
const resultMessage = document.getElementById('resultMessage');
const validationMessage = document.getElementById('validationMessage');
const $ = (id) => document.getElementById(id);
let repairPhotos = [];
// 2D por defeito: o 3D só arranca (e só gasta GPU) quando o cliente o pede.
let previewMode = '2d';
let threeViewer = null;
// O cliente já mexeu nas medidas / na abertura / nas partes? Se sim, trocar de produto não as substitui.
const touched = { size: false, opening: false, parts: false };

/*
 * Pedido com vários itens: `orderItems` guarda os itens já adicionados (sem dados de contacto);
 * o formulário mostra sempre o item em edição (`editingIndex`, ou um item novo quando é null).
 */
const ORDER_STORAGE_KEY = 'configurador.pedido.v1';
const CONTACT_FIELDS = ['customerName', 'customerPhone', 'customerEmail', 'address'];
let orderItems = [];
let editingIndex = null;
let currentDirty = false;
let blankItem = null;
let restoring = false;

/* ------------------------------------------------------------ escolhas */

function fillSelect(id, options) {
  $(id).innerHTML = options.map((option) => `<option value="${option.value}">${escapeHtml(option.label)}</option>`).join('');
}

function radioCards(name, options, checked, icon = () => '') {
  return options.map((item) => `
    <label class="choice-card need-card">
      <input class="sr-only" type="radio" name="${name}" value="${item.value}" ${item.value === checked ? 'checked' : ''}>
      ${icon(item)}<strong>${escapeHtml(item.label)}</strong>${item.hint ? `<span>${escapeHtml(item.hint)}</span>` : ''}
    </label>`).join('');
}

function checkedValue(name) {
  return form.querySelector(`input[name="${name}"]:checked`)?.value ?? null;
}

function renderProductChoices() {
  fillSelect('productType', CONFIGURATOR_RULES.productTypes);
  productChoices.innerHTML = CONFIGURATOR_RULES.productTypes.map((item) => `
    <button type="button" class="choice-card product-choice" data-value="${item.value}" aria-pressed="false">
      <em aria-hidden="true">${PRODUCT_ICONS[item.value] || '•'}</em><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(PRODUCT_TEXT[item.value] || '')}</span>
    </button>`).join('');
  productChoices.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
    $('productType').value = button.dataset.value;
    applyProductDefaults(button.dataset.value);
    updateUiFromState();
  }));
}

function renderOpeningChoices() {
  fillSelect('openingType', CONFIGURATOR_RULES.joineryOpeningTypes);
  openingChoices.innerHTML = CONFIGURATOR_RULES.joineryOpeningTypes.map((item) => `
    <button type="button" class="choice-card opening-choice" data-value="${item.value}" aria-pressed="false">
      ${openingIcon(item.value)}<strong>${escapeHtml(item.label.replace('Oscilo-batente', 'Oscilobatente'))}</strong><span>${escapeHtml(OPENING_TEXT[item.value] || '')}</span>
    </button>`).join('');
  openingChoices.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
    touched.opening = true;
    $('openingType').value = button.dataset.value;
    // Correr e duas folhas já ocupam o vão inteiro: começa com uma só parte.
    if (SLIDING_OR_DOUBLE.test(button.dataset.value)) setPartCount(1);
    updateUiFromState();
  }));
}

function renderPartChoices() {
  $('partChoices').innerHTML = [1, 2, 3].map((count) => `
    <label class="choice-card need-card part-card">
      <input class="sr-only" type="radio" name="partCount" value="${count}" ${count === 1 ? 'checked' : ''}>
      ${partsIcon(count)}<strong>${count === 1 ? 'Inteira' : `${count} partes`}</strong>
    </label>`).join('');
  $('partChoices').querySelectorAll('input').forEach((input) => input.addEventListener('change', () => { touched.parts = true; setPartCount(Number(input.value)); }));
}

function setPartCount(count) {
  $('moduleCount').value = String(count);
  const radio = form.querySelector(`input[name="partCount"][value="${count}"]`);
  if (radio) radio.checked = true;
}

function renderColorChoices() {
  $('colorChoices').innerHTML = CONFIGURATOR_RULES.colors.map((item) => `
    <label class="swatch" title="${escapeHtml(item.label)}">
      <input class="sr-only" type="radio" name="color" value="${item.value}" ${item.value === 'white' ? 'checked' : ''}>
      <i style="background:${item.finish === 'anodized' ? `linear-gradient(135deg, ${item.hex}, #ffffff 45%, ${item.hex} 70%)` : item.hex}"></i>
      <span>${escapeHtml(item.label)}</span>
    </label>`).join('');
}

function renderSimpleChoices() {
  $('handChoices').innerHTML = radioCards('openingHand', [
    { value: 'left', label: 'À esquerda' },
    { value: 'right', label: 'À direita' }
  ], 'left', (item) => handIcon(item.value));
  $('systemChoices').innerHTML = radioCards('profileSystem', SYSTEM_OPTIONS, 'thermal');
  $('infillChoices').innerHTML = radioCards('doorInfill', INFILL_OPTIONS, 'glass', (item) => infillIcon(item.value));
  $('sunChoices').innerHTML = radioCards('glassSun', SUN_OPTIONS, 'unknown');
  $('priorityChoices').innerHTML = radioCards('glassPriority', PRIORITY_OPTIONS, 'balanced');
  $('glassFunctionChoices').innerHTML = GLASS_FUNCTIONS.map((item) => `
    <label class="check-card"><input type="checkbox" name="glassFunctions" value="${item.id}"><span>${escapeHtml(item.label)}</span></label>`).join('');
  $('hardwareGrid').innerHTML = CONFIGURATOR_RULES.hardware.filter((item) => item.value !== 'handle').map((item) => `
    <label class="check-card"><input type="checkbox" name="hardware" value="${item.value}"><span>${escapeHtml(item.label)}</span></label>`).join('');
  $('shapeChoices').innerHTML = radioCards('shape', CONFIGURATOR_RULES.shapes, 'rectangular', (item) => shapeIcon(item.value));
  $('finishChoices').innerHTML = radioCards('glassFinish', CONFIGURATOR_RULES.finishes, 'clear', (item) => finishIcon(item.value));
  $('repairItemChoices').innerHTML = radioCards('repairItem', REPAIR_ITEMS, 'janela');
  $('repairIssueChoices').innerHTML = REPAIR_ISSUES.map((issue) => `
    <label class="check-card"><input type="checkbox" name="repairIssue" value="${escapeHtml(issue)}"><span>${escapeHtml(issue)}</span></label>`).join('');
}

/* --------------------------------------------------------------- partes */

function openingToEngine(type, hand) {
  if (type === 'casement_1') return hand === 'left' ? 'casement_left' : 'casement_right';
  if (type === 'casement_2') return 'double_casement';
  if (type === 'tilt_turn') return hand === 'left' ? 'tilt_turn_left' : 'tilt_turn_right';
  return type;
}

/** Partes iguais: a primeira abre como escolhido e as restantes ficam fixas (exceto correr/duas folhas). */
function partTypes(count) {
  const type = $('openingType').value;
  const engine = openingToEngine(type, checkedValue('openingHand') || 'left');
  return Array.from({ length: count }, (_, index) => (index === 0 || SLIDING_OR_DOUBLE.test(type) ? engine : 'fixed'));
}

/* ------------------------------------------------------------- estado */

function applyProductDefaults(productType) {
  const defaults = PRODUCT_DEFAULTS[productType];
  if (!defaults) return;
  if (!touched.size) {
    const factor = $('unit').value === 'cm' ? 10 : 1;
    $('width').value = String(defaults.width / factor);
    $('height').value = String(defaults.height / factor);
  }
  if (defaults.openingType && !touched.opening) $('openingType').value = defaults.openingType;
  if (defaults.parts && !touched.parts && !touched.opening) setPartCount(defaults.parts);
}

function setDefaults() {
  renderProductChoices();
  renderOpeningChoices();
  renderPartChoices();
  renderColorChoices();
  renderSimpleChoices();
  Object.entries({ productType: 'window', unit: 'mm' }).forEach(([key, value]) => { $(key).value = value; });
  applyProductDefaults('window');
}

function isMaintenance() { return $('productType').value === 'maintenance'; }

function itemSnapshot() {
  const raw = getRawFormData();
  CONTACT_FIELDS.forEach((key) => { delete raw[key]; });
  return raw;
}

function setRadio(name, value) {
  const input = value != null ? form.querySelector(`input[name="${name}"][value="${CSS.escape(String(value))}"]`) : null;
  if (input) input.checked = true;
}

function setChecks(name, values = []) {
  form.querySelectorAll(`input[name="${name}"]`).forEach((input) => { input.checked = values.includes(input.value); });
}

/** Repõe no formulário um item guardado (para o editar) ou o item em branco. */
function loadItem(raw) {
  restoring = true;
  ['productType', 'openingType', 'unit'].forEach((key) => { if (raw[key]) $(key).value = raw[key]; });
  ['width', 'height', 'reference', 'quantity', 'notes'].forEach((key) => { $(key).value = raw[key] ?? ''; });
  $('hasTopLight').checked = Boolean(raw.hasTopLight);
  setPartCount(Number(raw.moduleCount) || 1);
  ['openingHand', 'color', 'profileSystem', 'glassFinish', 'shape', 'glassSun', 'glassPriority', 'doorInfill'].forEach((key) => setRadio(key, raw[key]));
  setChecks('hardware', raw.hardware || []);
  setChecks('glassFunctions', raw.glassFunctions || []);
  restoring = false;
}

function saveOrder() {
  try { localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(orderItems)); } catch { /* sem armazenamento: o pedido vive só nesta página */ }
}

function restoreOrder() {
  try {
    const stored = JSON.parse(localStorage.getItem(ORDER_STORAGE_KEY) || '[]');
    if (Array.isArray(stored)) orderItems = stored.filter((item) => item && item.productType && item.productType !== 'maintenance');
  } catch { orderItems = []; }
}

function itemLabel(raw) {
  const config = normalizeConfiguratorInput(raw);
  const title = config.category === 'joinery'
    ? `${labelFor(CONFIGURATOR_RULES.productTypes, config.productType)} ${OPENING_TITLE[config.openingType] || ''}`.trim()
    : labelFor(CONFIGURATOR_RULES.productTypes, config.productType);
  const quantity = Number(raw.quantity) > 1 ? ` · ${raw.quantity} unidades` : '';
  const where = raw.reference ? ` · ${raw.reference}` : '';
  return { config, title, detail: `${config.width} × ${config.height} mm${quantity}${where}` };
}

function renderOrderList() {
  const rows = orderItems.map((raw, index) => ({ raw, index, current: index === editingIndex }));
  const showCurrentNew = editingIndex === null && (orderItems.length > 0);
  const list = $('orderList');
  list.innerHTML = [
    ...rows.map(({ raw, index, current }) => {
      const { config, title, detail } = itemLabel(current ? itemSnapshot() : raw);
      return `
        <div class="order-item ${current ? 'current' : ''}">
          <div class="order-thumb">${buildPreviewSvg(config, 'commercial')}</div>
          <div class="order-text"><strong>${index + 1}. ${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span>${current ? '<div class="order-badge">A editar agora</div>' : ''}</div>
          <div class="order-actions">
            ${current ? '' : `<button type="button" data-edit="${index}">Editar</button>`}
            <button type="button" data-remove="${index}" aria-label="Remover item ${index + 1}">Remover</button>
          </div>
        </div>`;
    }),
    showCurrentNew ? (() => {
      const { config, title, detail } = itemLabel(itemSnapshot());
      return `
        <div class="order-item current">
          <div class="order-thumb">${buildPreviewSvg(config, 'commercial')}</div>
          <div class="order-text"><strong>${orderItems.length + 1}. ${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span><div class="order-badge">${currentDirty ? 'A configurar agora' : 'Novo item (ainda por configurar)'}</div></div>
          <div class="order-actions"></div>
        </div>`;
    })() : ''
  ].join('');
  list.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => editItem(Number(button.dataset.edit))));
  list.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => removeItem(Number(button.dataset.remove))));
  $('addItemButton').textContent = editingIndex === null ? '+ Adicionar ao pedido e configurar outra' : 'Guardar alterações e configurar outra';
  const position = editingIndex === null ? orderItems.length + 1 : editingIndex + 1;
  $('previewKicker').textContent = orderItems.length ? `Item ${position} · a sua escolha` : 'A sua escolha';
  // Manutenção é um pedido à parte (com fotografias): não se mistura com um pedido de vários itens.
  const maintenanceCard = productChoices.querySelector('[data-value="maintenance"]');
  if (maintenanceCard) maintenanceCard.style.display = orderItems.length ? 'none' : '';
}

function startNewItem() {
  editingIndex = null;
  currentDirty = false;
  Object.keys(touched).forEach((key) => { touched[key] = false; });
  loadItem(blankItem);
  applyProductDefaults($('productType').value);
  updateUiFromState();
  document.getElementById('simulador').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function commitCurrentItem() {
  const raw = itemSnapshot();
  const config = normalizeConfiguratorInput(raw);
  if (!config.validation.valid) return false;
  if (editingIndex === null) orderItems.push(raw);
  else orderItems[editingIndex] = raw;
  saveOrder();
  return true;
}

function addAnotherItem() {
  if (isMaintenance()) return;
  if (!commitCurrentItem()) {
    renderValidation(normalizeConfiguratorInput(getRawFormData()));
    $('width').focus();
    return;
  }
  startNewItem();
}

function editItem(index) {
  // O que estava a ser configurado não se perde: entra no pedido antes de editar outro item.
  if (editingIndex !== null || currentDirty) commitCurrentItem();
  editingIndex = index;
  currentDirty = false;
  Object.keys(touched).forEach((key) => { touched[key] = true; });
  loadItem(orderItems[index]);
  updateUiFromState();
  document.getElementById('simulador').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function removeItem(index) {
  orderItems.splice(index, 1);
  if (editingIndex === index) { editingIndex = null; startNewItem(); }
  else if (editingIndex !== null && editingIndex > index) editingIndex -= 1;
  saveOrder();
  updateUiFromState();
}

/** Itens a enviar: os guardados mais o que está no formulário (se foi configurado). */
function itemsToSend() {
  const items = [...orderItems];
  const current = itemSnapshot();
  if (editingIndex !== null) items[editingIndex] = current;
  else if (currentDirty || !items.length) items.push(current);
  return items;
}

function getRawFormData() {
  const data = new FormData(form);
  const count = Number(data.get('moduleCount') || 1);
  return {
    productType: data.get('productType'), openingType: data.get('openingType'), openingHand: data.get('openingHand'),
    openingDirection: data.get('openingDirection'), width: data.get('width'), height: data.get('height'),
    unit: data.get('unit'), color: data.get('color'), profileDepth: data.get('profileDepth'), profileSystem: data.get('profileSystem'),
    glassFinish: data.get('glassFinish'), shape: data.get('shape'), notes: data.get('notes'),
    customerName: data.get('customerName'), customerPhone: data.get('customerPhone'), customerEmail: data.get('customerEmail'),
    reference: data.get('reference'), quantity: data.get('quantity'), viewSide: data.get('viewSide'),
    dimensionMode: data.get('dimensionMode'), moduleCount: count, hasTopLight: data.get('hasTopLight') === 'on',
    moduleTypes: partTypes(count), hardware: [...new Set(['handle', ...data.getAll('hardware')])],
    doorInfill: data.get('doorInfill'),
    glassSun: data.get('glassSun'), glassPriority: data.get('glassPriority'), glassFunctions: data.getAll('glassFunctions'),
    showDimensions: $('showDimensions').checked, showOpeningSymbols: $('showOpeningSymbols').checked
  };
}

function toggle(selector, show) { document.querySelectorAll(selector).forEach((element) => { element.style.display = show ? '' : 'none'; }); }

function syncConditionalFields(config) {
  const maintenance = isMaintenance();
  const joinery = config.category === 'joinery' && !maintenance;
  const decorative = config.category === 'decorative_glass';
  const opening = CONFIGURATOR_RULES.joineryOpeningTypes.find((item) => item.value === config.openingType);
  toggle('.joinery-only', joinery);
  toggle('.glass-controls', decorative);
  toggle('.glass-only', config.productType === 'glass');
  toggle('.maintenance-only', maintenance);
  toggle('.not-maintenance', !maintenance);
  $('handGroup').style.display = joinery && opening?.requiresHand ? '' : 'none';
  toggle('.door-only', joinery && config.productType === 'door');
  // Porta inteiriça sem partes fixas: não há vidro, por isso as perguntas de conforto do vidro não se aplicam.
  const noGlass = config.doorInfill === 'panel' && config.moduleTypes.every((type) => type !== 'fixed') && !config.hasTopLight;
  $('glassBlock').style.display = joinery && !noGlass ? '' : 'none';
}

function renderChoiceStates(config) {
  [[productChoices, config.productType], [openingChoices, config.openingType]].forEach(([container, value]) => {
    container.querySelectorAll('button').forEach((button) => {
      const active = button.dataset.value === value;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  });
}

function renderValidation(config) {
  validationMessage.className = 'validation-message';
  validationMessage.textContent = '';
  const valid = isMaintenance() || config.validation.valid;
  if (!valid) {
    validationMessage.classList.add('visible', 'error');
    validationMessage.textContent = 'Verifique as medidas: a largura e a altura têm de ter pelo menos 20 cm.';
  }
  submitButton.disabled = !valid;
}

function renderPreview(config) {
  if (isMaintenance()) { renderMaintenancePreview(); return; }
  const use3d = config.category === 'joinery' && previewMode === '3d';
  previewStage.classList.toggle('mode-3d', use3d);
  $('preview2dOptions').hidden = use3d;
  $('previewHint').textContent = use3d
    ? 'INDALSU · DOMO — arraste para ver os perfis em perspetiva.'
    : 'Vista frontal proporcional às medidas configuradas.';
  document.querySelectorAll('[data-preview-mode]').forEach((button) => {
    const active = button.dataset.previewMode === previewMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  if (use3d) {
    try {
      if (!threeViewer) threeViewer = new Joinery3DViewer(previewStage);
      threeViewer.update(config.geometryConfig, {
        profileDepth: config.profileDepth,
        glassThickness: config.glass?.thickness
      });
    } catch (error) {
      console.error('Não foi possível iniciar a vista 3D.', error);
      threeViewer?.destroy();
      threeViewer = null;
      previewMode = '2d';
      previewStage.classList.remove('mode-3d');
      previewStage.innerHTML = `<div class="preview-webgl-error">A vista 3D não está disponível neste dispositivo. A mostrar a vista 2D.</div>`;
      setTimeout(updateUiFromState, 0);
    }
  } else {
    if (threeViewer) {
      threeViewer.destroy();
      threeViewer = null;
    }
    previewStage.innerHTML = buildPreviewSvg(config, 'commercial');
  }
  const summary = buildSummaryData(config);
  previewTitle.textContent = config.category === 'joinery'
    ? `${labelFor(CONFIGURATOR_RULES.productTypes, config.productType)} ${OPENING_TITLE[config.openingType] || ''}`.trim()
    : summary.title || 'Produto';
  const rows = [['Medidas', `${config.width} × ${config.height} mm`]];
  if (config.category === 'joinery') {
    if (config.moduleCount > 1) rows.push(['Partes', `${config.moduleCount}${config.hasTopLight ? ' + bandeira' : ''}`]);
    if (config.doorInfill) rows.push(['Porta', config.doorInfill === 'panel' ? 'Inteiriça (painel)' : 'Com vidro']);
    rows.push(
      ['Sistema', `${config.manufacturer} · ${config.series}`],
      ['Cor', labelFor(CONFIGURATOR_RULES.colors, config.color)],
      ['Caixilho', config.thermalBreak ? 'Com corte térmico' : 'Standard']
    );
  }
  if (config.category === 'decorative_glass') {
    rows.push(['Forma', labelFor(CONFIGURATOR_RULES.shapes, config.decorative?.shape)]);
    if (config.productType === 'glass') rows.push(['Aspeto', labelFor(CONFIGURATOR_RULES.finishes, config.decorative?.finish)]);
  }
  if (Number(config.geometryConfig?.quantity) > 1) rows.push(['Quantidade', String(config.geometryConfig.quantity)]);
  renderSummaryRows(rows);
}

function renderSummaryRows(rows) {
  summaryList.innerHTML = rows.map(([label, value]) => `<div class="summary-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
}

function updateUiFromState() {
  const config = normalizeConfiguratorInput(getRawFormData());
  syncConditionalFields(config);
  renderChoiceStates(config);
  renderValidation(config);
  renderPreview(config);
  renderOrderList();
}

/* ---------------------------------------------------------- manutenção */

function repairData() {
  return {
    item: REPAIR_ITEMS.find((item) => item.value === checkedValue('repairItem'))?.label || '',
    issues: [...form.querySelectorAll('input[name="repairIssue"]:checked')].map((input) => input.value),
    description: $('repairDescription').value.trim()
  };
}

function renderMaintenancePreview() {
  if (threeViewer) {
    threeViewer.destroy();
    threeViewer = null;
  }
  previewStage.classList.remove('mode-3d');
  const repair = repairData();
  previewTitle.textContent = 'Pedido de manutenção';
  previewStage.innerHTML = repairPhotos.length
    ? `<div class="photo-preview">${repairPhotos.map((photo) => `<img src="${photo.url}" alt="Fotografia ${escapeHtml(photo.file.name)}">`).join('')}</div>`
    : `<div class="maintenance-empty"><span aria-hidden="true">🔧</span><p>Adicione fotografias do problema: ajudam o técnico a preparar a visita.</p></div>`;
  const rows = [['Onde', repair.item || '—']];
  if (repair.issues.length) rows.push(['Problema', repair.issues.join(', ')]);
  rows.push(['Fotografias', String(repairPhotos.length)]);
  renderSummaryRows(rows);
}

function renderPhotoList() {
  $('repairPhotoList').innerHTML = repairPhotos.map((photo, index) => `
    <figure class="photo-item">
      <img src="${photo.url}" alt="">
      <button type="button" data-remove="${index}" aria-label="Remover ${escapeHtml(photo.file.name)}">×</button>
    </figure>`).join('');
  $('repairPhotoList').querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
    const [removed] = repairPhotos.splice(Number(button.dataset.remove), 1);
    URL.revokeObjectURL(removed.url);
    renderPhotoList();
    updateUiFromState();
  }));
}

function addPhotos(files) {
  const problems = [];
  [...files].forEach((file) => {
    if (!file.type.startsWith('image/')) problems.push(`${file.name}: não é uma imagem.`);
    else if (file.size > MAX_PHOTO_BYTES) problems.push(`${file.name}: tem mais de 5 MB.`);
    else if (repairPhotos.length >= MAX_PHOTOS) problems.push(`Máximo de ${MAX_PHOTOS} fotografias.`);
    else repairPhotos.push({ file, url: URL.createObjectURL(file) });
  });
  renderPhotoList();
  updateUiFromState();
  if (problems.length) {
    validationMessage.className = 'validation-message visible warning';
    validationMessage.textContent = [...new Set(problems)].join(' ');
  }
}

/* -------------------------------------------------------------- envio */

function contactProblem(raw) {
  if (!String(raw.customerName || '').trim()) return { message: 'Indique o seu nome.', field: 'customerName' };
  if (isMaintenance()) {
    const repair = repairData();
    if (!repair.description && !repair.issues.length) return { message: 'Diga-nos qual é o problema.', field: 'repairDescription' };
    if (!String(raw.customerPhone || '').trim()) return { message: 'Indique um telefone para combinarmos a visita.', field: 'customerPhone' };
    if (!$('address').value.trim()) return { message: 'Indique a morada onde é o trabalho.', field: 'address' };
    return null;
  }
  if (!String(raw.customerPhone || '').trim() && !String(raw.customerEmail || '').trim()) return { message: 'Indique um telefone ou um email para o contactarmos.', field: 'customerPhone' };
  return null;
}

function showResult(kicker, title, message, error = false) {
  resultCard.classList.remove('hidden');
  resultCard.classList.toggle('error', error);
  resultKicker.textContent = kicker;
  resultTitle.textContent = title;
  resultMessage.textContent = message;
  resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  resultCard.focus({ preventScroll: true });
}

/** Manutenção usa o pedido de serviço existente (/api/lead), com as fotografias anexadas. */
function sendMaintenance(raw) {
  const repair = repairData();
  const body = new FormData();
  body.append('nome', raw.customerName.trim());
  body.append('telefone', raw.customerPhone.trim());
  body.append('email', (raw.customerEmail || '').trim());
  body.append('morada', $('address').value.trim());
  body.append('servico', 'manutencao');
  body.append('tipo', [repair.item, ...repair.issues].filter(Boolean).join(' · '));
  body.append('descricao', repair.description || repair.issues.join(', '));
  repairPhotos.forEach((photo) => body.append('fotos', photo.file, photo.file.name));
  return fetch('/api/lead', { method: 'POST', body });
}

async function submitConfigurator(event) {
  event.preventDefault();
  const raw = getRawFormData();
  const problem = contactProblem(raw);
  if (problem) {
    validationMessage.className = 'validation-message visible error';
    validationMessage.textContent = problem.message;
    $(problem.field).focus();
    return;
  }
  submitButton.disabled = true;
  submitButton.textContent = 'A enviar...';
  try {
    const maintenance = isMaintenance();
    const items = maintenance ? [] : itemsToSend();
    const response = maintenance
      ? await sendMaintenance(raw)
      : await fetch('/api/configurador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, customerName: raw.customerName, customerPhone: raw.customerPhone, customerEmail: raw.customerEmail })
      });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || 'Não foi possível enviar o pedido.');
    const name = String(raw.customerName).trim().split(' ')[0];
    const count = items.length > 1 ? ` com ${items.length} itens` : '';
    showResult('Pedido enviado', `Obrigado, ${name}!`, maintenance
      ? `Recebemos o seu pedido de manutenção (ref. ${result.id}). Vamos ligar-lhe para combinar a visita do técnico.`
      : `Recebemos o seu pedido${count} (ref. ${result.id}). Vamos ligar-lhe para confirmar o pedido e entregar o orçamento ou proposta.`);
    if (!maintenance) {
      orderItems = [];
      editingIndex = null;
      currentDirty = false;
      saveOrder();
      renderOrderList();
    }
  } catch (error) {
    showResult('Não foi possível enviar', 'Tente novamente', `${error.message} Se o problema continuar, contacte-nos por telefone.`, true);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Pedir proposta';
  }
}

function downloadPng() {
  const svg = buildPreviewSvg(normalizeConfiguratorInput(getRawFormData()), 'commercial');
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const image = new Image(); const url = URL.createObjectURL(blob);
  image.onload = () => {
    const ratio = image.naturalHeight / image.naturalWidth || 0.75;
    const canvas = document.createElement('canvas');
    canvas.width = 2400; canvas.height = Math.round(2400 * ratio);
    const context = canvas.getContext('2d'); context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob((png) => { if (png) triggerDownload(URL.createObjectURL(png), 'a-minha-janela.png'); }, 'image/png', 1);
  };
  image.src = url;
}

function triggerDownload(url, filename) {
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------------------------------------------------------------- ícones */

function iconSvg(inner, width = 44, height = 44) {
  return `<svg class="choice-icon" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">${inner}</svg>`;
}

function openingIcon(type) {
  const frame = '<rect x="5" y="5" width="34" height="34" rx="1.5"/>';
  const dash = 'stroke-dasharray="3 2"';
  const icons = {
    fixed: `${frame}<path d="M12 30 L20 14 M17 33 L27 13" stroke-width="1" opacity=".45"/>`,
    casement_1: `${frame}<path d="M8 8 L36 22 L8 36" ${dash}/>`,
    tilt_turn: `${frame}<path d="M8 8 L36 22 L8 36" ${dash}/><path d="M8 8 L22 36 L36 8" ${dash}/>`,
    casement_2: `${frame}<path d="M22 5 V39"/><path d="M8 8 L20 22 L8 36 M36 8 L24 22 L36 36" ${dash}/>`,
    sliding_2: `${frame}<path d="M22 5 V39"/><path d="M10 22 H19 M16 19 L19 22 L16 25 M34 22 H25 M28 19 L25 22 L28 25"/>`,
    sliding_3: `${frame}<path d="M16.3 5 V39 M27.7 5 V39"/><path d="M8 22 H13 M11 20 L13 22 L11 24 M36 22 H31 M33 20 L31 22 L33 24 M19 22 H25 M20.5 20.5 L19 22 L20.5 23.5 M23.5 20.5 L25 22 L23.5 23.5"/>`,
    sliding_4: `${frame}<path d="M13.5 5 V39 M22 5 V39 M30.5 5 V39"/><path d="M15 22 H20 M18 20 L20 22 L18 24 M29 22 H24 M26 20 L24 22 L26 24"/>`,
    hopper: `${frame}<path d="M8 8 L22 36 L36 8" ${dash}/>`
  };
  return iconSvg(icons[type] || frame);
}

function partsIcon(count) {
  const lines = Array.from({ length: count - 1 }, (_, index) => `<path d="M${(5 + (34 / count) * (index + 1)).toFixed(1)} 5 V39"/>`).join('');
  return iconSvg(`<rect x="5" y="5" width="34" height="34" rx="1.5"/>${lines}`);
}

function handIcon(side) {
  const hingeX = side === 'left' ? 6 : 38;
  const tipX = side === 'left' ? 36 : 8;
  return iconSvg(`<rect x="5" y="5" width="34" height="34" rx="1.5"/><path d="M${hingeX} 8 L${tipX} 22 L${hingeX} 36" stroke-dasharray="3 2"/><rect x="${hingeX - 1.5}" y="10" width="3" height="6" fill="currentColor"/><rect x="${hingeX - 1.5}" y="28" width="3" height="6" fill="currentColor"/>`);
}

function infillIcon(value) {
  if (value === 'panel') return iconSvg('<rect x="9" y="4" width="26" height="36" rx="1.5" fill="currentColor" fill-opacity=".22"/><path d="M13 14h18M13 20h18M13 26h18M13 32h18" stroke-width="1"/><circle cx="30" cy="22" r="1.6" fill="currentColor"/>');
  return iconSvg('<rect x="9" y="4" width="26" height="36" rx="1.5"/><rect x="13" y="8" width="18" height="28"/><path d="M16 30 L24 14 M20 32 L28 16" stroke-width="1" opacity=".45"/><circle cx="30" cy="22" r="1.6" fill="currentColor"/>');
}

function shapeIcon(shape) {
  if (shape === 'round') return iconSvg('<circle cx="22" cy="22" r="16"/>');
  if (shape === 'other') return iconSvg('<path d="M8 36 V18 Q22 2 36 18 V36 Z" stroke-dasharray="3 2"/>');
  return iconSvg('<rect x="7" y="9" width="30" height="26" rx="1.5"/>');
}

function finishIcon(finish) {
  if (finish === 'frosted') return iconSvg('<rect x="7" y="7" width="30" height="30" rx="1.5" fill="currentColor" fill-opacity=".18"/><path d="M12 14h2M20 12h2M28 16h2M14 24h2M24 22h2M18 31h2M29 29h2" stroke-linecap="round"/>');
  if (finish === 'other') return iconSvg('<rect x="7" y="7" width="30" height="30" rx="1.5" stroke-dasharray="3 2"/><path d="M19 18a3 3 0 1 1 4 3c-1 .6-1 1.3-1 2.5M22 28v.5" stroke-linecap="round"/>');
  return iconSvg('<rect x="7" y="7" width="30" height="30" rx="1.5"/><path d="M13 27 L22 14 M18 30 L27 17" stroke-width="1" opacity=".45"/>');
}

function labelFor(options, value) { return options.find((item) => item.value === value)?.label || value || '—'; }
function escapeHtml(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/* ---------------------------------------------------------------- arranque */

document.querySelectorAll('[data-preview-mode]').forEach((button) => button.addEventListener('click', () => {
  previewMode = button.dataset.previewMode;
  updateUiFromState();
}));

setDefaults();
blankItem = itemSnapshot();
restoreOrder();
// Atalhos vindos do site (ex.: /configurador?produto=maintenance).
const requestedProduct = new URLSearchParams(location.search).get('produto');
if (requestedProduct && CONFIGURATOR_RULES.productTypes.some((item) => item.value === requestedProduct)) {
  $('productType').value = requestedProduct;
  applyProductDefaults(requestedProduct);
}
updateUiFromState();
// Qualquer alteração ao item (não aos contactos) conta como "item configurado".
['input', 'change', 'click'].forEach((type) => form.addEventListener(type, (event) => {
  if (restoring || event.target.closest('#orderBlock') || CONTACT_FIELDS.includes(event.target.id)) return;
  if (type === 'click' && !event.target.closest('.choice-card')) return;
  currentDirty = true;
}, true));
$('addItemButton').addEventListener('click', addAnotherItem);
form.addEventListener('input', updateUiFromState);
form.addEventListener('change', updateUiFromState);
form.addEventListener('submit', submitConfigurator);
['width', 'height'].forEach((key) => $(key).addEventListener('input', () => { touched.size = true; }));
$('repairPhotos').addEventListener('change', (event) => { addPhotos(event.target.files); event.target.value = ''; });
$('showDimensions').addEventListener('change', updateUiFromState);
$('showOpeningSymbols').addEventListener('change', updateUiFromState);
$('downloadPngButton').addEventListener('click', downloadPng);
