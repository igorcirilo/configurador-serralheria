/**
 * CadViewer — viewport 2D com comportamento próximo do AutoCAD.
 *
 * Model space escuro, grelha adaptativa, cursor em cruz com pickbox, zoom no cursor,
 * pan com botão do meio / espaço / toque, OSNAP (ponto final, médio, interseção),
 * seleção por janela/cruzamento, grips, paleta de propriedades, gestor de layers,
 * linha de comandos (ZOOM, PAN, DIST, ID, LIST, LAYER, ...) e barra de estado.
 *
 * Consome a cena gerada por `buildCadScene` (joinery-engine): mm, Y para cima.
 */

import { dimensionGeometry } from '../joinery-engine/index.js';

const COLORS = {
  background: '#212830',
  gridMinor: 'rgba(255,255,255,0.045)',
  gridMajor: 'rgba(255,255,255,0.10)',
  crosshair: 'rgba(255,255,255,0.85)',
  snap: '#f2c418',
  hover: '#ffffff',
  grip: '#1f6fff',
  gripHot: '#ff3b30',
  windowFill: 'rgba(40,110,255,0.14)',
  windowStroke: '#3c7bff',
  crossingFill: 'rgba(40,200,90,0.14)',
  crossingStroke: '#38d26a',
  rubber: '#f2c418'
};

const SNAP_LABELS = { endpoint: 'Ponto final', midpoint: 'Ponto médio', intersection: 'Interseção', center: 'Centro' };
const PICKBOX = 6;
const APERTURE = 12;

const COMMANDS = {
  ZOOM: { aliases: ['Z'], help: 'ZOOM [E]xtensão / [J]anela' },
  ZE: { aliases: [], help: 'Zoom à extensão do desenho' },
  PAN: { aliases: ['P'], help: 'Deslocar a vista (Esc para terminar)' },
  DIST: { aliases: ['DI'], help: 'Medir a distância entre dois pontos' },
  ID: { aliases: [], help: 'Mostrar as coordenadas de um ponto' },
  LIST: { aliases: ['LI'], help: 'Listar propriedades da seleção' },
  LAYER: { aliases: ['LA'], help: 'Abrir o gestor de layers' },
  SELECTALL: { aliases: ['AI_SELALL'], help: 'Selecionar tudo (Ctrl+A)' },
  REGEN: { aliases: ['RE'], help: 'Regenerar o desenho' },
  GRID: { aliases: [], help: 'Ligar/desligar grelha (F7)' },
  ORTHO: { aliases: [], help: 'Ligar/desligar modo orto (F8)' },
  OSNAP: { aliases: ['OS'], help: 'Ligar/desligar referências a objetos (F3)' },
  LWT: { aliases: [], help: 'Mostrar/ocultar espessuras de linha' },
  HELP: { aliases: ['?'], help: 'Lista de comandos' }
};

function aliasMap() {
  const map = new Map();
  Object.entries(COMMANDS).forEach(([name, def]) => {
    map.set(name, name);
    def.aliases.forEach((alias) => map.set(alias, name));
  });
  return map;
}
const ALIASES = aliasMap();

export class CadViewer {
  constructor(host, options = {}) {
    this.host = host;
    this.options = options;
    this.scene = null;
    this.view = { cx: 0, cy: 0, scale: 0.2 };
    this.userMovedView = false;
    this.mouse = null; // posição de ecrã
    this.cursorWorld = null; // posição de mundo (já com snap)
    this.activeSnap = null;
    this.hoverId = null;
    this.selection = new Set();
    this.hiddenLayers = new Set();
    this.toggles = { grid: true, ortho: false, osnap: true, lwt: false };
    this.command = null; // { name, step, points }
    this.lastCommand = null;
    this.drag = null;
    this.pointers = new Map();
    this.spaceDown = false;
    this.history = [];
    this.measurements = [];
    this.maximized = false;
    this.frame = 0;
    this.buildDom();
    this.bindEvents();
    this.resize();
    this.print('Viewport CAD pronto. Escreva HELP para ver os comandos.');
  }

  /* ---------------------------------------------------------------- DOM */

  buildDom() {
    this.host.classList.add('cadv');
    this.host.innerHTML = `
      <div class="cadv-toolbar" role="toolbar" aria-label="Ferramentas CAD">
        <div class="cadv-tool-group">
          <button type="button" data-cmd="ZE" title="Zoom extensão (duplo clique no botão do meio)">${icon('extents')}<span>Extensão</span></button>
          <button type="button" data-cmd="ZOOM W" title="Zoom janela">${icon('window')}<span>Janela</span></button>
          <button type="button" data-cmd="PAN" title="Pan">${icon('pan')}<span>Pan</span></button>
        </div>
        <div class="cadv-tool-group">
          <button type="button" data-cmd="DIST" title="Medir distância (DI)">${icon('measure')}<span>Medir</span></button>
          <button type="button" data-cmd="ID" title="Coordenadas de um ponto">${icon('point')}<span>ID</span></button>
        </div>
        <div class="cadv-tool-group">
          <div class="cadv-layer-control">
            <button type="button" class="cadv-layer-button" data-action="layers" title="Gestor de layers (LA)">${icon('layers')}<span>Layers</span></button>
            <div class="cadv-layer-panel" hidden></div>
          </div>
        </div>
        <div class="cadv-tool-group cadv-tool-end">
          <button type="button" data-action="dxf" title="Exportar DXF">${icon('download')}<span>DXF</span></button>
          <button type="button" data-action="maximize" title="Maximizar viewport">${icon('maximize')}</button>
        </div>
      </div>
      <div class="cadv-viewport" tabindex="0" aria-label="Viewport CAD. Roda do rato para zoom, botão do meio para pan.">
        <canvas></canvas>
        <div class="cadv-tooltip" hidden></div>
        <div class="cadv-props" hidden></div>
        <input class="cadv-dim-editor" type="number" step="1" hidden aria-label="Novo valor da cota">
        <div class="cadv-ucs-label">Vista ${'interior'}</div>
      </div>
      <div class="cadv-command">
        <div class="cadv-history" aria-live="polite"></div>
        <label class="cadv-prompt"><span class="cadv-prompt-text">Comando:</span><input type="text" autocomplete="off" spellcheck="false" aria-label="Linha de comandos"></label>
      </div>
      <div class="cadv-status">
        <span class="cadv-coords">0.0000, 0.0000, 0.0000</span>
        <span class="cadv-status-sep"></span>
        <button type="button" data-toggle="grid" title="Grelha (F7)">GRELHA</button>
        <button type="button" data-toggle="ortho" title="Modo orto (F8)">ORTO</button>
        <button type="button" data-toggle="osnap" title="Referência a objetos (F3)">OSNAP</button>
        <button type="button" data-toggle="lwt" title="Espessura de linha">LWT</button>
        <span class="cadv-status-fill"></span>
        <span class="cadv-units">MODELO · mm</span>
      </div>`;
    this.viewport = this.host.querySelector('.cadv-viewport');
    this.canvas = this.host.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.tooltip = this.host.querySelector('.cadv-tooltip');
    this.propsEl = this.host.querySelector('.cadv-props');
    this.dimEditor = this.host.querySelector('.cadv-dim-editor');
    this.historyEl = this.host.querySelector('.cadv-history');
    this.promptText = this.host.querySelector('.cadv-prompt-text');
    this.cmdInput = this.host.querySelector('.cadv-prompt input');
    this.coordsEl = this.host.querySelector('.cadv-coords');
    this.layerPanel = this.host.querySelector('.cadv-layer-panel');
    this.ucsLabel = this.host.querySelector('.cadv-ucs-label');
    this.syncToggles();
  }

