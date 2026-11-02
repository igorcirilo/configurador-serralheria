const nav = document.getElementById('nav');
const navLinks = document.getElementById('navLinks');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');
const dimensionFields = document.getElementById('dimensionFields');
const successWaLink = document.getElementById('successWaLink');

window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 24));
document.getElementById('hamburger').addEventListener('click', () => navLinks.classList.toggle('open'));

document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', () => navLinks.classList.remove('open'));
});

const CATALOG = {
  aluminio: { label:'Alumínio', subs:['Portas','Janelas','Estruturas compostas','Fachadas','Portões'] },
  vidros: { label:'Vidros', subs:['Vidro monolítico','Vidro lacado','Vidro laminado','Vidro temperado','Vidro duplo','Espelhos'] },
  automatismos: { label:'Automatismos', subs:['Portas automáticas','Portões seccionados','Automatismos para portões','Automatismos para janelas'] },
  montagens_especializadas:{ label:'Montagens Especializadas', subs:['Montagens em altura','Apoio externo','Elevação de vidro pesado'] },
  manutencao_reparo:{ label:'Manutenção e Reparação', subs:['Manutenção preventiva','Manutenção curativa','Reparação de caixilharias','Reparação de estruturas'] },
  prescricao_desenvolvimento:{ label:'Prescrição e Desenvolvimento', subs:['Prescrição técnica','Desenvolvimento de projetos','Acompanhamento em obra'] },
  outro:{ label:'Outro serviço', subs:[] }
};

const MEASURE_SERVICES = ['manutencao_reparo', 'montagens_especializadas'];
const PHOTO_SERVICES = ['manutencao_reparo', 'montagens_especializadas'];

let currentStep = 1;
let selectedSubOption = null;
let uploadedFiles = [];
let toastTimer = null;

function showToast(message, type='ok') {
  toast.className = `toast show ${type}`;
  toastMsg.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3400);
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('theme', theme);
  document.getElementById('themeToggle').textContent = theme === 'dark' ? '☀️' : '🌙';
}
const savedTheme = localStorage.getItem('theme') || 'dark';
setTheme(savedTheme);
document.getElementById('themeToggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme(next);
});

function goToStep(n) {
  document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
  document.getElementById(`step${n}`).classList.add('active');
  document.querySelectorAll('.step-it').forEach(it => {
    const s = parseInt(it.dataset.step, 10);
    it.classList.toggle('active', s === n);
    it.classList.toggle('done', s < n);
  });
  currentStep = n;
}

function validateStep(step) {
  if (step === 1) {
    const nome = document.getElementById('nome').value.trim();
    const tel  = document.getElementById('telefone').value.trim();
    const mor  = document.getElementById('morada').value.trim();
    if (!nome || !tel || !mor) { showToast('Preencha nome, telefone e morada.', 'warn'); return false; }
  }
  if (step === 2 && !document.querySelector('input[name="servico"]:checked')) {
    showToast('Selecione um serviço para continuar.', 'warn');
    return false;
  }
  if (step === 3) {
    if (!document.getElementById('descricao').value.trim()) {
      showToast('Descreva o que precisa.', 'warn');
      return false;
    }
    const service = document.querySelector('input[name="servico"]:checked')?.value || '';
    if (MEASURE_SERVICES.includes(service)) {
      const largura = document.getElementById('largura').value.trim();
      const altura = document.getElementById('altura').value.trim();
      if (!largura || !altura) {
        showToast('Para montagens e manutenção, informe largura e altura.', 'warn');
        return false;
      }
    }
  }
  return true;
}

document.querySelectorAll('.btn-next').forEach(btn => btn.addEventListener('click', () => {
  const next = parseInt(btn.dataset.next, 10);
  if (!validateStep(currentStep)) return;
  if (next === 4) buildSummary();
  goToStep(next);
}));

document.querySelectorAll('.btn-back').forEach(btn => btn.addEventListener('click', () => goToStep(parseInt(btn.dataset.back, 10))));

document.querySelectorAll('[data-preselect]').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const val = link.dataset.preselect;
    const radio = document.querySelector(`input[name="servico"][value="${val}"]`);
    if (radio) {
      radio.checked = true;
      radio.dispatchEvent(new Event('change'));
    }
    goToStep(2);
    document.getElementById('orcamento').scrollIntoView({ behavior: 'smooth' });
  });
});

document.querySelectorAll('input[name="servico"]').forEach(r => {
  r.addEventListener('change', () => {
    const key = r.value;
    const subs = CATALOG[key]?.subs || [];
    const box = document.getElementById('subOptions');
    const grid = document.getElementById('subOptionsGrid');
    const uploadField = document.getElementById('uploadField');
    selectedSubOption = null;

    if (subs.length) {
      grid.innerHTML = subs.map(s => `<div class="sub-chip" data-val="${s}">${s}</div>`).join('');
      grid.querySelectorAll('.sub-chip').forEach(c => c.addEventListener('click', () => {
        grid.querySelectorAll('.sub-chip').forEach(x => x.classList.remove('selected'));
        c.classList.add('selected');
        selectedSubOption = c.dataset.val;
      }));
      box.style.display = 'block';
    } else {
      box.style.display = 'none';
      grid.innerHTML = '';
    }

    if (uploadField) uploadField.style.display = PHOTO_SERVICES.includes(key) ? 'block' : 'none';
    if (dimensionFields) {
      const showMeasure = MEASURE_SERVICES.includes(key);
      dimensionFields.style.display = showMeasure ? 'grid' : 'none';
      if (!showMeasure) {
        document.getElementById('largura').value = '';
        document.getElementById('altura').value = '';
      }
    }
  });
});

