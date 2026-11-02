import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildJoinery3DScene } from '../joinery-engine/index.js';

// Cor que o vidro ganha na espessura (vidro float comum puxa ligeiramente para o verde).
const GLASS_TINTS = {
  neutral: 0xe4f1ec,
  blue: 0xc9dcea,
  silver: 0xd9dfe2,
  grey: 0xb9c0c3,
  green: 0xcfe6d6,
  bronze: 0xdcc9b2
};

// Resolução de render: HD chega para ler o caixilho e mantém o 3D leve em portáteis e telemóveis.
const MAX_PIXEL_RATIO = 1.5;
const MAX_RENDER_PIXELS = 1920 * 1080;

const WALL_DEPTH = 240;
const REVEAL_INSET = 70;

function profileMaterial(color, anodized) {
  const base = new THREE.Color(color);
  // Lacado branco a 100% satura com a luz; o termolacado real fica num branco ligeiramente quebrado.
  if (base.r > 0.9 && base.g > 0.9 && base.b > 0.9) base.multiplyScalar(0.9);
  return anodized
    ? new THREE.MeshPhysicalMaterial({ color: base, metalness: 0.9, roughness: 0.34, envMapIntensity: 1.1 })
    : new THREE.MeshPhysicalMaterial({
      color: base,
      metalness: 0,
      roughness: 0.42,
      clearcoat: 0.45,
      clearcoatRoughness: 0.28,
      envMapIntensity: 0.9
    });
}

function materialSet(scene) {
  const anodized = scene.frameFinish === 'anodized';
  const profile = profileMaterial(scene.frameColor, anodized);
  const hardware = new THREE.MeshPhysicalMaterial({
    color: 0x111315,
    metalness: 0.35,
    roughness: 0.48,
    clearcoat: 0.18,
    clearcoatRoughness: 0.4,
    envMapIntensity: 0.55
  });
  const glassData = scene.glassAppearance;
  const satin = Boolean(glassData?.satin);
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: satin ? 0.42 : 0.015,
    transmission: 1,
    thickness: 6,
    ior: 1.52,
    attenuationColor: GLASS_TINTS[glassData?.hue ?? 'neutral'] ?? GLASS_TINTS.neutral,
    attenuationDistance: satin ? 40 : 90,
    specularIntensity: 1,
    envMapIntensity: 1.25
  });
  return {
    frame: profile,
    leaf: profile,
    divider: profile,
    bead: profile,
    hinge: hardware,
    panel: profile,
    handle: hardware,
    gasket: new THREE.MeshStandardMaterial({ color: 0x1c1e1f, roughness: 0.82, metalness: 0 }),
    spacer: new THREE.MeshStandardMaterial({ color: 0x55595c, roughness: 0.45, metalness: 0.6 }),
    glass,
    wall: new THREE.MeshStandardMaterial({ color: 0xebe8e2, roughness: 0.96, metalness: 0 }),
    sill: new THREE.MeshPhysicalMaterial({ color: 0xe0dcd4, roughness: 0.32, clearcoat: 0.25, clearcoatRoughness: 0.4 }),
    floor: new THREE.MeshPhysicalMaterial({ color: 0xc9bfb1, roughness: 0.55, clearcoat: 0.2, clearcoatRoughness: 0.5 })
  };
}

/** Converte coordenadas do desenho (mm, y para baixo, origem no canto) para o mundo 3D centrado. */
function toWorld(data, x, y) {
  return new THREE.Vector2(x - data.width / 2, data.height / 2 - y);
}

function insetBy(rect, value) {
  return { x: rect.x + value, y: rect.y + value, width: rect.width - value * 2, height: rect.height - value * 2 };
}

function bandWidth(side, outer, inner) {
  if (side === 'top') return inner.y - outer.y;
  if (side === 'bottom') return outer.y + outer.height - inner.y - inner.height;
  if (side === 'left') return inner.x - outer.x;
  return outer.x + outer.width - inner.x - inner.width;
}