  bindEvents() {
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.viewport);

    this.host.querySelectorAll('[data-cmd]').forEach((button) => button.addEventListener('click', () => {
      this.runCommand(button.dataset.cmd);
      this.viewport.focus();
    }));
    this.host.querySelectorAll('[data-toggle]').forEach((button) => button.addEventListener('click', () => this.toggle(button.dataset.toggle)));
    this.host.querySelector('[data-action="layers"]').addEventListener('click', () => this.toggleLayerPanel());
    this.host.querySelector('[data-action="dxf"]').addEventListener('click', () => this.options.onExportDxf?.());
    this.host.querySelector('[data-action="maximize"]').addEventListener('click', () => this.setMaximized(!this.maximized));

    const vp = this.viewport;
    vp.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    vp.addEventListener('pointermove', (event) => this.onPointerMove(event));
    vp.addEventListener('pointerup', (event) => this.onPointerUp(event));
    vp.addEventListener('pointercancel', (event) => this.onPointerUp(event));
    vp.addEventListener('pointerleave', () => { this.mouse = null; this.hoverId = null; this.hideTooltip(); this.requestDraw(); });
    vp.addEventListener('wheel', (event) => this.onWheel(event), { passive: false });
    vp.addEventListener('dblclick', (event) => this.onDoubleClick(event));
    vp.addEventListener('auxclick', (event) => { if (event.button === 1) event.preventDefault(); });
    vp.addEventListener('contextmenu', (event) => { event.preventDefault(); this.onRightClick(); });
    vp.addEventListener('keydown', (event) => this.onKeyDown(event));
    vp.addEventListener('keyup', (event) => { if (event.code === 'Space') this.spaceDown = false; });