const uploadZone = document.getElementById('uploadZone');
const fileInput  = document.getElementById('fotos');
uploadZone?.addEventListener('click', () => fileInput.click());
uploadZone?.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone?.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone?.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  handleFiles(e.dataTransfer.files);
});
fileInput?.addEventListener('change', () => handleFiles(fileInput.files));

function handleFiles(files) {
  const previews = document.getElementById('uploadPreviews');
  Array.from(files).forEach(f => {
    if (f.size > 5 * 1024 * 1024) {
      showToast(`${f.name} excede 5 MB.`, 'warn');
      return;
    }
    uploadedFiles.push(f);
    const reader = new FileReader();
    reader.onload = e => {
      const img = document.createElement('img');
      img.src = e.target.result;
      img.className = 'preview-img';
      previews.appendChild(img);
    };
    reader.readAsDataURL(f);
  });
  document.getElementById('uploadInner').style.display = uploadedFiles.length ? 'none' : 'flex';
}

function buildSummary() {
  const servicoVal = document.querySelector('input[name="servico"]:checked')?.value || '';
  const servicoLabel = CATALOG[servicoVal]?.label || servicoVal;
  const rows = [
    ['Nome', document.getElementById('nome').value],
    ['Telemóvel', document.getElementById('telefone').value],
    ['Email', document.getElementById('email').value || '—'],
    ['Morada', document.getElementById('morada').value],
    ['Serviço', servicoLabel + (selectedSubOption ? ` → ${selectedSubOption}` : '')],
    ['Descrição', document.getElementById('descricao').value],
    ['Medidas', document.getElementById('largura').value && document.getElementById('altura').value ? `${document.getElementById('largura').value} × ${document.getElementById('altura').value} cm` : 'Não aplicável'],
    ['Fotos', uploadedFiles.length ? `${uploadedFiles.length} ficheiro(s)` : 'Nenhuma']
  ];
  document.getElementById('summaryCard').innerHTML = rows.map(([l,v]) => `<div class="summary-row"><span class="summary-lbl">${l}</span><span>${v}</span></div>`).join('');
}

document.getElementById('mainForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!document.getElementById('lgpd').checked) {
    showToast('Aceite a política de privacidade para enviar.', 'warn');
    return;
  }
  const btn = document.getElementById('submitBtn');
  document.getElementById('submitLabel').style.display = 'none';
  document.getElementById('submitLoader').style.display = 'inline';
  btn.disabled = true;

  const fd = new FormData();
  fd.append('nome', document.getElementById('nome').value.trim());
  fd.append('telefone', document.getElementById('telefone').value.trim());
  fd.append('email', document.getElementById('email').value.trim());
  fd.append('morada', document.getElementById('morada').value.trim());
  const servicoVal = document.querySelector('input[name="servico"]:checked')?.value || '';
  fd.append('servico', servicoVal);
  fd.append('tipo', selectedSubOption || '');
  fd.append('descricao', document.getElementById('descricao').value.trim());
  fd.append('largura', document.getElementById('largura').value.trim());
  fd.append('altura', document.getElementById('altura').value.trim());
  fd.append('urgencia', document.getElementById('urgencia').value);
  fd.append('preferencia_horario', document.getElementById('preferencia_horario').value);
  fd.append('observacoes', document.getElementById('observacoes').value.trim());
  uploadedFiles.forEach(f => fd.append('fotos', f));

  try {
    const res = await fetch('/api/lead', { method:'POST', body:fd });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Falha ao enviar');

    const nome = document.getElementById('nome').value.trim();
    const telefone = document.getElementById('telefone').value.trim();
    const mensagem = encodeURIComponent(`Olá! Sou ${nome}. Enviei um pedido de orçamento para ${CATALOG[servicoVal]?.label || servicoVal}. Telefone: ${telefone}.`);
    successWaLink.href = `https://wa.me/351926400078?text=${mensagem}`;
    document.getElementById('successName').textContent = nome;
    document.getElementById('successPhone').textContent = telefone;
    document.getElementById('mainForm').style.display = 'none';
    document.getElementById('successPanel').style.display = 'flex';
    document.querySelector('.stepper').style.display = 'none';
    showToast('Pedido enviado com sucesso.', 'ok');
  } catch (err) {
    showToast(err.message || 'Erro de ligação. Tente novamente.', 'warn');
  } finally {
    document.getElementById('submitLabel').style.display = 'inline';
    document.getElementById('submitLoader').style.display = 'none';
    btn.disabled = false;
  }
});

window.resetForm = function resetForm() {
  document.getElementById('mainForm').reset();
  document.getElementById('mainForm').style.display = 'block';
  document.getElementById('successPanel').style.display = 'none';
  document.querySelector('.stepper').style.display = 'flex';
  uploadedFiles = [];
  selectedSubOption = null;
  document.getElementById('uploadPreviews').innerHTML = '';
  document.getElementById('uploadInner').style.display = 'flex';
  document.getElementById('subOptions').style.display = 'none';
  if (dimensionFields) dimensionFields.style.display = 'none';
  goToStep(1);
};

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in-view');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.14 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

document.querySelectorAll('[data-lightbox-src]').forEach(el => {
  el.addEventListener('click', () => openLightbox(el.dataset.lightboxSrc, el.dataset.lightboxTitle || 'Imagem'));
});

function openLightbox(src, title) {
  const modal = document.getElementById('lightbox');
  document.getElementById('lightboxImg').src = src;
  document.getElementById('lightboxTitle').textContent = title;
  modal.classList.add('open');
}
window.closeLightbox = function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
};
document.getElementById('lightbox')?.addEventListener('click', e => {
  if (e.target.id === 'lightbox') closeLightbox();
});