/** Barra de aro com as extremidades a 45°, arestas boleadas e junta visível no canto, entre back e front (mm). */
function mitredBarGeometry(data, { side, outer, inner }, back, front) {
  const ox1 = outer.x, oy1 = outer.y, ox2 = outer.x + outer.width, oy2 = outer.y + outer.height;
  const ix1 = inner.x, iy1 = inner.y, ix2 = inner.x + inner.width, iy2 = inner.y + inner.height;
  const corners = {
    top: [[ox1, oy1], [ox2, oy1], [ix2, iy1], [ix1, iy1]],
    bottom: [[ix1, iy2], [ix2, iy2], [ox2, oy2], [ox1, oy2]],
    left: [[ox1, oy1], [ix1, iy1], [ix1, iy2], [ox1, oy2]],
    right: [[ix2, iy1], [ox2, oy1], [ox2, oy2], [ix2, iy2]]
  }[side];
  const shape = new THREE.Shape(corners.map(([x, y]) => toWorld(data, x, y)));
  const depth = front - back;
  const bevel = Math.max(0.3, Math.min(1.8, bandWidth(side, outer, inner) * 0.1, depth * 0.15));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.5, depth - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 3,
    curveSegments: 1
  });
  geometry.translate(0, 0, back + bevel);
  return geometry;
}

/**
 * Secção do perfil em degraus, como os perfis extrudidos reais (mm, a partir do centro da peça):
 * o aro tem o batente recuado junto à folha, a folha tem a aba sobre o aro e o bite desce em rampa até ao vidro.
 * outer/inner estreitam a faixa pelo lado de fora/de dentro do aro; as camadas sobrepõem-se para não abrir frestas.
 */
function profileLayers(role, band, depth) {
  const front = depth / 2;
  const back = -depth / 2;
  if (role === 'frame') {
    const step = Math.min(9, depth * 0.14);
    const rebate = Math.min(band * 0.32, 14);
    return [
      { outer: 0, inner: 0, back, front: front - step },
      { outer: 0, inner: rebate, back: front - step - 4, front },
      // Nervura fina na face: o friso que os perfis de catálogo têm junto à aresta.
      { outer: 1.5, inner: rebate + 1.5, back: front - 4, front: front + 0.6 }
    ];
  }
  if (role === 'leaf') {
    const step = Math.min(6, depth * 0.12);
    const lip = Math.min(4, band * 0.14);
    return [
      { outer: 0, inner: 0, back, front: front - step },
      { outer: lip, inner: 0, back: front - step - 4, front },
      { outer: lip + 1.5, inner: Math.min(band * 0.2, 5), back: front - 4, front: front + 0.6 }
    ];
  }
  if (role === 'bead') {
    return [
      { outer: 0, inner: 0, back, front: front - depth * 0.45 },
      { outer: 0, inner: band * 0.35, back: back + depth * 0.3, front: front - depth * 0.15 },
      { outer: 0, inner: band * 0.62, back: back + depth * 0.4, front }
    ];
  }
  return [{ outer: 0, inner: 0, back, front }];
}

function profileGeometries(data, part) {
  const { side, outer, inner } = part.mitre;
  const band = bandWidth(side, outer, inner);
  return profileLayers(part.role, band, part.depth)
    .filter((layer) => band - layer.outer - layer.inner > 1)
    .map((layer) => mitredBarGeometry(data, {
      side,
      outer: insetBy(outer, layer.outer),
      inner: insetBy(inner, -layer.inner)
    }, layer.back, layer.front));
}

function roundedRectShape(width, height, radius) {
  const x = -width / 2;
  const y = -height / 2;
  const r = Math.min(radius, width / 2, height / 2);
  const shape = new THREE.Shape();
  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + height - r);
  shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  shape.lineTo(x + r, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

function softExtrude(shape, depth, bevel) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.5, depth - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 4,
    curveSegments: 12
  });
  geometry.translate(0, 0, bevel);
  return geometry;
}