    this.cmdInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || (event.key === ' ' && !this.cmdInput.value.includes(' ') && this.cmdInput.value && !this.command)) {
        event.preventDefault();
        this.submitCommandLine();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.cancel();
        this.viewport.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        const previous = this.history.filter((line) => line.startsWith('Comando: ')).pop();
        if (previous) this.cmdInput.value = previous.replace('Comando: ', '');
      }
    });

    this.dimEditor.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); this.commitDimEdit(); }
      if (event.key === 'Escape') { event.preventDefault(); this.closeDimEdit(); }
    });
    this.dimEditor.addEventListener('blur', () => this.closeDimEdit());

    this.onDocKey = (event) => {
      if (event.key === 'Escape' && this.maximized && !this.host.contains(document.activeElement)) this.setMaximized(false);
    };
    document.addEventListener('keydown', this.onDocKey);
    document.addEventListener('pointerdown', (event) => {
      if (!this.layerPanel.hidden && !event.target.closest('.cadv-layer-control')) this.layerPanel.hidden = true;
    });
  }

  /* -------------------------------------------------------------- scene */

  setScene(scene, { viewSide } = {}) {
    const previous = this.scene;
    this.scene = scene;
    this.layerByName = new Map((scene?.layers || []).map((layer) => [layer.name, layer]));
    this.entityById = new Map((scene?.entities || []).map((entity) => [entity.id, entity]));
    [...this.selection].forEach((id) => { if (!this.entityById.has(id)) this.selection.delete(id); });
    this.measurements = [];
    this.activeSnap = null;
    this.hideTooltip();
    this.buildSnapCache();
    this.renderLayerPanel();
    this.ucsLabel.textContent = scene ? `Vista ${scene.meta.viewSide === 'exterior' ? 'exterior' : 'interior'} · ${scene.meta.reference || ''}` : '';
    const sizeChanged = !previous || previous.meta.width !== scene?.meta.width || previous.meta.height !== scene?.meta.height;
    if (scene && (!this.userMovedView || (sizeChanged && !this.extentsVisible()))) this.zoomExtents(false);
    this.updateProps();
    this.requestDraw();
  }

  /* ------------------------------------------------------------- view */

  resize() {
    const rect = this.viewport.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    if (this.scene && !this.userMovedView) this.zoomExtents(false);
    this.requestDraw();
  }

  toScreen(p) {
    return { x: this.width / 2 + (p.x - this.view.cx) * this.view.scale, y: this.height / 2 - (p.y - this.view.cy) * this.view.scale };
  }

  toWorld(s) {
    return { x: this.view.cx + (s.x - this.width / 2) / this.view.scale, y: this.view.cy - (s.y - this.height / 2) / this.view.scale };
  }

  zoomExtents(markUser = true) {
    if (!this.scene) return;
    const { min, max } = this.scene.extents;
    this.fitBox(min, max);
    if (markUser) this.userMovedView = false;
  }

  fitBox(min, max) {
    const w = Math.max(1, max.x - min.x);
    const h = Math.max(1, max.y - min.y);
    this.view.scale = Math.min(this.width / w, this.height / h) * 0.94;
    this.view.cx = (min.x + max.x) / 2;
    this.view.cy = (min.y + max.y) / 2;
    this.requestDraw();
  }

  zoomAt(screenPoint, factor) {
    const before = this.toWorld(screenPoint);
    this.view.scale = Math.min(200, Math.max(0.002, this.view.scale * factor));
    const after = this.toWorld(screenPoint);
    this.view.cx += before.x - after.x;
    this.view.cy += before.y - after.y;
    this.userMovedView = true;
    this.requestDraw();
  }

  panBy(dx, dy) {
    this.view.cx -= dx / this.view.scale;
    this.view.cy += dy / this.view.scale;
    this.userMovedView = true;
    this.requestDraw();
  }

  extentsVisible() {
    if (!this.scene) return true;
    const a = this.toScreen(this.scene.extents.min);
    const b = this.toScreen(this.scene.extents.max);
    return a.x >= 0 && b.x <= this.width && b.y >= 0 && a.y <= this.height;
  }

  setMaximized(value) {
    this.maximized = value;
    // Move o viewport para o <body> enquanto maximizado: antepassados com transform/filter
    // criariam um containing block e cortariam o position: fixed.
    if (value) {
      this.placeholder = document.createComment('cad-viewer');
      this.host.replaceWith(this.placeholder);
      document.body.appendChild(this.host);
    } else if (this.placeholder) {
      this.placeholder.replaceWith(this.host);
      this.placeholder = null;
    }
    this.host.classList.toggle('cadv-maximized', value);
    document.documentElement.classList.toggle('cadv-lock-scroll', value);
    this.host.querySelector('[data-action="maximize"]').innerHTML = icon(value ? 'minimize' : 'maximize');
    requestAnimationFrame(() => { this.resize(); if (!this.userMovedView) this.zoomExtents(false); this.viewport.focus(); });
  }

  /* ----------------------------------------------------------- input */

  localPoint(event) {
    const rect = this.viewport.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  onPointerDown(event) {
    this.viewport.focus({ preventScroll: true });
    this.viewport.setPointerCapture(event.pointerId);
    const p = this.localPoint(event);
    this.pointers.set(event.pointerId, p);

    if (event.pointerType === 'touch') {
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.drag = { mode: 'pinch', distance: Math.hypot(a.x - b.x, a.y - b.y), mid: midpoint(a, b) };
      } else {
        this.drag = { mode: 'touch', start: p, last: p, moved: false };
      }
      return;
    }

    const panRequested = event.button === 1 || (event.button === 0 && (this.spaceDown || this.command?.name === 'PAN'));
    if (panRequested) {
      event.preventDefault();
      this.drag = { mode: 'pan', last: p };
      this.viewport.classList.add('cadv-panning');
      return;
    }
    if (event.button !== 0) return;

    if (this.command) {
      this.mouse = p;
      this.updateCursor(p);
      this.commandPick(this.cursorWorld);
      return;
    }

    const hit = this.hitTest(p);
    if (hit) {
      if (event.shiftKey) this.selection.delete(hit.id);
      else this.selection.add(hit.id);
      this.afterSelectionChange();
      return;
    }
    // Clique em vazio: inicia janela de seleção (como no AutoCAD).
    this.drag = { mode: 'window', start: p, current: p, shift: event.shiftKey };
  }

  onPointerMove(event) {
    const p = this.localPoint(event);
    if (this.pointers.has(event.pointerId)) this.pointers.set(event.pointerId, p);

    if (this.drag?.mode === 'pinch' && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = midpoint(a, b);
      this.panBy(mid.x - this.drag.mid.x, mid.y - this.drag.mid.y);
      if (this.drag.distance > 0) this.zoomAt(mid, distance / this.drag.distance);
      this.drag.distance = distance;
      this.drag.mid = mid;
      return;
    }
    if (this.drag?.mode === 'touch') {
      if (Math.hypot(p.x - this.drag.start.x, p.y - this.drag.start.y) > 6) this.drag.moved = true;
      if (this.drag.moved) this.panBy(p.x - this.drag.last.x, p.y - this.drag.last.y);
      this.drag.last = p;
      return;
    }
    if (this.drag?.mode === 'pan') {
      this.panBy(p.x - this.drag.last.x, p.y - this.drag.last.y);
      this.drag.last = p;
      return;
    }

    this.mouse = p;
    this.updateCursor(p);
    if (this.drag?.mode === 'window') this.drag.current = p;
    this.requestDraw();
  }

  onPointerUp(event) {
    const p = this.localPoint(event);
    this.pointers.delete(event.pointerId);
    if (this.viewport.hasPointerCapture(event.pointerId)) this.viewport.releasePointerCapture(event.pointerId);

    if (this.drag?.mode === 'touch' && !this.drag.moved) {
      // Toque curto: comporta-se como clique.
      this.updateCursor(p);
      if (this.command) this.commandPick(this.cursorWorld);
      else {
        const hit = this.hitTest(p, 14);
        if (hit) this.selection.add(hit.id); else this.selection.clear();
        this.afterSelectionChange();
      }
    }
    if (this.drag?.mode === 'window') {
      const { start, shift } = this.drag;
      if (Math.hypot(p.x - start.x, p.y - start.y) < 4) {
        if (!shift) this.selection.clear();
      } else {
        this.selectByWindow(start, p, shift);
      }
      this.afterSelectionChange();
    }
    if (this.drag?.mode === 'pinch' && this.pointers.size === 1) {
      const remaining = [...this.pointers.values()][0];
      this.drag = { mode: 'touch', start: remaining, last: remaining, moved: true };
      return;
    }
    if (this.pointers.size === 0) this.drag = null;
    this.viewport.classList.remove('cadv-panning');
    this.requestDraw();
  }

  onWheel(event) {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.0016));
    this.zoomAt(this.localPoint(event), factor);
    if (this.mouse) this.updateCursor(this.mouse);
  }

  onDoubleClick(event) {
    const p = this.localPoint(event);
    const hit = this.hitTest(p);
    if (hit?.kind === 'dimension' && hit.param) {
      this.openDimEdit(hit);
      return;
    }
    if (!hit) this.zoomExtents();
  }

  onRightClick() {
    // No AutoCAD, o botão direito com comando ativo equivale a Enter.
    if (this.command) this.finishCommand();
    else if (this.lastCommand) this.runCommand(this.lastCommand);
  }

  onKeyDown(event) {
    if (event.target !== this.viewport) return;
    const key = event.key;
    if (key === 'F3') { event.preventDefault(); this.toggle('osnap'); return; }
    if (key === 'F7') { event.preventDefault(); this.toggle('grid'); return; }
    if (key === 'F8') { event.preventDefault(); this.toggle('ortho'); return; }
    if (key === 'Escape') { event.preventDefault(); if (!this.command && !this.selection.size && this.maximized) this.setMaximized(false); else this.cancel(); return; }
    if (key === 'Delete') { event.preventDefault(); this.print('Os objetos são paramétricos: altere-os nas cotas (duplo clique) ou no formulário.'); return; }
    if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === 'a') { event.preventDefault(); this.runCommand('SELECTALL'); return; }
    if (event.code === 'Space' && !this.cmdInput.value) {
      event.preventDefault();
      if (!this.spaceDown && !event.repeat && !this.drag) {
        this.spaceDown = true;
        if (this.lastCommand && !this.command) { /* espaço = repetir no AutoCAD, mas mantemos pan temporário */ }
      }
      return;
    }
    if (key === 'Enter') { event.preventDefault(); if (this.command) this.finishCommand(); else if (this.lastCommand) this.runCommand(this.lastCommand); return; }
    // Escrever em qualquer lado envia para a linha de comandos.
    if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      this.cmdInput.focus();
      this.cmdInput.value += key;
    }
  }

  /* --------------------------------------------------------- commands */

  submitCommandLine() {
    const raw = this.cmdInput.value.trim();
    this.cmdInput.value = '';
    if (!raw) {
      if (this.command) this.finishCommand();
      else if (this.lastCommand) this.runCommand(this.lastCommand);
      this.viewport.focus();
      return;
    }
    if (this.command) this.commandInput(raw);
    else this.runCommand(raw);
    this.viewport.focus();
  }

  runCommand(raw) {
    const [head, ...rest] = raw.trim().toUpperCase().replace(/^_+/, '').split(/\s+/);
    const name = ALIASES.get(head);
    if (!name) { this.print(`Comando desconhecido "${head}". Escreva HELP.`); return; }
    this.cancel(true);
    this.print(`Comando: ${raw.toUpperCase()}`);
    this.lastCommand = name === 'ZOOM' && rest.length ? `ZOOM ${rest.join(' ')}` : name;
    const arg = rest.join(' ');
    switch (name) {
      case 'ZE': this.zoomExtents(); break;
      case 'ZOOM':
        if (!arg) { this.startCommand('ZOOM', 'Especifique o canto da janela ou [Extensão (E)/Janela (J)]:'); break; }
        this.commandInputFor('ZOOM', arg);
        break;
      case 'PAN': this.startCommand('PAN', 'Arraste para deslocar. Esc ou Enter para sair.'); break;
      case 'DIST': this.startCommand('DIST', 'Especifique o primeiro ponto:'); break;
      case 'ID': this.startCommand('ID', 'Especifique o ponto:'); break;
      case 'LIST': this.listSelection(); break;
      case 'LAYER': this.toggleLayerPanel(true); break;
      case 'SELECTALL':
        this.selection = new Set(this.visibleEntities().map((entity) => entity.id));
        this.afterSelectionChange();
        this.print(`${this.selection.size} objetos selecionados.`);
        break;
      case 'REGEN': this.buildSnapCache(); this.requestDraw(); this.print('A regenerar modelo.'); break;
      case 'GRID': this.toggle('grid'); break;
      case 'ORTHO': this.toggle('ortho'); break;
      case 'OSNAP': this.toggle('osnap'); break;
      case 'LWT': this.toggle('lwt'); break;
      case 'HELP':
        Object.entries(COMMANDS).forEach(([cmd, def]) => this.print(`  ${cmd}${def.aliases.length ? ` (${def.aliases.join(', ')})` : ''} — ${def.help}`));
        this.print('  Rato: roda = zoom · botão do meio / espaço+arrastar = pan · duplo clique numa cota = editar.');
        break;
      default: break;
    }
  }

  startCommand(name, prompt) {
    this.command = { name, points: [] };
    this.setPrompt(prompt);
    this.viewport.classList.toggle('cadv-pan-mode', name === 'PAN');
    this.requestDraw();
  }

  commandInputFor(name, arg) {
    if (name === 'ZOOM') {
      if (/^E/.test(arg)) { this.zoomExtents(); this.finishCommand(true); return; }
      if (/^[JW]/.test(arg)) { this.startCommand('ZOOMW', 'Especifique o primeiro canto:'); return; }
      const factor = parseFloat(arg.replace('X', ''));
      if (Number.isFinite(factor) && factor > 0) { this.zoomAt({ x: this.width / 2, y: this.height / 2 }, factor); this.finishCommand(true); return; }
      this.print('Opção inválida.');
    }
  }

  commandInput(raw) {
    const { name } = this.command;
    this.print(`${this.promptText.textContent} ${raw}`);
    if (name === 'ZOOM') { this.commandInputFor('ZOOM', raw.toUpperCase()); return; }
    // Coordenadas escritas: "x,y" absoluto ou "@dx,dy" relativo.
    const match = raw.match(/^(@)?\s*(-?\d+(?:[.,]\d+)?)\s*[,;]\s*(-?\d+(?:[.,]\d+)?)$/);
    if (match) {
      const base = match[1] && this.command.points.length ? this.command.points[this.command.points.length - 1] : { x: 0, y: 0 };
      this.commandPick({ x: base.x + parseFloat(match[2].replace(',', '.')), y: base.y + parseFloat(match[3].replace(',', '.')) }, true);
      return;
    }
    const length = parseFloat(raw.replace(',', '.'));
    if (name === 'DIST' && this.command.points.length === 1 && Number.isFinite(length) && this.cursorWorld) {
      // Entrada direta de distância na direção do cursor.
      const a = this.command.points[0];
      const angle = Math.atan2(this.cursorWorld.y - a.y, this.cursorWorld.x - a.x);
      this.commandPick({ x: a.x + Math.cos(angle) * length, y: a.y + Math.sin(angle) * length }, true);
      return;
    }
    this.print('Ponto inválido. Use x,y ou @dx,dy.');
  }

  commandPick(point, typed = false) {
    if (!this.command || !point) return;
    const { name, points } = this.command;
    if (!typed) this.print(`${this.promptText.textContent} ${fmt(point.x)},${fmt(point.y)}`);
    if (name === 'ID') {
      this.print(`X = ${fmt4(point.x)}     Y = ${fmt4(point.y)}     Z = 0.0000`);
      this.measurements = [{ kind: 'point', a: point }];
      this.finishCommand(true);
      return;
    }
    if (name === 'ZOOM' || name === 'ZOOMW') {
      points.push(point);
      if (points.length === 1) { this.command.name = 'ZOOMW'; this.setPrompt('Especifique o canto oposto:'); return; }
      const [a, b] = points;
      this.fitBox({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) });
      this.view.scale /= 0.94;
      this.userMovedView = true;
      this.finishCommand(true);
      return;
    }
    if (name === 'DIST') {
      points.push(point);
      if (points.length === 1) { this.setPrompt('Especifique o segundo ponto ou [Múltiplos pontos]:'); return; }
      const [a, b] = points;
      const dx = b.x - a.x; const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);
      const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
      this.print(`Distância = ${fmt4(distance)},  Ângulo no plano XY = ${fmt(angle)}°,  Ângulo do plano XY = 0`);
      this.print(`Delta X = ${fmt4(dx)},  Delta Y = ${fmt4(dy)},  Delta Z = 0.0000`);
      this.measurements = [{ kind: 'distance', a, b, distance }];
      this.finishCommand(true);
    }
  }

  finishCommand(silent = false) {
    if (!this.command) return;
    if (!silent && this.command.name === 'DIST' && this.command.points.length < 2) this.print('*Cancelado*');
    this.command = null;
    this.activeSnap = null;
    this.viewport.classList.remove('cadv-pan-mode');
    this.setPrompt('Comando:');
    this.hideTooltip();
    this.requestDraw();
  }

  cancel(quiet = false) {
    if (this.command) { if (!quiet) this.print('*Cancelado*'); this.finishCommand(true); }
    else if (!quiet) { this.selection.clear(); this.measurements = []; this.afterSelectionChange(); }
    this.drag = null;
    this.closeDimEdit();
  }

  setPrompt(text) { this.promptText.textContent = text; }

  print(line) {
    this.history.push(line);
    if (this.history.length > 200) this.history.shift();
    this.historyEl.innerHTML = this.history.slice(-3).map((item) => `<div>${escapeHtml(item)}</div>`).join('');
  }

  toggle(name) {
    this.toggles[name] = !this.toggles[name];
    const labels = { grid: 'Grelha', ortho: 'Orto', osnap: 'Osnap', lwt: 'Espessura de linha' };
    this.print(`<${labels[name]} ${this.toggles[name] ? 'ligado' : 'desligado'}>`);
    this.syncToggles();
    if (this.mouse) this.updateCursor(this.mouse);
    this.requestDraw();
  }

  syncToggles() {
    this.host.querySelectorAll('[data-toggle]').forEach((button) => {
      button.classList.toggle('on', Boolean(this.toggles[button.dataset.toggle]));
      button.setAttribute('aria-pressed', String(Boolean(this.toggles[button.dataset.toggle])));
    });
  }

  /* -------------------------------------------------------- selection */

  visibleEntities() {
    return (this.scene?.entities || []).filter((entity) => !this.hiddenLayers.has(entity.layer));
  }

  hitTest(screenPoint, tolerance = PICKBOX) {
    let best = null;
    let bestDistance = tolerance;
    for (const entity of this.visibleEntities()) {
      if (entity.kind === 'dimension') {
        const box = this.dimTextBox(entity);
        if (box && pointInBox(screenPoint, box)) return entity;
      }
      for (const [a, b] of this.segmentsOf(entity)) {
        const d = distanceToSegment(screenPoint, this.toScreen(a), this.toScreen(b));
        if (d < bestDistance) { bestDistance = d; best = entity; }
      }
    }
    return best;
  }

  selectByWindow(start, end, removing) {
    const crossing = end.x < start.x;
    const a = this.toWorld(start); const b = this.toWorld(end);
    const box = { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y) };
    for (const entity of this.visibleEntities()) {
      const segments = this.segmentsOf(entity);
      const inside = segments.every(([p, q]) => inBox(p, box) && inBox(q, box));
      const touches = inside || segments.some(([p, q]) => segmentIntersectsBox(p, q, box));
      if (crossing ? touches : inside) {
        if (removing) this.selection.delete(entity.id); else this.selection.add(entity.id);
      }
    }
  }

  afterSelectionChange() {
    this.updateProps();
    this.options.onSelectionChange?.([...this.selection].map((id) => this.entityById.get(id)));
    this.requestDraw();
  }

  listSelection() {
    if (!this.selection.size) { this.print('Nenhum objeto selecionado.'); return; }
    [...this.selection].slice(0, 12).forEach((id) => {
      const entity = this.entityById.get(id);
      this.print(`${entityTypeLabel(entity)}  Layer: "${entity.layer}"  ${entitySummary(entity)}`);
    });
    if (this.selection.size > 12) this.print(`... e mais ${this.selection.size - 12} objetos.`);
  }

  updateProps() {
    const items = [...this.selection].map((id) => this.entityById.get(id)).filter(Boolean);
    if (!items.length) { this.propsEl.hidden = true; return; }
    const types = new Set(items.map((entity) => entityTypeLabel(entity)));
    const layers = new Set(items.map((entity) => entity.layer));
    const rows = [
      ['Objetos', items.length === 1 ? entityTypeLabel(items[0]) : `${items.length} (${types.size > 1 ? 'Vários' : [...types][0]})`],
      ['Layer', layers.size > 1 ? '*VÁRIOS*' : [...layers][0]],
      ['Cor', layers.size > 1 ? '*VÁRIOS*' : 'PorLayer'],
      ['Tipo de linha', layers.size > 1 ? '*VÁRIOS*' : (this.layerByName.get([...layers][0])?.linetype || 'PorLayer')]
    ];
    let editable = '';
    if (items.length === 1) {
      const entity = items[0];
      if (entity.owner) rows.push(['Elemento', entity.owner]);
      if (entity.kind === 'line') {
        rows.push(['Início X,Y', `${fmt(entity.a.x)}, ${fmt(entity.a.y)}`], ['Fim X,Y', `${fmt(entity.b.x)}, ${fmt(entity.b.y)}`], ['Comprimento', fmt(Math.hypot(entity.b.x - entity.a.x, entity.b.y - entity.a.y))]);
      } else if (entity.kind === 'polyline') {
        const box = boundsOf(entity.points);
        rows.push(['Vértices', String(entity.points.length)], ['Largura', fmt(box.maxX - box.minX)], ['Altura', fmt(box.maxY - box.minY)], ['Área', `${fmt((polygonArea(entity.points)) / 1e6, 3)} m²`], ['Perímetro', fmt(perimeter(entity.points, entity.closed))]);
      } else if (entity.kind === 'text') {
        rows.push(['Conteúdo', entity.value], ['Altura', fmt(entity.height)], ['Posição X,Y', `${fmt(entity.at.x)}, ${fmt(entity.at.y)}`]);
      } else if (entity.kind === 'dimension') {
        rows.push(['Medida', `${fmt(entity.value)} mm`], ['Orientação', entity.orientation === 'horizontal' ? 'Horizontal' : 'Vertical']);
        if (entity.param) editable = `<label class="cadv-prop-edit"><span>Alterar medida</span><input type="number" step="1" value="${entity.value}" data-param="${entity.param}"></label><small>Enter aplica ao configurador.</small>`;
      }
    }
    this.propsEl.innerHTML = `<div class="cadv-props-head"><strong>Propriedades</strong><button type="button" aria-label="Fechar">×</button></div>
      <dl>${rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl>${editable}`;
    this.propsEl.hidden = false;
    this.propsEl.querySelector('button').addEventListener('click', () => { this.selection.clear(); this.afterSelectionChange(); });
    const input = this.propsEl.querySelector('input[data-param]');
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); this.applyParam(input.dataset.param, Number(input.value)); }
      event.stopPropagation();
    });
  }

  /* ---------------------------------------------------- dimension edit */

  openDimEdit(entity) {
    const box = this.dimTextBox(entity);
    if (!box) return;
    this.editingDim = entity;
    Object.assign(this.dimEditor.style, { left: `${(box.minX + box.maxX) / 2}px`, top: `${(box.minY + box.maxY) / 2}px` });
    this.dimEditor.value = String(entity.value);
    this.dimEditor.hidden = false;
    this.dimEditor.focus();
    this.dimEditor.select();
    this.print(`Editar cota ${entity.param}: introduza o novo valor (mm) e prima Enter.`);
  }

  commitDimEdit() {
    if (!this.editingDim) return;
    const value = Number(this.dimEditor.value);
    const param = this.editingDim.param;
    this.closeDimEdit();
    this.applyParam(param, value);
  }

  closeDimEdit() {
    if (this.dimEditor.hidden) return;
    this.editingDim = null;
    this.dimEditor.hidden = true;
    this.viewport.focus({ preventScroll: true });
  }

  applyParam(param, value) {
    if (!Number.isFinite(value) || value <= 0) { this.print('Valor inválido.'); return; }
    const result = this.options.onParamEdit?.(param, Math.round(value));
    if (result === false) this.print('O configurador rejeitou o valor.');
    else this.print(`Cota ${param} alterada para ${Math.round(value)} mm.`);
  }

  /* ---------------------------------------------------------- layers */

  toggleLayerPanel(force) {
    this.layerPanel.hidden = force === undefined ? !this.layerPanel.hidden : !force;
  }

  renderLayerPanel() {
    const layers = this.scene?.layers || [];
    const counts = new Map();
    (this.scene?.entities || []).forEach((entity) => counts.set(entity.layer, (counts.get(entity.layer) || 0) + 1));
    this.layerPanel.innerHTML = `<div class="cadv-layer-head"><span></span><span>Nome</span><span>Cor</span><span>Tipo de linha</span><span>Obj.</span></div>` +
      layers.map((layer) => `
        <label class="cadv-layer-row ${this.hiddenLayers.has(layer.name) ? 'off' : ''}">
          <input type="checkbox" data-layer="${layer.name}" ${this.hiddenLayers.has(layer.name) ? '' : 'checked'} aria-label="Mostrar layer ${layer.name}">
          <span class="cadv-layer-name" title="${escapeHtml(layer.description)}">${layer.name}</span>
          <span class="cadv-layer-color"><i style="background:${layer.color}"></i>${layer.aci}</span>
          <span>${layer.linetype}</span>
          <span>${counts.get(layer.name) || 0}</span>
        </label>`).join('');
    this.layerPanel.querySelectorAll('input[data-layer]').forEach((input) => input.addEventListener('change', () => {
      if (input.checked) this.hiddenLayers.delete(input.dataset.layer); else this.hiddenLayers.add(input.dataset.layer);
      input.closest('.cadv-layer-row').classList.toggle('off', !input.checked);
      [...this.selection].forEach((id) => { if (this.hiddenLayers.has(this.entityById.get(id)?.layer)) this.selection.delete(id); });
      this.buildSnapCache();
      this.afterSelectionChange();
    }));
  }

  /* ------------------------------------------------------------ snaps */

  buildSnapCache() {
    const snaps = [];
    const segments = [];
    for (const entity of this.visibleEntities()) {
      if (entity.kind === 'dimension' || entity.kind === 'text') continue;
      for (const [a, b] of this.segmentsOf(entity)) {
        segments.push([a, b]);
        snaps.push({ type: 'endpoint', p: a }, { type: 'endpoint', p: b }, { type: 'midpoint', p: midpoint(a, b) });
      }
    }
    for (let i = 0; i < segments.length; i += 1) {
      for (let j = i + 1; j < segments.length; j += 1) {
        const p = segmentIntersection(segments[i][0], segments[i][1], segments[j][0], segments[j][1]);
        if (p) snaps.push({ type: 'intersection', p });
      }
    }
    // Endpoints têm prioridade sobre interseções coincidentes.
    const seen = new Map();
    for (const snap of snaps) {
      const key = `${Math.round(snap.p.x * 10)}:${Math.round(snap.p.y * 10)}`;
      const current = seen.get(key);
      if (!current || snapRank(snap.type) < snapRank(current.type)) seen.set(key, snap);
    }
    this.snapPoints = [...seen.values()];
  }

  updateCursor(screenPoint) {
    let world = this.toWorld(screenPoint);
    this.activeSnap = null;
    if (this.toggles.osnap && this.command) {
      let best = null; let bestDistance = APERTURE;
      for (const snap of this.snapPoints || []) {
        const s = this.toScreen(snap.p);
        const d = Math.hypot(s.x - screenPoint.x, s.y - screenPoint.y);
        if (d < bestDistance || (best && Math.abs(d - bestDistance) < 0.5 && snapRank(snap.type) < snapRank(best.type))) { best = snap; bestDistance = d; }
      }
      if (best) { this.activeSnap = best; world = { ...best.p }; }
    }
    const base = this.command?.points?.[this.command.points.length - 1];
    if (this.toggles.ortho && base && !this.activeSnap) {
      if (Math.abs(world.x - base.x) > Math.abs(world.y - base.y)) world.y = base.y; else world.x = base.x;
    }
    this.cursorWorld = world;
    this.coordsEl.textContent = `${fmt4(world.x)}, ${fmt4(world.y)}, 0.0000`;
    this.hoverId = this.command || this.drag ? null : this.hitTest(screenPoint)?.id ?? null;
    this.updateTooltip(screenPoint);
  }

  updateTooltip(screenPoint) {
    let html = '';
    if (this.activeSnap) html = `<span class="cadv-snap-label">${SNAP_LABELS[this.activeSnap.type]}</span>`;
    if (this.command && this.cursorWorld) {
      const base = this.command.points[this.command.points.length - 1];
      if (base && this.command.name === 'DIST') {
        const d = Math.hypot(this.cursorWorld.x - base.x, this.cursorWorld.y - base.y);
        const angle = ((Math.atan2(this.cursorWorld.y - base.y, this.cursorWorld.x - base.x) * 180) / Math.PI + 360) % 360;
        html += `<span class="cadv-dyn"><b>${fmt(d)}</b><b>${fmt(angle)}°</b></span>`;
      } else {
        html += `<span class="cadv-dyn-prompt">${escapeHtml(this.promptText.textContent)}</span><span class="cadv-dyn"><b>${fmt(this.cursorWorld.x)}</b><b>${fmt(this.cursorWorld.y)}</b></span>`;
      }
    }
    if (!html) { this.hideTooltip(); return; }
    this.tooltip.innerHTML = html;
    this.tooltip.hidden = false;
    const x = Math.min(screenPoint.x + 18, this.width - this.tooltip.offsetWidth - 6);
    const y = Math.min(screenPoint.y + 18, this.height - this.tooltip.offsetHeight - 6);
    this.tooltip.style.transform = `translate(${x}px, ${y}px)`;
  }

  hideTooltip() { this.tooltip.hidden = true; }

  /* ---------------------------------------------------------- geometry */

  segmentsOf(entity) {
    if (entity.kind === 'line') return [[entity.a, entity.b]];
    if (entity.kind === 'polyline') {
      const pts = entity.points;
      const result = [];
      for (let i = 0; i < pts.length - 1; i += 1) result.push([pts[i], pts[i + 1]]);
      if (entity.closed && pts.length > 2) result.push([pts[pts.length - 1], pts[0]]);
      return result;
    }
    if (entity.kind === 'dimension') {
      const g = dimensionGeometry(entity);
      return [g.dimLine, ...g.extLines];
    }
    if (entity.kind === 'text') {
      const { x, y } = entity.at;
      const w = textWidth(entity); const h = entity.height;
      const c = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
      return [[c[0], c[1]], [c[1], c[2]], [c[2], c[3]], [c[3], c[0]]];
    }
    return [];
  }

  dimTextBox(entity) {
    const g = dimensionGeometry(entity);
    const s = this.toScreen(g.text);
    const h = entity.textHeight * this.view.scale;
    const w = String(Math.round(entity.value)).length * h * 0.62 + 6;
    return entity.orientation === 'horizontal'
      ? { minX: s.x - w / 2, maxX: s.x + w / 2, minY: s.y - h, maxY: s.y + 2 }
      : { minX: s.x - h, maxX: s.x + 2, minY: s.y - w / 2, maxY: s.y + w / 2 };
  }

  /* ------------------------------------------------------------ draw */

  requestDraw() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.draw(); });
  }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, this.width, this.height);
    if (this.toggles.grid) this.drawGrid();
    if (this.scene) {
      const dash = Math.max(this.scene.meta.width, this.scene.meta.height) * 0.012;
      for (const entity of this.visibleEntities()) {
        const selected = this.selection.has(entity.id);
        const hovered = this.hoverId === entity.id;
        this.drawEntity(entity, { selected, hovered, dash });
      }
      for (const id of this.selection) {
        const entity = this.entityById.get(id);
        if (entity && !this.hiddenLayers.has(entity.layer)) this.drawGrips(entity);
      }
    }
    this.drawMeasurements();
    this.drawCommandPreview();
    this.drawSelectionWindow();
    this.drawUcs();
    this.drawCursor();
  }

  drawGrid() {
    const ctx = this.ctx;
    const minPx = 14;
    let step = 1;
    const candidates = [1, 2, 5];
    let exp = 0;
    while (step * this.view.scale < minPx) {
      const index = candidates.indexOf(step / 10 ** exp);
      if (index === candidates.length - 1) { exp += 1; step = 10 ** exp; } else step = candidates[index + 1] * 10 ** exp;
    }
    const major = step * 5;
    const tl = this.toWorld({ x: 0, y: 0 });
    const br = this.toWorld({ x: this.width, y: this.height });
    ctx.lineWidth = 1;
    const drawLines = (spacing, color) => {
      ctx.strokeStyle = color;
      ctx.beginPath();
      for (let x = Math.floor(tl.x / spacing) * spacing; x <= br.x; x += spacing) {
        const sx = Math.round(this.toScreen({ x, y: 0 }).x) + 0.5;
        ctx.moveTo(sx, 0); ctx.lineTo(sx, this.height);
      }
      for (let y = Math.floor(br.y / spacing) * spacing; y <= tl.y; y += spacing) {
        const sy = Math.round(this.toScreen({ x: 0, y }).y) + 0.5;
        ctx.moveTo(0, sy); ctx.lineTo(this.width, sy);
      }
      ctx.stroke();
    };
    drawLines(step, COLORS.gridMinor);
    drawLines(major, COLORS.gridMajor);
    // Eixos X/Y do UCS.
    const o = this.toScreen({ x: 0, y: 0 });
    ctx.strokeStyle = 'rgba(230,80,80,0.35)';
    ctx.beginPath(); ctx.moveTo(0, Math.round(o.y) + 0.5); ctx.lineTo(this.width, Math.round(o.y) + 0.5); ctx.stroke();
    ctx.strokeStyle = 'rgba(80,200,110,0.35)';
    ctx.beginPath(); ctx.moveTo(Math.round(o.x) + 0.5, 0); ctx.lineTo(Math.round(o.x) + 0.5, this.height); ctx.stroke();
  }

  lineWidthFor(layer) {
    if (!this.toggles.lwt) return 1;
    return Math.max(1, layer.lineweight * 4.2);
  }

  drawEntity(entity, { selected, hovered, dash }) {
    const ctx = this.ctx;
    const layer = this.layerByName.get(entity.layer) || { color: '#fff', lineweight: 0.25, linetype: 'CONTINUOUS' };
    ctx.strokeStyle = hovered && !selected ? lighten(layer.color) : layer.color;
    ctx.fillStyle = layer.color;
    ctx.lineWidth = this.lineWidthFor(layer) + (hovered ? 1.5 : 0);
    const dashPx = dash * this.view.scale;
    if (selected) ctx.setLineDash([6, 4]);
    else if (layer.linetype === 'DASHED' && dashPx > 2) ctx.setLineDash([dashPx, dashPx * 0.5]);
    else if (layer.linetype === 'HIDDEN' && dashPx > 2) ctx.setLineDash([dashPx * 0.5, dashPx * 0.25]);
    else ctx.setLineDash([]);
    if (hovered && !selected) { ctx.shadowColor = layer.color; ctx.shadowBlur = 6; }

    if (entity.kind === 'line') {
      const a = this.toScreen(entity.a); const b = this.toScreen(entity.b);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    } else if (entity.kind === 'polyline') {
      ctx.beginPath();
      entity.points.forEach((point, index) => {
        const s = this.toScreen(point);
        const x = Math.round(s.x) + 0.5; const y = Math.round(s.y) + 0.5;
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      if (entity.closed) ctx.closePath();
      ctx.stroke();
    } else if (entity.kind === 'dimension') {
      this.drawDimension(entity, layer, selected || hovered);
    } else if (entity.kind === 'text') {
      const px = entity.height * this.view.scale;
      if (px >= 2.5) {
        const s = this.toScreen(entity.at);
        ctx.font = `${px}px "ISOCPEUR", "Arial Narrow", Arial, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = hovered || selected ? '#ffffff' : layer.color;
        ctx.fillText(entity.value, s.x, s.y);
      }
    }
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
  }

  drawDimension(entity, layer, emphasise) {
    const ctx = this.ctx;
    const g = dimensionGeometry(entity);
    ctx.beginPath();
    for (const [a, b] of [g.dimLine, ...g.extLines]) {
      const sa = this.toScreen(a); const sb = this.toScreen(b);
      ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // Setas fechadas e preenchidas (ISO-25).
    const arrow = entity.textHeight * 0.75 * this.view.scale;
    const [d1, d2] = g.dimLine;
    const s1 = this.toScreen(d1); const s2 = this.toScreen(d2);
    const angle = Math.atan2(s2.y - s1.y, s2.x - s1.x);
    const inside = Math.hypot(s2.x - s1.x, s2.y - s1.y) > arrow * 2.6;
    drawArrow(ctx, s1, inside ? angle + Math.PI : angle, arrow);
    drawArrow(ctx, s2, inside ? angle : angle + Math.PI, arrow);
    // Texto.
    const px = entity.textHeight * this.view.scale;
    if (px < 3) return;
    const t = this.toScreen(g.text);
    ctx.save();
    ctx.translate(t.x, t.y);
    if (entity.orientation === 'vertical') ctx.rotate(-Math.PI / 2);
    ctx.font = `${px}px "ISOCPEUR", "Arial Narrow", "Roboto Condensed", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = emphasise ? '#ffffff' : layer.color;
    ctx.fillText(String(Math.round(entity.value)), 0, 0);
    if (entity.param && emphasise) {
      const w = ctx.measureText(String(Math.round(entity.value))).width;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-w / 2 - 3, -px - 1, w + 6, px + 4);
    }
    ctx.restore();
  }

  drawGrips(entity) {
    const ctx = this.ctx;
    const points = entity.kind === 'line' ? [entity.a, entity.b, midpoint(entity.a, entity.b)]
      : entity.kind === 'polyline' ? entity.points
        : entity.kind === 'dimension' ? [entity.p1, entity.p2, dimensionGeometry(entity).text]
          : entity.kind === 'text' ? [entity.at] : [];
    for (const point of points) {
      const s = this.toScreen(point);
      const hot = this.mouse && Math.hypot(this.mouse.x - s.x, this.mouse.y - s.y) < 6;
      ctx.fillStyle = hot ? COLORS.gripHot : COLORS.grip;
      ctx.fillRect(Math.round(s.x) - 4, Math.round(s.y) - 4, 8, 8);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(s.x) - 4.5, Math.round(s.y) - 4.5, 9, 9);
    }
  }

  drawMeasurements() {
    const ctx = this.ctx;
    for (const m of this.measurements) {
      if (m.kind === 'distance') {
        const a = this.toScreen(m.a); const b = this.toScreen(m.b);
        ctx.strokeStyle = COLORS.rubber; ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
        const mid = midpoint(a, b);
        drawLabel(ctx, `${fmt(m.distance)} mm`, mid.x, mid.y - 10);
      }
      if (m.kind === 'point') {
        const s = this.toScreen(m.a);
        ctx.strokeStyle = COLORS.rubber; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(s.x - 6, s.y - 6); ctx.lineTo(s.x + 6, s.y + 6); ctx.moveTo(s.x + 6, s.y - 6); ctx.lineTo(s.x - 6, s.y + 6); ctx.stroke();
        drawLabel(ctx, `${fmt(m.a.x)}, ${fmt(m.a.y)}`, s.x, s.y - 14);
      }
    }
  }

  drawCommandPreview() {
    if (!this.command || !this.cursorWorld) return;
    const ctx = this.ctx;
    const base = this.command.points[0];
    if (!base) return;
    const a = this.toScreen(base); const b = this.toScreen(this.cursorWorld);
    if (this.command.name === 'DIST') {
      ctx.strokeStyle = COLORS.rubber; ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    }
    if (this.command.name === 'ZOOMW') {
      ctx.strokeStyle = COLORS.windowStroke; ctx.lineWidth = 1;
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    }
  }

  drawSelectionWindow() {
    if (this.drag?.mode !== 'window') return;
    const { start, current } = this.drag;
    if (Math.hypot(current.x - start.x, current.y - start.y) < 4) return;
    const ctx = this.ctx;
    const crossing = current.x < start.x;
    ctx.fillStyle = crossing ? COLORS.crossingFill : COLORS.windowFill;
    ctx.strokeStyle = crossing ? COLORS.crossingStroke : COLORS.windowStroke;
    ctx.lineWidth = 1;
    ctx.setLineDash(crossing ? [6, 4] : []);
    const x = Math.min(start.x, current.x); const y = Math.min(start.y, current.y);
    const w = Math.abs(current.x - start.x); const h = Math.abs(current.y - start.y);
    ctx.fillRect(x, y, w, h); ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.setLineDash([]);
  }

  drawUcs() {
    const ctx = this.ctx;
    const x = 24; const y = this.height - 24; const len = 34;
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#e8574f'; ctx.fillStyle = '#e8574f';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
    drawArrow(ctx, { x: x + len + 6, y }, 0, 8);
    ctx.strokeStyle = '#4fc96b'; ctx.fillStyle = '#4fc96b';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - len); ctx.stroke();
    drawArrow(ctx, { x, y: y - len - 6 }, -Math.PI / 2, 8);
    ctx.fillStyle = '#d7dde4';
    ctx.font = '11px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('X', x + len + 10, y + 4);
    ctx.fillText('Y', x - 4, y - len - 12);
    ctx.fillStyle = '#9aa4ae';
    ctx.fillRect(x - 3, y - 3, 6, 6);
  }

  drawCursor() {
    if (!this.mouse || this.drag?.mode === 'pan' || this.command?.name === 'PAN' || this.spaceDown) return;
    const ctx = this.ctx;
    const p = this.activeSnap ? this.toScreen(this.activeSnap.p) : this.mouse;
    const cx = Math.round(this.mouse.x) + 0.5; const cy = Math.round(this.mouse.y) + 0.5;
    ctx.strokeStyle = COLORS.crosshair;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cy); ctx.lineTo(cx - PICKBOX, cy); ctx.moveTo(cx + PICKBOX, cy); ctx.lineTo(this.width, cy);
    ctx.moveTo(cx, 0); ctx.lineTo(cx, cy - PICKBOX); ctx.moveTo(cx, cy + PICKBOX); ctx.lineTo(cx, this.height);
    ctx.stroke();
    if (!this.command) ctx.strokeRect(cx - PICKBOX, cy - PICKBOX, PICKBOX * 2, PICKBOX * 2);
    if (this.activeSnap) drawSnapMarker(ctx, this.activeSnap.type, p);
  }

  destroy() {
    this.resizeObserver.disconnect();
    document.removeEventListener('keydown', this.onDocKey);
    this.host.innerHTML = '';
  }
}

