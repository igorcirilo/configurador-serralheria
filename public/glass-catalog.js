/**
 * Catálogo de vidros duplos (Saint-Gobain e Guardian) e recomendação a partir das necessidades do cliente.
 *
 * Valores de referência dos fabricantes (EN 410 / EN 673) para a composição indicada em cada produto.
 * O desempenho final da janela (Uw) depende também do caixilho; estes valores são do vidro (Ug).
 *
 * Fontes:
 *  - Saint-Gobain Glass Portugal, Catálogo Climalit / Climalit Plus / Climalit Oraé (2025):
 *    https://www.saint-gobain.pt/sites/mac3.saint-gobain.pt/files/2025-01/Catalogo%20Climalit.pdf
 *  - Guardian Glass EU: ClimaGuard (Premium2, 1.0+, Solar) e SunGuard SuperNeutral (SN 70/37, SN 51):
 *    https://www.guardianglass.com/eu/en/our-glass/climaguard
 *    https://www.guardianglass.com/eu/en/our-glass/sunguard-superneutral
 */

const SG = 'Saint-Gobain';
const GD = 'Guardian';
const SG_COMPOSITION = '6 / 16 / 6 mm · árgon 90%';
const GD_COMPOSITION = '4 / 16 / 4 mm · árgon 90%';

/**
 * tl: transmissão luminosa (%) · rl: reflexão luminosa exterior (%) · g: fator solar · ug: W/m²K
 * hue: aspeto aproximado em reflexão, usado apenas na pré-visualização.
 */
export const GLASS_PRODUCTS = [
  { id: 'sg-climalit', brand: SG, name: 'Climalit (duplo incolor, sem capa)', family: 'basic', composition: SG_COMPOSITION, tl: 81, rl: 15, g: 0.78, ug: 2.5, hue: 'neutral',
    summary: 'Vidro duplo básico, sem capa térmica. Isola pouco face às soluções atuais.' },
  { id: 'sg-xn', brand: SG, name: 'Climalit Plus · Planitherm XN II', family: 'low_e', composition: SG_COMPOSITION, tl: 81, rl: 12, g: 0.61, ug: 1.1, hue: 'neutral',
    summary: 'Baixo emissivo muito transparente: mantém o calor dentro e deixa entrar o sol de inverno.' },
  { id: 'sg-eclaz', brand: SG, name: 'Climalit Plus · Eclaz', family: 'low_e', composition: SG_COMPOSITION, tl: 82, rl: 11, g: 0.65, ug: 1.1, hue: 'neutral',
    summary: 'Baixo emissivo de máxima luz e ganho solar: ideal para aquecer a casa com o sol.' },
  { id: 'sg-one', brand: SG, name: 'Climalit Plus · Planitherm ONE II', family: 'low_e_plus', composition: SG_COMPOSITION, tl: 71, rl: 23, g: 0.49, ug: 1.0, hue: 'blue',
    summary: 'Isolamento térmico reforçado com algum controlo solar.' },
  { id: 'sg-4s', brand: SG, name: 'Climalit Plus 4S · Planitherm 4S II', family: 'multifunction', composition: SG_COMPOSITION, tl: 65, rl: 27, g: 0.43, ug: 1.0, hue: 'silver',
    summary: 'Multifunções "4 estações": protege do frio no inverno e do calor no verão.' },
  { id: 'sg-planistar-one', brand: SG, name: 'Climalit Plus 4S · Planistar ONE', family: 'multifunction', composition: SG_COMPOSITION, tl: 71, rl: 14, g: 0.38, ug: 1.0, hue: 'neutral',
    summary: 'Multifunções neutro: boa luz, isolamento reforçado e bom controlo solar.' },
  { id: 'sg-skn176', brand: SG, name: 'Climalit Plus Solar Control · Cool-Lite SKN 176 II', family: 'solar', composition: SG_COMPOSITION, tl: 70, rl: 13, g: 0.37, ug: 1.0, hue: 'neutral',
    summary: 'Controlo solar seletivo: muita luz com pouco calor.' },
  { id: 'sg-skn154', brand: SG, name: 'Climalit Plus Solar Control · Cool-Lite SKN 154 II', family: 'solar', composition: SG_COMPOSITION, tl: 52, rl: 18, g: 0.28, ug: 1.0, hue: 'grey',
    summary: 'Controlo solar forte para fachadas muito expostas.' },
  { id: 'sg-xtreme70', brand: SG, name: 'Climalit Plus Solar Control · Cool-Lite Xtreme 70/33 II', family: 'solar', composition: SG_COMPOSITION, tl: 70, rl: 11, g: 0.33, ug: 1.0, hue: 'neutral',
    summary: 'Seletividade máxima (tripla prata): luz elevada e muito pouco calor, aspeto neutro.' },
  { id: 'sg-xtreme50', brand: SG, name: 'Climalit Plus Solar Control · Cool-Lite Xtreme 50/22 II', family: 'solar_extreme', composition: SG_COMPOSITION, tl: 47, rl: 16, g: 0.21, ug: 1.0, hue: 'grey',
    summary: 'Proteção solar máxima para grandes vãos a sul/poente.' },
  { id: 'gd-premium2', brand: GD, name: 'ClimaGuard Premium2', family: 'low_e', composition: GD_COMPOSITION, tl: 82, rl: null, g: 0.64, ug: 1.1, hue: 'neutral',
    summary: 'Baixo emissivo muito transparente com elevado ganho solar.' },
  { id: 'gd-10plus', brand: GD, name: 'ClimaGuard 1.0+', family: 'low_e_plus', composition: GD_COMPOSITION, tl: 76, rl: null, g: 0.52, ug: 1.0, hue: 'neutral',
    summary: 'Isolamento térmico reforçado (Ug 1,0) mantendo boa luz natural.' },
  { id: 'gd-solar', brand: GD, name: 'ClimaGuard Solar', family: 'multifunction', composition: GD_COMPOSITION, tl: 67, rl: null, g: 0.42, ug: 1.0, hue: 'blue',
    summary: 'Multifunções: isola do frio e reduz o sobreaquecimento no verão.' },
  { id: 'gd-sn7037', brand: GD, name: 'SunGuard SuperNeutral SN 70/37 + ClimaGuard Premium2', family: 'solar', composition: '6 / 16 / 4 mm · árgon 90%', tl: 71, rl: null, g: 0.37, ug: 1.0, hue: 'neutral',
    summary: 'Controlo solar de aspeto muito neutro com muita luz.' },
  { id: 'gd-sn51', brand: GD, name: 'SunGuard SuperNeutral SN 51', family: 'solar_extreme', composition: '6 / 16 / 4 mm · árgon 90%', tl: 51, rl: null, g: 0.28, ug: 1.0, hue: 'grey',
    summary: 'Controlo solar forte para vãos muito expostos ao sol.' }
];