/** Manete com espelho, pescoço e alavanca afunilada; nas janelas fica na posição fechada (para baixo). */
function buildHandle(material, { door, direction }) {
  const group = new THREE.Group();
  const roseWidth = door ? 32 : 27;
  const roseHeight = door ? 170 : 78;
  const roseDepth = 9;
  const spindleY = door ? 35 : 10;
  group.add(new THREE.Mesh(softExtrude(roundedRectShape(roseWidth, roseHeight, roseWidth * 0.45), roseDepth, 3), material));

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(10.5, 11.5, 13, 28), material);
  neck.rotation.x = Math.PI / 2;
  neck.position.set(0, spindleY, roseDepth + 6);
  group.add(neck);

  // Alavanca desenhada de perfil: cubo redondo à volta do eixo e corpo a afunilar até à ponta boleada.
  const length = door ? 135 : 112;
  const hub = 12;
  const tip = door ? 9 : 7.5;
  const lever = new THREE.Shape();
  lever.absarc(0, 0, hub, Math.PI * 0.5, Math.PI * 1.5, false);
  lever.bezierCurveTo(length * 0.35, -hub * 0.9, length * 0.7, -tip - 1, length - tip, -tip);
  lever.absarc(length - tip, 0, tip, -Math.PI * 0.5, Math.PI * 0.5, false);
  lever.bezierCurveTo(length * 0.7, tip + 1, length * 0.35, hub * 0.95, 0, hub);
  const pivot = new THREE.Group();
  pivot.position.set(0, spindleY, roseDepth + 11);
  pivot.add(new THREE.Mesh(softExtrude(lever, 12, 4.5), material));
  if (door) {
    pivot.rotation.z = direction < 0 ? Math.PI : 0;
  } else {
    pivot.rotation.z = -Math.PI / 2;
  }
  // Ponta ligeiramente afastada do vidro, como as manetes reais (dá a sombra por baixo).
  pivot.rotateOnAxis(new THREE.Vector3(0, 1, 0), -0.08);
  group.add(pivot);

  if (door) {
    // Escudo do canhão por baixo da manete.
    const escutcheon = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 9.5, 4, 28), material);
    escutcheon.rotation.x = Math.PI / 2;
    escutcheon.position.set(0, -38, roseDepth + 1.5);
    group.add(escutcheon);
    const keyway = new THREE.Mesh(new RoundedBoxGeometry(2.4, 9, 2, 1, 0.8), new THREE.MeshBasicMaterial({ color: 0x050505 }));
    keyway.position.set(0, -38, roseDepth + 3.6);
    group.add(keyway);
  }
  return group;
}

/** Dobradiça de cilindro à vista: duas asas e o nó em dois troços com tampas boleadas. */
function buildHinge(material, height) {
  const group = new THREE.Group();
  const radius = 8.5;
  const half = (height - 2) / 2;
  const knuckle = (length) => new THREE.LatheGeometry([
    new THREE.Vector2(0, 0),
    new THREE.Vector2(radius * 0.62, 0),
    new THREE.Vector2(radius * 0.92, 0.9),
    new THREE.Vector2(radius, 2.6),
    new THREE.Vector2(radius, length - 2.6),
    new THREE.Vector2(radius * 0.92, length - 0.9),
    new THREE.Vector2(radius * 0.62, length),
    new THREE.Vector2(0, length)
  ], 32);
  const lower = new THREE.Mesh(knuckle(half), material);
  lower.position.set(0, -height / 2, radius);
  const upper = new THREE.Mesh(knuckle(half), material);
  upper.position.set(0, 1, radius);
  group.add(lower, upper);
  // Tampas em cúpula nas pontas do nó.
  for (const y of [-height / 2, height / 2]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.62, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), material);
    cap.scale.y = 0.35;
    cap.position.set(0, y, radius);
    if (y < 0) cap.rotation.x = Math.PI;
    group.add(cap);
  }
  // Asas: uma no aro (troço de baixo) e outra na folha (troço de cima), como as dobradiças de batente.
  for (const [side, y] of [[-1, -height / 4], [1, height / 4]]) {
    const wing = new THREE.Mesh(new RoundedBoxGeometry(22, half - 6, 6, 2, 2), material);
    wing.position.set(side * 13, y, 3);
    group.add(wing);
  }
  return group;
}