/* --------------------------------------------------------------- helpers */

function drawArrow(ctx, tip, angle, size) {
  if (size < 1.5) return;
  const spread = 0.17;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(tip.x - size * Math.cos(angle - spread), tip.y - size * Math.sin(angle - spread));
  ctx.lineTo(tip.x - size * Math.cos(angle + spread), tip.y - size * Math.sin(angle + spread));
  ctx.closePath();
  ctx.fill();
}

function drawSnapMarker(ctx, type, p) {
  const s = 7;
  ctx.save();
  ctx.strokeStyle = COLORS.snap;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (type === 'endpoint') ctx.rect(p.x - s, p.y - s, s * 2, s * 2);
  else if (type === 'midpoint') { ctx.moveTo(p.x, p.y - s); ctx.lineTo(p.x + s, p.y + s * 0.8); ctx.lineTo(p.x - s, p.y + s * 0.8); ctx.closePath(); }
  else if (type === 'intersection') { ctx.moveTo(p.x - s, p.y - s); ctx.lineTo(p.x + s, p.y + s); ctx.moveTo(p.x + s, p.y - s); ctx.lineTo(p.x - s, p.y + s); }
  else ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawLabel(ctx, text, x, y) {
  ctx.font = '12px "Segoe UI", Arial, sans-serif';
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = 'rgba(20,24,30,0.9)';
  ctx.fillRect(x - w / 2, y - 14, w, 19);
  ctx.strokeStyle = COLORS.rubber;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - w / 2 + 0.5, y - 13.5, w - 1, 18);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
}