/** Funções adicionais (combinadas com o vidro duplo escolhido). */
export const GLASS_FUNCTIONS = [
  { id: 'acoustic', label: 'Menos ruído da rua', short: 'Acústico',
    sg: 'Stadip Silence (laminado acústico), ex.: 6/16/44.2 SIL ≈ Rw 42 dB', gd: 'LamiGlass Acoustic',
    detail: 'Vidro laminado acústico no interior. Referência: duplo 4/16/4 ≈ Rw 31 dB; 6/16/44.2 Silence ≈ Rw 42 dB.' },
  { id: 'safety', label: 'Segurança (crianças, quedas, vãos até ao chão)', short: 'Segurança',
    sg: 'Stadip (laminado) ou Securit (temperado)', gd: 'LamiGlass',
    detail: 'Vidro de segurança laminado ou temperado (EN 12543 / EN 12150).' },
  { id: 'intrusion', label: 'Proteção contra intrusão', short: 'Anti-intrusão',
    sg: 'Stadip Protect (2 ou mais butirais)', gd: 'LamiGlass (multi-PVB)',
    detail: 'Laminado com vários butirais (PVB) que retém o vidro após impacto.' },
  { id: 'privacy', label: 'Privacidade (vidro fosco)', short: 'Fosco',
    sg: 'Satinovo (acidado)', gd: 'SatinDeco (acidado)',
    detail: 'Vidro acidado translúcido: deixa passar luz sem ver através.' },
  { id: 'selfclean', label: 'Menos limpeza (autolimpeza)', short: 'Autolimpeza',
    sg: 'Bioclean', gd: null,
    detail: 'Capa exterior fotocatalítica e hidrofílica (disponível na gama Saint-Gobain).' }
];

