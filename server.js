import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import {
  CONFIGURATOR_RULES,
  normalizeConfiguratorInput,
  buildPreviewSvg,
  buildTechnicalSvg,
  buildTechnicalDxf,
  buildTechnicalDwg,
  buildSummaryData
} from './public/configurator-core.js';
import { calculateJoineryGeometry, openingSegments } from './public/joinery-engine/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
// Na Vercel só /tmp aceita escrita: pedidos, fotos e pacotes técnicos ficam lá enquanto a instância viver.
const IS_VERCEL = Boolean(process.env.VERCEL);
const WRITABLE_ROOT = IS_VERCEL ? '/tmp/serralheria' : path.resolve('.');
const MEDIA_DIR = process.env.MEDIA_DIR || path.join(WRITABLE_ROOT, 'uploads');
const DATA_DIR = path.join(WRITABLE_ROOT, 'data');
const PACKAGES_DIR = path.join(MEDIA_DIR, 'configurator-packages');
const CONFIG_REGRAS_FILE = path.join(DATA_DIR, 'regras.json');
const CONFIG_PRECOS_FILE = path.join(DATA_DIR, 'precos.json');
const LEADS_FILE = path.join(WRITABLE_ROOT, 'leads.json');

ensureDir(MEDIA_DIR);
ensureDir(DATA_DIR);
ensureDir(PACKAGES_DIR);
if (IS_VERCEL) {
  // Arranca com as regras e preços publicados no projeto em vez dos valores por defeito.
  for (const name of ['regras.json', 'precos.json']) {
    const source = path.join(__dirname, 'data', name);
    const target = path.join(DATA_DIR, name);
    if (fs.existsSync(source) && !fs.existsSync(target)) fs.copyFileSync(source, target);
  }
}
if (!fs.existsSync(LEADS_FILE)) fs.writeFileSync(LEADS_FILE, '[]', 'utf8');
if (!fs.existsSync(CONFIG_REGRAS_FILE)) fs.writeFileSync(CONFIG_REGRAS_FILE, JSON.stringify({ rules: CONFIGURATOR_RULES }, null, 2), 'utf8');
if (!fs.existsSync(CONFIG_PRECOS_FILE)) fs.writeFileSync(CONFIG_PRECOS_FILE, JSON.stringify({}, null, 2), 'utf8');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MEDIA_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Apenas imagens sao permitidas'));
  }
});

// Área de administração: leads, pacote técnico (CAD/DXF/PDF), uploads e páginas internas.
// Com ADMIN_PASSWORD definido usa autenticação HTTP Basic; sem ele só aceita pedidos diretos
// da própria máquina (desenvolvimento), nunca pedidos vindos de um proxy.
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_ROUTES = [
  /^\/admin(?:[/.-]|$)/,
  /^\/api\/leads(?:\/|$)/,
  /^\/api\/admin\//,
  /^\/api\/configurador\/(?!regras$|precos$|preview$)[^/]+/,
  /^\/uploads\//,
  /^\/dev(?:\/|-tipologias)/
];

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function isDirectLocalRequest(req) {
  const ip = req.socket.remoteAddress;
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip) && !req.headers['x-forwarded-for'];
}

function requireAdmin(req, res, next) {
  if (!ADMIN_ROUTES.some((pattern) => pattern.test(req.path))) return next();
  if (!ADMIN_PASSWORD) {
    if (isDirectLocalRequest(req)) return next();
    return res.status(403).send('Área de administração desativada: defina ADMIN_PASSWORD no ficheiro .env.');
  }
  const [scheme, encoded] = String(req.headers.authorization || '').split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    // "&" (não "&&") compara sempre utilizador e palavra-passe, sem atalho de tempo.
    if (safeEqual(decoded.slice(0, separator), ADMIN_USER) & safeEqual(decoded.slice(separator + 1), ADMIN_PASSWORD)) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Admin", charset="UTF-8"');
  return res.status(401).send('Autenticação necessária.');
}

if (!ADMIN_PASSWORD) console.warn('[admin] ADMIN_PASSWORD não definido: área de administração acessível apenas a partir desta máquina.');