function snapRank(type) { return { endpoint: 0, midpoint: 1, intersection: 2, center: 3 }[type] ?? 9; }
function midpoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
function pointInBox(p, box) { return p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY; }
function inBox(p, box) { return p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY; }

function distanceToSegment(p, a, b) {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function segmentIntersection(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  const eps = 1e-6;
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
}

function segmentIntersectsBox(a, b, box) {
  if (inBox(a, box) || inBox(b, box)) return true;
  const corners = [{ x: box.minX, y: box.minY }, { x: box.maxX, y: box.minY }, { x: box.maxX, y: box.maxY }, { x: box.minX, y: box.maxY }];
  for (let i = 0; i < 4; i += 1) if (segmentIntersection(a, b, corners[i], corners[(i + 1) % 4])) return true;
  return false;
}

function boundsOf(points) {
  return points.reduce((box, p) => ({ minX: Math.min(box.minX, p.x), maxX: Math.max(box.maxX, p.x), minY: Math.min(box.minY, p.y), maxY: Math.max(box.maxY, p.y) }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
}

function polygonArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]; const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum / 2);
}

function perimeter(points, closed) {
  let sum = 0;
  for (let i = 0; i < points.length - (closed ? 0 : 1); i += 1) {
    const a = points[i]; const b = points[(i + 1) % points.length];
    sum += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return sum;
}

function entityTypeLabel(entity) {
  return { line: 'Linha', polyline: 'Polilinha', dimension: 'Cota linear', text: 'Texto' }[entity.kind] || entity.kind;
}

function entitySummary(entity) {
  if (entity.kind === 'line') return `De (${fmt(entity.a.x)}, ${fmt(entity.a.y)}) a (${fmt(entity.b.x)}, ${fmt(entity.b.y)})`;
  if (entity.kind === 'polyline') { const b = boundsOf(entity.points); return `${fmt(b.maxX - b.minX)} × ${fmt(b.maxY - b.minY)}${entity.owner ? ` · ${entity.owner}` : ''}`; }
  if (entity.kind === 'dimension') return `Medida ${fmt(entity.value)}`;
  if (entity.kind === 'text') return `"${entity.value}"`;
  return '';
}

function textWidth(entity) {
  return entity.value.length * entity.height * 0.6;
}

function lighten(hex) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(c + (255 - c) * 0.45);
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}

function fmt(value, digits = 1) {
  const rounded = Number(value.toFixed(digits));
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(digits);
}
function fmt4(value) { return (Math.abs(value) < 5e-5 ? 0 : value).toFixed(4); }
function escapeHtml(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function icon(name) {
  const paths = {
    extents: '<path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5"/><rect x="8" y="8" width="8" height="8"/>',
    window: '<rect x="3" y="3" width="18" height="18" stroke-dasharray="3 2"/><circle cx="12" cy="12" r="3"/><path d="M14 14l4 4"/>',
    pan: '<path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/>',
    measure: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
    point: '<path d="M12 3v6M12 15v6M3 12h6M15 12h6"/><circle cx="12" cy="12" r="2"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
    maximize: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    minimize: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'
  };
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}