export const SUN_OPTIONS = [
  { value: 'strong', label: 'Muito sol direto', hint: 'Fachada a sul ou poente, sem sombra' },
  { value: 'morning', label: 'Sol só parte do dia', hint: 'Nascente ou com alguma sombra' },
  { value: 'little', label: 'Pouco sol direto', hint: 'Norte ou muito sombreada' },
  { value: 'unknown', label: 'Não sei', hint: 'Sem problema: o técnico confirma consigo' }
];

export const PRIORITY_OPTIONS = [
  { value: 'heat', label: 'Casa fresca no verão', hint: 'Proteger do calor e do sol forte' },
  { value: 'cold', label: 'Casa quente no inverno', hint: 'Proteger do frio e manter a temperatura' },
  { value: 'solar_gain', label: 'Aquecer a casa com o sol', hint: 'Aproveitar o sol de inverno como aquecimento gratuito' },
  { value: 'balanced', label: 'Conforto todo o ano', hint: 'Equilíbrio entre frio, calor e luz' },
  { value: 'light', label: 'Máxima luz natural', hint: 'Vidro o mais transparente possível' }
];

export const BRAND_OPTIONS = [
  { value: 'any', label: 'Indiferente' },
  { value: SG, label: 'Saint-Gobain' },
  { value: GD, label: 'Guardian' }
];

const clamp01 = (value) => Math.max(0, Math.min(1, value));

/** Indicadores 0..1 compreensíveis para o cliente. */
export function glassScores(product) {
  const cold = clamp01((2.6 - product.ug) / 1.6);
  const heat = clamp01((0.78 - product.g) / 0.57);
  const light = clamp01((product.tl - 30) / 52);
  const solarGain = clamp01((product.g - 0.2) / 0.45) * cold;
  return { cold, heat, light, solarGain };
}

function weightsFor(needs) {
  const base = {
    heat: { heat: 3, light: 1, cold: 1, solarGain: 0 },
    cold: { cold: 3, light: 1, solarGain: 1, heat: 0 },
    solar_gain: { solarGain: 3, cold: 1.5, light: 1, heat: 0 },
    balanced: { cold: 2, heat: 2, light: 1.5, solarGain: 0 },
    light: { light: 3, cold: 1.5, heat: 0.5, solarGain: 0 }
  }[needs.priority] || { cold: 2, heat: 2, light: 1.5, solarGain: 0 };
  const w = { ...base };
  if (needs.sun === 'strong') { w.heat += 1.5; w.solarGain = Math.max(0, w.solarGain - 1); }
  if (needs.sun === 'morning') w.heat += 0.5;
  if (needs.sun === 'little') { w.solarGain += 1; w.heat = Math.max(0, w.heat - 1); w.light += 0.5; }
  return w;
}

/** Ordena os vidros pela adequação às necessidades. */
export function recommendGlass(needs = {}) {
  const weights = weightsFor(needs);
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0) || 1;
  return GLASS_PRODUCTS
    .filter((product) => needs.brand && needs.brand !== 'any' ? product.brand === needs.brand : true)
    .filter((product) => product.family !== 'basic')
    .map((product) => {
      const scores = glassScores(product);
      let score = Object.entries(weights).reduce((sum, [key, weight]) => sum + scores[key] * weight, 0) / total;
      // Casas com vidro muito escuro: penalizar salvo quando o sol forte é a prioridade.
      if (product.tl < 55 && !(needs.priority === 'heat' && needs.sun === 'strong')) score -= 0.12;
      return { product, scores, score };
    })
    .sort((a, b) => b.score - a.score);
}

export function getGlassProduct(id) {
  return GLASS_PRODUCTS.find((product) => product.id === id) || null;
}

/** Funções obrigatórias/recomendadas pelo tipo de vão (ex.: portas levam vidro de segurança). */
export function requiredFunctions({ productType, height } = {}) {
  return productType === 'door' ? ['safety'] : [];
}

/** Aspeto aproximado para a pré-visualização comercial. */
export function glassAppearance(product, functions = []) {
  if (!product) return { transmission: 0.8, reflection: 0.12, hue: 'neutral', satin: functions.includes('privacy') };
  const reflection = product.rl != null ? product.rl / 100 : ({ basic: 0.15, low_e: 0.12, low_e_plus: 0.18, multifunction: 0.2, solar: 0.15, solar_extreme: 0.17 }[product.family] ?? 0.15);
  return { transmission: product.tl / 100, reflection, hue: product.hue, satin: functions.includes('privacy') };
}