app.use(requireAdmin);
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules', 'three')));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(MEDIA_DIR));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Lê as leads aceitando os formatos que já existiram no ficheiro: lista, { leads: [...] }
 * ou uma única lead solta. Se o ficheiro não for legível, lança erro em vez de devolver []:
 * devolver uma lista vazia faria a escrita seguinte apagar todas as leads.
 */
function readLeads() {
  if (!fs.existsSync(LEADS_FILE)) return [];
  const text = fs.readFileSync(LEADS_FILE, 'utf8').replace(/^﻿/, '');
  if (!text.trim()) return [];
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`leads.json ilegível (${error.message}). Corrija ou reponha o ficheiro antes de gravar novas leads.`);
  }
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.leads)) return parsed.leads;
  if (parsed && typeof parsed === 'object' && parsed.id) return [parsed];
  throw new Error('leads.json tem um formato desconhecido. Corrija ou reponha o ficheiro antes de gravar novas leads.');
}

/** Grava sempre como lista, de forma atómica; guarda uma cópia do original se ainda não estava nesse formato. */
function writeLeads(leads) {
  if (fs.existsSync(LEADS_FILE)) {
    const current = fs.readFileSync(LEADS_FILE, 'utf8').replace(/^﻿/, '').trim();
    if (current && !current.startsWith('[')) {
      const backup = LEADS_FILE.replace(/\.json$/, `.backup-${Date.now()}.json`);
      fs.copyFileSync(LEADS_FILE, backup);
      console.warn(`[leads] leads.json não estava em formato de lista; cópia guardada em ${path.basename(backup)}.`);
    }
  }
  const temp = `${LEADS_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(leads, null, 2), 'utf8');
  fs.renameSync(temp, LEADS_FILE);
}

function readJsonFile(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function escapeCsv(value = '') {
  const str = String(value ?? '');
  return `"${str.replace(/"/g, '""')}"`;
}

function packageUrl(id, fileName) {
  return `/uploads/configurator-packages/${id}/${fileName}`;
}

function getLeadById(id) {
  return readLeads().find((lead) => lead.id === id);
}