function exteriorTexture() {
  // Exterior fora de foco: céu claro, linha de vegetação e fachadas, só para o vidro ter o que mostrar.
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  const sky = context.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#b4c7d8');
  sky.addColorStop(0.5, '#dfe6ea');
  sky.addColorStop(0.66, '#d3d6cf');
  sky.addColorStop(1, '#a9ab9f');
  context.fillStyle = sky;
  context.fillRect(0, 0, 512, 512);
  context.filter = 'blur(22px)';
  context.fillStyle = 'rgba(128, 140, 118, 0.55)';
  for (let i = 0; i < 9; i += 1) {
    context.beginPath();
    context.ellipse(30 + i * 58, 330 + (i % 3) * 14, 70, 54 + (i % 2) * 18, 0, 0, Math.PI * 2);
    context.fill();
  }
  context.fillStyle = 'rgba(214, 206, 192, 0.85)';
  context.fillRect(300, 250, 150, 150);
  context.fillStyle = 'rgba(188, 178, 164, 0.8)';
  context.fillRect(40, 280, 110, 120);
  context.filter = 'none';
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function reflectionTexture() {
  // Reflexo largo e suave da sala no vidro; sem ele o vidro lê-se como um buraco.
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 256, 256);
  gradient.addColorStop(0, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.12)');
  gradient.addColorStop(0.42, 'rgba(255,255,255,0.42)');
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.05)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
    else child.material?.dispose?.();
  });
}

