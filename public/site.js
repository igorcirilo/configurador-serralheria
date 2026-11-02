/* Página inicial: menu móvel, carrossel do portefólio, ampliação de imagens, formulário e simulador. */

const $ = (selector, root = document) => root.querySelector(selector);

/* ---------------------------------------------------------------- menu */
const toggle = $('.menu-toggle');
const menu = $('#menu');
toggle.addEventListener('click', () => {
  const open = toggle.getAttribute('aria-expanded') !== 'true';
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  menu.classList.toggle('aberto', open);
});
menu.addEventListener('click', (event) => {
  if (event.target.closest('a') && toggle.getAttribute('aria-expanded') === 'true') toggle.click();
});

/* ------------------------------------------------------------ carrossel */
function setupCarousel(root) {
  const track = $('.carrossel-pista', root);
  const slides = [...track.children];
  const dots = $('.carrossel-pontos', root);
  const perView = () => Math.max(1, Math.round(track.clientWidth / slides[0].getBoundingClientRect().width));
  const pages = () => Math.max(1, slides.length - perView() + 1);
  const current = () => Math.round(track.scrollLeft / (slides[0].getBoundingClientRect().width + 8));
  const goTo = (index) => {
    const total = pages();
    const target = ((index % total) + total) % total;
    track.scrollTo({ left: slides[target].offsetLeft - slides[0].offsetLeft });
  };
  const renderDots = () => {
    dots.innerHTML = Array.from({ length: pages() }, (_, i) => `<button type="button" role="tab" aria-label="Imagem ${i + 1}" aria-selected="${i === current()}"></button>`).join('');
    [...dots.children].forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));
  };
  $('.anterior', root).addEventListener('click', () => goTo(current() - 1));
  $('.seguinte', root).addEventListener('click', () => goTo(current() + 1));
  track.addEventListener('scroll', () => {
    [...dots.children].forEach((dot, i) => dot.setAttribute('aria-selected', String(i === current())));
  }, { passive: true });
  window.addEventListener('resize', renderDots);
  renderDots();

  // Avança sozinho, mas para quando o visitante interage ou prefere menos movimento.
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timer = reduced ? null : setInterval(() => goTo(current() + 1), 4500);
  const stop = () => { clearInterval(timer); timer = null; };
  ['pointerdown', 'focusin', 'wheel', 'touchstart'].forEach((type) => root.addEventListener(type, stop, { passive: true }));
}
document.querySelectorAll('[data-carrossel]').forEach(setupCarousel);

/* -------------------------------------------------------------- lightbox */
const lightbox = $('#lightbox');
const lightboxImg = $('img', lightbox);
const lightboxCaption = $('.lightbox-legenda', lightbox);
document.querySelectorAll('.galeria-item, .carrossel-slide, .obra-item').forEach((link) => link.addEventListener('click', (event) => {
  if (typeof lightbox.showModal !== 'function') return; // browsers antigos abrem a imagem normalmente
  event.preventDefault();
  const img = $('img', link);
  lightboxImg.src = link.getAttribute('href');
  lightboxImg.alt = img?.alt || '';
  lightboxCaption.textContent = link.dataset.legenda || link.querySelector('.galeria-info strong')?.textContent || img?.alt || '';
  lightbox.showModal();
}));
$('.lightbox-fechar', lightbox).addEventListener('click', () => lightbox.close());
lightbox.addEventListener('click', (event) => { if (event.target === lightbox) lightbox.close(); });

/* ------------------------------------------------------------ formulários */
// Mesmo comportamento em todas as páginas: validação, envio para /api/contacto e mensagem de estado.
const PHONE_PT = /^[29]\d{8}$/;

function setupContactForm(form) {
  const status = $('.form-estado', form);
  const field = (name) => form.elements[name];
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const phone = String(data.telefone || '').replace(/[\s.-]/g, '').replace(/^(\+|00)351/, '');
    const checksPhone = field('telefone')?.hasAttribute('data-telefone-pt');
    const problem = !data.nome?.trim() ? ['Indique o seu nome.', 'nome']
      : !data.email?.trim() && !phone ? ['Indique um email ou um contacto para resposta.', 'email']
        : checksPhone && phone && !PHONE_PT.test(phone) ? ['Por favor insira um número de contacto válido (9 dígitos, começado por 9 ou 2).', 'telefone']
          : !data.mensagem?.trim() ? ['Escreva a sua mensagem.', 'mensagem']
            : !data.privacidade ? ['Tem de aceitar a Política de Privacidade.', 'privacidade'] : null;
    if (problem) {
      status.className = 'form-estado erro';
      status.textContent = problem[0];
      field(problem[1])?.focus();
      return;
    }
    const button = $('button[type="submit"]', form);
    button.disabled = true;
    status.className = 'form-estado';
    status.textContent = 'A enviar...';
    try {
      const response = await fetch('/api/contacto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, telefone: phone || data.telefone, privacidade: true, origem: form.dataset.origem || 'contacto' })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'Não foi possível enviar.');
      form.reset();
      status.className = 'form-estado ok';
      status.textContent = 'Obrigado! Recebemos o seu pedido e entraremos em contacto brevemente.';
    } catch (error) {
      status.className = 'form-estado erro';
      status.textContent = `${error.message} Pode também ligar-nos para o 912 042 795.`;
    } finally {
      button.disabled = false;
    }
  });
}
document.querySelectorAll('.contacto-form').forEach(setupContactForm);

// "Pedir este equipamento": escolhe o equipamento no formulário antes de ir para lá.
document.querySelectorAll('[data-equipamento]').forEach((button) => button.addEventListener('click', () => {
  const select = document.getElementById('eEquipamento');
  if (select) select.value = button.dataset.equipamento;
}));

/* ------------------------------------------------------------- simulador */
// Pré-visualização real do simulador: uma janela de exemplo desenhada pelo mesmo motor.
const preview = $('#simuladorPreview');
if (preview) {
  import('/configurator-core.js').then(({ normalizeConfiguratorInput, buildPreviewSvg }) => {
    const config = normalizeConfiguratorInput({
      productType: 'window', openingType: 'tilt_turn', openingHand: 'left', width: 1400, height: 1200,
      moduleCount: 2, moduleTypes: ['tilt_turn_left', 'fixed'], color: 'graphite', profileSystem: 'thermal',
      showOpeningSymbols: true
    });
    preview.innerHTML = buildPreviewSvg(config, 'commercial');
  }).catch(() => { preview.hidden = true; });
}