function buildTechnicalPdfBuffer(config, summary) {
  const pageWidth = 842;
  const pageHeight = 595;
  const commands = [];
  const setStroke = (gray = 0) => commands.push(`${gray} G`);
  const line = (x1, y1, x2, y2, width = 0.8) => commands.push(`${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  const rectangle = (x, y, width, height, strokeWidth = 0.8, fillGray = null) => {
    if (fillGray !== null) commands.push(`q ${fillGray} g ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f Q`);
    commands.push(`${strokeWidth} w ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S`);
  };
  const pdfText = (x, y, value, size = 10, bold = false) => commands.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdfText(value)}) Tj ET`);

  commands.push('1 1 1 rg 0 0 842 595 re f');
  commands.push('0.12 0.25 0.37 rg 0 525 842 70 re f');
  commands.push('1 g');
  pdfText(42, 562, 'IDEIAS COMUNS', 18, true);
  pdfText(42, 542, 'Ficha tecnica de caixilharia - alcado esquematico', 10);
  pdfText(650, 562, config.geometryConfig?.reference || 'VAO-01', 13, true);
  pdfText(650, 543, new Date().toLocaleDateString('pt-PT'), 9);
  commands.push('0 g');

  rectangle(42, 440, 758, 64, 0.6, 0.97);
  pdfText(56, 484, summary.title, 14, true);
  pdfText(56, 462, `Dimensoes: ${config.width} x ${config.height} mm | Quantidade: ${config.geometryConfig?.quantity || 1}`, 10);
  pdfText(430, 484, `Sistema: ${config.geometryConfig?.system || 'Nao definido'}`, 9);
  pdfText(430, 462, `Acabamento: ${config.color}`, 9);
  pdfText(56, 447, `Vidro: ${config.geometryConfig?.glassDescription || 'Nao definido'}`, 8);

  if (config.category === 'joinery' && config.geometryConfig) {
    const geometry = calculateJoineryGeometry(config.geometryConfig);
    const drawing = { x: 90, y: 118, width: 650, height: 286 };
    const scale = Math.min(drawing.width / geometry.config.width, drawing.height / geometry.config.height);
    const actualWidth = geometry.config.width * scale;
    const actualHeight = geometry.config.height * scale;
    const offsetX = drawing.x + (drawing.width - actualWidth) / 2;
    const offsetY = drawing.y + (drawing.height - actualHeight) / 2;
    const mapX = (x) => offsetX + x * scale;
    const mapY = (y) => offsetY + (geometry.config.height - y) * scale;
    const mappedRect = (bounds, strokeWidth = 0.8) => rectangle(mapX(bounds.x), mapY(bounds.y + bounds.height), bounds.width * scale, bounds.height * scale, strokeWidth);

    setStroke(0);
    mappedRect(geometry.outerBounds, 1.4);
    mappedRect(geometry.innerBounds, 1.0);
    geometry.mullions.forEach((bounds) => mappedRect(bounds, 1.0));
    geometry.transoms.forEach((bounds) => mappedRect(bounds, 1.0));
    geometry.modules.forEach((module) => {
      if (module.slidingLeaves?.length) {
        module.slidingLeaves.forEach((leaf) => {
          mappedRect(leaf.bounds, 0.9);
          mappedRect(leaf.glassBounds, 0.45);
          if (leaf.direction === 'fixed') return;
          const y = leaf.bounds.y + leaf.bounds.height / 2;
          const left = leaf.bounds.x + leaf.bounds.width * 0.28;
          const right = leaf.bounds.x + leaf.bounds.width * 0.72;
          const start = leaf.direction === 'right' ? left : right;
          const end = leaf.direction === 'right' ? right : left;
          const sign = leaf.direction === 'right' ? -1 : 1;
          line(mapX(start), mapY(y), mapX(end), mapY(y), 0.75);
          line(mapX(end), mapY(y), mapX(end + sign * 28), mapY(y - 20), 0.75);
          line(mapX(end), mapY(y), mapX(end + sign * 28), mapY(y + 20), 0.75);
        });
        return;
      }
      mappedRect(module.glassBounds, 0.45);
      if (module.leafBounds) mappedRect(module.leafBounds, 0.9);
      const symbols = openingSegments(module, geometry.config.viewSide);
      if (symbols.length) commands.push('[4 2] 0 d');
      symbols.forEach((segment) => line(mapX(segment.a.x), mapY(segment.a.y), mapX(segment.b.x), mapY(segment.b.y), 0.75));
      if (symbols.length) commands.push('[] 0 d');
    });

    const dimY = offsetY - 28;
    line(offsetX, dimY, offsetX + actualWidth, dimY, 0.55);
    line(offsetX, offsetY, offsetX, dimY - 6, 0.45);
    line(offsetX + actualWidth, offsetY, offsetX + actualWidth, dimY - 6, 0.45);
    pdfText(offsetX + actualWidth / 2 - 28, dimY - 16, `${geometry.config.width} mm`, 9);
    const dimX = offsetX - 28;
    line(dimX, offsetY, dimX, offsetY + actualHeight, 0.55);
    line(dimX - 6, offsetY, offsetX, offsetY, 0.45);
    line(dimX - 6, offsetY + actualHeight, offsetX, offsetY + actualHeight, 0.45);
    pdfText(dimX - 22, offsetY + actualHeight / 2, `${geometry.config.height} mm`, 8);

    if (geometry.config.dimensionMode === 'full' && geometry.grid[0].length > 1) {
      geometry.grid[0].forEach((cell, index) => pdfText(mapX(cell.x) + cell.width * scale / 2 - 22, offsetY - 50, `${geometry.config.layout.cols[index]} mm`, 7));
    }
  }

  rectangle(42, 42, 758, 46, 0.5, 0.97);
  pdfText(54, 70, `Vista: ${config.geometryConfig?.viewSide || 'interior'} | Documento para orcamentacao - nao usar para fabricacao`, 8, true);
  pdfText(54, 54, `Observacoes: ${config.notes || 'Sem observacoes.'}`, 8);

  const stream = commands.join('\n');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R /F2 6 0 R >> >> /Contents 5 0 R >> endobj`,
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${Buffer.byteLength(stream, 'utf8')} >> stream\n${stream}\nendstream endobj`,
    '6 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj'
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object) => {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${object}\n`;
  });
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

function escapePdfText(value) {
  // As fontes base do PDF só cobrem ASCII: tirar acentos e símbolos em vez de os perder.
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/·/g, '-').replace(/²/g, '2').replace(/[–—]/g, '-')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, ' ');
}

const MAX_ORDER_ITEMS = 30;
const CUSTOMER_FIELDS = ['customerName', 'customerPhone', 'customerEmail'];

/** Gera o pacote técnico (JSON, SVG, DXF, DWG, PDF) de um item na pasta indicada. */
function buildItemPackage(normalizedConfig, summary, id, subdir = '') {
  const packageDir = path.join(PACKAGES_DIR, id, subdir);
  ensureDir(packageDir);
  const files = {
    json: ['config.json', JSON.stringify(normalizedConfig, null, 2)],
    svg: ['preview.svg', buildPreviewSvg(normalizedConfig)],
    technicalSvg: ['technical.svg', buildTechnicalSvg(normalizedConfig)],
    dxf: ['technical.dxf', buildTechnicalDxf(normalizedConfig)],
    dwg: ['technical.dwg', buildTechnicalDwg(normalizedConfig)],
    pdf: ['summary.pdf', buildTechnicalPdfBuffer(normalizedConfig, summary)]
  };
  Object.values(files).forEach(([name, content]) => fs.writeFileSync(path.join(packageDir, name), content, typeof content === 'string' ? 'utf8' : undefined));
  return {
    generatedAt: new Date().toISOString(),
    directory: packageDir,
    files: Object.fromEntries(Object.entries(files).map(([key, [name]]) => [key, packageUrl(id, subdir ? `${subdir}/${name}` : name)]))
  };
}

/**
 * Lead do configurador. Aceita um item (formato antigo) ou { items: [...], customerName, ... }
 * com vários itens pedidos em conjunto; os dados de contacto são comuns a todos.
 */
function buildConfiguradorLead(rawPayload) {
  const rawItems = Array.isArray(rawPayload.items) && rawPayload.items.length ? rawPayload.items : [rawPayload];
  if (rawItems.length > MAX_ORDER_ITEMS) throw new Error(`Máximo de ${MAX_ORDER_ITEMS} itens por pedido.`);
  const customer = Object.fromEntries(CUSTOMER_FIELDS.map((key) => [key, rawPayload[key] ?? rawItems[0]?.[key] ?? '']));

  const normalizedItems = rawItems.map((raw, index) => {
    const normalizedConfig = normalizeConfiguratorInput({ ...raw, ...customer });
    if (!normalizedConfig.validation.valid) {
      const prefix = rawItems.length > 1 ? `Item ${index + 1}: ` : '';
      throw new Error(prefix + normalizedConfig.validation.errors.join(' '));
    }
    return { normalizedConfig, summary: buildSummaryData(normalizedConfig) };
  });

  const id = `CFG${Date.now()}`;
  const multiple = normalizedItems.length > 1;
  const items = normalizedItems.map(({ normalizedConfig, summary }, index) => ({
    index: index + 1,
    normalizedConfig,
    summary,
    package: buildItemPackage(normalizedConfig, summary, id, multiple ? `item-${index + 1}` : '')
  }));
  const first = items[0];

  return {
    id,
    criadoEm: new Date().toISOString(),
    origem: 'configurador',
    nome: first.normalizedConfig.customer.name,
    telefone: first.normalizedConfig.customer.phone,
    email: first.normalizedConfig.customer.email,
    morada: '',
    servico: 'Configurador Comercial',
    tipo: 'configurador',
    descricao: multiple ? `${items.length} itens: ${items.map((item) => item.summary.title).join(' | ')}` : first.summary.title,
    largura: first.normalizedConfig.width,
    altura: first.normalizedConfig.height,
    urgencia: 'normal',
    preferencia_horario: '',
    observacoes: items.map((item) => item.normalizedConfig.notes).filter(Boolean).join(' | '),
    fotos: [],
    estado: 'novo',
    configurador: {
      rawInput: rawPayload,
      // Campos do primeiro item mantidos para compatibilidade com pedidos antigos.
      normalizedConfig: first.normalizedConfig,
      summary: first.summary,
      package: first.package,
      items
    }
  };
}

async function sendLeadNotification(lead) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, NOTIFY_TO } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_FROM || !NOTIFY_TO) {
    return { sent: false, reason: 'smtp_not_configured' };
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
  });

  // Contactos do site e pedidos de manutenção não têm configuração: email simples.
  if (!lead.configurador) {
    const kind = lead.origem === 'contacto' ? 'Novo contacto do site' : `Novo pedido: ${lead.servico || 'serviço'}`;
    await transporter.sendMail({
      from: SMTP_FROM,
      to: NOTIFY_TO,
      subject: `${kind} ${lead.id}`,
      text: [
        kind,
        `ID: ${lead.id}`,
        `Cliente: ${lead.nome || 'Sem nome'}`,
        `Email: ${lead.email || '-'}`,
        `Telefone: ${lead.telefone || '-'}`,
        lead.morada ? `Morada: ${lead.morada}` : null,
        lead.tipo && lead.tipo !== 'contacto' ? `Tipo: ${lead.tipo}` : null,
        `Mensagem: ${lead.descricao || '-'}`,
        lead.fotos?.length ? `Fotografias: ${lead.fotos.length}` : null
      ].filter(Boolean).join('\n')
    });
    return { sent: true };
  }

  const cfg = lead.configurador?.normalizedConfig;
  const lines = [
    'Novo pedido do configurador',
    `ID: ${lead.id}`,
    `Cliente: ${lead.nome || 'Sem nome'}`,
    `Produto: ${cfg?.productType || 'n/d'}`,
    `Categoria: ${cfg?.category || 'n/d'}`,
    `Dimensoes: ${cfg?.width || '-'} x ${cfg?.height || '-'} ${cfg?.unit || ''}`,
    `Email: ${lead.email || '-'}`,
    `Telefone: ${lead.telefone || '-'}`,
    `Pacote PDF: ${lead.configurador?.package?.files?.pdf || '-'}`,
    `Resumo: ${(lead.configurador?.summary?.lines || []).join(' | ')}`
  ];
  const orderItems = lead.configurador?.items || [];
  if (orderItems.length > 1) {
    lines.push('', `Itens do pedido (${orderItems.length}):`);
    orderItems.forEach((item) => lines.push(`${item.index}. ${item.summary.title} · ${item.normalizedConfig.width} x ${item.normalizedConfig.height} mm · Qtd ${item.normalizedConfig.geometryConfig?.quantity ?? 1} · PDF ${item.package.files.pdf}`));
  }

  await transporter.sendMail({
    from: SMTP_FROM,
    to: NOTIFY_TO,
    subject: `Novo pedido configurador ${lead.id}`,
    text: lines.join('\n')
  });

  return { sent: true };
}

app.get('/', (req, res, next) => {
  const homepage = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(homepage)) return res.sendFile(homepage);
  next();
});

// Páginas institucionais (mesmos endereços do site original).
app.get(['/sobre-nos', '/sobre-nos/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sobre-nos.html'));
});

app.get(['/aluguer-de-equipamentos-de-elevacao-de-vidro', '/aluguer-de-equipamentos-de-elevacao-de-vidro/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'equipamentos.html'));
});

app.get('/equipamentos', (req, res) => res.redirect(301, '/aluguer-de-equipamentos-de-elevacao-de-vidro/'));

app.get('/configurador', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'configurador.html'));
});

app.get('/dev/tipologias', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dev-tipologias.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin/configurador', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-configurador.html'));
});

// Formulário "Fale connosco" da página inicial.
app.post('/api/contacto', async (req, res) => {
  try {
    const text = (value, max = 2000) => String(value ?? '').trim().slice(0, max);
    const nome = text(req.body?.nome, 120);
    const email = text(req.body?.email, 160);
    const telefone = text(req.body?.telefone, 40);
    const mensagem = text(req.body?.mensagem, 4000);
    const equipamento = text(req.body?.equipamento, 80);
    const ORIGENS = { contacto: 'Pedido de orçamento (site)', 'sobre-nos': 'Contacto (Sobre nós)', equipamentos: 'Aluguer de equipamento' };
    const origem = ORIGENS[req.body?.origem] ? req.body.origem : 'contacto';
    if (!nome || !mensagem || (!email && !telefone)) {
      return res.status(400).json({ ok: false, error: 'Indique o nome, um email ou contacto e a mensagem.' });
    }
    if (req.body?.privacidade !== true) {
      return res.status(400).json({ ok: false, error: 'É necessário aceitar a Política de Privacidade.' });
    }
    const leads = readLeads();
    const lead = {
      id: `C${Date.now()}`,
      criadoEm: new Date().toISOString(),
      origem: 'contacto',
      pagina: origem,
      nome,
      telefone,
      email,
      morada: '',
      servico: ORIGENS[origem],
      tipo: equipamento ? `Equipamento: ${equipamento}` : 'contacto',
      descricao: mensagem,
      urgencia: 'normal',
      observacoes: '',
      fotos: [],
      estado: 'novo'
    };
    leads.unshift(lead);
    writeLeads(leads);
    let notification = { sent: false };
    try { notification = await sendLeadNotification(lead); } catch (error) { notification = { sent: false, reason: error.message }; }
    res.json({ ok: true, id: lead.id, notificationSent: Boolean(notification.sent) });
  } catch (error) {
    console.error('Erro ao guardar contacto:', error);
    res.status(500).json({ ok: false, error: 'Erro interno do servidor' });
  }
});

app.post('/api/lead', upload.array('fotos', 10), async (req, res) => {
  try {
    const {
      nome, telefone, email, morada,
      servico, tipo, descricao,
      largura, altura,
      urgencia, preferencia_horario, observacoes
    } = req.body;

    if (!nome || !telefone || !morada || !descricao) {
      return res.status(400).json({ ok: false, error: 'Campos obrigatorios em falta' });
    }

    const fotos = (req.files || []).map((file) => file.filename);
    const lead = {
      id: `L${Date.now()}`,
      criadoEm: new Date().toISOString(),
      nome: nome.trim(),
      telefone: telefone.trim(),
      email: (email || '').trim(),
      morada: morada.trim(),
      servico: servico || '',
      tipo: tipo || '',
      descricao: descricao.trim(),
      largura: largura || '',
      altura: altura || '',
      urgencia: urgencia || 'normal',
      preferencia_horario: preferencia_horario || '',
      observacoes: (observacoes || '').trim(),
      fotos,
      estado: 'novo'
    };

    const leads = readLeads();
    leads.unshift(lead);
    writeLeads(leads);

    let notification = { sent: false, reason: 'not_attempted' };
    try {
      notification = await sendLeadNotification(lead);
    } catch (error) {
      notification = { sent: false, reason: error.message };
    }

    res.json({ ok: true, id: lead.id, notification });
  } catch (error) {
    console.error('Erro ao guardar lead:', error);
    res.status(500).json({ ok: false, error: 'Erro interno do servidor' });
  }
});

app.get('/api/leads', (req, res) => {
  try {
    res.json({ ok: true, leads: readLeads() });
  } catch {
    res.status(500).json({ ok: false, error: 'Erro ao ler leads' });
  }
});

app.get('/api/leads/export', (req, res) => {
  try {
    const leads = readLeads();
    const headers = ['id', 'criadoEm', 'nome', 'telefone', 'email', 'morada', 'servico', 'tipo', 'descricao', 'largura', 'altura', 'urgencia', 'preferencia_horario', 'observacoes', 'estado', 'fotos'];
    const csv = [
      headers.join(','),
      ...leads.map((lead) => headers.map((field) => escapeCsv(field === 'fotos' ? (lead.fotos || []).join('|') : lead[field] || '')).join(','))
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
    res.send(csv);
  } catch {
    res.status(500).json({ ok: false, error: 'Erro ao exportar leads' });
  }
});

app.patch('/api/leads/:id', (req, res) => {
  try {
    const { id } = req.params;
    const leads = readLeads();
    const index = leads.findIndex((lead) => lead.id === id);
    if (index === -1) return res.status(404).json({ ok: false, error: 'Lead nao encontrado' });
    leads[index] = { ...leads[index], ...req.body, id };
    writeLeads(leads);
    res.json({ ok: true, lead: leads[index] });
  } catch {
    res.status(500).json({ ok: false, error: 'Erro ao actualizar lead' });
  }
});

app.get('/api/configurador/regras', (req, res) => {
  const stored = readJsonFile(CONFIG_REGRAS_FILE, { rules: {} });
  res.json({
    ok: true,
    data: {
      ...stored,
      rules: {
        ...CONFIGURATOR_RULES,
        ...(stored.rules || {}),
        joineryOpeningTypes: CONFIGURATOR_RULES.joineryOpeningTypes,
        moduleTypes: CONFIGURATOR_RULES.moduleTypes
      }
    }
  });
});

app.get('/api/configurador/precos', (req, res) => {
  res.json({ ok: true, data: readJsonFile(CONFIG_PRECOS_FILE, {}) });
});

app.post('/api/admin/regras', (req, res) => {
  try {
    writeJsonFile(CONFIG_REGRAS_FILE, req.body || {});
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/admin/precos', (req, res) => {
  try {
    writeJsonFile(CONFIG_PRECOS_FILE, req.body || {});
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/configurador/preview', (req, res) => {
  try {
    const normalizedConfig = normalizeConfiguratorInput(req.body || {});
    res.type('image/svg+xml').send(buildPreviewSvg(normalizedConfig));
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post('/api/configurador/technical-svg', (req, res) => {
  try {
    const normalizedConfig = normalizeConfiguratorInput(req.body || {});
    res.type('image/svg+xml').send(buildTechnicalSvg(normalizedConfig));
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post('/api/configurador/pdf', (req, res) => {
  try {
    const normalizedConfig = normalizeConfiguratorInput(req.body || {});
    if (!normalizedConfig.validation.valid) {
      return res.status(400).json({ ok: false, error: normalizedConfig.validation.errors.join(' ') });
    }
    const summary = buildSummaryData(normalizedConfig);
    const pdf = buildTechnicalPdfBuffer(normalizedConfig, summary);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="ficha-tecnica.pdf"');
    res.send(pdf);
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post('/api/configurador/dxf', (req, res) => {
  try {
    const normalizedConfig = normalizeConfiguratorInput(req.body || {});
    const dxf = buildTechnicalDxf(normalizedConfig);
    res.setHeader('Content-Type', 'application/dxf; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="technical.dxf"');
    res.send(dxf);
  } catch (error) {
    console.error('Erro ao gerar DXF do configurador:', error);
    res.status(400).json({ ok: false, error: 'Erro ao gerar DXF do configurador' });
  }
});

app.post('/api/configurador', async (req, res) => {
  try {
    const leads = readLeads();
    const lead = buildConfiguradorLead(req.body || {});
    leads.unshift(lead);
    writeLeads(leads);

    let notification = { sent: false, reason: 'not_attempted' };
    try {
      notification = await sendLeadNotification(lead);
    } catch (error) {
      notification = { sent: false, reason: error.message };
    }

    // O pacote técnico (CAD/DXF/PDF) fica só no admin; o cliente recebe apenas a confirmação.
    res.json({ ok: true, id: lead.id, notificationSent: Boolean(notification.sent) });
  } catch (error) {
    console.error('Erro ao guardar pedido do configurador:', error);
    res.status(400).json({ ok: false, error: error.message || 'Erro interno do servidor' });
  }
});

app.get('/api/configurador/:id', (req, res) => {
  const lead = getLeadById(req.params.id);
  if (!lead?.configurador) return res.status(404).json({ ok: false, error: 'Pedido nao encontrado' });
  res.json({ ok: true, lead });
});

app.get('/api/configurador/:id/pdf', (req, res) => {
  const lead = getLeadById(req.params.id);
  const pdfUrl = lead?.configurador?.package?.files?.pdf;
  if (!pdfUrl) return res.status(404).json({ ok: false, error: 'PDF nao encontrado' });
  res.sendFile(path.join(MEDIA_DIR, pdfUrl.replace('/uploads/', '')));
});

if (!IS_VERCEL) app.listen(PORT, () => {
  console.log(`Serralheria app em http://localhost:${PORT}`);
  console.log(`Admin geral em http://localhost:${PORT}/admin`);
  console.log(`Admin configurador em http://localhost:${PORT}/admin/configurador`);
});

export default app;