export class Joinery3DViewer {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe6e3dd);
    this.camera = new THREE.PerspectiveCamera(30, 1, 10, 40000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'joinery-3d-canvas';
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute('aria-label', 'Modelo tridimensional interativo da caixilharia');
    container.replaceChildren(this.renderer.domElement);

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = this.pmrem.fromScene(new RoomEnvironment(), 0.02).texture;
    this.scene.environment = this.environment;
    this.scene.environmentIntensity = 0.6;
    this.exterior = exteriorTexture();
    this.reflection = reflectionTexture();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.45;
    this.controls.zoomSpeed = 0.5;
    // Movimento curto: o cliente olha o caixilho de frente e de lado, não dá a volta à parede.
    this.controls.minAzimuthAngle = -0.42;
    this.controls.maxAzimuthAngle = 0.42;
    this.controls.minPolarAngle = Math.PI * 0.4;
    this.controls.maxPolarAngle = Math.PI * 0.56;
    this.controls.addEventListener('change', () => { this.needsRender = true; });
    this.controls.addEventListener('start', () => { this.userMoved = true; });

    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.signature = '';

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xa89f92, 0.3));
    // Luz principal suave, de cima e de lado, para desenhar as sombras dos perfis no aro e no vão.
    this.key = new THREE.DirectionalLight(0xfff4e6, 2.6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.6;
    this.key.shadow.radius = 4;
    this.scene.add(this.key);
    this.scene.add(this.key.target);
    const fill = new THREE.DirectionalLight(0xe4eef7, 0.25);
    fill.position.set(2400, 600, 3000);
    this.scene.add(fill);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.renderer.setAnimationLoop(() => this.renderFrame());
  }

  update(config, options = {}) {
    const signature = JSON.stringify([config, options.profileDepth, options.glassThickness]);
    if (signature === this.signature) return;
    this.signature = signature;
    const data = buildJoinery3DScene(config, options);
    disposeObject(this.world);
    this.world.clear();
    this.data = data;
    const materials = materialSet(data);

    const handles = new Map();
    for (const part of data.parts) {
      if (part.role === 'glass') {
        this.addGlass(data, part, materials);
        continue;
      }
      if (part.role === 'handle') {
        const list = handles.get(part.groupId) ?? [];
        list.push(part);
        handles.set(part.groupId, list);
        continue;
      }
      if (part.role === 'hinge') {
        const center = toWorld(data, part.bounds.x + part.bounds.width / 2, part.bounds.y + part.bounds.height / 2);
        const hinge = buildHinge(materials.hinge, part.bounds.height);
        // A peça do modelo vem 6 mm à frente da folha; a dobradiça assenta na face.
        hinge.position.set(center.x, center.y, part.z - part.depth / 2 - 3);
        this.addShadowCaster(hinge);
        continue;
      }
      if (part.mitre) {
        for (const geometry of profileGeometries(data, part)) {
          const mesh = new THREE.Mesh(geometry, materials[part.role]);
          mesh.position.z = part.z;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          this.world.add(mesh);
        }
        continue;
      }
      const geometry = new RoundedBoxGeometry(part.bounds.width, part.bounds.height, part.depth, 3,
        Math.max(0.4, Math.min(1.8, part.bounds.width * 0.08, part.bounds.height * 0.08, part.depth * 0.12)));
      const mesh = new THREE.Mesh(geometry, materials[part.role]);
      const center = toWorld(data, part.bounds.x + part.bounds.width / 2, part.bounds.y + part.bounds.height / 2);
      mesh.position.set(center.x, center.y, part.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.world.add(mesh);
    }
    this.addHandles(data, handles, materials);

    this.addRoom(data, materials);
    this.placeKeyLight(data);
    this.fitCamera();
    this.resize();
  }

  addShadowCaster(object) {
    object.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    this.world.add(object);
  }

  addHandles(data, handles, materials) {
    const door = data.height >= 1900;
    for (const [groupId, parts] of handles) {
      // Folha dupla: só a folha ativa (direita) leva manete; a outra fecha com fecho embutido.
      if (groupId?.endsWith('-L') && handles.has(groupId.replace(/-L$/, '-R'))) continue;
      const base = [...parts].sort((a, b) => b.bounds.height - a.bounds.height)[0];
      const lever = parts.find((part) => part !== base);
      const baseCenter = base.bounds.x + base.bounds.width / 2;
      const direction = lever && lever.bounds.x + lever.bounds.width / 2 < baseCenter ? -1 : 1;
      const center = toWorld(data, baseCenter, base.bounds.y + base.bounds.height / 2);
      const handle = buildHandle(materials.handle, { door, direction });
      // No modelo o espelho fica 4 mm à frente da folha; aqui assenta diretamente na face.
      handle.position.set(center.x, center.y, base.z - base.depth / 2 - 4);
      this.addShadowCaster(handle);
    }
  }

  addGlass(data, part, materials) {
    const center = toWorld(data, part.bounds.x + part.bounds.width / 2, part.bounds.y + part.bounds.height / 2);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(part.bounds.width, part.bounds.height, part.depth), materials.glass);
    glass.position.set(center.x, center.y, part.z);
    this.world.add(glass);
    const reflection = new THREE.Mesh(
      new THREE.PlaneGeometry(part.bounds.width, part.bounds.height),
      new THREE.MeshBasicMaterial({
        map: this.reflection, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending
      })
    );
    reflection.position.z = part.depth / 2 + 0.2;
    glass.add(reflection);

    // Vidro duplo: o intercalar entre os dois vidros fica à vista junto ao bite, como na obra.
    if (part.depth < 12) return;
    const band = 6;
    const inner = {
      x: part.bounds.x + band,
      y: part.bounds.y + band,
      width: part.bounds.width - band * 2,
      height: part.bounds.height - band * 2
    };
    if (inner.width <= 0 || inner.height <= 0) return;
    for (const side of ['top', 'bottom', 'left', 'right']) {
      const depth = Math.max(4, part.depth - 9);
      const mesh = new THREE.Mesh(mitredBarGeometry(data, { side, outer: part.bounds, inner }, -depth / 2, depth / 2), materials.spacer);
      mesh.position.z = part.z;
      this.world.add(mesh);
    }
  }

  addRoom(data, materials) {
    const margin = Math.max(data.width, data.height) * 3;
    const hole = 2;
    const wallFront = data.profileDepth / 2 + REVEAL_INSET;

    // Parede interior com o vão do caixilho: as ombreiras recebem luz e sombra e dão escala real.
    const shape = new THREE.Shape();
    shape.moveTo(-data.width / 2 - margin, -data.height / 2 - margin);
    shape.lineTo(data.width / 2 + margin, -data.height / 2 - margin);
    shape.lineTo(data.width / 2 + margin, data.height / 2 + margin);
    shape.lineTo(-data.width / 2 - margin, data.height / 2 + margin);
    shape.closePath();
    const opening = new THREE.Path();
    opening.moveTo(-data.width / 2 - hole, -data.height / 2 - hole);
    opening.lineTo(-data.width / 2 - hole, data.height / 2 + hole);
    opening.lineTo(data.width / 2 + hole, data.height / 2 + hole);
    opening.lineTo(data.width / 2 + hole, -data.height / 2 - hole);
    opening.closePath();
    shape.holes.push(opening);
    const wallGeometry = new THREE.ExtrudeGeometry(shape, {
      depth: WALL_DEPTH - 6, bevelEnabled: true, bevelThickness: 3, bevelSize: 3, bevelOffset: -3, bevelSegments: 2, curveSegments: 1
    });
    wallGeometry.translate(0, 0, wallFront - WALL_DEPTH + 3);
    const wall = new THREE.Mesh(wallGeometry, materials.wall);
    wall.receiveShadow = true;
    wall.castShadow = true;
    this.world.add(wall);

    // Portas vão até ao chão; janelas levam peitoril interior em pedra.
    if (data.height < 1900) {
      const sillDepth = REVEAL_INSET + 30;
      const sill = new THREE.Mesh(
        new RoundedBoxGeometry(data.width + 80, 25, sillDepth, 2, 2),
        materials.sill
      );
      sill.position.set(0, -data.height / 2 - 12.5, data.profileDepth / 2 + sillDepth / 2 - 5);
      sill.castShadow = true;
      sill.receiveShadow = true;
      this.world.add(sill);
    } else {
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(margin * 2 + data.width, margin), materials.floor);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(0, -data.height / 2, wallFront + margin / 2);
      floor.receiveShadow = true;
      this.world.add(floor);
    }

    const backdropSize = Math.max(data.width, data.height) * 4;
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(backdropSize * 1.4, backdropSize),
      new THREE.MeshBasicMaterial({ map: this.exterior, toneMapped: true })
    );
    backdrop.position.set(0, data.height * 0.1, -WALL_DEPTH - Math.max(data.width, data.height) * 1.6);
    this.world.add(backdrop);
  }

  placeKeyLight(data) {
    const size = Math.max(data.width, data.height);
    this.key.position.set(-size * 1.1, size * 1.2, size * 1.1);
    this.key.target.position.set(0, 0, 0);
    const shadow = this.key.shadow.camera;
    shadow.left = -size * 0.85;
    shadow.right = size * 0.85;
    shadow.top = size * 0.85;
    shadow.bottom = -size * 0.85;
    shadow.near = size * 0.5;
    shadow.far = size * 4.5;
    shadow.updateProjectionMatrix();
  }

  /** Distância para o caixilho ocupar quase todo o palco, com só uma faixa de parede à volta. */
  frameDistance() {
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const spanHeight = this.data.height * 1.14;
    const spanWidth = this.data.width * 1.14;
    const byHeight = spanHeight / 2 / Math.tan(fov / 2);
    const byWidth = spanWidth / 2 / (Math.tan(fov / 2) * this.camera.aspect);
    return Math.max(byHeight, byWidth) + this.data.profileDepth / 2;
  }

  fitCamera() {
    if (!this.data) return;
    const distance = this.frameDistance();
    // Ligeira vista de três quartos: mostra a espessura dos perfis sem deformar o alçado.
    const yaw = 0.2;
    const pitch = 0.04;
    this.camera.position.set(
      Math.sin(yaw) * Math.cos(pitch) * distance,
      Math.sin(pitch) * distance,
      Math.cos(yaw) * Math.cos(pitch) * distance
    );
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = distance * 0.6;
    this.controls.maxDistance = distance * 1.12;
    this.controls.update();
    this.userMoved = false;
    this.needsRender = true;
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(320, this.container.clientHeight || Math.round(width * 0.78));
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO, Math.sqrt(MAX_RENDER_PIXELS / (width * height)));
    this.renderer.setPixelRatio(Math.max(1, ratio));
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    if (this.data && !this.userMoved) this.fitCamera();
    this.needsRender = true;
  }

  renderFrame() {
    this.controls.update();
    // Só desenha quando algo mudou: a imagem parada não gasta GPU.
    if (!this.needsRender) return;
    this.needsRender = false;
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.resizeObserver.disconnect();
    this.renderer.setAnimationLoop(null);
    disposeObject(this.world);
    this.controls.dispose();
    this.environment.dispose();
    this.exterior.dispose();
    this.reflection.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
  }
}
