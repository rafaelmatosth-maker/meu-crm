function qs(selector) {
  return document.querySelector(selector);
}

function qsa(selector) {
  return Array.from(document.querySelectorAll(selector));
}

const CRM_THEME_STORAGE_KEY = 'crm_theme';
const CRM_THEME_FALLBACK = 'classic';
const CRM_THEME_VALUES = ['classic', 'aurora', 'oceano', 'amanhecer'];
const CRM_THEME_SWATCH_FALLBACK = {
  classic: '#fafaf9',
  aurora: '#3f58bb',
  oceano: '#155fa1',
  amanhecer: '#7a39b8',
};

function ensureThemeStylesheet() {
  if (qs('#crmThemeStylesheet')) return;
  const link = document.createElement('link');
  link.id = 'crmThemeStylesheet';
  link.rel = 'stylesheet';
  link.href = '/assets/themes.css?v=20260313-theme1';
  document.head.appendChild(link);
}

function normalizeThemeValue(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return CRM_THEME_VALUES.includes(normalized) ? normalized : CRM_THEME_FALLBACK;
}

function getStoredThemeValue() {
  try {
    return normalizeThemeValue(localStorage.getItem(CRM_THEME_STORAGE_KEY));
  } catch (_) {
    return CRM_THEME_FALLBACK;
  }
}

function setStoredThemeValue(theme) {
  try {
    localStorage.setItem(CRM_THEME_STORAGE_KEY, normalizeThemeValue(theme));
  } catch (_) {
    // ignore localStorage failures
  }
}

function parseThemeSwatchColor(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const shortHex = raw.match(/^#([0-9a-f]{3})$/i);
  if (shortHex) {
    const [r, g, b] = shortHex[1].split('').map((part) => Number.parseInt(part + part, 16));
    return { r, g, b };
  }

  const longHex = raw.match(/^#([0-9a-f]{6})$/i);
  if (longHex) {
    return {
      r: Number.parseInt(longHex[1].slice(0, 2), 16),
      g: Number.parseInt(longHex[1].slice(2, 4), 16),
      b: Number.parseInt(longHex[1].slice(4, 6), 16),
    };
  }

  const rgbMatch = raw.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+\s*)?\)$/i);
  if (rgbMatch) {
    return {
      r: Math.max(0, Math.min(255, Math.round(Number(rgbMatch[1])))),
      g: Math.max(0, Math.min(255, Math.round(Number(rgbMatch[2])))),
      b: Math.max(0, Math.min(255, Math.round(Number(rgbMatch[3])))),
    };
  }

  return null;
}

function toRelativeLuminance(rgb) {
  const channel = (value) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };

  const r = channel(rgb.r);
  const g = channel(rgb.g);
  const b = channel(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function resolveThemeInk(theme) {
  const body = document.body;
  if (!body) return 'dark';
  const fallback = CRM_THEME_SWATCH_FALLBACK[theme] || CRM_THEME_SWATCH_FALLBACK.classic;
  const swatchFromCss = getComputedStyle(body).getPropertyValue('--crm-ink-swatch').trim();
  const color = parseThemeSwatchColor(swatchFromCss) || parseThemeSwatchColor(fallback);
  if (!color) return 'dark';
  const luminance = toRelativeLuminance(color);
  const contrastWhite = 1.05 / (luminance + 0.05);
  const contrastBlack = (luminance + 0.05) / 0.05;
  return contrastWhite >= contrastBlack ? 'light' : 'dark';
}

function updateSidebarLogoVariant(theme, ink) {
  const useLightVariant = theme !== 'classic' && ink === 'light';
  qsa('.crm-sidebar-logo').forEach((logo) => {
    const current = String(logo.getAttribute('src') || '').trim();
    if (!logo.dataset.logoDarkSrc) {
      logo.dataset.logoDarkSrc = current;
    }
    if (!logo.dataset.logoLightSrc) {
      const dark = logo.dataset.logoDarkSrc || current;
      logo.dataset.logoLightSrc = dark.includes('logo-trim-transparent.png')
        ? dark.replace('logo-trim-transparent.png', 'logo-trim-transparent-white.png')
        : dark;
    }
    const nextSrc = useLightVariant ? logo.dataset.logoLightSrc : logo.dataset.logoDarkSrc;
    if (nextSrc && current !== nextSrc) {
      logo.setAttribute('src', nextSrc);
    }
  });
}

function applyTheme(theme, options = {}) {
  const persist = options.persist !== false;
  const normalized = normalizeThemeValue(theme);
  const body = document.body;
  if (!body) return normalized;
  body.classList.add('crm-theme-ready');
  body.dataset.theme = normalized;
  const ink = resolveThemeInk(normalized);
  body.dataset.themeInk = ink;
  updateSidebarLogoVariant(normalized, ink);
  if (persist) setStoredThemeValue(normalized);
  return normalized;
}

function initTheme() {
  ensureThemeStylesheet();
  applyTheme(getStoredThemeValue(), { persist: false });
}

function formatCpf(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatRg(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;

  const head = digits.slice(0, -2);
  const tail = digits.slice(-2);
  const first = head.slice(0, 2);
  const rest = head.slice(2).replace(/(\d{3})(?=\d)/g, '$1.');
  const left = rest ? `${first}.${rest}` : first;
  return `${left}-${tail}`;
}

function bindMask(input, formatter) {
  if (!input) return;
  const apply = () => {
    const formatted = formatter(input.value);
    input.value = formatted;
  };
  input.addEventListener('input', apply);
  input.addEventListener('blur', apply);
  apply();
}

function normalizeDateValue(value) {
  if (!value) return '';
  const str = String(value).trim();
  if (!str) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const brDash = str.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (brDash) return `${brDash[3]}-${brDash[2]}-${brDash[1]}`;
  if (str.includes('/')) {
    const [d, m, y] = str.split('/');
    if (y && m && d) {
      return `${y.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  return str;
}

function formatDateBR(value) {
  const date = parseDateTimeInput(value);
  if (!date) return '-';
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}

function parseDateTimeInput(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (!str) return null;
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(str)) {
    const parsed = new Date(str);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const isoMatch = str.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (isoMatch) {
    const [, y, m, d, hh = '0', mm = '0', ss = '0'] = isoMatch;
    const parsed = new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss)
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const brMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (brMatch) {
    const [, d, m, y, hh = '0', mm = '0'] = brMatch;
    const parsed = new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      0
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const brDashMatch = str.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (brDashMatch) {
    const [, d, m, y, hh = '0', mm = '0'] = brDashMatch;
    const parsed = new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      0
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const fallback = new Date(str);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function formatDateTimeBR(value) {
  const date = parseDateTimeInput(value);
  if (!date) return '-';
  const base = formatDateBR(date);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${base} ${hh}:${mm}`;
}

function formatDateOptionalTime(dateValue, timeValue) {
  if (!dateValue) return '-';
  const normalized = normalizeDateValue(dateValue);
  if (!normalized) return '-';
  const timeRaw = String(timeValue || '').trim();
  if (timeRaw) {
    const timeClean = timeRaw.length >= 5 ? timeRaw.slice(0, 5) : timeRaw;
    return formatDateTimeBR(`${normalized}T${timeClean}`);
  }
  return formatDateBR(normalized);
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function parseCurrencyValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const str = String(value).trim();
  if (!str) return null;
  const cleaned = str.replace(/[^\d,.\-]/g, '');
  if (!cleaned) return null;
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  let normalized = cleaned;
  if (hasComma && hasDot) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  }
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function formatCurrencyValue(value) {
  const num = typeof value === 'number' ? value : parseCurrencyValue(value);
  if (!Number.isFinite(num)) return '-';
  return currencyFormatter.format(num);
}

function parsePercentValue(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const cleaned = raw.replace('%', '').replace(/\s/g, '').replace(',', '.');
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  if (raw.includes('%')) return num;
  if (num <= 1) return num * 100;
  return num;
}

function normalizeMonthValue(value) {
  if (!value) return '';
  const str = String(value).trim();
  if (!str) return '';
  const match = str.match(/^(\d{4})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}`;
  const parsed = parseDateTimeInput(str);
  if (parsed) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  return '';
}

function stripHashSuffix(text) {
  return String(text || '').replace(/\s+[a-f0-9]{16,}$/i, '').trim();
}

function isTruthyFlag(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['sim', 'yes', 'true', '1'].includes(normalized);
}

function calcularIdade(dataIso) {
  if (!dataIso) return '';
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  if (!ano || !mes || !dia) return '';
  const hoje = new Date();
  let idade = hoje.getFullYear() - ano;
  const m = hoje.getMonth() + 1 - mes;
  if (m < 0 || (m === 0 && hoje.getDate() < dia)) {
    idade -= 1;
  }
  return idade >= 0 ? String(idade) : '';
}

function atualizarIdade(dataInput, idadeInfo, idadeHidden) {
  if (!dataInput) return;
  const idade = calcularIdade(dataInput.value);
  if (idadeHidden) idadeHidden.value = idade;
  if (idadeInfo) {
    idadeInfo.textContent = idade ? `Idade: ${idade} anos` : 'Idade: -';
  }
}

function formatDateLongBR(value) {
  const date = parseDateTimeInput(value);
  if (!date) return '';
  return date.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function buildClienteQualificacaoAuto(cliente = {}) {
  const nome = String(cliente.nome || '').trim();
  if (!nome) return '';

  const qualificadores = [
    String(cliente.nacionalidade || '').trim(),
    String(cliente.estado_civil || '').trim(),
    String(cliente.profissao || '').trim(),
  ].filter(Boolean);

  const partes = [qualificadores.length ? `${nome}, ${qualificadores.join(', ')}` : nome];

  const dataNascimento = formatDateLongBR(cliente.data_nascimento);
  if (dataNascimento) partes.push(`nascido(a) em ${dataNascimento}`);

  const filiacao = String(cliente.filiacao || '').trim();
  if (filiacao) partes.push(`filho(a) de ${filiacao}`);

  const rg = String(cliente.rg || '').trim();
  if (rg) partes.push(`portador(a) do RG ${rg}`);

  const cpf = String(cliente.cpf || '').trim();
  if (cpf) partes.push(`CPF ${cpf}`);

  const enderecoLinha = [
    String(cliente.endereco || '').trim(),
    String(cliente.numero_casa || '').trim(),
  ]
    .filter(Boolean)
    .join(', ');
  const cidadeUf = [String(cliente.cidade || '').trim(), String(cliente.estado || '').trim()]
    .filter(Boolean)
    .join(' - ');
  const cep = String(cliente.cep || '').trim();
  const enderecoCompleto = [enderecoLinha, cidadeUf, cep ? `CEP ${cep}` : '']
    .filter(Boolean)
    .join(', ');
  if (enderecoCompleto) partes.push(`residente e domiciliado(a) em ${enderecoCompleto}`);

  return partes.filter(Boolean).join(', ');
}

function isQualificacaoPlaceholder(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return true;
  const normalized = raw.toLowerCase();
  if (/(^|,)\s*,/.test(raw)) return true;
  if (/nascido\s*\(a\)\s*em\s*,/i.test(normalized)) return true;
  if (/filho\s*\(a\)\s*de\s*,/i.test(normalized)) return true;
  if (/sob o n[ºo]\s*,/i.test(normalized)) return true;
  if (/cpf\s*,/i.test(normalized)) return true;
  if (/residente e domiciliado\s*\(a\)\s*em\s*,\s*,/i.test(normalized)) return true;
  return false;
}

function normalizeCompareText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizeDigits(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function shouldPreferAutoQualificacao(cliente = {}, manual = '', auto = '') {
  const manualText = String(manual || '').trim();
  const autoText = String(auto || '').trim();
  if (!autoText) return false;
  if (!manualText || isQualificacaoPlaceholder(manualText)) return true;

  const normalizedManual = normalizeCompareText(manualText);
  let missingSignals = 0;

  const cpfDigits = normalizeDigits(cliente.cpf);
  if (cpfDigits && !normalizeDigits(manualText).includes(cpfDigits)) missingSignals += 1;

  const rgDigits = normalizeDigits(cliente.rg);
  if (rgDigits && !normalizeDigits(manualText).includes(rgDigits)) missingSignals += 1;

  const filiacao = normalizeCompareText(cliente.filiacao);
  if (filiacao && !normalizedManual.includes(filiacao)) missingSignals += 1;

  const endereco = normalizeCompareText(cliente.endereco);
  if (endereco && !normalizedManual.includes(endereco)) missingSignals += 1;

  const cidade = normalizeCompareText(cliente.cidade);
  if (cidade && !normalizedManual.includes(cidade)) missingSignals += 1;

  const cepDigits = normalizeDigits(cliente.cep);
  if (cepDigits && !normalizeDigits(manualText).includes(cepDigits)) missingSignals += 1;

  const dataNascimento = String(cliente.data_nascimento || '').trim();
  if (dataNascimento) {
    const yearMatch = dataNascimento.match(/(\d{4})/);
    if (yearMatch && !manualText.includes(yearMatch[1])) missingSignals += 1;
  }

  return missingSignals >= 2 || manualText.length < autoText.length * 0.7;
}

function getClienteQualificacaoText(cliente = {}) {
  const manual = String(cliente.qualificacao || '').trim();
  const auto = buildClienteQualificacaoAuto(cliente);
  if (manual && !shouldPreferAutoQualificacao(cliente, manual, auto)) return manual;
  return auto;
}

async function buscarCep(cep) {
  const onlyDigits = String(cep || '').replace(/\D/g, '');
  if (onlyDigits.length !== 8) return null;
  try {
    const resp = await fetch(`https://viacep.com.br/ws/${onlyDigits}/json/`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.erro) return null;
    return data;
  } catch (_) {
    return null;
  }
}

function setupCepAutoFill(cepInput, enderecoInput, cidadeInput, estadoInput) {
  if (!cepInput) return;
  const handler = async () => {
    const data = await buscarCep(cepInput.value);
    if (!data) return;
    if (enderecoInput && data.logradouro) enderecoInput.value = data.logradouro;
    if (cidadeInput && data.localidade) cidadeInput.value = data.localidade;
    if (estadoInput && data.uf) estadoInput.value = data.uf;
  };
  cepInput.addEventListener('blur', handler);
}

function showMessage(target, text, type = 'erro') {
  if (!target) return;
  target.textContent = text;
  target.className = type === 'sucesso' ? 'text-green-600 text-sm' : 'text-red-600 text-sm';
}

const ibgeMunicipiosCache = new Map();

async function fetchMunicipiosByUf(uf) {
  const normalizedUf = String(uf || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalizedUf)) return [];
  if (ibgeMunicipiosCache.has(normalizedUf)) return ibgeMunicipiosCache.get(normalizedUf);

  const promise = (async () => {
    const url = `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(
      normalizedUf
    )}/municipios?orderBy=nome`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error('Falha ao carregar cidades.');
    }
    const data = await response.json().catch(() => []);
    const cidades = Array.isArray(data)
      ? data
          .map((item) => String(item?.nome || '').trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      : [];
    return cidades;
  })();

  ibgeMunicipiosCache.set(normalizedUf, promise);
  try {
    return await promise;
  } catch (err) {
    ibgeMunicipiosCache.delete(normalizedUf);
    throw err;
  }
}

function setCidadeSelectOptions(selectEl, cidades = [], { currentValue = '', placeholder = 'Selecione a cidade' } = {}) {
  if (!selectEl) return;
  const current = String(currentValue || '').trim();
  selectEl.innerHTML = '';
  const placeholderOpt = document.createElement('option');
  placeholderOpt.value = '';
  placeholderOpt.textContent = placeholder;
  selectEl.appendChild(placeholderOpt);
  cidades.forEach((cidade) => {
    const opt = document.createElement('option');
    opt.value = cidade;
    opt.textContent = cidade;
    selectEl.appendChild(opt);
  });
  if (current) {
    const hasCurrent = Array.from(selectEl.options).some((opt) => opt.value === current);
    if (!hasCurrent) {
      const opt = document.createElement('option');
      opt.value = current;
      opt.textContent = current;
      selectEl.appendChild(opt);
    }
    selectEl.value = current;
  } else {
    selectEl.value = '';
  }
}

async function hydrateCidadeSelectByEstado(estadoValue, cidadeSelectEl, { currentValue = '' } = {}) {
  if (!cidadeSelectEl) return;
  const uf = String(estadoValue || '').trim().toUpperCase();
  const requestId = String(Number(cidadeSelectEl.dataset.cityReqId || 0) + 1);
  cidadeSelectEl.dataset.cityReqId = requestId;

  if (!uf) {
    cidadeSelectEl.disabled = true;
    setCidadeSelectOptions(cidadeSelectEl, [], {
      currentValue,
      placeholder: currentValue ? 'Cidade' : 'Selecione o estado',
    });
    return;
  }

  cidadeSelectEl.disabled = true;
  setCidadeSelectOptions(cidadeSelectEl, [], {
    currentValue,
    placeholder: 'Carregando cidades...',
  });

  try {
    const cidades = await fetchMunicipiosByUf(uf);
    if (cidadeSelectEl.dataset.cityReqId !== requestId) return;
    cidadeSelectEl.disabled = false;
    setCidadeSelectOptions(cidadeSelectEl, cidades, {
      currentValue,
      placeholder: 'Selecione a cidade',
    });
  } catch (_) {
    if (cidadeSelectEl.dataset.cityReqId !== requestId) return;
    cidadeSelectEl.disabled = false;
    setCidadeSelectOptions(cidadeSelectEl, [], {
      currentValue,
      placeholder: currentValue ? 'Cidade' : 'Não foi possível carregar',
    });
  }
}

function syncModalBodyScrollLock() {
  // Consider only modal containers, not buttons like "fecharProcessoModal".
  const hasOpenModal = Array.from(document.querySelectorAll('[id$="Modal"]')).some((el) => {
    if (!(el instanceof HTMLElement)) return false;
    if (el.classList.contains('hidden')) return false;
    const tag = el.tagName.toLowerCase();
    return tag === 'div' || tag === 'section' || tag === 'dialog';
  });
  document.documentElement.classList.toggle('overflow-hidden', hasOpenModal);
  document.body.classList.toggle('overflow-hidden', hasOpenModal);
}

function ensureModalBodyScrollLockObserver() {
  if (window.__modalBodyScrollLockObserverInitialized) return;
  window.__modalBodyScrollLockObserverInitialized = true;

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== 'attributes') continue;
      const target = mutation.target;
      if (!(target instanceof HTMLElement)) continue;
      if (!target.id || !target.id.endsWith('Modal')) continue;
      syncModalBodyScrollLock();
      return;
    }
  });

  observer.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  syncModalBodyScrollLock();
}

function openModal(modal) {
  if (!modal) return;
  modal.classList.remove('hidden');
  syncModalBodyScrollLock();
}

function closeModal(modal) {
  if (!modal) return;
  modal.classList.add('hidden');
  syncModalBodyScrollLock();
}

async function fetchAjustesResumoSafe() {
  try {
    return await api.ajustes.resumo();
  } catch (_) {
    return null;
  }
}

function fillSelectWithAreas(selectEl, areas = [], { keepCurrent = true } = {}) {
  if (!selectEl || !Array.isArray(areas) || !areas.length) return;
  const current = keepCurrent ? selectEl.value : '';
  const options = ['<option value=""></option>']
    .concat(
      areas
        .filter((item) => item && item.ativo !== false)
        .map((item) => `<option value="${item.nome}">${item.nome}</option>`)
    )
    .join('');
  selectEl.innerHTML = options;
  if (current) {
    const hasCurrent = Array.from(selectEl.options).some((opt) => opt.value === current);
    if (hasCurrent) {
      selectEl.value = current;
    } else {
      const custom = document.createElement('option');
      custom.value = current;
      custom.textContent = current;
      selectEl.appendChild(custom);
      selectEl.value = current;
    }
  }
}

function fillDatalistWithColaboradores(datalistEl, colaboradores = []) {
  if (!datalistEl) return;
  datalistEl.innerHTML = colaboradores
    .map((item) => `<option value="${item.nome || ''}"></option>`)
    .join('');
}

function normalizeResultadoAndRecurso(resultadoValue, recursoValue) {
  const rawResultado = String(resultadoValue || '').trim();
  const normalized = rawResultado
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  let resultado = '';
  if (normalized.includes('improcedente')) {
    resultado = 'Improcedente';
  } else if (normalized.includes('procedente em parte') || normalized.includes('parcialmente procedente')) {
    resultado = 'Procedente em parte';
  } else if (normalized.includes('procedente')) {
    resultado = 'Procedente';
  } else {
    resultado = rawResultado;
  }

  const recursoNormalized = String(recursoValue || '')
    .trim()
    .toLowerCase();
  const recursoFromResultado = normalized.includes('recurso') ? 'sim' : 'no';
  const recurso = recursoNormalized || recursoFromResultado;

  return {
    resultado,
    recurso: recurso === 'sim' ? 'Sim' : 'No',
  };
}

function stripHashSuffixText(text) {
  return String(text || '').replace(/\s+[a-f0-9]{16,}$/i, '').trim();
}

function canCopyProcessNumber(value) {
  const text = String(value || '').trim();
  if (!text || text === '-' || text.toLowerCase() === 'sem processo') return false;
  return true;
}

function renderCopyProcessButton(value, classes = '') {
  const text = String(value || '').trim();
  if (!canCopyProcessNumber(text)) return '';
  const className = classes || 'text-stone-400 hover:text-stone-700';
  return `
    <button
      type="button"
      data-copy-process-number="${text}"
      class="inline-flex items-center justify-center ${className}"
      title="Copiar número do processo"
      aria-label="Copiar número do processo"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="11" height="11" rx="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    </button>
  `;
}

function initProcessNumberCopy() {
  if (window.__processNumberCopyInitialized) return;
  window.__processNumberCopyInitialized = true;

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy-process-number]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const value = btn.getAttribute('data-copy-process-number') || '';
    if (!canCopyProcessNumber(value)) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement('textarea');
        ta.value = value;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      btn.classList.add('text-emerald-600');
      setTimeout(() => btn.classList.remove('text-emerald-600'), 800);
    } catch (_) {}
  });
}

async function updateProcessosBadge() {
  const badge = qs('#processosBadge');
  if (!badge) return;
  try {
    const resp = await api.processos.list({ page: 1, limit: 1, andamentos_novos: '1' });
    const total = Number(resp?.total || 0);
    if (total > 0) {
      badge.textContent = total;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch (_) {
    badge.classList.add('hidden');
  }
}

function captureTokenFromUrl() {
  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get('token');
    if (token) {
      window.__tokenFromUrl = token;
      let stored = false;
      try {
        localStorage.setItem('token', token);
        stored = true;
      } catch (_) {}
      if (stored) {
        url.searchParams.delete('token');
        const newUrl = url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : '');
        window.history.replaceState({}, '', newUrl);
      }
    }
  } catch (_) {}
}

const chatWidgetState = {
  initialized: false,
  isOpen: false,
  me: null,
  conversations: [],
  selectedConversationId: null,
  messagesByConversation: {},
  collaborators: [],
  pollTimerId: null,
  loadingConversations: false,
  loadingMessages: false,
};

function chatEscapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function chatFormatHour(value) {
  const date = parseDateTimeInput(value);
  if (!date) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function chatFormatListTime(value) {
  const date = parseDateTimeInput(value);
  if (!date) return '';
  const now = new Date();
  const sameDay =
    now.getFullYear() === date.getFullYear() &&
    now.getMonth() === date.getMonth() &&
    now.getDate() === date.getDate();
  if (sameDay) return chatFormatHour(value);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function chatGetSelectedConversation() {
  const selectedId = Number(chatWidgetState.selectedConversationId);
  return chatWidgetState.conversations.find((item) => Number(item.id) === selectedId) || null;
}

function chatSetStatus(message, isError = false) {
  const el = qs('#chatWidgetStatus');
  if (!el) return;
  el.textContent = String(message || '');
  el.style.color = isError ? '#dc2626' : '#78716c';
  if (!message) return;
  setTimeout(() => {
    if (el.textContent === message) el.textContent = '';
  }, 3000);
}

function chatInjectStyles() {
  if (qs('#chatWidgetStyles')) return;
  const style = document.createElement('style');
  style.id = 'chatWidgetStyles';
  style.textContent = `
    .chat-fab {
      position: fixed; right: 18px; bottom: 18px; z-index: 1100;
      width: 56px; height: 56px; padding: 0;
      border: 1px solid #d6d3d1; background: #0c1b33; color: #fff;
      border-radius: 999px; display: inline-flex; align-items: center; justify-content: center;
      box-shadow: 0 12px 30px rgba(12, 27, 51, 0.25);
    }
    .chat-fab-icon { width: 24px; height: 24px; }
    .chat-fab-badge {
      position: absolute; top: -5px; right: -5px;
      min-width: 20px; height: 20px; border-radius: 999px; background: #dc2626;
      color: #fff; text-align: center; line-height: 20px; font-size: 11px; font-weight: 700; padding: 0 6px;
    }
    .chat-fab-badge.hidden { display: none; }
    .chat-panel {
      position: fixed; right: 18px; bottom: 80px; z-index: 1101;
      width: min(900px, calc(100vw - 24px)); height: min(620px, calc(100vh - 110px));
      border: 1px solid #d6d3d1; border-radius: 16px; background: #fff;
      box-shadow: 0 24px 52px rgba(12, 27, 51, 0.22); overflow: hidden; display: flex; flex-direction: column;
    }
    .chat-panel.hidden { display: none; }
    .chat-head {
      border-bottom: 1px solid #e7e5e4; padding: 10px 12px; background: #fafaf9;
      display: flex; align-items: center; justify-content: space-between;
    }
    .chat-head-title { font-size: 14px; font-weight: 700; color: #1c1917; }
    .chat-status { font-size: 11px; color: #78716c; min-height: 14px; margin-top: 2px; }
    .chat-btn {
      border: 1px solid #d6d3d1; background: #fff; color: #44403c;
      border-radius: 8px; font-size: 12px; padding: 6px 10px; cursor: pointer;
    }
    .chat-btn-primary { border-color: #0c1b33; background: #0c1b33; color: #fff; }
    .chat-body {
      flex: 1; min-height: 0; display: grid; grid-template-columns: 290px 1fr;
    }
    .chat-sidebar {
      border-right: 1px solid #e7e5e4; background: #fcfcfb; display: flex; flex-direction: column; min-height: 0;
    }
    .chat-search {
      margin: 10px; border: 1px solid #d6d3d1; border-radius: 8px; padding: 8px 10px; font-size: 12px;
    }
    .chat-conversations { flex: 1; min-height: 0; overflow: auto; padding: 4px 8px 8px; }
    .chat-conversation {
      border: 1px solid transparent; border-radius: 10px; padding: 8px; margin-bottom: 4px; background: #fff; cursor: pointer;
    }
    .chat-conversation:hover { border-color: #d6d3d1; background: #fafaf9; }
    .chat-conversation.active { border-color: #0c1b33; background: #f5f7fb; }
    .chat-conversation-name { font-size: 13px; font-weight: 600; color: #1c1917; }
    .chat-conversation-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 2px; }
    .chat-conversation-preview {
      font-size: 12px; color: #57534e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px;
    }
    .chat-conversation-time { font-size: 11px; color: #78716c; }
    .chat-conversation-unread {
      margin-top: 6px; display: inline-flex; align-items: center; justify-content: center;
      min-width: 20px; height: 20px; border-radius: 999px; background: #dc2626; color: #fff;
      font-size: 11px; font-weight: 700; padding: 0 6px;
    }
    .chat-main { display: grid; grid-template-rows: auto 1fr auto; min-height: 0; }
    .chat-main-head { border-bottom: 1px solid #e7e5e4; padding: 10px 12px; }
    .chat-main-title { font-size: 13px; font-weight: 700; color: #1c1917; }
    .chat-main-subtitle { font-size: 11px; color: #78716c; margin-top: 2px; }
    .chat-messages { min-height: 0; overflow: auto; padding: 12px; background: linear-gradient(180deg, #fff 0%, #fafaf9 100%); }
    .chat-message {
      max-width: 78%; margin-bottom: 10px; border: 1px solid #e7e5e4;
      border-radius: 10px; padding: 8px 10px; background: #fff;
    }
    .chat-message.mine { margin-left: auto; border-color: #bfdbfe; background: #eff6ff; }
    .chat-message-meta {
      display: flex; align-items: center; justify-content: space-between;
      font-size: 10px; color: #57534e; margin-bottom: 4px; text-transform: uppercase;
    }
    .chat-message-text { font-size: 13px; color: #1c1917; white-space: pre-wrap; line-height: 1.35; }
    .chat-empty {
      border: 1px dashed #d6d3d1; border-radius: 10px; padding: 12px;
      text-align: center; color: #78716c; font-size: 12px; background: #fff;
    }
    .chat-attachments { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .chat-attachment {
      border: 1px solid #d6d3d1; background: #fff; border-radius: 999px;
      padding: 4px 9px; font-size: 11px; cursor: pointer; max-width: 100%;
      overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
    }
    .chat-compose { border-top: 1px solid #e7e5e4; padding: 10px; background: #fff; }
    .chat-files { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; min-height: 16px; }
    .chat-file-pill {
      border: 1px solid #d6d3d1; border-radius: 999px; padding: 2px 8px;
      font-size: 11px; color: #57534e; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .chat-compose-row { display: flex; align-items: flex-end; gap: 8px; }
    .chat-textarea {
      flex: 1; min-height: 40px; max-height: 120px; resize: vertical;
      border: 1px solid #d6d3d1; border-radius: 8px; padding: 8px 10px; font-size: 13px;
    }
    .chat-hidden-file { display: none; }
    .chat-picker {
      position: absolute; right: 12px; top: 54px; z-index: 5;
      width: min(320px, calc(100vw - 52px)); max-height: 360px;
      border: 1px solid #d6d3d1; border-radius: 10px; background: #fff;
      box-shadow: 0 16px 32px rgba(12,27,51,.18); overflow: hidden; display: flex; flex-direction: column;
    }
    .chat-picker.hidden { display: none; }
    .chat-picker-list { overflow: auto; min-height: 0; padding: 6px; }
    .chat-picker-item { border: 1px solid transparent; border-radius: 8px; padding: 8px; cursor: pointer; }
    .chat-picker-item:hover { border-color: #d6d3d1; background: #fafaf9; }
    .chat-picker-name { font-size: 13px; font-weight: 600; color: #1c1917; }
    .chat-picker-email { font-size: 11px; color: #78716c; margin-top: 2px; }
    @media (max-width: 920px) {
      .chat-panel { right: 12px; left: 12px; bottom: 76px; width: auto; }
      .chat-body { grid-template-columns: 1fr; grid-template-rows: 210px 1fr; }
      .chat-sidebar { border-right: 0; border-bottom: 1px solid #e7e5e4; }
      .chat-message { max-width: 90%; }
    }
  `;
  document.head.appendChild(style);
}

function chatInjectMarkup() {
  if (qs('#chatWidgetFab')) return;
  const wrapper = document.createElement('div');
  wrapper.id = 'chatWidgetRoot';
  wrapper.innerHTML = `
    <button id="chatWidgetFab" type="button" class="chat-fab" aria-label="Abrir conversas" title="Conversas">
      <svg class="chat-fab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 14c-1.7 0-3-1.3-3-3V6c0-1.7 1.3-3 3-3h8c1.7 0 3 1.3 3 3v5c0 1.7-1.3 3-3 3H9l-4 3z"></path>
        <path d="M13 9h6c1.7 0 3 1.3 3 3v4c0 1.7-1.3 3-3 3h-3l-3 2.2V12"></path>
      </svg>
      <span id="chatWidgetFabBadge" class="chat-fab-badge hidden"></span>
    </button>
    <div id="chatWidgetPanel" class="chat-panel hidden">
      <div class="chat-head">
        <div>
          <div class="chat-head-title">Chat interno</div>
          <div id="chatWidgetStatus" class="chat-status"></div>
        </div>
        <div class="flex items-center gap-2">
          <button id="chatWidgetNewBtn" type="button" class="chat-btn">Nova conversa</button>
          <button id="chatWidgetCloseBtn" type="button" class="chat-btn">Fechar</button>
        </div>
      </div>
      <div class="chat-body">
        <aside class="chat-sidebar">
          <input id="chatWidgetConversationSearch" class="chat-search" type="search" placeholder="Buscar conversa" />
          <div id="chatWidgetConversations" class="chat-conversations"></div>
        </aside>
        <section class="chat-main">
          <div class="chat-main-head">
            <div id="chatWidgetConversationTitle" class="chat-main-title">Selecione uma conversa</div>
            <div id="chatWidgetConversationSubtitle" class="chat-main-subtitle">Envie mensagens e arquivos para o time</div>
          </div>
          <div id="chatWidgetMessages" class="chat-messages"></div>
          <div class="chat-compose">
            <div id="chatWidgetFilesPreview" class="chat-files"></div>
            <div class="chat-compose-row">
              <textarea id="chatWidgetComposer" class="chat-textarea" rows="2" placeholder="Escreva uma mensagem... (Enter envia)"></textarea>
              <label for="chatWidgetFilesInput" class="chat-btn" title="Anexar arquivos">Anexar</label>
              <input id="chatWidgetFilesInput" class="chat-hidden-file" type="file" multiple />
              <button id="chatWidgetSendBtn" type="button" class="chat-btn chat-btn-primary">Enviar</button>
            </div>
          </div>
        </section>
      </div>
      <div id="chatWidgetPicker" class="chat-picker hidden">
        <div class="chat-head">
          <div class="chat-head-title">Nova conversa direta</div>
          <button id="chatWidgetPickerCloseBtn" type="button" class="chat-btn">Fechar</button>
        </div>
        <input id="chatWidgetPickerSearch" class="chat-search" type="search" placeholder="Buscar colaborador" />
        <div id="chatWidgetPickerList" class="chat-picker-list"></div>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper);
}

function chatRenderFabBadge() {
  const badge = qs('#chatWidgetFabBadge');
  if (!badge) return;
  const total = chatWidgetState.conversations.reduce((acc, item) => acc + Number(item.nao_lidas || 0), 0);
  if (total > 0) {
    badge.textContent = total > 99 ? '99+' : String(total);
    badge.classList.remove('hidden');
  } else {
    badge.textContent = '';
    badge.classList.add('hidden');
  }
}

function chatSetPanelOpen(isOpen) {
  const panel = qs('#chatWidgetPanel');
  if (!panel) return;
  chatWidgetState.isOpen = Boolean(isOpen);
  panel.classList.toggle('hidden', !chatWidgetState.isOpen);
  if (chatWidgetState.isOpen && chatWidgetState.selectedConversationId) {
    chatLoadMessages(chatWidgetState.selectedConversationId, { silent: true }).catch(() => {});
  }
}

function chatRenderConversations() {
  const listEl = qs('#chatWidgetConversations');
  if (!listEl) return;
  const term = String((qs('#chatWidgetConversationSearch') && qs('#chatWidgetConversationSearch').value) || '')
    .trim()
    .toLowerCase();
  const rows = chatWidgetState.conversations.filter((item) => {
    if (!term) return true;
    return (
      String(item.nome_exibicao || '').toLowerCase().includes(term) ||
      String(item.ultima_mensagem_texto || '').toLowerCase().includes(term)
    );
  });
  if (!rows.length) {
    listEl.innerHTML = '<div class="chat-empty">Nenhuma conversa encontrada.</div>';
    return;
  }
  listEl.innerHTML = rows
    .map((item) => {
      const active = Number(item.id) === Number(chatWidgetState.selectedConversationId);
      const unread = Number(item.nao_lidas || 0);
      const preview = item.ultima_mensagem_texto
        ? chatEscapeHtml(item.ultima_mensagem_texto)
        : item.ultima_mensagem_id
          ? 'Arquivo enviado'
          : 'Sem mensagens ainda';
      return `
        <div class="chat-conversation ${active ? 'active' : ''}" data-chat-conversa-id="${item.id}">
          <div class="chat-conversation-name">${chatEscapeHtml(item.nome_exibicao || 'Conversa')}</div>
          <div class="chat-conversation-meta">
            <div class="chat-conversation-preview">${preview}</div>
            <div class="chat-conversation-time">${chatEscapeHtml(chatFormatListTime(item.ultima_mensagem_em || item.updated_at || item.created_at))}</div>
          </div>
          ${unread > 0 ? `<span class="chat-conversation-unread">${unread > 99 ? '99+' : unread}</span>` : ''}
        </div>
      `;
    })
    .join('');
}

function chatRenderMessages() {
  const messagesEl = qs('#chatWidgetMessages');
  const titleEl = qs('#chatWidgetConversationTitle');
  const subtitleEl = qs('#chatWidgetConversationSubtitle');
  if (!messagesEl || !titleEl || !subtitleEl) return;
  const selected = chatGetSelectedConversation();
  if (!selected) {
    titleEl.textContent = 'Selecione uma conversa';
    subtitleEl.textContent = 'Envie mensagens e arquivos para o time';
    messagesEl.innerHTML = '<div class="chat-empty">Escolha uma conversa para iniciar.</div>';
    return;
  }
  titleEl.textContent = selected.nome_exibicao || 'Conversa';
  subtitleEl.textContent = selected.tipo === 'direta' ? 'Conversa direta' : 'Conversa em grupo';
  const mensagens = chatWidgetState.messagesByConversation[String(selected.id)] || [];
  if (!mensagens.length) {
    messagesEl.innerHTML = '<div class="chat-empty">Nenhuma mensagem ainda. Envie a primeira.</div>';
    return;
  }
  messagesEl.innerHTML = mensagens
    .map((mensagem) => {
      const isMine = Number(mensagem.autor_id) === Number(chatWidgetState.me && chatWidgetState.me.id);
      const anexos = Array.isArray(mensagem.anexos) ? mensagem.anexos : [];
      const anexosHtml = anexos.length
        ? `<div class="chat-attachments">
            ${anexos
              .map(
                (anexo) => `
                  <button
                    type="button"
                    class="chat-attachment"
                    data-chat-anexo-id="${anexo.id}"
                    data-chat-anexo-nome="${encodeURIComponent(anexo.nome_original || 'anexo')}"
                  >
                    ${chatEscapeHtml(anexo.nome_original || 'Anexo')}
                  </button>
                `
              )
              .join('')}
          </div>`
        : '';
      return `
        <div class="chat-message ${isMine ? 'mine' : ''}">
          <div class="chat-message-meta">
            <span>${chatEscapeHtml(isMine ? 'Voce' : mensagem.autor_nome || 'Colaborador')}</span>
            <span>${chatEscapeHtml(chatFormatHour(mensagem.created_at))}</span>
          </div>
          ${mensagem.texto ? `<div class="chat-message-text">${chatEscapeHtml(mensagem.texto)}</div>` : ''}
          ${anexosHtml}
        </div>
      `;
    })
    .join('');
}

function chatRenderFilesPreview() {
  const filesEl = qs('#chatWidgetFilesPreview');
  const input = qs('#chatWidgetFilesInput');
  if (!filesEl || !input) return;
  const files = Array.from(input.files || []);
  filesEl.innerHTML = files
    .map((file) => `<span class="chat-file-pill">${chatEscapeHtml(file.name)}</span>`)
    .join('');
}

function chatRenderCollaborators() {
  const listEl = qs('#chatWidgetPickerList');
  const searchEl = qs('#chatWidgetPickerSearch');
  if (!listEl) return;
  const term = String((searchEl && searchEl.value) || '')
    .trim()
    .toLowerCase();
  const rows = chatWidgetState.collaborators.filter((item) => {
    if (!term) return true;
    return (
      String(item.nome || '').toLowerCase().includes(term) ||
      String(item.email || '').toLowerCase().includes(term)
    );
  });
  if (!rows.length) {
    listEl.innerHTML = '<div class="chat-empty">Nenhum colaborador encontrado.</div>';
    return;
  }
  listEl.innerHTML = rows
    .map(
      (item) => `
        <div class="chat-picker-item" data-chat-colaborador-id="${item.id}">
          <div class="chat-picker-name">${chatEscapeHtml(item.nome || 'Colaborador')}</div>
          <div class="chat-picker-email">${chatEscapeHtml(item.email || '')}</div>
        </div>
      `
    )
    .join('');
}

async function chatLoadConversations(options = {}) {
  if (!api.chat || chatWidgetState.loadingConversations) return;
  chatWidgetState.loadingConversations = true;
  const keepSelection = options.keepSelection !== false;
  const oldSelected = Number(chatWidgetState.selectedConversationId || 0);
  try {
    const response = await api.chat.listConversas();
    chatWidgetState.conversations = Array.isArray(response.data) ? response.data : [];
    if (!keepSelection || !chatWidgetState.selectedConversationId) {
      chatWidgetState.selectedConversationId = chatWidgetState.conversations[0]
        ? Number(chatWidgetState.conversations[0].id)
        : null;
    } else {
      const exists = chatWidgetState.conversations.some((item) => Number(item.id) === oldSelected);
      chatWidgetState.selectedConversationId = exists
        ? oldSelected
        : chatWidgetState.conversations[0]
          ? Number(chatWidgetState.conversations[0].id)
          : null;
    }
    chatRenderFabBadge();
    chatRenderConversations();
    chatRenderMessages();
  } catch (err) {
    if (!options.silent) chatSetStatus(err.message || 'Falha ao carregar conversas.', true);
  } finally {
    chatWidgetState.loadingConversations = false;
  }
}

async function chatLoadMessages(conversaId, options = {}) {
  if (!api.chat || !conversaId || chatWidgetState.loadingMessages) return;
  chatWidgetState.loadingMessages = true;
  try {
    const response = await api.chat.listMensagens(conversaId, { limit: 80 });
    chatWidgetState.messagesByConversation[String(conversaId)] = Array.isArray(response.data) ? response.data : [];
    const conversa = chatWidgetState.conversations.find((item) => Number(item.id) === Number(conversaId));
    if (conversa) conversa.nao_lidas = 0;
    chatRenderFabBadge();
    chatRenderConversations();
    chatRenderMessages();
    const messagesEl = qs('#chatWidgetMessages');
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  } catch (err) {
    if (!options.silent) chatSetStatus(err.message || 'Falha ao carregar mensagens.', true);
  } finally {
    chatWidgetState.loadingMessages = false;
  }
}

async function chatOpenNewConversationPicker() {
  if (!api.chat) return;
  const picker = qs('#chatWidgetPicker');
  const pickerSearch = qs('#chatWidgetPickerSearch');
  if (!picker) return;
  picker.classList.remove('hidden');
  if (!chatWidgetState.collaborators.length) {
    try {
      const response = await api.chat.listColaboradores();
      chatWidgetState.collaborators = Array.isArray(response.data) ? response.data : [];
    } catch (err) {
      chatSetStatus(err.message || 'Falha ao carregar colaboradores.', true);
      return;
    }
  }
  if (pickerSearch) pickerSearch.value = '';
  chatRenderCollaborators();
}

async function chatCreateDirectConversation(colaboradorId) {
  if (!api.chat) return;
  try {
    const response = await api.chat.criarConversaDireta(colaboradorId);
    const conversaId = response && response.conversa ? Number(response.conversa.id) : null;
    await chatLoadConversations({ keepSelection: false, silent: true });
    if (conversaId) {
      chatWidgetState.selectedConversationId = conversaId;
      chatRenderConversations();
      await chatLoadMessages(conversaId, { silent: true });
    }
    const picker = qs('#chatWidgetPicker');
    if (picker) picker.classList.add('hidden');
    chatSetPanelOpen(true);
  } catch (err) {
    chatSetStatus(err.message || 'Nao foi possivel criar a conversa.', true);
  }
}

async function chatHandleSendMessage() {
  const selected = chatGetSelectedConversation();
  if (!selected || !api.chat) return;
  const textarea = qs('#chatWidgetComposer');
  const fileInput = qs('#chatWidgetFilesInput');
  const sendBtn = qs('#chatWidgetSendBtn');
  const texto = textarea ? String(textarea.value || '').trim() : '';
  const arquivos = fileInput ? Array.from(fileInput.files || []) : [];
  if (!texto && !arquivos.length) return;
  if (sendBtn) sendBtn.disabled = true;
  try {
    const response = await api.chat.enviarMensagem(selected.id, texto, arquivos);
    const mensagem = response && response.mensagem ? response.mensagem : null;
    if (mensagem) {
      const key = String(selected.id);
      const current = chatWidgetState.messagesByConversation[key] || [];
      chatWidgetState.messagesByConversation[key] = [...current, mensagem];
    }
    if (textarea) textarea.value = '';
    if (fileInput) fileInput.value = '';
    chatRenderFilesPreview();
    chatRenderMessages();
    const messagesEl = qs('#chatWidgetMessages');
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
    await chatLoadConversations({ keepSelection: true, silent: true });
  } catch (err) {
    chatSetStatus(err.message || 'Falha ao enviar mensagem.', true);
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

function chatStartPolling() {
  if (chatWidgetState.pollTimerId || !api.chat) return;
  chatWidgetState.pollTimerId = setInterval(async () => {
    if (document.hidden) return;
    await chatLoadConversations({ keepSelection: true, silent: true });
    if (chatWidgetState.isOpen && chatWidgetState.selectedConversationId) {
      await chatLoadMessages(chatWidgetState.selectedConversationId, { silent: true });
    }
  }, 6000);
}

function chatBindEvents() {
  const fab = qs('#chatWidgetFab');
  const closeBtn = qs('#chatWidgetCloseBtn');
  const newBtn = qs('#chatWidgetNewBtn');
  const pickerClose = qs('#chatWidgetPickerCloseBtn');
  const conversationSearch = qs('#chatWidgetConversationSearch');
  const pickerSearch = qs('#chatWidgetPickerSearch');
  const conversationList = qs('#chatWidgetConversations');
  const pickerList = qs('#chatWidgetPickerList');
  const sendBtn = qs('#chatWidgetSendBtn');
  const composer = qs('#chatWidgetComposer');
  const fileInput = qs('#chatWidgetFilesInput');
  const messagesEl = qs('#chatWidgetMessages');

  fab?.addEventListener('click', () => chatSetPanelOpen(!chatWidgetState.isOpen));
  closeBtn?.addEventListener('click', () => chatSetPanelOpen(false));
  newBtn?.addEventListener('click', () => {
    chatOpenNewConversationPicker().catch(() => {});
  });
  pickerClose?.addEventListener('click', () => {
    qs('#chatWidgetPicker')?.classList.add('hidden');
  });
  conversationSearch?.addEventListener('input', () => chatRenderConversations());
  pickerSearch?.addEventListener('input', () => chatRenderCollaborators());
  fileInput?.addEventListener('change', () => chatRenderFilesPreview());
  sendBtn?.addEventListener('click', () => {
    chatHandleSendMessage().catch(() => {});
  });
  composer?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      chatHandleSendMessage().catch(() => {});
    }
  });

  conversationList?.addEventListener('click', (event) => {
    const card = event.target.closest('[data-chat-conversa-id]');
    if (!card) return;
    const conversaId = Number(card.getAttribute('data-chat-conversa-id'));
    if (!conversaId) return;
    chatWidgetState.selectedConversationId = conversaId;
    chatRenderConversations();
    chatLoadMessages(conversaId).catch(() => {});
  });

  pickerList?.addEventListener('click', (event) => {
    const row = event.target.closest('[data-chat-colaborador-id]');
    if (!row) return;
    const colaboradorId = Number(row.getAttribute('data-chat-colaborador-id'));
    if (!colaboradorId) return;
    chatCreateDirectConversation(colaboradorId).catch(() => {});
  });

  messagesEl?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-chat-anexo-id]');
    if (!btn || !api.chat) return;
    const anexoId = Number(btn.getAttribute('data-chat-anexo-id'));
    if (!anexoId) return;
    const nome = decodeURIComponent(btn.getAttribute('data-chat-anexo-nome') || 'anexo');
    api.chat.downloadAnexo(anexoId, nome).catch((err) => {
      chatSetStatus(err.message || 'Falha ao baixar anexo.', true);
    });
  });
}

async function initChatWidget(meData) {
  if (chatWidgetState.initialized) return;
  if (document.body.dataset.page === 'login') return;
  if (!api.chat) return;
  const usuario = meData && meData.usuario ? meData.usuario : null;
  if (!usuario || !usuario.id) return;

  chatWidgetState.me = usuario;
  chatInjectStyles();
  chatInjectMarkup();
  chatBindEvents();
  chatWidgetState.initialized = true;

  await chatLoadConversations({ keepSelection: false, silent: true });
  if (chatWidgetState.selectedConversationId) {
    await chatLoadMessages(chatWidgetState.selectedConversationId, { silent: true });
  } else {
    chatRenderMessages();
  }
  chatStartPolling();
}

async function guardAuth() {
  try {
    const me = await getMe();
    window.__currentUser = me && me.usuario ? me.usuario : null;
    applyRolePermissionsUI(me);
    updateProcessosBadge();
    initChatWidget(me).catch(() => {});
    return me;
  } catch (err) {
    clearToken();
    window.location.href = './login';
  }
}

function normalizeUserRole(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!raw) return '';
  if (raw === 'owner' || raw === 'admin' || raw === 'administrador') return 'administrador';
  if (raw === 'colaborador' || raw === 'advogado') return 'advogado';
  if (raw === 'estagiario') return 'estagiario';
  return raw;
}

function getCurrentUserRole() {
  return normalizeUserRole(window.__currentUser?.papel || '');
}

function canAccessFinanceiro(role = getCurrentUserRole()) {
  return role === 'administrador';
}

function canCreateDeleteAtividades(role = getCurrentUserRole()) {
  return role !== 'estagiario';
}

function applyRolePermissionsUI(me) {
  const role = normalizeUserRole(me?.usuario?.papel || '');

  if (!canAccessFinanceiro(role)) {
    qsa('a[href="./financeiro"], a[href="/financeiro"], a[href$="/financeiro"]').forEach((link) =>
      link.classList.add('hidden')
    );
    if (document.body?.dataset?.page === 'financeiro') {
      window.location.href = './dashboard';
    }
  }
}

function bindLogout() {
  const btn = qs('#logoutBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    try {
      await logout();
    } catch (_) {
      clearToken();
    }
    if (chatWidgetState.pollTimerId) {
      clearInterval(chatWidgetState.pollTimerId);
      chatWidgetState.pollTimerId = null;
    }
    window.location.href = './login';
  });
}

async function initLogin() {
  const msg = qs('#loginMessage');
  const tabLoginBtn = qs('#tabLoginBtn');
  const tabCadastroBtn = qs('#tabCadastroBtn');
  const loginForm = qs('#loginForm');
  const cadastroSection = qs('#cadastroSection');
  const cadastroStartForm = qs('#cadastroStartForm');
  const cadastroVerifyForm = qs('#cadastroVerifyForm');
  const cadastroStartMessage = qs('#cadastroStartMessage');
  const cadastroVerifyMessage = qs('#cadastroVerifyMessage');
  const cadastroEmailResumo = qs('#cadastroEmailResumo');
  const cadastroBackBtn = qs('#cadastroBackBtn');
  const cadastroCodigo = qs('#cadastroCodigo');
  const cadastroStartBtn = qs('#cadastroStartBtn');
  const cadastroVerifyBtn = qs('#cadastroVerifyBtn');
  const loginSubmitBtn = qs('#loginSubmitBtn');
  const cadastroEscritorio = qs('#cadastroEscritorio');
  const cadastroNome = qs('#cadastroNome');
  const cadastroEmail = qs('#cadastroEmail');
  const cadastroSenha = qs('#cadastroSenha');

  let cadastroEmailAtual = '';

  const setTab = (tab) => {
    const isLogin = tab === 'login';
    if (loginForm) loginForm.classList.toggle('hidden', !isLogin);
    if (cadastroSection) cadastroSection.classList.toggle('hidden', isLogin);
    if (tabLoginBtn) {
      tabLoginBtn.className = isLogin
        ? 'py-3 rounded-2xl text-sm font-semibold bg-[#0C1B33] text-white'
        : 'py-3 rounded-2xl text-sm font-semibold bg-stone-100 text-stone-700';
    }
    if (tabCadastroBtn) {
      tabCadastroBtn.className = isLogin
        ? 'py-3 rounded-2xl text-sm font-semibold bg-stone-100 text-stone-700'
        : 'py-3 rounded-2xl text-sm font-semibold bg-[#0C1B33] text-white';
    }
  };

  const showCadastroStart = () => {
    if (cadastroStartForm) cadastroStartForm.classList.remove('hidden');
    if (cadastroVerifyForm) cadastroVerifyForm.classList.add('hidden');
    showMessage(cadastroVerifyMessage, '');
  };

  const showCadastroVerify = () => {
    if (cadastroStartForm) cadastroStartForm.classList.add('hidden');
    if (cadastroVerifyForm) cadastroVerifyForm.classList.remove('hidden');
    if (cadastroEmailResumo) cadastroEmailResumo.textContent = cadastroEmailAtual || '';
    if (cadastroCodigo) cadastroCodigo.focus();
  };

  const params = new URLSearchParams(window.location.search);
  const erro = params.get('erro');
  if (erro === 'credenciais') {
    showMessage(msg, 'Credenciais inválidas. Tente novamente.');
  } else if (erro === 'campos') {
    showMessage(msg, 'Informe usuário/e-mail e senha.');
  } else if (erro === 'servidor') {
    showMessage(msg, 'Erro no servidor. Tente novamente.');
  } else {
    showMessage(msg, '');
  }

  setTab('login');
  showCadastroStart();

  tabLoginBtn?.addEventListener('click', () => setTab('login'));
  tabCadastroBtn?.addEventListener('click', () => setTab('cadastro'));

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage(msg, '');
    if (loginSubmitBtn) loginSubmitBtn.disabled = true;
    try {
      await login((qs('#email')?.value || '').trim(), qs('#senha')?.value || '');
      window.location.href = './dashboard';
    } catch (err) {
      showMessage(msg, err.message || 'Não foi possível entrar no sistema.');
    } finally {
      if (loginSubmitBtn) loginSubmitBtn.disabled = false;
    }
  });

  cadastroStartForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage(cadastroStartMessage, '');
    if (cadastroStartBtn) cadastroStartBtn.disabled = true;
    try {
      const payload = {
        nome_escritorio: (cadastroEscritorio?.value || '').trim(),
        nome: (cadastroNome?.value || '').trim(),
        email: (cadastroEmail?.value || '').trim(),
        senha: cadastroSenha?.value || '',
      };
      const resp = await api.auth.registerStart(payload);
      cadastroEmailAtual = resp.email || payload.email;
      showMessage(cadastroStartMessage, resp.mensagem || 'Código enviado.', 'sucesso');
      showCadastroVerify();
    } catch (err) {
      showMessage(cadastroStartMessage, err.message || 'Não foi possível iniciar cadastro.');
    } finally {
      if (cadastroStartBtn) cadastroStartBtn.disabled = false;
    }
  });

  cadastroVerifyForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage(cadastroVerifyMessage, '');
    if (cadastroVerifyBtn) cadastroVerifyBtn.disabled = true;
    try {
      const resp = await api.auth.registerVerify({
        email: cadastroEmailAtual,
        codigo: (cadastroCodigo?.value || '').trim(),
      });
      if (resp?.token) {
        setToken(resp.token);
      }
      if (resp?.escritorio_atual?.id) {
        api.auth.setEscritorio(resp.escritorio_atual.id);
      }
      window.location.href = './dashboard';
    } catch (err) {
      showMessage(cadastroVerifyMessage, err.message || 'Código inválido.');
    } finally {
      if (cadastroVerifyBtn) cadastroVerifyBtn.disabled = false;
    }
  });

  cadastroBackBtn?.addEventListener('click', () => {
    showCadastroStart();
    showMessage(cadastroStartMessage, 'Solicite um novo código se necessário.');
  });
}

async function initDashboard() {
  await guardAuth();
  bindLogout();

  const toIsoDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getTodayIso = () => toIsoDate(new Date());
  const addDaysToIso = (isoDate, days) => {
    const base = new Date(`${isoDate}T00:00:00`);
    base.setDate(base.getDate() + days);
    return toIsoDate(base);
  };

  const hoje = getTodayIso();

  const countClientesEl = qs('#countClientes');
  const countProcessosEl = qs('#countProcessos');
  const countAtividadesEl = qs('#countAtividades');
  const countAtividadesLabelEl = qs('#countAtividadesLabel');
  const countAtivasEl = qs('#countAtivas');
  const periodoEl = qs('#dashboardHojePeriodo');
  const rangeButtons = qsa('[data-dashboard-range]');

  if (countClientesEl || countProcessosEl || countAtividadesEl || countAtivasEl) {
    const [clientes, processos, atividadesTotal, atividadesHoje, atividadesFeitas] = await Promise.all([
      api.clientes.list({ page: 1, limit: 1 }),
      api.processos.list({ page: 1, limit: 1, exclude_sem_processo: 'true' }),
      api.atividades.list({ page: 1, limit: 1 }),
      api.atividades.list({ page: 1, limit: 1, prazo: hoje }),
      api.atividades.list({ page: 1, limit: 1, status: 'feito' }),
    ]);

    if (countClientesEl) countClientesEl.textContent = clientes.total;
    if (countProcessosEl) countProcessosEl.textContent = processos.total;
    if (countAtividadesEl) countAtividadesEl.textContent = atividadesHoje.total;
    if (countAtivasEl) countAtivasEl.textContent = atividadesTotal.total - atividadesFeitas.total;
  }

  const listaEl = qs('#dashboardHojeLista');
  const vazioEl = qs('#dashboardHojeVazio');
  const infoEl = qs('#dashboardHojeInfo');
  const audienciasEl = qs('#dashboardAudienciasLista');
  const audienciasVazio = qs('#dashboardAudienciasVazio');
  const audienciasInfo = qs('#dashboardAudienciasInfo');
  const audienciasPrev = qs('#dashboardAudienciasPrev');
  const audienciasNext = qs('#dashboardAudienciasNext');
  const detalheModal = qs('#dashboardAtividadeModal');
  const detalheClose = qs('#dashboardAtividadeClose');
  const detalheTipo = qs('#dashboardAtividadeTipo');
  const detalheTitulo = qs('#dashboardAtividadeTitulo');
  const detalheCliente = qs('#dashboardAtividadeCliente');
  const detalheProcesso = qs('#dashboardAtividadeProcesso');
  const detalhePrazo = qs('#dashboardAtividadePrazo');
  const detalheStatus = qs('#dashboardAtividadeStatus');
  const detalhePrioridade = qs('#dashboardAtividadePrioridade');
  const detalheDescricao = qs('#dashboardAtividadeDescricao');
  const quickSearchForm = qs('#dashboardQuickSearchForm');
  const quickSearchInput = qs('#dashboardQuickSearchInput');
  const quickSearchStatus = qs('#dashboardQuickSearchStatus');
  const quickSearchResults = qs('#dashboardQuickSearchResults');
  const quickSearchBtn = qs('#dashboardQuickSearchBtn');
  const quickCreateBtn = qs('#dashboardQuickCreateBtn');
  const quickCreateMenu = qs('#dashboardQuickCreateMenu');
  const createModal = qs('#dashboardCreateModal');
  const createCloseBtn = qs('#dashboardCreateClose');
  const createTitleEl = qs('#dashboardCreateTitle');
  const createTabButtons = qsa('[data-dashboard-create-tab]');
  const createPanels = qsa('[data-dashboard-create-panel]');
  const createTabAtividadeBtn = qs('[data-dashboard-create-tab-atividade]');
  const createClienteForm = qs('#dashboardCreateClienteForm');
  const createClienteNome = qs('#dashboardCreateClienteNome');
  const createClienteTelefone = qs('#dashboardCreateClienteTelefone');
  const createClienteCpf = qs('#dashboardCreateClienteCpf');
  const createClienteStatus = qs('#dashboardCreateClienteStatus');
  const createClienteMsg = qs('#dashboardCreateClienteMessage');
  const createProcessoForm = qs('#dashboardCreateProcessoForm');
  const createProcessoClienteInput = qs('#dashboardCreateProcessoClienteInput');
  const createProcessoClienteSugestoesEl = qs('#dashboardCreateProcessoClienteSugestoes');
  const createProcessoNumero = qs('#dashboardCreateProcessoNumero');
  const createProcessoStatus = qs('#dashboardCreateProcessoStatus');
  const createProcessoMsg = qs('#dashboardCreateProcessoMessage');
  const createAtividadeForm = qs('#dashboardCreateAtividadeForm');
  const createAtividadeTitulo = qs('#dashboardCreateAtividadeTitulo');
  const createAtividadeClienteInput = qs('#dashboardCreateAtividadeClienteInput');
  const createAtividadeClienteSugestoesEl = qs('#dashboardCreateAtividadeClienteSugestoes');
  const createAtividadeProcessoInput = qs('#dashboardCreateAtividadeProcessoInput');
  const createAtividadeProcessoSugestoesEl = qs('#dashboardCreateAtividadeProcessoSugestoes');
  const createAtividadeStatus = qs('#dashboardCreateAtividadeStatus');
  const createAtividadePrioridade = qs('#dashboardCreateAtividadePrioridade');
  const createAtividadePrazo = qs('#dashboardCreateAtividadePrazo');
  const createAtividadeDescricao = qs('#dashboardCreateAtividadeDescricao');
  const createAtividadeMsg = qs('#dashboardCreateAtividadeMessage');
  const canManageAtividades = canCreateDeleteAtividades();
  const dashboardRanges = {
    today: {
      countLabel: 'Atividades de hoje',
      focusLabel: 'hoje',
      emptyLabel: 'para hoje',
      getParams: () => ({ prazo: hoje }),
    },
    '7d': {
      countLabel: 'Atividades (7 dias)',
      focusLabel: 'próximos 7 dias',
      emptyLabel: 'nos próximos 7 dias',
      getParams: () => ({ prazo_from: hoje, prazo_to: addDaysToIso(hoje, 6) }),
    },
    '30d': {
      countLabel: 'Atividades (30 dias)',
      focusLabel: 'próximos 30 dias',
      emptyLabel: 'nos próximos 30 dias',
      getParams: () => ({ prazo_from: hoje, prazo_to: addDaysToIso(hoje, 29) }),
    },
  };
  let dashboardRange = 'today';
  let audienciasPage = 1;
  const audienciasPageSize = 5;
  let audienciasCache = [];
  let atividadesPeriodoCache = [];
  let quickSearchDebounceTimer = null;
  let quickSearchRequestId = 0;
  let quickSearchItems = [];
  let createCurrentTab = 'cliente';
  let createProcessoClienteId = '';
  let createAtividadeClienteId = '';
  let createAtividadeProcessoId = '';
  let createProcessoClienteSuggestions = [];
  let createAtividadeClienteSuggestions = [];
  let createAtividadeProcessoSuggestions = [];
  let createProcessoClienteReqId = 0;
  let createAtividadeClienteReqId = 0;
  let createAtividadeProcessoReqId = 0;
  let createProcessoClienteTimer = null;
  let createAtividadeClienteTimer = null;
  let createAtividadeProcessoTimer = null;

  const escapeQuickSearchHtml = (value) =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const setQuickSearchStatus = (text) => {
    if (!quickSearchStatus) return;
    quickSearchStatus.textContent = String(text || '');
  };

  const openDashboardSearchResult = (item) => {
    if (!item || !item.id || !item.type) return;
    const path = item.type === 'cliente' ? `./cliente?id=${item.id}` : `./processo?id=${item.id}`;
    window.location.href = path;
  };

  const renderQuickSearchResults = (items) => {
    if (!quickSearchResults) return;
    quickSearchItems = Array.isArray(items) ? items : [];
    if (!quickSearchItems.length) {
      quickSearchResults.innerHTML = '';
      quickSearchResults.classList.add('hidden');
      return;
    }
    quickSearchResults.classList.remove('hidden');
    quickSearchResults.innerHTML = quickSearchItems
      .map(
        (item, idx) => `
          <button
            type="button"
            class="w-full py-3 text-left hover:bg-stone-50 px-2 rounded-lg"
            data-dashboard-search-index="${idx}"
          >
            <div class="dashboard-quick-search-item text-sm">${escapeQuickSearchHtml(item.label)}</div>
            <div class="dashboard-quick-search-item-meta text-xs mt-0.5">${escapeQuickSearchHtml(item.meta)}</div>
          </button>
        `
      )
      .join('');
  };

  const clearQuickSearchResults = () => {
    quickSearchItems = [];
    if (!quickSearchResults) return;
    quickSearchResults.innerHTML = '';
    quickSearchResults.classList.add('hidden');
  };

  const setQuickCreateMenuOpen = (open) => {
    if (!quickCreateMenu || !quickCreateBtn) return;
    quickCreateMenu.classList.toggle('hidden', !open);
    quickCreateBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  const hideCreateSuggestions = () => {
    createProcessoClienteSuggestions = [];
    createAtividadeClienteSuggestions = [];
    createAtividadeProcessoSuggestions = [];
    if (createProcessoClienteSugestoesEl) {
      createProcessoClienteSugestoesEl.innerHTML = '';
      createProcessoClienteSugestoesEl.classList.add('hidden');
    }
    if (createAtividadeClienteSugestoesEl) {
      createAtividadeClienteSugestoesEl.innerHTML = '';
      createAtividadeClienteSugestoesEl.classList.add('hidden');
    }
    if (createAtividadeProcessoSugestoesEl) {
      createAtividadeProcessoSugestoesEl.innerHTML = '';
      createAtividadeProcessoSugestoesEl.classList.add('hidden');
    }
  };

  const setCreateTab = (tab) => {
    const normalized = String(tab || '').trim().toLowerCase();
    let nextTab = ['cliente', 'processo', 'atividade'].includes(normalized) ? normalized : 'cliente';
    if (nextTab === 'atividade' && !canManageAtividades) nextTab = 'cliente';
    createCurrentTab = nextTab;
    createTabButtons.forEach((btn) => {
      const active = (btn.dataset.dashboardCreateTab || '') === createCurrentTab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    createPanels.forEach((panel) => {
      const panelTab = panel.dataset.dashboardCreatePanel || '';
      panel.classList.toggle('hidden', panelTab !== createCurrentTab);
    });
    if (createTitleEl) {
      const titles = {
        cliente: 'Criar cliente',
        processo: 'Criar processo',
        atividade: 'Criar atividade',
      };
      createTitleEl.textContent = titles[createCurrentTab] || 'Criar';
    }
  };

  const resetCreateModalState = () => {
    createProcessoClienteId = '';
    createAtividadeClienteId = '';
    createAtividadeProcessoId = '';
    if (createClienteForm) createClienteForm.reset();
    if (createProcessoForm) createProcessoForm.reset();
    if (createAtividadeForm) createAtividadeForm.reset();
    if (createClienteStatus) createClienteStatus.value = 'lead';
    if (createAtividadeStatus) createAtividadeStatus.value = 'a_fazer';
    if (createAtividadePrioridade) createAtividadePrioridade.value = 'media';
    showMessage(createClienteMsg, '');
    showMessage(createProcessoMsg, '');
    showMessage(createAtividadeMsg, '');
    hideCreateSuggestions();
  };

  const closeDashboardCreateModal = () => {
    if (!createModal) return;
    closeModal(createModal);
    hideCreateSuggestions();
  };

  const renderCreateProcessoClienteSuggestions = () => {
    if (!createProcessoClienteSugestoesEl) return;
    if (!createProcessoClienteSuggestions.length) {
      createProcessoClienteSugestoesEl.innerHTML = '';
      createProcessoClienteSugestoesEl.classList.add('hidden');
      return;
    }
    createProcessoClienteSugestoesEl.classList.remove('hidden');
    createProcessoClienteSugestoesEl.innerHTML = createProcessoClienteSuggestions
      .map(
        (item, idx) => `
          <button type="button" class="w-full text-left px-3 py-2 text-sm border-b border-stone-100 last:border-b-0" data-dashboard-create-proc-cliente-index="${idx}">
            ${escapeQuickSearchHtml(item.nome || 'Cliente')}
          </button>
        `
      )
      .join('');
  };

  const renderCreateAtividadeClienteSuggestions = () => {
    if (!createAtividadeClienteSugestoesEl) return;
    if (!createAtividadeClienteSuggestions.length) {
      createAtividadeClienteSugestoesEl.innerHTML = '';
      createAtividadeClienteSugestoesEl.classList.add('hidden');
      return;
    }
    createAtividadeClienteSugestoesEl.classList.remove('hidden');
    createAtividadeClienteSugestoesEl.innerHTML = createAtividadeClienteSuggestions
      .map(
        (item, idx) => `
          <button type="button" class="w-full text-left px-3 py-2 text-sm border-b border-stone-100 last:border-b-0" data-dashboard-create-atividade-cliente-index="${idx}">
            ${escapeQuickSearchHtml(item.nome || 'Cliente')}
          </button>
        `
      )
      .join('');
  };

  const renderCreateAtividadeProcessoSuggestions = () => {
    if (!createAtividadeProcessoSugestoesEl) return;
    if (!createAtividadeProcessoSuggestions.length) {
      createAtividadeProcessoSugestoesEl.innerHTML = '';
      createAtividadeProcessoSugestoesEl.classList.add('hidden');
      return;
    }
    createAtividadeProcessoSugestoesEl.classList.remove('hidden');
    createAtividadeProcessoSugestoesEl.innerHTML = createAtividadeProcessoSuggestions
      .map(
        (item, idx) => `
          <button type="button" class="w-full text-left px-3 py-2 text-sm border-b border-stone-100 last:border-b-0" data-dashboard-create-atividade-processo-index="${idx}">
            <div>${escapeQuickSearchHtml(item.numero_processo || 'Processo')}</div>
            <div class="text-xs text-stone-500 mt-0.5">${escapeQuickSearchHtml(item.cliente_nome || '')}</div>
          </button>
        `
      )
      .join('');
  };

  const openDashboardCreateFlow = (target) => {
    if (!createModal) return;
    setQuickCreateMenuOpen(false);
    resetCreateModalState();
    setCreateTab(target || 'cliente');
    openModal(createModal);
    if (createCurrentTab === 'cliente' && createClienteNome) createClienteNome.focus();
    if (createCurrentTab === 'processo' && createProcessoClienteInput) createProcessoClienteInput.focus();
    if (createCurrentTab === 'atividade' && createAtividadeTitulo) createAtividadeTitulo.focus();
  };
  const loadDashboardQuickSearch = async (rawTerm) => {
    const term = String(rawTerm || '').trim();
    if (!term) {
      setQuickSearchStatus('');
      clearQuickSearchResults();
      return [];
    }

    const reqId = ++quickSearchRequestId;
    setQuickSearchStatus('Buscando...');
    if (quickSearchBtn) quickSearchBtn.disabled = true;
    try {
      const [clientesResp, processosResp] = await Promise.all([
        api.clientes.list({ page: 1, limit: 5, search: term }),
        api.processos.list({ page: 1, limit: 5, search: term, exclude_sem_processo: 'true' }),
      ]);
      if (reqId !== quickSearchRequestId) return [];

      const clientes = (clientesResp?.data || []).map((item) => ({
        type: 'cliente',
        id: item.id,
        label: item.nome || 'Cliente',
        meta: `Cliente${item.cpf ? ` · CPF ${item.cpf}` : ''}${item.telefone ? ` · ${item.telefone}` : ''}`,
      }));

      const processos = (processosResp?.data || []).map((item) => ({
        type: 'processo',
        id: item.id,
        label: item.numero_processo || 'Processo',
        meta: `Processo${item.cliente_nome ? ` · ${item.cliente_nome}` : ''}`,
      }));

      const results = [...clientes, ...processos];
      renderQuickSearchResults(results);
      setQuickSearchStatus(results.length ? `${results.length} resultado(s).` : 'Nenhum resultado encontrado.');
      return results;
    } catch (err) {
      if (reqId !== quickSearchRequestId) return [];
      clearQuickSearchResults();
      setQuickSearchStatus(err.message || 'Não foi possível pesquisar agora.');
      return [];
    } finally {
      if (quickSearchBtn) quickSearchBtn.disabled = false;
    }
  };

  const searchCreateProcessoClientes = async (term) => {
    const query = String(term || '').trim();
    if (query.length < 2) {
      createProcessoClienteSuggestions = [];
      renderCreateProcessoClienteSuggestions();
      return;
    }
    const reqId = ++createProcessoClienteReqId;
    try {
      const resp = await api.clientes.list({ page: 1, limit: 8, search: query });
      if (reqId !== createProcessoClienteReqId) return;
      createProcessoClienteSuggestions = Array.isArray(resp?.data) ? resp.data : [];
      renderCreateProcessoClienteSuggestions();
    } catch (_) {
      if (reqId !== createProcessoClienteReqId) return;
      createProcessoClienteSuggestions = [];
      renderCreateProcessoClienteSuggestions();
    }
  };

  const searchCreateAtividadeClientes = async (term) => {
    const query = String(term || '').trim();
    if (query.length < 2) {
      createAtividadeClienteSuggestions = [];
      renderCreateAtividadeClienteSuggestions();
      return;
    }
    const reqId = ++createAtividadeClienteReqId;
    try {
      const resp = await api.clientes.list({ page: 1, limit: 8, search: query });
      if (reqId !== createAtividadeClienteReqId) return;
      createAtividadeClienteSuggestions = Array.isArray(resp?.data) ? resp.data : [];
      renderCreateAtividadeClienteSuggestions();
    } catch (_) {
      if (reqId !== createAtividadeClienteReqId) return;
      createAtividadeClienteSuggestions = [];
      renderCreateAtividadeClienteSuggestions();
    }
  };

  const searchCreateAtividadeProcessos = async (term) => {
    const query = String(term || '').trim();
    if (query.length < 2) {
      createAtividadeProcessoSuggestions = [];
      renderCreateAtividadeProcessoSuggestions();
      return;
    }
    const reqId = ++createAtividadeProcessoReqId;
    try {
      const resp = await api.processos.list({ page: 1, limit: 8, search: query, exclude_sem_processo: 'true' });
      if (reqId !== createAtividadeProcessoReqId) return;
      createAtividadeProcessoSuggestions = Array.isArray(resp?.data) ? resp.data : [];
      renderCreateAtividadeProcessoSuggestions();
    } catch (_) {
      if (reqId !== createAtividadeProcessoReqId) return;
      createAtividadeProcessoSuggestions = [];
      renderCreateAtividadeProcessoSuggestions();
    }
  };

  const openDashboardAtividadeDetalhe = async (id) => {
    if (!id || !detalheModal) return;
    try {
      const data = await api.atividades.get(id);
      const tipo = data.categoria || (data.titulo || '').split(' - ')[0] || '-';
      if (detalheTipo) detalheTipo.textContent = tipo || '-';
      if (detalheTitulo) detalheTitulo.textContent = stripHashSuffixText(data.titulo || '-') || '-';
      if (detalheCliente) detalheCliente.textContent = data.cliente_nome || '-';
      if (detalheProcesso) {
        const processoText = data.numero_processo || '-';
        detalheProcesso.innerHTML = `${renderCopyProcessButton(processoText)} <span>${processoText}</span>`;
      }
      if (detalhePrazo) detalhePrazo.textContent = formatDateOptionalTime(data.prazo, data.prazo_hora) || '-';
      if (detalheStatus) detalheStatus.textContent = data.status || '-';
      if (detalhePrioridade) detalhePrioridade.textContent = data.prioridade || '-';
      if (detalheDescricao) detalheDescricao.textContent = (data.descricao || data.orientacoes || '-').toString();
      openModal(detalheModal);
    } catch (err) {
      alert(err.message || 'Erro ao carregar atividade.');
    }
  };

  const updateRangeButtons = () => {
    rangeButtons.forEach((btn) => {
      const isActive = (btn.dataset.dashboardRange || '') === dashboardRange;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  };

  const loadAtividadesDashboard = async (params) => {
    const first = await api.atividades.list({ ...params, page: 1, limit: 100 });
    let itens = first.data || [];
    const limit = Number(first.limit || 100);
    const total = Number(first.total || itens.length);
    const totalPages = Math.max(1, Math.ceil(total / (limit || 100)));
    for (let p = 2; p <= totalPages; p += 1) {
      const resp = await api.atividades.list({ ...params, page: p, limit: limit || 100 });
      itens = itens.concat(resp.data || []);
    }
    return itens;
  };

  const renderAtividadesPeriodo = async () => {
    if (!listaEl || !vazioEl || !infoEl) return;
    const range = dashboardRanges[dashboardRange] || dashboardRanges.today;
    if (countAtividadesLabelEl) countAtividadesLabelEl.textContent = range.countLabel;
    if (periodoEl) periodoEl.textContent = range.focusLabel;

    try {
      const itens = await loadAtividadesDashboard(range.getParams());
      itens.sort((a, b) => {
        const dataA = parseDateTimeInput(normalizeDateValue(a.prazo)) || new Date(8640000000000000);
        const dataB = parseDateTimeInput(normalizeDateValue(b.prazo)) || new Date(8640000000000000);
        const diff = dataA.getTime() - dataB.getTime();
        if (diff !== 0) return diff;
        return String(a.prazo_hora || '').localeCompare(String(b.prazo_hora || ''));
      });
      atividadesPeriodoCache = itens;

      if (countAtividadesEl) countAtividadesEl.textContent = itens.length;
      infoEl.textContent = `${itens.length} item(s)`;
      if (!itens.length) {
        atividadesPeriodoCache = [];
        listaEl.innerHTML = '';
        vazioEl.textContent = `Nenhuma atividade ${range.emptyLabel}.`;
        vazioEl.classList.remove('hidden');
        return;
      }

      vazioEl.classList.add('hidden');
      listaEl.innerHTML = itens
        .map((a) => {
          const titulo = stripHashSuffixText(a.titulo || '');
          const processo = (a.numero_processo || '').trim() || '-';
          const cliente = (a.cliente_nome || '').trim() || '-';
          const prazoLabel = formatDateOptionalTime(a.prazo, a.prazo_hora);
          const statusAtual = String(a.status || 'a_fazer');
          const statusMap = {
            a_fazer: 'A fazer',
            fazendo: 'Fazendo',
            feito: 'Concluída',
            cancelado: 'Cancelada',
          };
          const statusLabel = statusMap[statusAtual] || 'A fazer';
          const isFeita = statusAtual === 'feito';
          const clienteHtml = a.cliente_id
            ? `
              <a
                href="./cliente?id=${a.cliente_id}"
                class="text-stone-700 hover:text-stone-900 hover:underline"
                title="Abrir cliente"
              >
                ${cliente}
              </a>
            `
            : `<span class="text-stone-500">${cliente}</span>`;
          const processoHtml = a.processo_id
            ? `
              <a href="./processo?id=${a.processo_id}" class="text-stone-700 hover:text-stone-900 hover:underline" title="Abrir processo">
                ${processo}
              </a>
            `
            : `<span class="text-stone-500">${processo}</span>`;
          return `
            <div class="py-3 border-b border-stone-100 last:border-b-0" data-atividade-id="${a.id}" role="button" tabindex="0">
              <div class="flex items-start gap-3">
                <input
                  type="checkbox"
                  class="mt-1 h-4 w-4 rounded border-stone-300 accent-stone-900 cursor-pointer"
                  data-atividade-toggle-feito="${a.id}"
                  aria-label="Marcar atividade como concluída"
                  ${isFeita ? 'checked' : ''}
                />
                <div class="min-w-0 flex-1">
                  <div class="flex items-start justify-between gap-4">
                    <button type="button" class="font-medium text-stone-900 hover:underline text-left text-sm leading-snug ${isFeita ? 'line-through opacity-70' : ''}" data-atividade-id="${a.id}">
                      ${titulo || 'Atividade'}
                    </button>
                    <span class="text-[11px] text-stone-400 whitespace-nowrap">${prazoLabel}</span>
                  </div>
                  <div class="mt-1 text-xs text-stone-500 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>${statusLabel}</span>
                    <span class="text-stone-300">•</span>
                    <span>Cliente:</span>
                    ${clienteHtml}
                    <span class="text-stone-300">•</span>
                    <span>Processo:</span>
                    ${processoHtml}
                  </div>
                </div>
              </div>
            </div>
          `;
        })
        .join('');
    } catch (err) {
      atividadesPeriodoCache = [];
      if (countAtividadesEl) countAtividadesEl.textContent = '0';
      infoEl.textContent = '-';
      listaEl.innerHTML = '';
      vazioEl.textContent = err.message || 'Não foi possível carregar as atividades.';
      vazioEl.classList.remove('hidden');
    }
  };

  const renderAudiencias = async () => {
    if (!audienciasEl || !audienciasInfo || !audienciasVazio) return;
    if (!audienciasCache.length) {
      const baseParams = { page: 1, limit: 100, categoria: 'Audiência', prazo_from: hoje };
      const first = await api.atividades.list(baseParams);
      let itens = first.data || [];
      const totalPages = Math.max(1, Math.ceil((first.total || 0) / (first.limit || 100)));
      for (let p = 2; p <= totalPages; p += 1) {
        const resp = await api.atividades.list({ ...baseParams, page: p });
        itens = itens.concat(resp.data || []);
      }
      itens = itens.filter((a) => a.prazo);
      itens.sort((a, b) => {
        const dataA = parseDateTimeInput(normalizeDateValue(a.prazo)) || new Date(0);
        const dataB = parseDateTimeInput(normalizeDateValue(b.prazo)) || new Date(0);
        const base = dataA.getTime() - dataB.getTime();
        if (base !== 0) return base;
        const horaA = String(a.prazo_hora || '');
        const horaB = String(b.prazo_hora || '');
        if (horaA && horaB) return horaA.localeCompare(horaB);
        if (horaA) return -1;
        if (horaB) return 1;
        return String(a.titulo || '').localeCompare(String(b.titulo || ''));
      });
      audienciasCache = itens;
    }

    const totalPages = Math.max(1, Math.ceil(audienciasCache.length / audienciasPageSize));
    if (audienciasPage > totalPages) audienciasPage = totalPages;
    if (audienciasPage < 1) audienciasPage = 1;
    const start = (audienciasPage - 1) * audienciasPageSize;
    const itensMostrados = audienciasCache.slice(start, start + audienciasPageSize);

    audienciasInfo.textContent = `${audienciasPage}/${totalPages}`;
    if (!itensMostrados.length) {
      audienciasEl.innerHTML = '';
      audienciasVazio.classList.remove('hidden');
      return;
    }
    audienciasVazio.classList.add('hidden');
    audienciasEl.innerHTML = itensMostrados
      .map((a) => {
        const clienteNome = `${a.cliente_nome || ''}`.trim() || '-';
        const processo = a.numero_processo || '-';
        const prazoDate = parseDateTimeInput(normalizeDateValue(a.prazo));
        const prazoDiaMes =
          prazoDate && !Number.isNaN(prazoDate.getTime())
            ? prazoDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
            : '-';
        const prazoAno =
          prazoDate && !Number.isNaN(prazoDate.getTime()) ? String(prazoDate.getFullYear()) : '';
        const prazoFull = formatDateOptionalTime(a.prazo, a.prazo_hora);
        const clienteHtml = a.cliente_id
          ? `<a href="./cliente?id=${a.cliente_id}" class="block text-sm text-stone-900 font-medium truncate" title="${clienteNome}">${clienteNome}</a>`
          : `<div class="text-sm text-stone-900 font-medium truncate" title="${clienteNome}">${clienteNome}</div>`;
        const processoHtml = a.processo_id
          ? `<a href="./processo?id=${a.processo_id}" class="block text-xs text-stone-500 whitespace-nowrap hover:text-stone-700" title="${processo}">${processo}</a>`
          : `<div class="text-xs text-stone-500 whitespace-nowrap" title="${processo}">${processo}</div>`;
        return `
          <div
            class="w-full py-3 px-1 flex items-start gap-3 cursor-pointer"
            data-atividade-id="${a.id}"
            role="button"
            tabindex="0"
          >
            <div class="min-w-0 flex-1">
              <div class="text-[11px] text-stone-500 mb-1" title="${prazoFull}">
                ${prazoDiaMes}${prazoAno ? `/${prazoAno}` : ''}
              </div>
              ${clienteHtml}
              ${processoHtml}
            </div>
          </div>
        `;
      })
      .join('');

    if (audienciasPrev) audienciasPrev.disabled = audienciasPage <= 1;
    if (audienciasNext) audienciasNext.disabled = audienciasPage >= totalPages;
  };

  updateRangeButtons();
  await renderAtividadesPeriodo();
  renderAudiencias();
  initPrazoCalculator();

  if (audienciasEl) {
    audienciasEl.addEventListener('click', async (e) => {
      if (e.target.closest('a')) return;
      const item = e.target.closest('[data-atividade-id]');
      if (!item) return;
      const id = item.dataset.atividadeId;
      openDashboardAtividadeDetalhe(id);
    });
  }

  if (quickSearchInput) {
    quickSearchInput.addEventListener('input', () => {
      if (quickSearchDebounceTimer) clearTimeout(quickSearchDebounceTimer);
      quickSearchDebounceTimer = setTimeout(() => {
        loadDashboardQuickSearch(quickSearchInput.value);
      }, 250);
    });
  }

  if (quickSearchForm && quickSearchInput) {
    quickSearchForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const results = await loadDashboardQuickSearch(quickSearchInput.value);
      if (results.length === 1) {
        openDashboardSearchResult(results[0]);
        return;
      }
      if (!results.length) return;
      openDashboardSearchResult(results[0]);
    });
  }

  if (quickSearchResults) {
    quickSearchResults.addEventListener('click', (event) => {
      const button = event.target.closest('[data-dashboard-search-index]');
      if (!button) return;
      const index = Number(button.dataset.dashboardSearchIndex);
      if (!Number.isInteger(index) || index < 0 || index >= quickSearchItems.length) return;
      openDashboardSearchResult(quickSearchItems[index]);
    });
  }

  if (quickCreateBtn && quickCreateMenu) {
    quickCreateBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const isOpen = !quickCreateMenu.classList.contains('hidden');
      setQuickCreateMenuOpen(!isOpen);
    });
    quickCreateMenu.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-dashboard-create-target]');
      if (!btn) return;
      const target = btn.dataset.dashboardCreateTarget || '';
      setQuickCreateMenuOpen(false);
      openDashboardCreateFlow(target);
    });
  }

  if (!canManageAtividades) {
    qsa('[data-dashboard-create-target="atividade"]').forEach((el) => el.classList.add('hidden'));
    if (createTabAtividadeBtn) createTabAtividadeBtn.classList.add('hidden');
    createPanels
      .filter((panel) => (panel.dataset.dashboardCreatePanel || '') === 'atividade')
      .forEach((panel) => panel.classList.add('hidden'));
  }

  if (createTabButtons.length) {
    createTabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.dashboardCreateTab || 'cliente';
        setCreateTab(tab);
      });
    });
  }

  if (createCloseBtn) {
    createCloseBtn.addEventListener('click', () => closeDashboardCreateModal());
  }

  if (createModal) {
    createModal.addEventListener('click', (event) => {
      if (event.target === createModal) closeDashboardCreateModal();
    });
  }

  if (createProcessoClienteInput) {
    createProcessoClienteInput.addEventListener('input', () => {
      createProcessoClienteId = '';
      if (createProcessoClienteTimer) clearTimeout(createProcessoClienteTimer);
      createProcessoClienteTimer = setTimeout(() => {
        searchCreateProcessoClientes(createProcessoClienteInput.value);
      }, 220);
    });
    createProcessoClienteInput.addEventListener('blur', () => {
      setTimeout(() => {
        if (createProcessoClienteSugestoesEl) createProcessoClienteSugestoesEl.classList.add('hidden');
      }, 120);
    });
  }

  if (createProcessoClienteSugestoesEl) {
    createProcessoClienteSugestoesEl.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const btn = event.target.closest('[data-dashboard-create-proc-cliente-index]');
      if (!btn) return;
      const idx = Number(btn.dataset.dashboardCreateProcClienteIndex);
      if (!Number.isInteger(idx) || idx < 0 || idx >= createProcessoClienteSuggestions.length) return;
      const selected = createProcessoClienteSuggestions[idx];
      createProcessoClienteId = String(selected.id || '');
      if (createProcessoClienteInput) createProcessoClienteInput.value = selected.nome || '';
      createProcessoClienteSugestoesEl.classList.add('hidden');
    });
  }

  if (createAtividadeClienteInput) {
    createAtividadeClienteInput.addEventListener('input', () => {
      createAtividadeClienteId = '';
      if (createAtividadeClienteTimer) clearTimeout(createAtividadeClienteTimer);
      createAtividadeClienteTimer = setTimeout(() => {
        searchCreateAtividadeClientes(createAtividadeClienteInput.value);
      }, 220);
    });
    createAtividadeClienteInput.addEventListener('blur', () => {
      setTimeout(() => {
        if (createAtividadeClienteSugestoesEl) createAtividadeClienteSugestoesEl.classList.add('hidden');
      }, 120);
    });
  }

  if (createAtividadeClienteSugestoesEl) {
    createAtividadeClienteSugestoesEl.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const btn = event.target.closest('[data-dashboard-create-atividade-cliente-index]');
      if (!btn) return;
      const idx = Number(btn.dataset.dashboardCreateAtividadeClienteIndex);
      if (!Number.isInteger(idx) || idx < 0 || idx >= createAtividadeClienteSuggestions.length) return;
      const selected = createAtividadeClienteSuggestions[idx];
      createAtividadeClienteId = String(selected.id || '');
      if (createAtividadeClienteInput) createAtividadeClienteInput.value = selected.nome || '';
      createAtividadeClienteSugestoesEl.classList.add('hidden');
    });
  }

  if (createAtividadeProcessoInput) {
    createAtividadeProcessoInput.addEventListener('input', () => {
      createAtividadeProcessoId = '';
      if (createAtividadeProcessoTimer) clearTimeout(createAtividadeProcessoTimer);
      createAtividadeProcessoTimer = setTimeout(() => {
        searchCreateAtividadeProcessos(createAtividadeProcessoInput.value);
      }, 220);
    });
    createAtividadeProcessoInput.addEventListener('blur', () => {
      setTimeout(() => {
        if (createAtividadeProcessoSugestoesEl) createAtividadeProcessoSugestoesEl.classList.add('hidden');
      }, 120);
    });
  }

  if (createAtividadeProcessoSugestoesEl) {
    createAtividadeProcessoSugestoesEl.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const btn = event.target.closest('[data-dashboard-create-atividade-processo-index]');
      if (!btn) return;
      const idx = Number(btn.dataset.dashboardCreateAtividadeProcessoIndex);
      if (!Number.isInteger(idx) || idx < 0 || idx >= createAtividadeProcessoSuggestions.length) return;
      const selected = createAtividadeProcessoSuggestions[idx];
      createAtividadeProcessoId = String(selected.id || '');
      if (createAtividadeProcessoInput) createAtividadeProcessoInput.value = selected.numero_processo || '';
      if (selected.cliente_id && createAtividadeClienteInput) {
        createAtividadeClienteId = String(selected.cliente_id || '');
        createAtividadeClienteInput.value = selected.cliente_nome || '';
      }
      createAtividadeProcessoSugestoesEl.classList.add('hidden');
    });
  }

  if (createClienteForm) {
    createClienteForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      showMessage(createClienteMsg, '');
      const nome = String(createClienteNome?.value || '').trim();
      if (!nome) {
        showMessage(createClienteMsg, 'Informe o nome do cliente.');
        return;
      }
      const submitBtn = createClienteForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        await api.clientes.create({
          nome,
          telefone: String(createClienteTelefone?.value || '').trim() || null,
          cpf: String(createClienteCpf?.value || '').trim() || null,
          status: String(createClienteStatus?.value || 'lead') || 'lead',
        });
        showMessage(createClienteMsg, 'Cliente criado com sucesso.', 'sucesso');
        createClienteForm.reset();
        if (createClienteStatus) createClienteStatus.value = 'lead';
        if (createClienteNome) createClienteNome.focus();
      } catch (err) {
        showMessage(createClienteMsg, err.message || 'Não foi possível criar cliente.');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  if (createProcessoForm) {
    createProcessoForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      showMessage(createProcessoMsg, '');
      const numero = String(createProcessoNumero?.value || '').trim();
      if (!createProcessoClienteId) {
        showMessage(createProcessoMsg, 'Selecione um cliente válido.');
        return;
      }
      if (!numero) {
        showMessage(createProcessoMsg, 'Informe o número do processo.');
        return;
      }
      const submitBtn = createProcessoForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        await api.processos.create({
          cliente_id: Number(createProcessoClienteId),
          numero_processo: numero,
          status: String(createProcessoStatus?.value || '').trim() || null,
        });
        showMessage(createProcessoMsg, 'Processo criado com sucesso.', 'sucesso');
        createProcessoForm.reset();
        createProcessoClienteId = '';
        hideCreateSuggestions();
        if (createProcessoClienteInput) createProcessoClienteInput.focus();
      } catch (err) {
        const existingProcessId = Number(err?.data?.processo_id);
        if (Number.isFinite(existingProcessId) && existingProcessId > 0) {
          showMessage(
            createProcessoMsg,
            `Esse número já existe no processo #${existingProcessId}.`,
            'erro'
          );
        } else {
          showMessage(createProcessoMsg, err.message || 'Não foi possível criar processo.');
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  if (createAtividadeForm) {
    createAtividadeForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      showMessage(createAtividadeMsg, '');
      if (!canManageAtividades) {
        showMessage(createAtividadeMsg, 'Você não tem permissão para criar atividade.');
        return;
      }
      const titulo = String(createAtividadeTitulo?.value || '').trim();
      if (!titulo) {
        showMessage(createAtividadeMsg, 'Informe o título da atividade.');
        return;
      }
      const processoTexto = String(createAtividadeProcessoInput?.value || '').trim();
      const clienteTexto = String(createAtividadeClienteInput?.value || '').trim();
      const submitBtn = createAtividadeForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        await api.atividades.create({
          titulo,
          descricao: String(createAtividadeDescricao?.value || '').trim() || null,
          status: String(createAtividadeStatus?.value || 'a_fazer') || 'a_fazer',
          prioridade: String(createAtividadePrioridade?.value || 'media') || 'media',
          prazo: String(createAtividadePrazo?.value || '').trim() || null,
          processo_id: createAtividadeProcessoId ? Number(createAtividadeProcessoId) : null,
          cliente_id: createAtividadeProcessoId
            ? null
            : (createAtividadeClienteId ? Number(createAtividadeClienteId) : null),
          processo_numero: createAtividadeProcessoId ? null : (processoTexto || null),
          cliente_nome:
            createAtividadeProcessoId || createAtividadeClienteId
              ? null
              : (clienteTexto || null),
        });
        showMessage(createAtividadeMsg, 'Atividade criada com sucesso.', 'sucesso');
        createAtividadeForm.reset();
        createAtividadeClienteId = '';
        createAtividadeProcessoId = '';
        hideCreateSuggestions();
        await renderAtividadesPeriodo();
        if (createAtividadeTitulo) createAtividadeTitulo.focus();
      } catch (err) {
        showMessage(createAtividadeMsg, err.message || 'Não foi possível criar atividade.');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  document.addEventListener('click', (event) => {
    if (quickSearchResults && quickSearchForm) {
      if (!(quickSearchForm.contains(event.target) || quickSearchResults.contains(event.target))) {
        if (!quickSearchInput || !quickSearchInput.value.trim()) {
          clearQuickSearchResults();
          setQuickSearchStatus('');
        } else {
          clearQuickSearchResults();
        }
      }
    }
    if (quickCreateBtn && quickCreateMenu) {
      if (!quickCreateBtn.contains(event.target) && !quickCreateMenu.contains(event.target)) {
        setQuickCreateMenuOpen(false);
      }
    }
    if (createModal && !createModal.classList.contains('hidden')) {
      const insideInputs =
        (createProcessoClienteSugestoesEl && createProcessoClienteSugestoesEl.contains(event.target)) ||
        (createAtividadeClienteSugestoesEl && createAtividadeClienteSugestoesEl.contains(event.target)) ||
        (createAtividadeProcessoSugestoesEl && createAtividadeProcessoSugestoesEl.contains(event.target));
      if (!insideInputs) hideCreateSuggestions();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (quickCreateMenu && !quickCreateMenu.classList.contains('hidden')) setQuickCreateMenuOpen(false);
    if (createModal && !createModal.classList.contains('hidden')) closeDashboardCreateModal();
  });

  if (listaEl) {
    listaEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-atividade-toggle-feito]')) return;
      if (e.target.closest('a')) return;
      const item = e.target.closest('[data-atividade-id]');
      if (!item) return;
      const id = item.dataset.atividadeId;
      openDashboardAtividadeDetalhe(id);
    });
    listaEl.addEventListener('keydown', (e) => {
      if (e.target.closest('[data-atividade-toggle-feito]')) return;
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const item = e.target.closest('[data-atividade-id]');
      if (!item) return;
      e.preventDefault();
      const id = item.dataset.atividadeId;
      openDashboardAtividadeDetalhe(id);
    });

    listaEl.addEventListener('change', async (e) => {
      const toggle = e.target.closest('[data-atividade-toggle-feito]');
      if (!toggle) return;
      const id = String(toggle.dataset.atividadeToggleFeito || '');
      if (!id) return;
      const atividade = atividadesPeriodoCache.find((item) => String(item.id) === id);
      if (!atividade) return;
      const marcado = Boolean(toggle.checked);
      toggle.disabled = true;
      try {
        await api.atividades.update(id, {
          ...atividade,
          processo_numero: atividade.processo_numero || atividade.numero_processo || null,
          status: marcado ? 'feito' : 'a_fazer',
          concluida_em: marcado ? new Date().toISOString() : null,
        });
        await renderAtividadesPeriodo();
      } catch (err) {
        toggle.checked = !marcado;
        alert(err.message || 'Não foi possível atualizar a atividade.');
      } finally {
        toggle.disabled = false;
      }
    });
  }

  if (rangeButtons.length) {
    rangeButtons.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const nextRange = btn.dataset.dashboardRange || 'today';
        if (nextRange === dashboardRange || !dashboardRanges[nextRange]) return;
        dashboardRange = nextRange;
        updateRangeButtons();
        infoEl.textContent = 'Carregando...';
        await renderAtividadesPeriodo();
      });
    });
  }

  if (detalheClose && detalheModal) {
    detalheClose.addEventListener('click', () => closeModal(detalheModal));
  }

  if (audienciasPrev) {
    audienciasPrev.addEventListener('click', () => {
      audienciasPage -= 1;
      renderAudiencias();
    });
  }
  if (audienciasNext) {
    audienciasNext.addEventListener('click', () => {
      audienciasPage += 1;
      renderAudiencias();
    });
  }
  initSidebarWidgets();
}

function initPrazoCalculator() {
  const pubInput = qs('#prazoPublicacao');
  const diasInput = qs('#prazoDias');
  const uteisInput = qs('#prazoDiasUteis');
  const inicioEl = qs('#prazoInicio');
  const resultadoEl = qs('#prazoResultado');

  if (!pubInput || !diasInput || !inicioEl || !resultadoEl) return;

  const formatLong = (date) =>
    date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const formatWeekday = (date) => date.toLocaleDateString('pt-BR', { weekday: 'long' });
  const holidayCache = new Map();

  const dateKey = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getEasterDate = (year) => {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=março, 4=abril
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  };

  const getNationalHolidaysForYear = (year) => {
    if (holidayCache.has(year)) return holidayCache.get(year);
    const set = new Set();
    const fixed = [
      [1, 1],   // Confraternização universal
      [4, 21],  // Tiradentes
      [5, 1],   // Dia do Trabalho
      [9, 7],   // Independência
      [10, 12], // Nossa Senhora Aparecida
      [11, 2],  // Finados
      [11, 15], // Proclamação da República
      [12, 25], // Natal
    ];

    fixed.forEach(([month, day]) => {
      const d = new Date(year, month - 1, day);
      set.add(dateKey(d));
    });

    // Consciência Negra (feriado nacional a partir de 2024)
    if (year >= 2024) {
      const d = new Date(year, 10, 20); // novembro (0-based)
      set.add(dateKey(d));
    }

    // Paixão de Cristo (sexta-feira santa) - calculada a partir da Páscoa
    const easter = getEasterDate(year);
    const goodFriday = new Date(easter);
    goodFriday.setDate(easter.getDate() - 2);
    set.add(dateKey(goodFriday));

    holidayCache.set(year, set);
    return set;
  };

  const isNationalHoliday = (date) => {
    const set = getNationalHolidaysForYear(date.getFullYear());
    return set.has(dateKey(date));
  };

  const compute = () => {
    const pubVal = pubInput.value;
    const diasVal = Number(diasInput.value);
    if (!pubVal || !Number.isFinite(diasVal) || diasVal < 1) {
      inicioEl.textContent = 'Início: -';
      resultadoEl.textContent = 'Último dia: -';
      return;
    }

    const base = new Date(`${pubVal}T00:00:00`);
    if (Number.isNaN(base.getTime())) {
      inicioEl.textContent = 'Início: -';
      resultadoEl.textContent = 'Último dia: -';
      return;
    }

    const onlyBusiness = uteisInput ? uteisInput.checked : true;
    const current = new Date(base);
    current.setHours(0, 0, 0, 0);
    current.setDate(current.getDate() + 1);

    let counted = 0;
    let inicio = null;
    while (counted < diasVal) {
      const day = current.getDay();
      const isWeekend = day === 0 || day === 6;
      const isHoliday = onlyBusiness ? isNationalHoliday(current) : false;
      const isBusinessDay = !isWeekend && !isHoliday;
      if (!onlyBusiness || isBusinessDay) {
        if (!inicio) inicio = new Date(current);
        counted += 1;
        if (counted === diasVal) break;
      }
      current.setDate(current.getDate() + 1);
    }

    if (!inicio) {
      inicioEl.textContent = 'Início: -';
      resultadoEl.textContent = 'Último dia: -';
      return;
    }
    inicioEl.textContent = `Início: ${formatLong(inicio)} (${formatWeekday(inicio)})`;
    resultadoEl.textContent = `Último dia: ${formatLong(current)} (${formatWeekday(current)})`;
  };

  pubInput.addEventListener('input', compute);
  diasInput.addEventListener('input', compute);
  if (uteisInput) uteisInput.addEventListener('change', compute);
  compute();
}

function initSidebarWidgets() {
  const clockFace = qs('#sidebarClockFace');
  const clockDigital = qs('#sidebarClockDigital');
  const dateLabel = qs('#sidebarDate');
  const monthLabel = qs('#sidebarMonth');
  const calendarEl = qs('#sidebarCalendar');
  const prevYearBtn = qs('#calPrevYear');
  const prevMonthBtn = qs('#calPrevMonth');
  const nextMonthBtn = qs('#calNextMonth');
  const nextYearBtn = qs('#calNextYear');

  if (!clockFace || !clockDigital || !dateLabel || !monthLabel || !calendarEl) return;

  const hourHand = clockFace.querySelector('[data-hand=\"hour\"]');
  const minuteHand = clockFace.querySelector('[data-hand=\"minute\"]');
  const secondHand = clockFace.querySelector('[data-hand=\"second\"]');

  const today = new Date();
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth();

  const updateClock = () => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();

    const hourAngle = (hours % 12) * 30 + minutes * 0.5;
    const minuteAngle = minutes * 6 + seconds * 0.1;
    const secondAngle = seconds * 6;

    if (hourHand) hourHand.style.transform = `translate(-50%, -100%) rotate(${hourAngle}deg)`;
    if (minuteHand) minuteHand.style.transform = `translate(-50%, -100%) rotate(${minuteAngle}deg)`;
    if (secondHand) secondHand.style.transform = `translate(-50%, -100%) rotate(${secondAngle}deg)`;

    const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' });
    clockDigital.textContent = timeFmt.format(now);
    dateLabel.textContent = dateFmt.format(now);
  };

  const renderCalendar = () => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
    const monthText = monthFmt.format(new Date(viewYear, viewMonth, 1));
    monthLabel.textContent = monthText.charAt(0).toUpperCase() + monthText.slice(1);

    const week = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
    const cells = [];
    week.forEach((d) => {
      cells.push(`<div class=\"text-[10px] text-stone-400\">${d}</div>`);
    });

    for (let i = 0; i < firstDay; i += 1) {
      cells.push('<div></div>');
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const isToday =
        day === today.getDate() &&
        viewMonth === today.getMonth() &&
        viewYear === today.getFullYear();
      cells.push(
        `<div class=\"h-7 w-7 mx-auto flex items-center justify-center rounded-full ${
          isToday ? 'bg-[#0C1B33] text-white' : 'text-stone-600'
        }\">${day}</div>`
      );
    }

    calendarEl.innerHTML = cells.join('');
  };

  const changeMonth = (delta) => {
    viewMonth += delta;
    if (viewMonth < 0) {
      viewMonth = 11;
      viewYear -= 1;
    }
    if (viewMonth > 11) {
      viewMonth = 0;
      viewYear += 1;
    }
    renderCalendar();
  };

  const changeYear = (delta) => {
    viewYear += delta;
    renderCalendar();
  };

  if (prevMonthBtn) prevMonthBtn.addEventListener('click', () => changeMonth(-1));
  if (nextMonthBtn) nextMonthBtn.addEventListener('click', () => changeMonth(1));
  if (prevYearBtn) prevYearBtn.addEventListener('click', () => changeYear(-1));
  if (nextYearBtn) nextYearBtn.addEventListener('click', () => changeYear(1));

  updateClock();
  renderCalendar();
  setInterval(updateClock, 1000);
}

async function initClientes() {
  await guardAuth();
  bindLogout();

  const tableBody = qs('#clientesTableBody');
  const modal = qs('#clienteModal');
  const openBtn = qs('#novoClienteBtn');
  const closeBtn = qs('#fecharClienteModal');
  const form = qs('#clienteForm');
  const msg = qs('#clienteMessage');
  const busca = qs('#clienteBusca');
  const filtroStatus = qs('#clienteFiltroStatus');
  const limitSelect = qs('#clienteLimit');
  const sortBtn = qs('#clienteOrdenar');
  const info = qs('#clientePaginacaoInfo');
  const prevBtn = qs('#clientePrev');
  const nextBtn = qs('#clienteNext');
  const paginaAtual = qs('#clientePaginaAtual');
  const dataNascimentoInput = qs('#clienteDataNascimento');
  const idadeInfo = qs('#clienteIdadeInfo');
  const idadeHidden = qs('#clienteIdade');
  const cepInput = qs('#clienteCep');
  const enderecoInput = qs('#clienteEndereco');
  const cidadeInput = qs('#clienteCidade');
  const estadoInput = qs('#clienteEstado');
  const dataChegadaInput = qs('#clienteDataChegada');
  const cpfInput = qs('#clienteCpf');
  const rgInput = qs('#clienteRg');
  const responsaveisList = qs('#clienteResponsaveisList');
  const parceirosList = qs('#clienteParceirosList');
  const clienteDetailOverlay = qs('#clienteDetailOverlay');
  const clienteDetailCloseBtn = qs('#clienteDetailCloseBtn');
  const clienteDetailNomeEl = qs('#clienteDetailNome');
  const clienteDetailStatusDot = qs('#clienteDetailStatusDot');
  const clienteDetailTabContent = qs('#clienteDetailTabContent');
  const clienteDetailAtividades = qs('#clienteDetailAtividades');
  const clienteDetailTabBtns = qsa('[data-cliente-detail-tab]');
  const clientePageParams = new URLSearchParams(window.location.search);
  const clientePrefillNovo = clientePageParams.get('novo') === '1';
  const clientePrefillOpenId = String(clientePageParams.get('cliente_id') || '').trim();

  let clientes = [];
  let page = 1;
  let limit = Number(limitSelect?.value) || 100;
  let total = 0;
  let buscaTimeout;
  let sortDir = 'asc';
  let clienteDetailTab = 'complementares';
  let clienteDetailPayload = null;
  try {
    const stored = localStorage.getItem('clientes_sort_dir');
    if (stored === 'asc' || stored === 'desc') sortDir = stored;
  } catch (_) {}
  const processosCache = new Map();
  let colaboradoresAjustes = [];

  function updateSortLabel() {
    if (!sortBtn) return;
    const asc = sortDir === 'asc';
    sortBtn.textContent = asc ? '▲' : '▼';
    sortBtn.title = asc ? 'Ordenar A-Z' : 'Ordenar Z-A';
    sortBtn.setAttribute('aria-label', sortBtn.title);
  }

  const clearNovoClienteQueryParams = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete('novo');
    const search = params.toString();
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash || ''}`;
    window.history.replaceState({}, '', nextUrl);
  };

  const clearOpenClienteQueryParams = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete('cliente_id');
    const search = params.toString();
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash || ''}`;
    window.history.replaceState({}, '', nextUrl);
  };

  const openNovoClienteModal = () => {
    form.reset();
    form.dataset.id = '';
    showMessage(msg, '');
    if (dataChegadaInput) {
      dataChegadaInput.value = new Date().toISOString().slice(0, 10);
    }
    atualizarIdade(dataNascimentoInput, idadeInfo, idadeHidden);
    openModal(modal);
  };

  function closeMenus() {
    qsa('[data-menu-panel]').forEach((panel) => panel.classList.add('hidden'));
    qsa('[data-status-panel]').forEach((panel) => panel.classList.add('hidden'));
    qsa('[data-menu-btn]').forEach((btn) => btn.setAttribute('aria-expanded', 'false'));
  }

  function openEditModal(cliente) {
    if (!cliente) return;
    form.reset();
    form.dataset.id = String(cliente.id);
    showMessage(msg, '');
    qs('#clienteNome').value = cliente.nome || '';
    qs('#clienteNacionalidade').value = cliente.nacionalidade || '';
    qs('#clienteEstadoCivil').value = cliente.estado_civil || '';
    qs('#clienteProfissao').value = cliente.profissao || '';
    qs('#clienteDataNascimento').value = normalizeDateValue(cliente.data_nascimento);
    qs('#clienteIdade').value = cliente.idade || '';
    qs('#clienteFiliacao').value = cliente.filiacao || '';
    qs('#clienteCpf').value = cliente.cpf || '';
    qs('#clienteRg').value = cliente.rg || '';
    qs('#clienteEmail').value = cliente.email || '';
    qs('#clienteTelefone').value = cliente.telefone || '';
    qs('#clienteCep').value = cliente.cep || '';
    qs('#clienteEndereco').value = cliente.endereco || '';
    qs('#clienteNumeroCasa').value = cliente.numero_casa || '';
    qs('#clienteCidade').value = cliente.cidade || '';
    qs('#clienteEstado').value = cliente.estado || '';
    qs('#clienteAgencia').value = cliente.agencia || '';
    qs('#clienteConta').value = cliente.conta || '';
    qs('#clienteBanco').value = cliente.banco || '';
    qs('#clienteTipoConta').value = cliente.tipo_conta || '';
    qs('#clienteLinkPasta').value = cliente.link_pasta || '';
    qs('#clienteResponsavel').value = cliente.responsavel || '';
    qs('#clienteParceiro').value = cliente.parceiro || '';
    qs('#clienteAcessoGov').value = cliente.acesso_gov || '';
    qs('#clienteQualificacao').value = getClienteQualificacaoText(cliente) || '';
    qs('#clienteProcessosNotion').value = cliente.processos_notion || '';
    qs('#clienteDataChegada').value = normalizeDateValue(cliente.data_chegada);
    qs('#clienteStatus').value = cliente.status || 'lead';

    atualizarIdade(dataNascimentoInput, idadeInfo, idadeHidden);
    bindMask(cpfInput, formatCpf);
    bindMask(rgInput, formatRg);
    openModal(modal);
  }

  async function loadAjustesColaboradores() {
    const resumo = await fetchAjustesResumoSafe();
    colaboradoresAjustes = Array.isArray(resumo?.colaboradores) ? resumo.colaboradores : [];
    fillDatalistWithColaboradores(responsaveisList, colaboradoresAjustes);
    fillDatalistWithColaboradores(parceirosList, colaboradoresAjustes);
  }

  function renderTable() {
    tableBody.innerHTML = clientes
      .map(
        (c) => `
        <tr class="border-b border-stone-200">
          <td class="py-3">
            <div class="flex items-center gap-2">
              <button
                class="group inline-flex items-center justify-center text-stone-400 hover:text-stone-700"
                data-toggle="${c.id}"
                aria-expanded="false"
                title="Ver detalhes"
              >
                <svg
                  data-chevron="${c.id}"
                  class="h-3 w-3 transform transition-transform"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M6 8l4 4 4-4" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
              <span
                class="inline-flex h-2 w-2 rounded-full ${
                  c.status === 'ativo'
                    ? 'bg-green-500'
                    : c.status === 'inativo'
                    ? 'bg-stone-400'
                    : 'bg-stone-300'
                }"
                title="${c.status === 'ativo' ? 'Cliente' : c.status === 'inativo' ? 'Inativo' : 'Lead'}"
              ></span>
              <a class="text-stone-900 hover:text-stone-700 font-medium" href="./cliente?id=${c.id}" data-open-cliente-detail="${c.id}">
                ${c.nome}
              </a>
            </div>
          </td>
          <td class="py-3">
            ${
              c.link_pasta
                ? `<a class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-stone-200 text-stone-500 hover:text-stone-900" href="${c.link_pasta}" target="_blank" title="Abrir pasta">
                    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 7h6l2 2h10v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                    </svg>
                  </a>`
                : '<span class="text-xs text-stone-400">-</span>'
            }
          </td>
          <td class="py-3 text-right">
            <div class="relative inline-block text-left" data-menu-wrapper="${c.id}">
              <button
                class="text-stone-500 hover:text-stone-900 px-2"
                data-menu-btn="${c.id}"
                aria-expanded="false"
                title="Mais opções"
              >
                ⋮
              </button>
              <div
                data-menu-panel="${c.id}"
                class="hidden absolute right-0 mt-2 w-44 bg-white border border-stone-200 rounded-lg shadow-sm z-20"
              >
                <button
                  class="w-full text-left px-3 py-2 text-sm hover:bg-stone-50"
                  data-action="editar"
                  data-id="${c.id}"
                >
                  Editar
                </button>
                <button
                  class="w-full text-left px-3 py-2 text-sm hover:bg-stone-50"
                  data-action="status"
                  data-id="${c.id}"
                >
                  Mudar status
                </button>
                <div
                  data-status-panel="${c.id}"
                  class="hidden border-t border-stone-200 px-2 py-2 space-y-1"
                >
                  <button class="w-full text-left text-sm hover:bg-stone-50 px-2 py-1" data-status="lead" data-id="${c.id}">
                    Lead
                  </button>
                  <button class="w-full text-left text-sm hover:bg-stone-50 px-2 py-1" data-status="ativo" data-id="${c.id}">
                    Ativo
                  </button>
                  <button class="w-full text-left text-sm hover:bg-stone-50 px-2 py-1" data-status="inativo" data-id="${c.id}">
                    Inativo
                  </button>
                </div>
                <button
                  class="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-stone-50"
                  data-action="excluir"
                  data-id="${c.id}"
                >
                  Excluir
                </button>
              </div>
            </div>
          </td>
        </tr>
        <tr class="border-b border-stone-200 hidden" data-details="${c.id}">
          <td colspan="3" class="py-4">
            ${renderClienteDetalhes(c)}
          </td>
        </tr>
      `
      )
      .join('');
  }

  function renderClienteDetalhes(cliente) {
    const campos = [
      ['data_chegada', 'Data de chegada'],
      ['telefone', 'Telefone'],
      ['cpf_responsavel', 'CPF do responsável'],
      ['nacionalidade', 'Nacionalidade'],
      ['estado_civil', 'Estado civil'],
      ['profissao', 'Profissão'],
      ['data_nascimento', 'Data de nascimento'],
      ['idade', 'Idade'],
      ['filiacao', 'Filiação'],
      ['rg', 'RG'],
      ['cpf', 'CPF'],
      ['email', 'E-mail'],
      ['endereco', 'Endereço'],
      ['numero_casa', 'Número'],
      ['cidade', 'Cidade'],
      ['estado', 'Estado'],
      ['cep', 'CEP'],
      ['acesso_gov', 'Acesso GOV'],
      ['parceiro', 'Parceiro'],
      ['responsavel', 'Responsável'],
      ['agencia', 'Agência'],
      ['conta', 'Conta'],
      ['banco', 'Banco'],
      ['tipo_conta', 'Tipo de conta'],
      ['dados_bancarios', 'Observações bancárias'],
      ['link_pasta', 'Link da pasta'],
      ['status', 'Status'],
      ['created_at', 'Criado em'],
      ['qualificacao', 'Qualificação'],
      ['processos_relacionados', 'Processo(s)'],
    ];

    const formatValue = (key, value) => {
      if (key === 'qualificacao') {
        const texto = getClienteQualificacaoText(cliente);
        return texto || '-';
      }
      if (key === 'processos_relacionados') {
        return `<span data-processos="${cliente.id}" class="text-stone-400 text-xs">Carregando...</span>`;
      }
      if (value === null || value === undefined || value === '') return '-';
      if (key === 'link_pasta') {
        const val = String(value);
        if (val.startsWith('http://') || val.startsWith('https://')) {
          return `<a class="text-blue-600" href="${val}" target="_blank">Abrir</a>`;
        }
      }
      return String(value);
    };

    return `
      <div class="text-sm space-y-3">
        ${campos
          .map(([key, label]) => {
            const value = formatValue(key, cliente[key]);
            const isQualificacao = key === 'qualificacao';
            const isProcessos = key === 'processos_relacionados';
            const sep =
              isQualificacao || isProcessos ? '<div class="h-px bg-stone-200 my-3"></div>' : '';
            return `
              ${sep}
              <div class="grid grid-cols-[220px_1fr] gap-6 py-1">
                <div class="text-[11px] uppercase tracking-wide text-stone-400">${label}</div>
                <div class="text-stone-900 break-words">${value}</div>
              </div>
            `;
          })
          .join('')}
      </div>
    `;
  }

  async function ensureProcessosForCliente(clienteId) {
    const container = tableBody.querySelector(`[data-processos="${clienteId}"]`);
    if (!container) return;
    if (processosCache.has(clienteId)) {
      const cached = processosCache.get(clienteId);
      container.innerHTML = cached;
      return;
    }
    container.textContent = 'Carregando...';
    try {
      const response = await api.processos.list({
        page: 1,
        limit: 200,
        cliente_id: clienteId,
        sort: 'numero_processo',
        dir: 'asc',
      });
      const linhas = (response.data || [])
        .filter((p) => p.numero_processo)
        .map(
          (p) =>
            `<div class="inline-flex items-center gap-1">${renderCopyProcessButton(p.numero_processo)}<a class="text-blue-600 hover:text-blue-800" href="./processo?id=${p.id}">${p.numero_processo}</a></div>`
        );
      const html = linhas.length ? `<div class="space-y-1">${linhas.join('')}</div>` : '-';
      processosCache.set(clienteId, html);
      container.innerHTML = html;
    } catch (_) {
      container.textContent = '-';
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function setClienteDetailActiveTab(tab) {
    clienteDetailTab = tab;
    clienteDetailTabBtns.forEach((btn) => {
      const active = btn.dataset.clienteDetailTab === tab;
      btn.classList.toggle('is-active', active);
    });
  }

  function formatDetailValue(key, value) {
    if (value === null || value === undefined || value === '') {
      return '<span class="text-stone-400">Não informado</span>';
    }
    const copyBtn = (text) =>
      `<button type="button" class="inline-flex h-6 w-6 items-center justify-center rounded-md border border-stone-200 text-stone-500 hover:bg-stone-100 hover:text-stone-700" data-copy-text="${encodeURIComponent(
        String(text || '')
      )}" title="Copiar" aria-label="Copiar">
        <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="11" height="11" rx="2"></rect>
          <path d="M5 15V5a2 2 0 0 1 2-2h10"></path>
        </svg>
      </button>`;
    if (key.startsWith('data_') || key.endsWith('_at')) return formatDateBR(value);
    if (key === 'link_pasta') {
      const val = String(value);
      if (val.startsWith('http://') || val.startsWith('https://')) {
        return `<a class="text-blue-600 hover:text-blue-800" href="${escapeHtml(val)}" target="_blank" rel="noreferrer">Abrir pasta</a>`;
      }
    }
    if (key === 'acesso_gov') {
      return `<div class="inline-flex items-center gap-2"><span>${escapeHtml(value)}</span>${copyBtn(value)}</div>`;
    }
    return escapeHtml(value);
  }

  function renderDetailRows(cliente, rows) {
    return rows
      .map(([key, label]) => {
        const value = formatDetailValue(key, cliente[key]);
        return `
          <div class="px-4 py-2.5">
            <div class="text-[11px] uppercase tracking-wide text-slate-400">${label}</div>
            <div class="mt-1 text-sm leading-snug text-slate-700 break-words">${value}</div>
          </div>
        `;
      })
      .join('');
  }

  function renderClienteDetailTabContent() {
    if (!clienteDetailPayload || !clienteDetailTabContent) return;
    const { cliente, processos } = clienteDetailPayload;
    const camposComplementares = [
      ['nacionalidade', 'Nacionalidade'],
      ['estado_civil', 'Estado civil'],
      ['profissao', 'Profissão'],
      ['endereco', 'Endereço'],
      ['numero_casa', 'Número'],
      ['cidade', 'Cidade'],
      ['estado', 'Estado'],
      ['cep', 'CEP'],
      ['acesso_gov', 'Acesso GOV'],
      ['link_pasta', 'Pasta'],
    ];
    const camposRelacionamento = [
      ['cpf_responsavel', 'CPF do responsável'],
      ['responsavel', 'Responsável'],
      ['parceiro', 'Parceiro'],
      ['data_chegada', 'Data de chegada'],
    ];
    const camposFinanceiros = [
      ['agencia', 'Agência'],
      ['conta', 'Conta'],
      ['banco', 'Banco'],
      ['tipo_conta', 'Tipo de conta'],
      ['dados_bancarios', 'Observações bancárias'],
    ];

    if (clienteDetailTab === 'qualificacao') {
      const qual = getClienteQualificacaoText(cliente);
      const qualRaw = qual || '';
      const qualClean = qualRaw.trimStart();
      const qualCopyBtn = `
        <button type="button" class="inline-flex h-6 w-6 items-center justify-center rounded-md border border-stone-200 text-stone-500 hover:bg-stone-100 hover:text-stone-700" data-copy-text="${encodeURIComponent(
          qualRaw
        )}" title="Copiar qualificação" aria-label="Copiar qualificação">
          <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="11" height="11" rx="2"></rect>
            <path d="M5 15V5a2 2 0 0 1 2-2h10"></path>
          </svg>
        </button>
      `;
      clienteDetailTabContent.innerHTML = `
        <div class="cliente-left-card">
          <div class="cliente-left-card-header">
            <h3 class="cliente-left-card-title">Qualificação</h3>
            <div class="flex items-center gap-2">
              ${qualRaw ? qualCopyBtn : ''}
              <button type="button" class="cliente-left-card-edit" data-cliente-detail-edit="1">editar</button>
            </div>
          </div>
          <div class="px-4 py-3 text-sm leading-relaxed text-slate-700 break-words">${qualClean ? escapeHtml(qualClean) : '<span class="text-slate-400">Não informada.</span>'}</div>
        </div>
      `;
      return;
    }

    if (clienteDetailTab === 'processos') {
      const processosList = Array.isArray(processos) ? processos.filter((p) => p && p.numero_processo) : [];
      const novoProcessoLink = `./processos?novo=1&cliente_id=${encodeURIComponent(String(cliente.id || ''))}&cliente_nome=${encodeURIComponent(String(cliente.nome || ''))}`;
      clienteDetailTabContent.innerHTML = `
        <div class="cliente-left-card">
          <div class="cliente-left-card-header">
            <h3 class="cliente-left-card-title">Processos vinculados</h3>
            <a href="${novoProcessoLink}" class="inline-flex items-center rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100">Novo processo</a>
          </div>
          ${
            processosList.length
              ? `<div class="px-4 py-1">${processosList
                  .map(
                    (p) => `
                      <div class="py-2.5 border-b border-slate-200/80 last:border-b-0">
                        <div class="inline-flex items-center gap-1.5 text-sm text-slate-700">
                          ${renderCopyProcessButton(p.numero_processo)}
                          <a class="text-blue-600 hover:text-blue-800" href="./processo?id=${p.id}">${escapeHtml(p.numero_processo)}</a>
                        </div>
                        <div class="mt-1 text-xs text-slate-500">${escapeHtml(p.status || 'Sem status')}</div>
                      </div>
                    `
                  )
                  .join('')}</div>`
              : '<div class="px-4 py-3 text-sm text-slate-400">Nenhum processo vinculado a este cliente.</div>'
          }
        </div>
      `;
      return;
    }

    const selectedRows =
      clienteDetailTab === 'relacionamento'
        ? camposRelacionamento
        : clienteDetailTab === 'financeiros'
          ? camposFinanceiros
          : camposComplementares;

    const titulo =
      clienteDetailTab === 'relacionamento'
        ? 'Relacionamento'
      : clienteDetailTab === 'financeiros'
          ? 'Dados financeiros'
          : 'Dados gerais';

    clienteDetailTabContent.innerHTML = `
      <div class="cliente-left-card">
        <div class="cliente-left-card-header">
          <h3 class="cliente-left-card-title">${titulo}</h3>
          <button type="button" class="cliente-left-card-edit" data-cliente-detail-edit="1">editar</button>
        </div>
        <div>${renderDetailRows(cliente, selectedRows)}</div>
      </div>
    `;
  }

  function renderClienteDetailAtividades() {
    if (!clienteDetailPayload || !clienteDetailAtividades) return;
    const { atividades, cliente } = clienteDetailPayload;
    const atividadeLink = `./atividades?origem=cliente&novo=1&cliente_id=${encodeURIComponent(String(cliente.id || ''))}&cliente_nome=${encodeURIComponent(String(cliente.nome || ''))}`;
    const cards = atividades.length
      ? atividades
          .map((atividade) => {
            const titulo = escapeHtml(stripHashSuffix(atividade.titulo || '') || 'Atividade');
            const prazoDate = atividade.prazo ? parseDateTimeInput(atividade.prazo) : null;
            const prazoHora = String(atividade.prazo_hora || '').trim();
            const concluida = String(atividade.status || '').toLowerCase() === 'feito';
            const prazoLabel = atividade.prazo
              ? `Prazo ${formatDateLongBR(atividade.prazo)}${prazoHora ? `, ${prazoHora.slice(0, 5)}` : ''}`
              : 'Prazo não definido';
            const dia = prazoDate ? String(prazoDate.getDate()).padStart(2, '0') : '--';
            const mes = prazoDate
              ? prazoDate.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase()
              : '---';
            const horaRodape = prazoHora
              ? prazoHora.slice(0, 5)
              : prazoDate
                ? `${String(prazoDate.getHours()).padStart(2, '0')}:${String(prazoDate.getMinutes()).padStart(2, '0')}`
                : '--:--';
            const description = escapeHtml(
              atividade.descricao || stripHashSuffix(atividade.titulo || '') || 'Sem descrição'
            );
            return `
              <article class="w-[84%] rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0 flex items-start gap-2">
                    <input
                      type="checkbox"
                      class="mt-0.5 h-4 w-4 rounded border-stone-300"
                      data-cliente-atividade-toggle="${atividade.id}"
                      ${concluida ? 'checked' : ''}
                      aria-label="Concluir atividade"
                    />
                    <div class="min-w-0 text-base leading-none ${concluida ? 'line-through text-stone-400' : ''}">${titulo}</div>
                  </div>
                  <span class="text-xs text-stone-400">${atividade.created_at ? formatDateTimeBR(atividade.created_at).slice(11, 16) : ''}</span>
                </div>
                <div class="mt-2.5 flex items-start gap-2.5">
                  <div class="w-16 shrink-0 rounded-xl bg-cyan-50 border border-cyan-100 text-center py-1.5">
                    <div class="text-2xl font-semibold text-slate-600 leading-none">${dia}</div>
                    <div class="text-[10px] font-semibold text-slate-400 uppercase">${mes}</div>
                    <div class="text-[10px] text-cyan-600">${horaRodape}</div>
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-600">${escapeHtml(prazoLabel)}</div>
                    <div class="mt-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm break-words ${concluida ? 'line-through text-stone-400' : 'text-stone-700'}">${description}</div>
                  </div>
                </div>
              </article>
            `;
          })
          .join('')
      : '<div class="text-sm text-stone-400">Nenhuma atividade vinculada a este cliente.</div>';

    clienteDetailAtividades.innerHTML = `
      <div class="mb-3 flex items-center gap-2 text-xs">
        <span class="inline-flex rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 font-medium text-blue-700">Atividade</span>
        <span class="inline-flex rounded-lg px-2.5 py-1 text-stone-500">Comentário</span>
        <a href="${atividadeLink}" class="ml-auto inline-flex items-center rounded-lg border border-stone-300 px-2.5 py-1 text-xs text-stone-700 hover:bg-stone-100">Nova atividade</a>
      </div>
      <div class="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-400 mb-3">Coisas a fazer</div>
      <div class="space-y-2.5">${cards}</div>
    `;

    clienteDetailAtividades.querySelectorAll('[data-cliente-atividade-toggle]').forEach((checkbox) => {
      checkbox.addEventListener('change', async (event) => {
        const target = event.currentTarget;
        const atividadeId = String(target.getAttribute('data-cliente-atividade-toggle') || '').trim();
        if (!atividadeId) return;
        const atividade = atividades.find((item) => String(item.id) === atividadeId);
        if (!atividade) return;
        const feito = target.checked;
        target.disabled = true;
        try {
          await api.atividades.update(atividadeId, {
            ...atividade,
            status: feito ? 'feito' : 'a_fazer',
            processo_numero: atividade.processo_numero || atividade.numero_processo || null,
          });
          atividade.status = feito ? 'feito' : 'a_fazer';
          renderClienteDetailAtividades();
        } catch (err) {
          target.checked = !feito;
        } finally {
          target.disabled = false;
        }
      });
    });
  }

  function renderClienteDetailOverlay() {
    if (!clienteDetailPayload) return;
    renderClienteDetailTabContent();
    renderClienteDetailAtividades();
  }

  function closeClienteDetailOverlay() {
    if (!clienteDetailOverlay) return;
    clienteDetailOverlay.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    document.body.classList.remove('cliente-detail-open');
    clienteDetailPayload = null;
  }

  async function openClienteDetailOverlay(clienteId) {
    if (!clienteDetailOverlay || !clienteDetailTabContent || !clienteDetailAtividades || !clienteDetailNomeEl) {
      window.location.href = `./cliente?id=${clienteId}`;
      return;
    }
    clienteDetailOverlay.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    document.body.classList.add('cliente-detail-open');
    clienteDetailNomeEl.textContent = 'Carregando...';
    clienteDetailTabContent.innerHTML = '<div class="text-sm text-stone-500">Carregando informações...</div>';
    clienteDetailAtividades.innerHTML = '<div class="text-sm text-stone-500">Carregando atividades...</div>';
    setClienteDetailActiveTab('complementares');
    try {
      const [cliente, processosResp, atividadesResp] = await Promise.all([
        api.clientes.get(clienteId),
        api.processos.list({ page: 1, limit: 200, cliente_id: clienteId, sort: 'numero_processo', dir: 'asc' }),
        api.atividades.list({ page: 1, limit: 12, cliente_id: clienteId, sort: 'created_at', dir: 'desc' }),
      ]);
      clienteDetailPayload = {
        cliente,
        processos: Array.isArray(processosResp?.data) ? processosResp.data : [],
        atividades: Array.isArray(atividadesResp?.data) ? atividadesResp.data : [],
      };
      clienteDetailNomeEl.textContent = cliente.nome || 'Cliente';
      if (clienteDetailStatusDot) {
        const status = String(cliente.status || '').toLowerCase().trim();
        clienteDetailStatusDot.classList.remove('bg-stone-300', 'bg-emerald-500', 'bg-amber-400', 'bg-stone-400');
        if (status === 'ativo') clienteDetailStatusDot.classList.add('bg-emerald-500');
        else if (status === 'inativo') clienteDetailStatusDot.classList.add('bg-stone-400');
        else clienteDetailStatusDot.classList.add('bg-amber-400');
      }
      renderClienteDetailOverlay();
    } catch (err) {
      clienteDetailNomeEl.textContent = 'Cliente';
      if (clienteDetailStatusDot) {
        clienteDetailStatusDot.classList.remove('bg-emerald-500', 'bg-amber-400', 'bg-stone-400');
        clienteDetailStatusDot.classList.add('bg-stone-300');
      }
      clienteDetailTabContent.innerHTML = `<div class="text-sm text-red-600">${escapeHtml(err.message || 'Erro ao carregar detalhes do cliente.')}</div>`;
      clienteDetailAtividades.innerHTML = '';
    }
  }

  async function load() {
    const response = await api.clientes.list({
      page,
      limit,
      status: filtroStatus.value,
      search: busca.value.trim(),
      sort: 'nome',
      dir: sortDir,
    });
    clientes = response.data;
    total = response.total;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    if (page > totalPages) {
      page = totalPages;
      return load();
    }
    info.textContent = `${total} resultado(s)`;
    paginaAtual.textContent = `Página ${page} de ${totalPages}`;
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= totalPages;
    renderTable();
  }

  updateSortLabel();

  openBtn.addEventListener('click', openNovoClienteModal);

  closeBtn.addEventListener('click', () => closeModal(modal));

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(modal);
    });
  }
  if (clienteDetailCloseBtn) {
    clienteDetailCloseBtn.addEventListener('click', closeClienteDetailOverlay);
  }
  if (clienteDetailOverlay) {
    clienteDetailOverlay.addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-cliente-detail-edit]');
      if (editBtn) {
        const clienteAtual = clienteDetailPayload?.cliente || null;
        if (clienteAtual) {
          closeClienteDetailOverlay();
          openEditModal(clienteAtual);
        }
        return;
      }
      const copyBtn = e.target.closest('[data-copy-text]');
      if (copyBtn) {
        const raw = copyBtn.getAttribute('data-copy-text') || '';
        const text = decodeURIComponent(raw);
        if (text && navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(text).catch(() => {});
        }
        return;
      }
      if (e.target.matches('[data-cliente-detail-close]')) {
        closeClienteDetailOverlay();
      }
    });
  }
  clienteDetailTabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.clienteDetailTab;
      if (!tab) return;
      setClienteDetailActiveTab(tab);
      renderClienteDetailTabContent();
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && clienteDetailOverlay && !clienteDetailOverlay.classList.contains('hidden')) {
      closeClienteDetailOverlay();
    }
  });

  if (dataNascimentoInput) {
    dataNascimentoInput.addEventListener('change', () =>
      atualizarIdade(dataNascimentoInput, idadeInfo, idadeHidden)
    );
  }
  setupCepAutoFill(cepInput, enderecoInput, cidadeInput, estadoInput);
  bindMask(cpfInput, formatCpf);
  bindMask(rgInput, formatRg);

  busca.addEventListener('input', () => {
    clearTimeout(buscaTimeout);
    buscaTimeout = setTimeout(() => {
      page = 1;
      load();
    }, 300);
  });

  filtroStatus.addEventListener('change', () => {
    page = 1;
    load();
  });

  limitSelect.addEventListener('change', () => {
    limit = Number(limitSelect.value) || 10;
    page = 1;
    load();
  });

  if (sortBtn) {
    sortBtn.addEventListener('click', () => {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      try { localStorage.setItem('clientes_sort_dir', sortDir); } catch (_) {}
      updateSortLabel();
      page = 1;
      load();
    });
  }

  prevBtn.addEventListener('click', () => {
    if (page > 1) {
      page -= 1;
      load();
    }
  });

  nextBtn.addEventListener('click', () => {
    if (page * limit < total) {
      page += 1;
      load();
    }
  });

  tableBody.addEventListener('click', (e) => {
    const detailLink = e.target.closest('[data-open-cliente-detail]');
    if (detailLink) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      const id = detailLink.getAttribute('data-open-cliente-detail');
      if (id) openClienteDetailOverlay(id);
      return;
    }
    const toggleBtn = e.target.closest('[data-toggle]');
    if (!toggleBtn) return;
    const toggleId = toggleBtn.dataset.toggle;
    const detailRow = tableBody.querySelector(`tr[data-details="${toggleId}"]`);
    if (!detailRow) return;
    detailRow.classList.toggle('hidden');
    const isOpen = !detailRow.classList.contains('hidden');
    toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    const chevron = toggleBtn.querySelector(`[data-chevron="${toggleId}"]`);
    if (chevron) {
      chevron.classList.toggle('rotate-180', isOpen);
    }
    if (isOpen) {
      ensureProcessosForCliente(toggleId);
    }
  });

  tableBody.addEventListener('click', async (e) => {
    const menuBtn = e.target.closest('[data-menu-btn]');
    if (menuBtn) {
      e.stopPropagation();
      const id = menuBtn.dataset.menuBtn;
      const panel = tableBody.querySelector(`[data-menu-panel="${id}"]`);
      const isOpen = panel && !panel.classList.contains('hidden');
      closeMenus();
      if (panel && !isOpen) {
        panel.classList.remove('hidden');
        menuBtn.setAttribute('aria-expanded', 'true');
      }
      return;
    }

    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      e.stopPropagation();
      const action = actionBtn.dataset.action;
      const id = actionBtn.dataset.id;
      const cliente = clientes.find((c) => String(c.id) === String(id));

      if (action === 'editar') {
        closeMenus();
        openEditModal(cliente);
        return;
      }

      if (action === 'status') {
        const statusPanel = tableBody.querySelector(`[data-status-panel="${id}"]`);
        if (statusPanel) {
          statusPanel.classList.toggle('hidden');
        }
        return;
      }

      if (action === 'excluir') {
        if (!cliente) return;
        closeMenus();
        if (confirm(`Excluir cliente "${cliente.nome}"?`)) {
          try {
            await api.clientes.remove(id);
            await load();
          } catch (err) {
            alert(err.message || 'Erro ao excluir cliente.');
          }
        }
      }
    }

    const statusBtn = e.target.closest('[data-status]');
    if (statusBtn) {
      e.stopPropagation();
      const id = statusBtn.dataset.id;
      const status = statusBtn.dataset.status;
      try {
        await api.clientes.update(id, { status });
        closeMenus();
        await load();
      } catch (err) {
        alert(err.message || 'Erro ao atualizar status.');
      }
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-menu-wrapper]')) {
      closeMenus();
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showMessage(msg, '');

    const payload = {
      nome: qs('#clienteNome').value.trim(),
      nacionalidade: qs('#clienteNacionalidade').value.trim(),
      estado_civil: qs('#clienteEstadoCivil').value.trim(),
      profissao: qs('#clienteProfissao').value.trim(),
      data_nascimento: qs('#clienteDataNascimento').value.trim(),
      idade: qs('#clienteIdade').value.trim(),
      filiacao: qs('#clienteFiliacao').value.trim(),
      cpf: qs('#clienteCpf').value.trim(),
      rg: qs('#clienteRg').value.trim(),
      email: qs('#clienteEmail').value.trim(),
      telefone: qs('#clienteTelefone').value.trim(),
      cep: qs('#clienteCep').value.trim(),
      endereco: qs('#clienteEndereco').value.trim(),
      numero_casa: qs('#clienteNumeroCasa').value.trim(),
      cidade: qs('#clienteCidade').value.trim(),
      estado: qs('#clienteEstado').value.trim(),
      agencia: qs('#clienteAgencia').value.trim(),
      conta: qs('#clienteConta').value.trim(),
      banco: qs('#clienteBanco').value.trim(),
      tipo_conta: qs('#clienteTipoConta').value.trim(),
      link_pasta: qs('#clienteLinkPasta').value.trim(),
      responsavel: qs('#clienteResponsavel').value.trim(),
      parceiro: qs('#clienteParceiro').value.trim(),
      acesso_gov: qs('#clienteAcessoGov').value.trim(),
      qualificacao: qs('#clienteQualificacao').value.trim(),
      processos_notion: qs('#clienteProcessosNotion').value.trim(),
      data_chegada: qs('#clienteDataChegada').value.trim(),
      status: qs('#clienteStatus').value,
    };
    if (!payload.qualificacao) {
      payload.qualificacao = buildClienteQualificacaoAuto(payload);
    }

    try {
      if (form.dataset.id) {
        await api.clientes.update(form.dataset.id, payload);
      } else {
        await api.clientes.create(payload);
      }
      closeModal(modal);
      await load();
    } catch (err) {
      showMessage(msg, err.message);
    }
  });

  await loadAjustesColaboradores();
  await load();
  if (clientePrefillNovo) {
    openNovoClienteModal();
    clearNovoClienteQueryParams();
  }
  if (clientePrefillOpenId) {
    await openClienteDetailOverlay(clientePrefillOpenId);
    clearOpenClienteQueryParams();
  }
}

async function initProcessos() {
  await guardAuth();
  bindLogout();

  const tableBody = qs('#processosTableBody');
  const processoDetailOverlay = qs('#processoDetailOverlay');
  const processoDetailNumero = qs('#processoDetailNumero');
  const processoDetailSubtitulo = qs('#processoDetailSubtitulo');
  const processoDetailTabBtns = qsa('[data-processo-detail-tab]');
  const processoDetailDados = qs('#processoDetailDados');
  const processoDetailFinanceiro = qs('#processoDetailFinanceiro');
  const processoDetailAndamentos = qs('#processoDetailAndamentos');
  const processoDetailAtividades = qs('#processoDetailAtividades');
  const processoDetailCloseBtn = qs('#processoDetailCloseBtn');
  const processoDetailEditBtn = qs('#processoDetailEditBtn');
  const modal = qs('#processoModal');
  const documentoModal = qs('#documentoModal');
  const openBtn = qs('#novoProcessoBtn');
  const closeBtn = qs('#fecharProcessoModal');
  const closeDocumentoBtn = qs('#fecharDocumentoModal');
  const form = qs('#processoForm');
  const msg = qs('#processoMessage');
  const clienteInput = qs('#processoClienteInput');
  const clienteOptions = qs('#processoClienteOptions');
  const clienteSuggestionsEl = qs('#processoClienteSuggestions');
  const clienteId = qs('#processoClienteId');
  const filtroCliente = qs('#processoFiltroCliente');
  const filtroStatus = qs('#processoFiltroStatus');
  const filtroAndamentos = qs('#processoFiltroAndamentos');
  const busca = qs('#processoBusca');
  const limitSelect = qs('#processoLimit');
  const sortBtn = qs('#processoOrdenar');
  const info = qs('#processoPaginacaoInfo');
  const prevBtn = qs('#processoPrev');
  const nextBtn = qs('#processoNext');
  const paginaAtual = qs('#processoPaginaAtual');
  const documentoLista = qs('#documentoLista');
  const documentoArquivo = qs('#documentoArquivo');
  const enviarDocumentoBtn = qs('#enviarDocumentoBtn');
  const numeroInput = qs('#processoNumero');
  const areaInput = qs('#processoArea');
  const statusInput = qs('#processoStatus');
  const classeInput = qs('#processoClasse');
  const orgaoInput = qs('#processoOrgao');
  const orgaoGrid = qs('#processoOrgaoGrid');
  const varaInput = qs('#processoVara');
  const grauInput = qs('#processoGrau');
  const cidadeInput = qs('#processoCidade');
  const estadoInput = qs('#processoEstado');
  const sistemaInput = qs('#processoSistema');
  const distribuicaoInput = qs('#processoDistribuicao');
  const resultadoInput = qs('#processoResultado');
  const interpostoRecursoInput = qs('#processoInterpostoRecurso');
  const parteContrariaInput = qs('#processoParteContraria');
  const contaBeneficioWrap = qs('#processoContaBeneficioWrap');
  const abrirContaInput = qs('#processoAbrirConta');
  const contaAbertaInput = qs('#processoContaAberta');
  const queryParams = new URLSearchParams(window.location.search);

  let processos = [];
  let clientes = [];
  let page = 1;
  let limit = Number(limitSelect?.value) || 10;
  let total = 0;
  let buscaTimeout;
  let processoDocumentoId = null;
  let sortDir = 'asc';
  let loadingClientes = null;
  let clientesModal = [];
  let areasAjustes = [];
  let clienteSuggestionsVisible = [];
  let processoDetailPayload = null;
  let processoDetailActiveTab = 'dados';
  const hasFinanceAccess = canAccessFinanceiro();
  const canManageAtividades = canCreateDeleteAtividades();
  const atividadeTemplates = [
    'Audiência',
    'Perícia',
    'Petição inicial',
    'Réplica',
    'Embargos de declaração',
    'Recurso inominado',
    'Cumprimento de sentença',
    'Manifestar ciência',
    'Aceitar acordo',
    'Informar cliente',
    'Responder cliente',
    'Administrativo BPC',
    'Prazo',
    'Melhoria',
  ];
  let prefillNovoProcesso = {
    ativo: queryParams.get('novo') === '1',
    origem: String(queryParams.get('origem') || '').trim().toLowerCase(),
    numero: String(queryParams.get('numero_processo') || '').trim(),
    clienteId: String(queryParams.get('cliente_id') || '').trim(),
    clienteNome: String(queryParams.get('cliente_nome') || '').trim(),
  };

  function updateSortLabel() {
    if (!sortBtn) return;
    const asc = sortDir === 'asc';
    sortBtn.textContent = asc ? '▲' : '▼';
    sortBtn.title = asc ? 'Ordenar A-Z' : 'Ordenar Z-A';
    sortBtn.setAttribute('aria-label', sortBtn.title);
  }

  function normalizeText(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function bigrams(text) {
    const s = ` ${text} `;
    const list = [];
    for (let i = 0; i < s.length - 1; i += 1) list.push(s.slice(i, i + 2));
    return list;
  }

  function similarityScore(query, name) {
    const q = normalizeText(query);
    const n = normalizeText(name);
    if (!q || !n) return 0;
    if (n === q) return 1200;
    let score = 0;
    const starts = n.startsWith(q);
    const idx = n.indexOf(q);
    if (starts) score += 900;
    else if (idx >= 0) score += 700 - Math.min(200, idx * 4);
    const qTokens = q.split(/\s+/).filter(Boolean);
    const tokenHits = qTokens.filter((t) => n.includes(t)).length;
    score += tokenHits * 60;
    const qb = bigrams(q);
    const nb = bigrams(n);
    if (qb.length && nb.length) {
      const nSet = new Set(nb);
      let inter = 0;
      qb.forEach((bg) => {
        if (nSet.has(bg)) inter += 1;
      });
      const dice = (2 * inter) / (qb.length + nb.length);
      score += Math.round(dice * 400);
    }
    return score;
  }

  function escapeProcessoDetailHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function setProcessoDetailNumeroLabel(value, withCopy = false) {
    if (!processoDetailNumero) return;
    const text = String(value || '').trim() || 'Processo';
    if (withCopy && canCopyProcessNumber(text)) {
      processoDetailNumero.innerHTML = `
        <span class="inline-flex items-center gap-2">
          ${renderCopyProcessButton(text)}
          <span>${escapeProcessoDetailHtml(text)}</span>
        </span>
      `;
      return;
    }
    processoDetailNumero.textContent = text;
  }

  async function openProcessoDetailInlineEdit() {
    const current = processoDetailPayload?.processo;
    if (!current?.id) return;
    await loadAllClientes().catch(() => null);
    await loadAjustesAreas().catch(() => null);
    closeProcessoDetailOverlay();
    await openEditProcessoModal(current);
  }

  async function triggerProcessoDetailInlineEdit() {
    try {
      await openProcessoDetailInlineEdit();
    } catch (err) {
      alert(err?.message || 'Erro ao abrir edição do processo.');
    }
  }

  function closeProcessoDetailOverlay() {
    if (!processoDetailOverlay) return;
    processoDetailOverlay.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    document.body.classList.remove('processo-detail-open');
    processoDetailPayload = null;
    setProcessoDetailActiveTab('dados');
  }

  function renderClienteOptions(list) {
    if (!clienteOptions) return;
    clienteOptions.innerHTML = list
      .slice(0, 40)
      .map((c) => `<option value="${c.nome}" data-id="${c.id}"></option>`)
      .join('');
  }

  function hideClienteSuggestions() {
    if (!clienteSuggestionsEl) return;
    clienteSuggestionsEl.classList.add('hidden');
  }

  function showClienteSuggestions() {
    if (!clienteSuggestionsEl) return;
    if (!clienteSuggestionsVisible.length) {
      hideClienteSuggestions();
      return;
    }
    clienteSuggestionsEl.classList.remove('hidden');
  }

  function setClienteSelecionado(cliente) {
    if (!cliente) return;
    if (clienteInput) clienteInput.value = cliente.nome || '';
    if (clienteId) clienteId.value = cliente.id || '';
    hideClienteSuggestions();
  }

  function renderClienteSuggestions(list) {
    if (!clienteSuggestionsEl) return;
    clienteSuggestionsVisible = Array.isArray(list) ? list.slice(0, 8) : [];
    if (!clienteSuggestionsVisible.length) {
      clienteSuggestionsEl.innerHTML = '';
      hideClienteSuggestions();
      return;
    }
    clienteSuggestionsEl.innerHTML = clienteSuggestionsVisible
      .map(
        (c, idx) => `
          <button
            type="button"
            data-cliente-suggestion-index="${idx}"
            class="w-full text-left px-3 py-2 text-sm text-stone-800 hover:bg-stone-50 border-b border-stone-100 last:border-b-0"
          >
            ${c.nome}
          </button>
        `
      )
      .join('');
    showClienteSuggestions();
  }

  function findBestClienteByQuery(query) {
    const source = clientesModal.length ? clientesModal : clientes;
    const ranked = source
      .map((c, idx) => ({ c, idx, score: similarityScore(query, c.nome) }))
      .filter((it) => it.score >= 180)
      .sort((a, b) => (b.score - a.score) || (a.idx - b.idx));
    return ranked.length ? ranked[0].c : null;
  }

  function renderClientesSelect() {
    renderClienteOptions(clientesModal.length ? clientesModal : clientes);
    if (!filtroCliente) return;
    filtroCliente.innerHTML = ['<option value="">Todos os clientes</option>']
      .concat(clientes.map((c) => `<option value="${c.id}">${c.nome}</option>`))
      .join('');
  }

  async function loadAjustesAreas() {
    try {
      const resp = await api.ajustes.listAreas();
      areasAjustes = Array.isArray(resp?.data) ? resp.data : [];
      fillSelectWithAreas(areaInput, areasAjustes, { keepCurrent: true });
    } catch (_) {
      areasAjustes = [];
    }
  }

  function isPrevidenciario(value) {
    return (
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim() === 'previdenciario'
    );
  }

  function toggleContaBeneficio() {
    if (!contaBeneficioWrap || !areaInput) return;
    const show = isPrevidenciario(areaInput.value);
    contaBeneficioWrap.classList.toggle('hidden', !show);
    if (!show) {
      if (abrirContaInput) abrirContaInput.checked = false;
      if (contaAbertaInput) contaAbertaInput.checked = false;
    }
  }

  async function syncProcessoCidadeByEstado(currentCidade = '') {
    await hydrateCidadeSelectByEstado(estadoInput?.value, cidadeInput, { currentValue: currentCidade });
  }

  async function loadAllClientes() {
    if (loadingClientes) return loadingClientes;
    loadingClientes = (async () => {
      const all = [];
      let clientesPage = 1;
      const clientesLimit = 100;
      while (true) {
        const resp = await api.clientes.list({ page: clientesPage, limit: clientesLimit });
        all.push(...(resp.data || []));
        if (!resp.data || resp.data.length < clientesLimit) break;
        clientesPage += 1;
      }
      clientesModal = all;
      clientes = all;
      renderClientesSelect();
      loadingClientes = null;
      return clientes;
    })();
    return loadingClientes;
  }

  async function openEditProcessoModal(processoInput) {
    const processo = processoInput?.id ? processoInput : null;
    if (!processo) return;
    form.dataset.id = processo.id;
    numeroInput.value = processo.numero_processo || '';
    if (areaInput) {
      const areaValue = processo.area || '';
      const hasArea = Array.from(areaInput.options || []).some((opt) => opt.value === areaValue);
      if (areaValue && !hasArea) {
        const opt = document.createElement('option');
        opt.value = areaValue;
        opt.textContent = areaValue;
        areaInput.appendChild(opt);
      }
      areaInput.value = areaValue;
    }
    statusInput.value = processo.status || '';
    if (classeInput) {
      const classeValue = processo.classe || '';
      const hasClasse = Array.from(classeInput.options || []).some((opt) => opt.value === classeValue);
      if (classeValue && !hasClasse) {
        const opt = document.createElement('option');
        opt.value = classeValue;
        opt.textContent = classeValue;
        classeInput.appendChild(opt);
      }
      classeInput.value = classeValue;
    }
    orgaoInput.value = processo.orgao || '';
    varaInput.value = processo.vara || '';
    grauInput.value = processo.grau || '';
    estadoInput.value = processo.estado || '';
    await syncProcessoCidadeByEstado(processo.cidade || '');
    sistemaInput.value = processo.sistema || '';
    distribuicaoInput.value = normalizeDateValue(processo.distribuicao || '');
    const resultadoInfo = normalizeResultadoAndRecurso(processo.resultado, processo.recurso_inominado);
    resultadoInput.value = resultadoInfo.resultado || '';
    if (interpostoRecursoInput) {
      interpostoRecursoInput.checked = resultadoInfo.recurso === 'Sim';
    }
    parteContrariaInput.value = processo.parte_contraria || '';
    if (abrirContaInput) abrirContaInput.checked = String(processo.abrir_conta || '').toLowerCase() === 'sim';
    if (contaAbertaInput) contaAbertaInput.checked = String(processo.conta_aberta || '').toLowerCase() === 'sim';
    toggleContaBeneficio();
    if (orgaoGrid) {
      orgaoGrid.querySelectorAll('.orgao-btn').forEach((btn) => {
        const active = btn.dataset.value === orgaoInput.value;
        btn.classList.toggle('border-stone-900', active);
        btn.classList.toggle('bg-stone-50', active);
      });
    }
    if (clienteInput) clienteInput.value = processo.cliente_nome || '';
    if (clienteId) clienteId.value = processo.cliente_id || '';
    openModal(modal);
  }

  function setProcessoDetailActiveTab(tab) {
    processoDetailActiveTab = ['dados', 'financeiro', 'andamentos'].includes(tab) ? tab : 'dados';
    if (processoDetailDados) processoDetailDados.classList.toggle('hidden', processoDetailActiveTab !== 'dados');
    if (processoDetailFinanceiro)
      processoDetailFinanceiro.classList.toggle('hidden', processoDetailActiveTab !== 'financeiro');
    if (processoDetailAndamentos)
      processoDetailAndamentos.classList.toggle('hidden', processoDetailActiveTab !== 'andamentos');
    processoDetailTabBtns.forEach((btn) => {
      const isActive = btn.dataset.processoDetailTab === processoDetailActiveTab;
      btn.classList.toggle('is-active', isActive);
    });
  }

  function renderProcessoDetailInfo(processo) {
    if (!processoDetailDados) return;
    const uniqueJoin = (values, separator = ' • ') => {
      const cleaned = values
        .map((val) => String(val || '').trim())
        .filter(Boolean)
        .map((val) => val.replace(/\s+/g, ' '));
      const deduped = [];
      cleaned.forEach((val) => {
        const normalized = val.toLowerCase();
        if (!deduped.some((item) => item.toLowerCase() === normalized)) deduped.push(val);
      });
      return deduped.join(separator);
    };

    const numero = processo.numero_processo || '-';
    const assunto = uniqueJoin([processo.area, processo.classe || processo.fase]) || 'Não informado';
    const tribunal = uniqueJoin(
      [processo.orgao || processo.juizo, [processo.cidade, processo.estado].filter(Boolean).join(', ')],
      ' • '
    ) || 'Não informado';
    const resultadoInfo = normalizeResultadoAndRecurso(processo.resultado, processo.recurso_inominado);
    const resultado =
      resultadoInfo.resultado ||
      (String(processo.status || '').trim() ? String(processo.status).trim() : 'Não informado');
    const poloAtivo = processo.cliente_nome || 'Não informado';
    const poloPassivo = processo.parte_contraria || 'Não informado';
    const poloAtivoHtml =
      processo.cliente_nome && processo.cliente_id
        ? `<a href="./clientes?cliente_id=${encodeURIComponent(String(processo.cliente_id))}" class="text-blue-700 hover:text-blue-900 underline underline-offset-2">${escapeProcessoDetailHtml(
            poloAtivo
          )}</a>`
        : escapeProcessoDetailHtml(poloAtivo);

    const icon = (name) => {
      const map = {
        file: '<path d="M8 3h6l4 4v14H8z"/><path d="M14 3v4h4"/>',
        assunto: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16"/><path d="M12 4v16"/>',
        tribunal: '<path d="M4 9h16"/><path d="M6 9v8h12V9"/><path d="M10 5h4"/>',
        check: '<path d="M5 12l4 4 10-10"/>',
        users: '<circle cx="9" cy="9" r="3"/><circle cx="16.5" cy="10.5" r="2.5"/><path d="M4.5 18c.8-2.2 2.6-3.5 4.5-3.5 2 0 3.7 1.3 4.5 3.5"/><path d="M14.5 17.5c.5-1.3 1.5-2.2 2.9-2.5"/>',
      };
      return `
        <svg viewBox="0 0 24 24" class="h-5 w-5 text-stone-500" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          ${map[name] || map.file}
        </svg>
      `;
    };

    const row = (name, title, value, extra = '', valueIsHtml = false) => `
      <div class="py-2.5">
        <div class="flex items-start gap-2.5">
          <div class="mt-0.5">${icon(name)}</div>
          <div class="min-w-0 flex-1">
            <div class="text-[14px] font-semibold text-stone-900">${escapeProcessoDetailHtml(title)}</div>
            ${
              String(value || '').trim()
                ? valueIsHtml
                  ? `<div class="mt-1 text-[14px] text-stone-700 break-words">${value}</div>`
                  : `<div class="mt-1 text-[14px] text-stone-700 break-words">${escapeProcessoDetailHtml(value)}</div>`
                : ''
            }
            ${extra}
          </div>
        </div>
      </div>
    `;

    processoDetailDados.innerHTML = `
      <article class="overflow-hidden rounded-3xl border border-stone-200 bg-white">
        <header class="flex items-center justify-between border-b border-stone-200 px-4 py-3">
          <h3 class="text-[12px] font-semibold tracking-[0.08em] text-slate-600">DADOS GERAIS</h3>
          <button
            type="button"
            data-processo-detail-edit-inline="1"
            class="text-[12px] text-slate-400 hover:text-slate-700"
          >
            editar
          </button>
        </header>
        <div class="px-4 py-1.5">
          ${row(
            'file',
            'Número do processo',
            `<span class="inline-flex items-center gap-2">${renderCopyProcessButton(numero)}<span>${escapeProcessoDetailHtml(
              numero
            )}</span></span>`,
            '',
            true
          )}
          ${row('assunto', 'Assunto', assunto)}
          ${row('tribunal', 'Tribunal', tribunal)}
          ${row('check', 'Resultado', resultado)}
          ${row(
            'users',
            'Envolvidos',
            '',
            `
              <div class="mt-3 space-y-3">
                <div>
                  <div class="text-xs uppercase tracking-wide text-stone-400">Polo ativo</div>
                  <div class="mt-1 text-[14px] text-stone-900 break-words">${poloAtivoHtml}</div>
                </div>
                <div>
                  <div class="text-xs uppercase tracking-wide text-stone-400">Polo passivo</div>
                  <div class="mt-1 text-[14px] text-stone-500 break-words">${escapeProcessoDetailHtml(poloPassivo)}</div>
                </div>
              </div>
            `
          )}
        </div>
      </article>
    `;
  }

  function renderProcessoDetailFinanceiro(financeiroResp) {
    if (!processoDetailFinanceiro) return;
    if (!hasFinanceAccess) {
      processoDetailFinanceiro.innerHTML =
        '<div class="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-500">Sem permissão para visualizar o financeiro.</div>';
      return;
    }
    const itens = Array.isArray(financeiroResp?.data) ? financeiroResp.data : [];
    let totalProveito = 0;
    let totalHonorarios = 0;
    let totalRepasse = 0;
    itens.forEach((item) => {
      const base = parseCurrencyValue(item.valor_base);
      const honor = parseCurrencyValue(item.honorarios_calculados);
      const rep = parseCurrencyValue(item.repasse_calculado);
      if (base !== null) totalProveito += base;
      if (honor !== null) totalHonorarios += honor;
      if (rep !== null) totalRepasse += rep;
    });
    processoDetailFinanceiro.innerHTML = `
      <div class="mb-3 flex justify-end">
        <button
          type="button"
          data-processo-detail-edit-inline="1"
          class="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-100"
        >
          Editar processo
        </button>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div class="text-xs uppercase tracking-wide text-slate-400">Proveito total</div>
          <div class="mt-1 text-sm font-semibold text-slate-900">${formatCurrencyValue(totalProveito)}</div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div class="text-xs uppercase tracking-wide text-slate-400">Honorários totais</div>
          <div class="mt-1 text-sm font-semibold text-slate-900">${formatCurrencyValue(totalHonorarios)}</div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div class="text-xs uppercase tracking-wide text-slate-400">Repasse total</div>
          <div class="mt-1 text-sm font-semibold text-slate-900">${formatCurrencyValue(totalRepasse)}</div>
        </div>
      </div>
      <div class="space-y-3">
        ${
          itens.length
            ? itens
                .map((item) => {
                  const tipo = item.tipo || 'outros';
                  const base = formatCurrencyValue(item.valor_base);
                  const honor = formatCurrencyValue(item.honorarios_calculados);
                  const rep = formatCurrencyValue(item.repasse_calculado);
                  const previsao = normalizeMonthValue(item.previsao_pagamento_mes);
                  return `
                    <div class="rounded-xl border border-slate-200 p-4">
                      <div class="text-sm font-semibold text-slate-800">${escapeProcessoDetailHtml(tipo)}</div>
                      <div class="text-xs text-slate-500 mt-1">${escapeProcessoDetailHtml(item.descricao || '')}</div>
                      <div class="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div><div class="text-xs uppercase tracking-wide text-slate-400">Proveito</div><div class="text-slate-900">${base}</div></div>
                        <div><div class="text-xs uppercase tracking-wide text-slate-400">Percentual</div><div class="text-slate-900">${escapeProcessoDetailHtml(item.percentual || '—')}</div></div>
                        <div><div class="text-xs uppercase tracking-wide text-slate-400">Honorários</div><div class="text-slate-900">${honor}</div></div>
                        <div><div class="text-xs uppercase tracking-wide text-slate-400">Repasse</div><div class="text-slate-900">${rep}</div></div>
                      </div>
                      <div class="mt-3 text-xs text-slate-500">Previsão: ${escapeProcessoDetailHtml(previsao || '—')}</div>
                    </div>
                  `;
                })
                .join('')
            : '<div class="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-500">Nenhum lançamento financeiro.</div>'
        }
      </div>
    `;
  }

  function renderProcessoDetailAtividades(atividadesResp, processoId) {
    if (!processoDetailAtividades) return;
    const atividades = Array.isArray(atividadesResp?.data) ? atividadesResp.data : [];
    const COMMENT_TOKEN = '[COMENTARIOS_EQUIPE]';
    const splitDescricaoComentarios = (value) => {
      const raw = String(value || '');
      const idx = raw.indexOf(COMMENT_TOKEN);
      if (idx < 0) return { descricao: raw.trim(), comentarios: [] };
      const descricao = raw.slice(0, idx).trim();
      const commentsRaw = raw.slice(idx + COMMENT_TOKEN.length).trim();
      const comentarios = commentsRaw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => (line.startsWith('- ') ? line.slice(2).trim() : line))
        .filter(Boolean);
      return { descricao, comentarios };
    };
    const buildDescricaoComComentarios = (descricaoBase, comentarios) => {
      const base = String(descricaoBase || '').trim();
      const comments = Array.isArray(comentarios) ? comentarios.map((c) => String(c || '').trim()).filter(Boolean) : [];
      if (!comments.length) return base;
      const commentsText = comments.map((c) => `- ${c}`).join('\n');
      return `${base}${base ? '\n\n' : ''}${COMMENT_TOKEN}\n${commentsText}`;
    };
    const getCurrentUserDisplayName = () =>
      String(
        window.__currentUser?.nome_exibicao ||
          window.__currentUser?.nome ||
          window.__currentUser?.usuario ||
          'Equipe'
      ).trim();

    const cards = atividades.length
      ? atividades
          .map((atividade) => {
            const titulo = escapeProcessoDetailHtml(stripHashSuffix(atividade.titulo || '') || 'Atividade');
            const prazo = formatDateOptionalTime(atividade.prazo, atividade.prazo_hora);
            const parts = splitDescricaoComentarios(atividade.descricao || atividade.observacao || '');
            const descricao = escapeProcessoDetailHtml(parts.descricao || 'Sem descrição.');
            const comentarios = parts.comentarios;
            const createdAt = atividade.created_at ? formatDateTimeBR(atividade.created_at).slice(11, 16) : '';
            return `
              <article class="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <div class="flex items-start gap-3">
                  <div class="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-500"></div>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center justify-between gap-2">
                      <div class="truncate text-sm font-medium text-slate-800">${titulo}</div>
                      <span class="text-xs text-stone-400">${escapeProcessoDetailHtml(createdAt)}</span>
                    </div>
                    ${prazo ? `<div class="mt-1 inline-flex items-center rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600">Prazo ${escapeProcessoDetailHtml(prazo)}</div>` : ''}
                    <div class="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 break-words">${descricao}</div>
                    <div class="mt-2 flex items-center justify-between gap-2">
                      <span class="text-xs text-stone-500">${comentarios.length} comentário(s)</span>
                      <div class="flex items-center gap-2">
                        <button
                          type="button"
                          data-processo-detail-comment="${atividade.id}"
                          class="text-xs rounded-md border border-stone-200 px-2 py-1 text-stone-600 hover:bg-stone-50"
                        >
                          Comentar
                        </button>
                        ${
                          canManageAtividades
                            ? `
                              <div class="relative">
                                <button
                                  type="button"
                                  data-processo-detail-atividade-menu-toggle="${atividade.id}"
                                  class="h-7 w-7 inline-flex items-center justify-center rounded-md border border-stone-200 text-stone-500 hover:bg-stone-100"
                                  title="Opções"
                                  aria-label="Opções"
                                >
                                  &#x22EE;
                                </button>
                                <div
                                  data-processo-detail-atividade-menu="${atividade.id}"
                                  class="hidden absolute right-0 mt-1 w-32 rounded-lg border border-stone-200 bg-white shadow-lg z-20"
                                >
                                  <button
                                    type="button"
                                    data-processo-detail-edit-atividade="${atividade.id}"
                                    class="w-full text-left px-3 py-2 text-xs text-stone-700 hover:bg-stone-50"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    data-processo-detail-remove-atividade="${atividade.id}"
                                    class="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50"
                                  >
                                    Excluir
                                  </button>
                                </div>
                              </div>
                            `
                            : ''
                        }
                      </div>
                    </div>
                    ${
                      comentarios.length
                        ? `<div class="mt-2 space-y-1">
                            ${comentarios
                              .slice(-3)
                              .map(
                                (item) =>
                                  `<div class="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-600 break-words">${escapeProcessoDetailHtml(
                                    item
                                  )}</div>`
                              )
                              .join('')}
                          </div>`
                        : ''
                    }
                  </div>
                </div>
              </article>
            `;
          })
          .join('')
      : '<div class="text-sm text-stone-400">Nenhuma atividade vinculada a este processo.</div>';

    processoDetailAtividades.innerHTML = `
      <div class="mb-3 flex items-center gap-2 text-xs">
        <span class="inline-flex rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 font-medium text-blue-700">Atividade</span>
        <span class="inline-flex rounded-lg px-2.5 py-1 text-stone-500">Comentário</span>
        ${
          canManageAtividades
            ? `
              <div class="relative ml-auto inline-block">
                <button
                  id="processoDetailNovaAtividadeBtn"
                  type="button"
                  class="inline-flex items-center rounded-lg border border-stone-300 px-2.5 py-1 text-xs text-stone-700 hover:bg-stone-100"
                >
                  Nova atividade
                </button>
                <div
                  id="processoDetailNovaAtividadeMenu"
                  class="hidden absolute right-0 mt-2 w-56 bg-white border border-stone-200 rounded-lg shadow-sm z-20"
                >
                  ${atividadeTemplates
                    .map(
                      (tipo) => `
                        <button
                          type="button"
                          class="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
                          data-processo-detail-template="${tipo}"
                        >
                          ${tipo}
                        </button>
                      `
                    )
                    .join('')}
                </div>
              </div>
            `
            : ''
        }
      </div>
      ${
        canManageAtividades
          ? `
            <div id="processoDetailAtividadeFormWrap" class="hidden mb-3 rounded-xl border border-stone-200 bg-white p-3">
              <div class="flex items-center justify-between mb-3">
                <h4 id="processoDetailAtividadeFormTitle" class="text-sm font-semibold text-stone-800">Nova atividade</h4>
                <button
                  id="processoDetailAtividadeFormCancel"
                  type="button"
                  class="text-xs rounded-md border border-stone-200 px-2 py-1 text-stone-600 hover:bg-stone-50"
                >
                  Fechar
                </button>
              </div>
              <form id="processoDetailAtividadeForm" class="space-y-2.5">
                <input type="hidden" id="processoDetailAtividadeId" />
                <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label class="text-xs text-stone-500">Tipo</label>
                    <select id="processoDetailAtividadeTipo" class="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm">
                      <option value="">Selecione</option>
                      ${atividadeTemplates.map((tipo) => `<option value="${tipo}">${tipo}</option>`).join('')}
                    </select>
                  </div>
                  <div>
                    <label class="text-xs text-stone-500">Título</label>
                    <input id="processoDetailAtividadeTitulo" class="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm" required />
                  </div>
                </div>
                <div>
                  <label class="text-xs text-stone-500">Descrição</label>
                  <textarea id="processoDetailAtividadeDescricao" rows="2" class="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"></textarea>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <div>
                    <label class="text-xs text-stone-500">Status</label>
                    <select id="processoDetailAtividadeStatus" class="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm">
                      <option value="a_fazer">A fazer</option>
                      <option value="fazendo">Fazendo</option>
                      <option value="feito">Feito</option>
                      <option value="cancelado">Cancelado</option>
                    </select>
                  </div>
                  <div>
                    <label class="text-xs text-stone-500">Prioridade</label>
                    <select id="processoDetailAtividadePrioridade" class="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm">
                      <option value="baixa">Baixa</option>
                      <option value="media" selected>Média</option>
                      <option value="alta">Alta</option>
                    </select>
                  </div>
                  <div>
                    <label class="text-xs text-stone-500">Prazo</label>
                    <input id="processoDetailAtividadePrazo" type="date" class="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label class="text-xs text-stone-500">Hora</label>
                    <input id="processoDetailAtividadePrazoHora" type="time" class="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm" />
                  </div>
                </div>
                <div class="flex justify-end gap-2 pt-1">
                  <button
                    type="submit"
                    id="processoDetailAtividadeSalvar"
                    class="rounded-md bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700"
                  >
                    Salvar atividade
                  </button>
                </div>
              </form>
            </div>
          `
          : ''
      }
      <div class="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-400 mb-3">Coisas a fazer</div>
      <div class="space-y-2.5">${cards}</div>
    `;

    const refreshAtividades = async () => {
      const next = await api.atividades.list({ page: 1, limit: 12, processo_id: processoId, sort: 'created_at', dir: 'desc' });
      if (processoDetailPayload) processoDetailPayload.atividades = next;
      renderProcessoDetailAtividades(next, processoId);
    };

    const novaBtn = qs('#processoDetailNovaAtividadeBtn');
    const novaMenu = qs('#processoDetailNovaAtividadeMenu');
    const formWrap = qs('#processoDetailAtividadeFormWrap');
    const form = qs('#processoDetailAtividadeForm');
    const formTitle = qs('#processoDetailAtividadeFormTitle');
    const formCancel = qs('#processoDetailAtividadeFormCancel');
    const atividadeIdInput = qs('#processoDetailAtividadeId');
    const tipoInput = qs('#processoDetailAtividadeTipo');
    const tituloInput = qs('#processoDetailAtividadeTitulo');
    const descricaoInput = qs('#processoDetailAtividadeDescricao');
    const statusInput = qs('#processoDetailAtividadeStatus');
    const prioridadeInput = qs('#processoDetailAtividadePrioridade');
    const prazoInput = qs('#processoDetailAtividadePrazo');
    const prazoHoraInput = qs('#processoDetailAtividadePrazoHora');

    const openAtividadeForm = (atividade = null, template = '') => {
      if (!formWrap || !form) return;
      formWrap.classList.remove('hidden');
      if (atividade) {
        const parts = splitDescricaoComentarios(atividade.descricao || atividade.observacao || '');
        if (formTitle) formTitle.textContent = 'Editar atividade';
        if (atividadeIdInput) atividadeIdInput.value = String(atividade.id || '');
        if (tipoInput) {
          const tipoFound = atividadeTemplates.find((item) =>
            String(atividade.titulo || '').toLowerCase().includes(item.toLowerCase())
          );
          tipoInput.value = tipoFound || '';
        }
        if (tituloInput) tituloInput.value = String(atividade.titulo || '').trim();
        if (descricaoInput) descricaoInput.value = parts.descricao || '';
        if (statusInput) statusInput.value = atividade.status || 'a_fazer';
        if (prioridadeInput) prioridadeInput.value = atividade.prioridade || 'media';
        if (prazoInput) prazoInput.value = normalizeDateValue(atividade.prazo || '');
        if (prazoHoraInput) prazoHoraInput.value = (atividade.prazo_hora || '').slice(0, 5);
      } else {
        if (formTitle) formTitle.textContent = 'Nova atividade';
        if (atividadeIdInput) atividadeIdInput.value = '';
        if (tipoInput) tipoInput.value = template || '';
        if (tituloInput) tituloInput.value = template || '';
        if (descricaoInput) descricaoInput.value = '';
        if (statusInput) statusInput.value = 'a_fazer';
        if (prioridadeInput) prioridadeInput.value = 'media';
        if (prazoInput) prazoInput.value = '';
        if (prazoHoraInput) prazoHoraInput.value = '';
      }
      tituloInput?.focus();
    };

    const closeAtividadeForm = () => {
      if (!formWrap) return;
      formWrap.classList.add('hidden');
    };

    if (canManageAtividades && novaBtn && novaMenu) {
      novaBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        novaMenu.classList.toggle('hidden');
      });
      novaMenu.addEventListener('click', (e) => e.stopPropagation());
      novaMenu.querySelectorAll('[data-processo-detail-template]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const template = String(btn.getAttribute('data-processo-detail-template') || 'Atividade').trim();
          novaMenu.classList.add('hidden');
          openAtividadeForm(null, template);
        });
      });
    }

    if (formCancel) {
      formCancel.addEventListener('click', () => closeAtividadeForm());
    }

    if (tipoInput && tituloInput) {
      tipoInput.addEventListener('change', () => {
        if (!tituloInput.value.trim()) tituloInput.value = tipoInput.value || '';
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const atividadeId = String(atividadeIdInput?.value || '').trim();
        const titulo = String(tituloInput?.value || '').trim();
        if (!titulo) {
          alert('Informe o título da atividade.');
          return;
        }
        const descricaoBase = String(descricaoInput?.value || '').trim();
        const prazo = String(prazoInput?.value || '').trim() || null;
        const prazoHora = String(prazoHoraInput?.value || '').trim() || null;
        try {
          if (atividadeId) {
            const atividadeAtual = atividades.find((item) => String(item.id) === atividadeId);
            if (!atividadeAtual) {
              alert('Atividade não encontrada para edição.');
              return;
            }
            const parts = splitDescricaoComentarios(atividadeAtual.descricao || atividadeAtual.observacao || '');
            await api.atividades.update(atividadeId, {
              ...atividadeAtual,
              titulo,
              descricao: buildDescricaoComComentarios(descricaoBase, parts.comentarios),
              status: statusInput?.value || 'a_fazer',
              prioridade: prioridadeInput?.value || 'media',
              prazo,
              prazo_hora: prazo ? prazoHora : null,
              processo_numero: atividadeAtual.processo_numero || atividadeAtual.numero_processo || null,
            });
          } else {
            await api.atividades.create({
              processo_id: Number(processoId),
              titulo,
              descricao: descricaoBase,
              status: statusInput?.value || 'a_fazer',
              prioridade: prioridadeInput?.value || 'media',
              prazo,
              prazo_hora: prazo ? prazoHora : null,
            });
          }
          closeAtividadeForm();
          await refreshAtividades();
        } catch (err) {
          alert(err?.message || 'Não foi possível salvar atividade.');
        }
      });
    }

    if (processoDetailAtividades.__outsideAtividadeMenuHandler) {
      document.removeEventListener('click', processoDetailAtividades.__outsideAtividadeMenuHandler);
      processoDetailAtividades.__outsideAtividadeMenuHandler = null;
    }

    const closeAtividadeActionMenus = () => {
      processoDetailAtividades
        .querySelectorAll('[data-processo-detail-atividade-menu]')
        .forEach((menuEl) => menuEl.classList.add('hidden'));
    };

    processoDetailAtividades.querySelectorAll('[data-processo-detail-atividade-menu-toggle]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const atividadeId = String(btn.getAttribute('data-processo-detail-atividade-menu-toggle') || '').trim();
        if (!atividadeId) return;
        const menuEl = processoDetailAtividades.querySelector(
          `[data-processo-detail-atividade-menu="${atividadeId}"]`
        );
        if (!menuEl) return;
        const willOpen = menuEl.classList.contains('hidden');
        closeAtividadeActionMenus();
        if (willOpen) menuEl.classList.remove('hidden');
      });
    });

    if (canManageAtividades) {
      const outsideHandler = (event) => {
        if (
          event.target.closest('[data-processo-detail-atividade-menu-toggle]') ||
          event.target.closest('[data-processo-detail-atividade-menu]')
        ) {
          return;
        }
        closeAtividadeActionMenus();
      };
      processoDetailAtividades.__outsideAtividadeMenuHandler = outsideHandler;
      document.addEventListener('click', outsideHandler);
    }

    processoDetailAtividades.querySelectorAll('[data-processo-detail-edit-atividade]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const atividadeId = String(btn.getAttribute('data-processo-detail-edit-atividade') || '').trim();
        if (!atividadeId) return;
        const atividade = atividades.find((item) => String(item.id) === atividadeId);
        if (!atividade) return;
        closeAtividadeActionMenus();
        openAtividadeForm(atividade);
      });
    });

    processoDetailAtividades.querySelectorAll('[data-processo-detail-remove-atividade]').forEach((btn) => {
      btn.addEventListener('click', async (event) => {
        event.stopPropagation();
        const atividadeId = String(btn.getAttribute('data-processo-detail-remove-atividade') || '').trim();
        if (!atividadeId) return;
        closeAtividadeActionMenus();
        if (!window.confirm('Deseja excluir esta atividade?')) return;
        try {
          await api.atividades.remove(atividadeId);
          await refreshAtividades();
        } catch (err) {
          alert(err?.message || 'Não foi possível excluir a atividade.');
        }
      });
    });

    processoDetailAtividades.querySelectorAll('[data-processo-detail-comment]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const atividadeId = String(btn.getAttribute('data-processo-detail-comment') || '').trim();
        if (!atividadeId) return;
        const atividade = atividades.find((item) => String(item.id) === atividadeId);
        if (!atividade) return;
        const comentario = window.prompt('Comentário para a atividade:');
        const comentarioClean = String(comentario || '').trim();
        if (!comentarioClean) return;
        const parts = splitDescricaoComentarios(atividade.descricao || atividade.observacao || '');
        const stamp = new Date().toLocaleString('pt-BR');
        const autor = getCurrentUserDisplayName();
        const nextComentarios = [...parts.comentarios, `[${stamp}] ${autor}: ${comentarioClean}`];
        btn.disabled = true;
        try {
          await api.atividades.update(atividadeId, {
            ...atividade,
            descricao: buildDescricaoComComentarios(parts.descricao, nextComentarios),
            processo_numero: atividade.processo_numero || atividade.numero_processo || null,
          });
          await refreshAtividades();
        } catch (err) {
          alert(err?.message || 'Não foi possível salvar comentário.');
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  function renderProcessoDetailAndamentos(andamentosResp, logsResp) {
    if (!processoDetailAndamentos || !processoDetailPayload?.processo) return;
    const processoId = processoDetailPayload.processo.id;
    const movimentos = Array.isArray(andamentosResp?.movimentos) ? andamentosResp.movimentos : [];
    const logs = Array.isArray(logsResp?.data) ? logsResp.data : [];
    const lastLog = logs[0];
    const atualizadoEm = andamentosResp?.data?.created_at ? formatDateTimeBR(andamentosResp.data.created_at) : '';
    const ultimaMov = andamentosResp?.data?.data_ultima_movimentacao
      ? formatDateTimeBR(andamentosResp.data.data_ultima_movimentacao)
      : '';

    const itens = movimentos.slice(0, 10).map((mov) => {
      const dataMov =
        formatDateTimeBR(mov?.dataHora || mov?.data || mov?.data_movimentacao || mov?.dataMovimento) || '—';
      const titulo = mov?.nome || mov?.descricao || mov?.movimento || mov?.codigo || 'Movimentação';
      const complemento = mov?.complemento || mov?.texto || '';
      return `
        <div class="py-3">
          <div class="text-xs uppercase tracking-wide text-slate-400">${escapeProcessoDetailHtml(dataMov)}</div>
          <div class="text-sm text-slate-900 mt-1">${escapeProcessoDetailHtml(titulo)}</div>
          ${complemento ? `<div class="text-sm text-slate-500 mt-1">${escapeProcessoDetailHtml(complemento)}</div>` : ''}
        </div>
      `;
    });

    let bodyHtml = itens.length
      ? `<div class="divide-y divide-slate-200/70">${itens.join('')}</div>`
      : '<div class="text-sm text-slate-500">Sem andamentos disponíveis no momento.</div>';
    if (!itens.length && lastLog?.status === 'not_found') {
      bodyHtml = '<div class="text-sm text-slate-500">Processo não localizado no DataJud.</div>';
    }

    const logsHtml = logs.length
      ? `
        <div class="text-sm font-semibold text-slate-700 mb-2">Logs de sincronização</div>
        <div class="rounded-xl border border-slate-200 px-4 py-2 divide-y divide-slate-200/70">
          ${logs
            .slice(0, 12)
            .map((log) => {
              const when = formatDateTimeBR(log.created_at) || '—';
              const status = log.status || 'info';
              const msg = log.mensagem || '';
              return `
                <div class="py-2">
                  <div class="text-xs uppercase tracking-wide text-slate-400">${escapeProcessoDetailHtml(when)}</div>
                  <div class="text-sm text-slate-900">${escapeProcessoDetailHtml(status)}</div>
                  ${msg ? `<div class="text-sm text-slate-500 mt-1">${escapeProcessoDetailHtml(msg)}</div>` : ''}
                </div>
              `;
            })
            .join('')}
        </div>
      `
      : '<div class="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-500">Nenhum log de sincronização.</div>';

    processoDetailAndamentos.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-semibold text-slate-700">Andamentos</h2>
        <div class="flex items-center gap-3 text-xs">
          <button id="processoDetailEditAndamentosBtn" type="button" data-processo-detail-edit-inline="1" class="text-emerald-700 hover:text-emerald-800">Editar processo</button>
          <button id="processoDetailAndamentosSeen" class="text-slate-500 hover:text-slate-900">Marcar como lido</button>
          <button id="processoDetailAndamentosSync" class="text-slate-500 hover:text-slate-900">Atualizar</button>
        </div>
      </div>
      <div class="rounded-xl border border-slate-200 px-4 py-2">
        ${bodyHtml}
        <div class="mt-4 text-xs text-slate-400">
          ${ultimaMov ? `Última movimentação: ${escapeProcessoDetailHtml(ultimaMov)}` : ''}
          ${ultimaMov && atualizadoEm ? ' • ' : ''}
          ${atualizadoEm ? `Atualizado em: ${escapeProcessoDetailHtml(atualizadoEm)}` : ''}
        </div>
      </div>
      <div class="mt-4">${logsHtml}</div>
    `;

    const syncBtn = qs('#processoDetailAndamentosSync');
    if (syncBtn) {
      syncBtn.addEventListener('click', async () => {
        syncBtn.textContent = 'Atualizando...';
        syncBtn.disabled = true;
        try {
          const updated = await api.processos.syncAndamentos(processoId);
          const logsNext = await api.processos.andamentosLogs(processoId, { limit: 20 });
          processoDetailPayload.andamentos = updated;
          processoDetailPayload.logs = logsNext;
          renderProcessoDetailAndamentos(updated, logsNext);
          updateProcessosBadge();
        } catch (err) {
          processoDetailAndamentos.innerHTML =
            '<div class="text-sm text-slate-500">Não foi possível atualizar os andamentos.</div>';
        }
      });
    }

    const seenBtn = qs('#processoDetailAndamentosSeen');
    if (seenBtn) {
      seenBtn.addEventListener('click', async () => {
        seenBtn.textContent = 'Marcando...';
        seenBtn.disabled = true;
        try {
          await api.processos.markAndamentosSeen(processoId);
          updateProcessosBadge();
          const inMemory = processos.find((item) => String(item.id) === String(processoId));
          if (inMemory) inMemory.tem_novo_andamento = false;
          renderTable();
        } catch (_) {
          // ignore
        } finally {
          seenBtn.textContent = 'Marcar como lido';
          seenBtn.disabled = false;
        }
      });
    }
  }

  async function openProcessoDetailOverlay(processoId) {
    if (!processoDetailOverlay || !processoDetailDados || !processoDetailAndamentos || !processoDetailNumero) {
      window.location.href = `./processo?id=${processoId}`;
      return;
    }

    processoDetailOverlay.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    document.body.classList.add('processo-detail-open');
    setProcessoDetailNumeroLabel('Carregando...');
    if (processoDetailSubtitulo) processoDetailSubtitulo.textContent = '';
    processoDetailDados.innerHTML = '<div class="text-sm text-slate-500">Carregando informações...</div>';
    if (processoDetailFinanceiro) processoDetailFinanceiro.innerHTML = '<div class="text-sm text-slate-500">Carregando financeiro...</div>';
    processoDetailAndamentos.innerHTML = '<div class="text-sm text-slate-500">Carregando andamentos...</div>';
    if (processoDetailAtividades) processoDetailAtividades.innerHTML = '<div class="text-sm text-slate-500">Carregando atividades...</div>';
    setProcessoDetailActiveTab('dados');

    try {
      const [processo, andamentos, logs, financeiro, atividades] = await Promise.all([
        api.processos.get(processoId),
        api.processos.andamentos(processoId).catch(() => null),
        api.processos.andamentosLogs(processoId, { limit: 20 }).catch(() => null),
        hasFinanceAccess ? api.financeiro.listByProcesso(processoId).catch(() => null) : Promise.resolve(null),
        api.atividades
          .list({ page: 1, limit: 12, processo_id: processoId, sort: 'created_at', dir: 'desc' })
          .catch(() => null),
      ]);

      processoDetailPayload = { processo, andamentos, logs, financeiro, atividades };
      setProcessoDetailNumeroLabel(processo.numero_processo || `Processo #${processoId}`, true);
      if (processoDetailSubtitulo) {
        const clienteLabel = processo.cliente_nome ? `Cliente: ${processo.cliente_nome}` : 'Processo';
        processoDetailSubtitulo.textContent = clienteLabel;
      }
      renderProcessoDetailInfo(processo);
      renderProcessoDetailFinanceiro(financeiro);
      renderProcessoDetailAndamentos(andamentos, logs);
      renderProcessoDetailAtividades(atividades, processoId);
    } catch (err) {
      setProcessoDetailNumeroLabel('Processo');
      processoDetailDados.innerHTML = `<div class="text-sm text-red-600">${escapeProcessoDetailHtml(
        err?.message || 'Erro ao carregar detalhes do processo.'
      )}</div>`;
      if (processoDetailFinanceiro) processoDetailFinanceiro.innerHTML = '';
      processoDetailAndamentos.innerHTML = '';
      if (processoDetailAtividades) processoDetailAtividades.innerHTML = '';
    }
  }

  function renderTable() {
    tableBody.innerHTML = processos
      .map(
        (p) => `
        <tr class="border-b border-stone-200">
          <td class="py-3">
            <div class="inline-flex items-center gap-1">
              ${renderCopyProcessButton(p.numero_processo)}
              <a class="text-stone-900 hover:text-stone-700 font-medium" href="./processo?id=${p.id}" data-open-processo-detail="${p.id}">
                ${p.numero_processo}
              </a>
            </div>
            ${
              p.tem_novo_andamento
                ? '<span class="ml-2 inline-flex h-2 w-2 rounded-full bg-amber-400" title="Novo andamento"></span>'
                : ''
            }
          </td>
	          <td class="py-3">
	            ${
	              p.cliente_id
	                ? `<a class="text-stone-900 hover:text-stone-700 hover:underline" href="./clientes?cliente_id=${p.cliente_id}">${p.cliente_nome || '-'}</a>`
	                : `${p.cliente_nome || '-'}`
	            }
	          </td>
          <td class="py-3">
            <div class="inline-flex items-center gap-2">
              <span
                class="inline-flex h-2 w-2 rounded-full ${
                  (() => {
                    const status = String(p.status || '').toLowerCase();
                    if (status.match(/ativo|andamento|em\\s*andamento/)) return 'bg-green-500';
                    if (status.match(/inativo|arquiv|encerr|finaliz|cancel/)) return 'bg-stone-400';
                    return 'bg-stone-300';
                  })()
                }"
              ></span>
              <span class="text-stone-700">${p.status || 'Sem status'}</span>
            </div>
          </td>
        </tr>
      `
      )
      .join('');
  }

  async function load() {
    const searchTerm = busca.value.trim();
    const effectiveLimit = searchTerm ? 100 : limit;
    const [processosResp, clientesResp] = await Promise.all([
      api.processos.list({
        page,
        limit: effectiveLimit,
        cliente_id: filtroCliente?.value || '',
        status: filtroStatus.value.trim(),
        andamentos_novos: filtroAndamentos?.checked ? '1' : '',
        search: searchTerm,
        sort: 'cnj',
        dir: sortDir,
      }),
      api.clientes.list({ page: 1, limit: 100 }),
    ]);
    processos = processosResp.data;
    total = processosResp.total;
    clientes = clientesResp.data || [];
    const totalPages = Math.max(1, Math.ceil(total / effectiveLimit));
    if (page > totalPages) {
      page = totalPages;
      return load();
    }
    renderClientesSelect();
    info.textContent = `${total} resultado(s)`;
    paginaAtual.textContent = `Página ${page} de ${totalPages}`;
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= totalPages;
    renderTable();
  }

  updateSortLabel();

  const openProcessoModal = async (prefill = null) => {
    await loadAllClientes().catch(() => null);
    await loadAjustesAreas().catch(() => null);
    form.reset();
    form.dataset.id = '';
    showMessage(msg, '');
    renderClienteOptions(clientesModal);
    renderClienteSuggestions([]);
    if (clienteId) clienteId.value = '';
    if (orgaoInput) orgaoInput.value = '';
    if (abrirContaInput) abrirContaInput.checked = false;
    if (contaAbertaInput) contaAbertaInput.checked = false;
    if (interpostoRecursoInput) interpostoRecursoInput.checked = false;
    toggleContaBeneficio();
    await syncProcessoCidadeByEstado('');
    if (orgaoGrid) {
      orgaoGrid.querySelectorAll('.orgao-btn').forEach((btn) => {
        btn.classList.remove('border-stone-900', 'bg-stone-50');
      });
    }
    if (prefill?.numero && numeroInput) numeroInput.value = prefill.numero;
    const prefillClienteId = String(prefill?.clienteId || '').trim();
    const prefillClienteNome = String(prefill?.clienteNome || '').trim();
    if ((prefillClienteId || prefillClienteNome) && clienteInput && clienteId) {
      let match = null;
      if (prefillClienteId) {
        match = (clientesModal || []).find((c) => String(c.id) === prefillClienteId) || null;
      }
      if (!match && prefillClienteNome) {
        const nomeNormalizado = normalizeText(prefillClienteNome);
        match =
          (clientesModal || []).find((c) => normalizeText(c.nome || '') === nomeNormalizado) || null;
      }
      if (match) {
        clienteInput.value = match.nome || '';
        clienteId.value = String(match.id || '');
      } else {
        clienteInput.value = prefillClienteNome;
        clienteId.value = prefillClienteId;
      }
    }
    if (prefill?.origem === 'djen' && statusInput && !statusInput.value) statusInput.value = 'Ativo';
    openModal(modal);
  };

  const clearNovoProcessoQueryParams = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete('novo');
    params.delete('origem');
    params.delete('numero_processo');
    params.delete('cliente_id');
    params.delete('cliente_nome');
    const search = params.toString();
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash || ''}`;
    window.history.replaceState({}, '', nextUrl);
  };

  const ensureTopProcessoButton = () => {
    const header = document.querySelector('main > header');
    if (!header) return;
    let btn = qs('#novoProcessoBtn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'novoProcessoBtn';
      btn.textContent = 'Novo processo';
      btn.type = 'button';
      btn.className = 'bg-emerald-600 text-white px-5 py-2 rounded-full hover:bg-emerald-700';
      header.appendChild(btn);
    }
    btn.classList.remove('hidden');
    btn.style.display = 'inline-flex';
    btn.style.visibility = 'visible';
    btn.style.opacity = '1';
    if (!btn.dataset.boundOpenProcesso) {
      btn.addEventListener('click', openProcessoModal);
      btn.dataset.boundOpenProcesso = '1';
    }
  };

  ensureTopProcessoButton();


  closeBtn.addEventListener('click', () => closeModal(modal));
  closeDocumentoBtn.addEventListener('click', () => closeModal(documentoModal));
  if (processoDetailCloseBtn) {
    processoDetailCloseBtn.addEventListener('click', closeProcessoDetailOverlay);
  }
  if (processoDetailOverlay) {
    processoDetailOverlay.addEventListener('click', (e) => {
      const inlineEditBtn = e.target.closest('[data-processo-detail-edit-inline]');
      if (inlineEditBtn) {
        e.preventDefault();
        triggerProcessoDetailInlineEdit();
        return;
      }
      if (e.target.matches('[data-processo-detail-close]')) {
        closeProcessoDetailOverlay();
      }
    });
  }
  if (processoDetailEditBtn) {
    processoDetailEditBtn.addEventListener('click', () => {
      triggerProcessoDetailInlineEdit();
    });
  }
  processoDetailTabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.processoDetailTab;
      if (!tab) return;
      setProcessoDetailActiveTab(tab);
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && processoDetailOverlay && !processoDetailOverlay.classList.contains('hidden')) {
      closeProcessoDetailOverlay();
    }
  });

  busca.addEventListener('input', () => {
    clearTimeout(buscaTimeout);
    buscaTimeout = setTimeout(() => {
      page = 1;
      load();
    }, 300);
  });

  filtroCliente?.addEventListener('change', () => {
    page = 1;
    load();
  });

  filtroStatus.addEventListener('change', () => {
    page = 1;
    load();
  });

  filtroAndamentos?.addEventListener('change', () => {
    page = 1;
    load();
  });

  limitSelect.addEventListener('change', () => {
    limit = Number(limitSelect.value) || 10;
    page = 1;
    load();
  });

  if (sortBtn) {
    sortBtn.addEventListener('click', () => {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      updateSortLabel();
      page = 1;
      load();
    });
  }

  prevBtn.addEventListener('click', () => {
    if (page > 1) {
      page -= 1;
      load();
    }
  });

  nextBtn.addEventListener('click', () => {
    if (page * limit < total) {
      page += 1;
      load();
    }
  });

  tableBody.addEventListener('click', async (e) => {
    const detailLink = e.target.closest('[data-open-processo-detail]');
    if (detailLink) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      const id = detailLink.getAttribute('data-open-processo-detail');
      if (id) await openProcessoDetailOverlay(id);
      return;
    }

    const editId = e.target.dataset.edit;
    const removeId = e.target.dataset.remove;
    const docsId = e.target.dataset.docs;

    if (editId) {
      const processo = processos.find((p) => String(p.id) === editId);
      if (!processo) return;
      await openEditProcessoModal(processo);
    }

    if (removeId) {
      if (confirm('Deseja excluir este processo?')) {
        api.processos.remove(removeId).then(load).catch((err) => alert(err.message));
      }
    }

    if (docsId) {
      processoDocumentoId = docsId;
      loadDocumentos();
      openModal(documentoModal);
    }
  });

  async function loadDocumentos() {
    if (!processoDocumentoId) return;
    const docs = await api.documentos.list(processoDocumentoId);
    documentoLista.innerHTML = docs
      .map(
        (d) => `
        <div class="flex items-center justify-between border border-stone-200 rounded-lg px-3 py-2 text-sm">
          <button class="text-blue-600" data-download-doc="${d.id}" data-filename="${d.nome_original}">
            ${d.nome_original}
          </button>
          <button class="text-red-600" data-remove-doc="${d.id}">Excluir</button>
        </div>
      `
      )
      .join('');
  }

  documentoLista.addEventListener('click', (e) => {
    const removeId = e.target.dataset.removeDoc;
    const downloadId = e.target.dataset.downloadDoc;
    const filename = e.target.dataset.filename;
    if (removeId && confirm('Deseja excluir este documento?')) {
      api.documentos.remove(removeId).then(loadDocumentos).catch((err) => alert(err.message));
    }
    if (downloadId) {
      api.documentos.download(downloadId, filename).catch((err) => alert(err.message));
    }
  });

  enviarDocumentoBtn.addEventListener('click', async () => {
    if (!processoDocumentoId) return;
    const file = documentoArquivo.files[0];
    if (!file) {
      alert('Selecione um arquivo.');
      return;
    }
    try {
      await api.documentos.upload(processoDocumentoId, file);
      documentoArquivo.value = '';
      await loadDocumentos();
    } catch (err) {
      alert(err.message);
    }
  });

  if (orgaoGrid && orgaoInput) {
    orgaoGrid.addEventListener('click', (event) => {
      const btn = event.target.closest('.orgao-btn');
      if (!btn) return;
      orgaoInput.value = btn.dataset.value || '';
      orgaoGrid.querySelectorAll('.orgao-btn').forEach((item) => {
        const active = item === btn;
        item.classList.toggle('border-stone-900', active);
        item.classList.toggle('bg-stone-50', active);
      });
    });
  }

  areaInput?.addEventListener('change', toggleContaBeneficio);
  areaInput?.addEventListener('input', toggleContaBeneficio);
  estadoInput?.addEventListener('change', () => {
    syncProcessoCidadeByEstado('').catch(() => null);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showMessage(msg, '');
    if (!clienteId.value && clienteInput?.value && clienteOptions) {
      const match = Array.from(clienteOptions.options).find(
        (opt) => normalizeText(opt.value) === normalizeText(clienteInput.value)
      );
      if (match?.dataset?.id) clienteId.value = match.dataset.id;
      if (!clienteId.value) {
        const similar = findBestClienteByQuery(clienteInput.value);
        if (similar) {
          clienteId.value = similar.id;
          clienteInput.value = similar.nome;
        }
      }
    }
    if (!clienteId.value) {
      showMessage(msg, 'Selecione um cliente válido.');
      return;
    }

    const payload = {
      cliente_id: Number(clienteId.value),
      numero_processo: numeroInput.value.trim(),
      area: areaInput.value.trim(),
      fase: '',
      status: statusInput.value.trim(),
      classe: classeInput.value.trim(),
      orgao: orgaoInput.value.trim(),
      vara: varaInput.value.trim(),
      grau: grauInput.value.trim(),
      cidade: cidadeInput.value.trim(),
      estado: estadoInput.value.trim(),
      sistema: sistemaInput.value.trim(),
      distribuicao: distribuicaoInput.value.trim(),
      resultado: resultadoInput.value.trim(),
      recurso_inominado: interpostoRecursoInput?.checked ? 'Sim' : 'No',
      parte_contraria: parteContrariaInput.value.trim(),
      abrir_conta: isPrevidenciario(areaInput.value) ? (abrirContaInput?.checked ? 'Sim' : 'No') : null,
      conta_aberta: isPrevidenciario(areaInput.value) ? (contaAbertaInput?.checked ? 'Sim' : 'No') : null,
    };

    try {
      if (form.dataset.id) {
        await api.processos.update(form.dataset.id, payload);
      } else {
        await api.processos.create(payload);
      }
      closeModal(modal);
      await load();
    } catch (err) {
      const existingProcessId = Number(err?.data?.processo_id);
      if (!form.dataset.id && Number.isFinite(existingProcessId) && existingProcessId > 0) {
        showMessage(
          msg,
          `Esse número já existe no processo #${existingProcessId}. Abrindo o processo existente...`
        );
        setTimeout(() => {
          window.location.href = `./processo?id=${existingProcessId}`;
        }, 500);
        return;
      }
      showMessage(msg, err.message);
    }
  });

  if (clienteInput && clienteOptions && clienteId) {
    clienteInput.addEventListener('input', () => {
      const query = clienteInput.value.trim();
      const source = clientesModal.length ? clientesModal : clientes;
      if (!query) {
        renderClienteOptions(source);
        renderClienteSuggestions([]);
        clienteId.value = '';
        return;
      }
      const ranked = source
        .map((c, idx) => ({ c, idx, score: similarityScore(query, c.nome) }))
        .filter((it) => it.score >= 180)
        .sort((a, b) => (b.score - a.score) || (a.idx - b.idx))
        .map((it) => it.c);
      renderClienteOptions(ranked);
      renderClienteSuggestions(ranked);
      const exact = ranked.find((c) => normalizeText(c.nome) === normalizeText(query));
      if (exact) {
        clienteId.value = exact.id;
        return;
      }
      const best = ranked[0];
      clienteId.value = best ? best.id : '';
    });

    clienteInput.addEventListener('focus', () => {
      const query = clienteInput.value.trim();
      if (!query) return;
      const source = clientesModal.length ? clientesModal : clientes;
      const ranked = source
        .map((c, idx) => ({ c, idx, score: similarityScore(query, c.nome) }))
        .filter((it) => it.score >= 180)
        .sort((a, b) => (b.score - a.score) || (a.idx - b.idx))
        .map((it) => it.c);
      renderClienteSuggestions(ranked);
    });

    clienteInput.addEventListener('blur', () => {
      setTimeout(() => hideClienteSuggestions(), 120);
    });
  }

  if (clienteSuggestionsEl) {
    clienteSuggestionsEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const btn = e.target.closest('[data-cliente-suggestion-index]');
      if (!btn) return;
      const idx = Number(btn.getAttribute('data-cliente-suggestion-index'));
      if (!Number.isFinite(idx)) return;
      const selected = clienteSuggestionsVisible[idx];
      if (!selected) return;
      setClienteSelecionado(selected);
    });
  }

  await loadAjustesAreas();
  await load();

  if (prefillNovoProcesso.ativo) {
    await openProcessoModal({
      numero: prefillNovoProcesso.numero,
      origem: prefillNovoProcesso.origem,
    });
    clearNovoProcessoQueryParams();
    prefillNovoProcesso = { ativo: false, origem: '', numero: '' };
  }
}

async function initFinanceiro() {
  await guardAuth();
  bindLogout();
  if (!canAccessFinanceiro()) {
    window.location.href = './dashboard';
    return;
  }

  const tableBody = qs('#financeiroTableBody');
  if (!tableBody) return;

  const totalHonorariosEl = qs('#financeiroTotalHonorarios');
  const totalHonorariosLiquidosEl = qs('#financeiroTotalHonorariosLiquidos');
  const totalComissaoEl = qs('#financeiroTotalComissao');
  const totalRepasseEl = qs('#financeiroTotalRepasse');
  const totalProveitoEl = qs('#financeiroTotalProveito');
  const countHonorariosEl = qs('#financeiroCountHonorarios');
  const countLiquidosEl = qs('#financeiroCountLiquidos');
  const countComissaoEl = qs('#financeiroCountComissao');
  const countRepasseEl = qs('#financeiroCountRepasse');
  const countProveitoEl = qs('#financeiroCountProveito');

  const filtroCliente = qs('#financeiroFiltroCliente');
  const filtroStatus = qs('#financeiroFiltroStatus');
  const busca = qs('#financeiroBusca');
  const limitSelect = qs('#financeiroLimit');
  const sortBtn = qs('#financeiroOrdenar');
  const novoHonorarioBtn = qs('#financeiroNovoHonorario');
  const info = qs('#financeiroPaginacaoInfo');
  const prevBtn = qs('#financeiroPrev');
  const nextBtn = qs('#financeiroNext');
  const paginaAtual = qs('#financeiroPaginaAtual');
  const avulsoModal = qs('#financeiroAvulsoModal');
  const avulsoForm = qs('#financeiroAvulsoForm');
  const avulsoClose = qs('#financeiroAvulsoClose');
  const avulsoCancel = qs('#financeiroAvulsoCancel');
  const avulsoMessage = qs('#financeiroAvulsoMessage');
  const avulsoCliente = qs('#financeiroAvulsoCliente');
  const avulsoProcesso = qs('#financeiroAvulsoProcesso');
  const avulsoTipo = qs('#financeiroAvulsoTipo');
  const avulsoDescricao = qs('#financeiroAvulsoDescricao');
  const avulsoValorBase = qs('#financeiroAvulsoValorBase');
  const avulsoPercentual = qs('#financeiroAvulsoPercentual');
  const avulsoHonorarios = qs('#financeiroAvulsoHonorarios');
  const avulsoRepasse = qs('#financeiroAvulsoRepasse');
  const avulsoPrevisao = qs('#financeiroAvulsoPrevisao');
  const avulsoPago = qs('#financeiroAvulsoPago');
  const avulsoRepassado = qs('#financeiroAvulsoRepassado');

  let processos = [];
  let clientes = [];
  let page = 1;
  let limit = Number(limitSelect?.value) || 20;
  let total = 0;
  let buscaTimeout;
  let sortDir = 'desc';
  let processosCache = [];

  function updateSortLabel() {
    if (!sortBtn) return;
    const desc = sortDir === 'desc';
    sortBtn.textContent = desc ? '▼' : '▲';
    sortBtn.title = desc ? 'Mais recente' : 'Mais antigo';
    sortBtn.setAttribute('aria-label', sortBtn.title);
  }

  function renderClientesSelect() {
    if (!filtroCliente) return;
    filtroCliente.innerHTML = ['<option value="">Todos os clientes</option>']
      .concat(clientes.map((c) => `<option value="${c.id}">${c.nome}</option>`))
      .join('');
  }

  function renderAvulsoClientes() {
    if (!avulsoCliente) return;
    avulsoCliente.innerHTML = ['<option value="">Selecione</option>']
      .concat(clientes.map((c) => `<option value="${c.id}">${c.nome}</option>`))
      .join('');
  }

  function renderAvulsoProcessos(clienteId = '') {
    if (!avulsoProcesso) return;
    const lista = clienteId
      ? processosCache.filter((p) => String(p.cliente_id) === String(clienteId))
      : processosCache;
    avulsoProcesso.innerHTML = ['<option value="">-</option>']
      .concat(
        lista.map((p) => `<option value="${p.id}">${p.numero_processo} - ${p.cliente_nome}</option>`)
      )
      .join('');
  }

  function calcularAvulso() {
    if (!avulsoValorBase || !avulsoPercentual) return;
    const base = parseCurrencyValue(avulsoValorBase.value);
    const perc = parsePercentValue(avulsoPercentual.value);
    if (base === null || perc === null) return;
    const honor = base * (perc / 100);
    const rep = base - honor;
    if (avulsoHonorarios) avulsoHonorarios.value = formatCurrencyValue(honor);
    if (avulsoRepasse) avulsoRepasse.value = formatCurrencyValue(rep);
  }

  function openAvulsoModal() {
    if (!avulsoModal) return;
    avulsoMessage.textContent = '';
    avulsoForm.reset();
    renderAvulsoClientes();
    renderAvulsoProcessos();
    avulsoModal.classList.remove('hidden');
    avulsoModal.classList.add('flex');
  }

  function closeAvulsoModal() {
    if (!avulsoModal) return;
    avulsoModal.classList.add('hidden');
    avulsoModal.classList.remove('flex');
  }

  function renderTable() {
    tableBody.innerHTML = processos
      .map((p) => {
        return `
          <tr class="border-b border-stone-200">
            <td class="py-3 whitespace-nowrap">
              <div class="inline-flex items-center gap-1">
                ${renderCopyProcessButton(p.numero_processo)}
                <a class="text-stone-900 hover:text-stone-700 font-medium whitespace-nowrap" href="./processo?id=${p.id}">
                  ${p.numero_processo}
                </a>
              </div>
            </td>
            <td class="py-3 whitespace-nowrap">${p.cliente_nome}</td>
            <td class="py-3">${formatCurrencyValue(p.honorarios)}</td>
            <td class="py-3">${formatCurrencyValue(p.proveito_economico)}</td>
          </tr>
        `;
      })
      .join('');
  }

  function renderTotals(list) {
    const totals = {
      honorarios: 0,
      honorariosLiquidos: 0,
      comissao: 0,
      repasse: 0,
      proveito: 0,
      countHonorarios: 0,
      countLiquidos: 0,
      countComissao: 0,
      countRepasse: 0,
      countProveito: 0,
    };

    list.forEach((p) => {
      const honorarios = parseCurrencyValue(p.honorarios);
      if (honorarios !== null) {
        totals.honorarios += honorarios;
        totals.countHonorarios += 1;
      }
      const liquidos = parseCurrencyValue(p.honorarios_liquidos);
      if (liquidos !== null) {
        totals.honorariosLiquidos += liquidos;
        totals.countLiquidos += 1;
      }
      const comissao = parseCurrencyValue(p.comissao);
      if (comissao !== null) {
        totals.comissao += comissao;
        totals.countComissao += 1;
      }
      const repasse = parseCurrencyValue(p.repasse);
      if (repasse !== null) {
        totals.repasse += repasse;
        totals.countRepasse += 1;
      }
      const proveito = parseCurrencyValue(p.proveito_economico);
      if (proveito !== null) {
        totals.proveito += proveito;
        totals.countProveito += 1;
      }
    });

    if (totalHonorariosEl) totalHonorariosEl.textContent = formatCurrencyValue(totals.honorarios);
    if (totalHonorariosLiquidosEl)
      totalHonorariosLiquidosEl.textContent = formatCurrencyValue(totals.honorariosLiquidos);
    if (totalComissaoEl) totalComissaoEl.textContent = formatCurrencyValue(totals.comissao);
    if (totalRepasseEl) totalRepasseEl.textContent = formatCurrencyValue(totals.repasse);
    if (totalProveitoEl) totalProveitoEl.textContent = formatCurrencyValue(totals.proveito);

    if (countHonorariosEl)
      countHonorariosEl.textContent = `${totals.countHonorarios} processo(s)`;
    if (countLiquidosEl) countLiquidosEl.textContent = `${totals.countLiquidos} processo(s)`;
    if (countComissaoEl) countComissaoEl.textContent = `${totals.countComissao} processo(s)`;
    if (countRepasseEl) countRepasseEl.textContent = `${totals.countRepasse} processo(s)`;
    if (countProveitoEl) countProveitoEl.textContent = `${totals.countProveito} processo(s)`;
  }

  async function fetchAllForTotals(baseParams) {
    const all = [];
    let currentPage = 1;
    const limitTotals = 100;
    let totalPages = 1;
    while (currentPage <= totalPages) {
      const resp = await api.processos.list({ ...baseParams, page: currentPage, limit: limitTotals });
      all.push(...resp.data);
      totalPages = Math.max(1, Math.ceil(resp.total / limitTotals));
      currentPage += 1;
      if (currentPage > 50) break;
    }
    return all;
  }

  async function load() {
    const searchTerm = busca?.value.trim() || '';
    const baseParams = {
      cliente_id: filtroCliente?.value || '',
      status_pagamento: filtroStatus?.value.trim() || '',
      search: searchTerm,
      sort: 'cnj',
      dir: sortDir,
    };
    const processosResp = await api.processos.list({ ...baseParams, page, limit });
    processos = processosResp.data;
    total = processosResp.total;

    const clientesResp = await api.clientes.list({ page: 1, limit: 100 });
    clientes = clientesResp.data;
    const processosAll = await api.processos.list({ page: 1, limit: 200 });
    processosCache = processosAll.data || [];

    const totalPages = Math.max(1, Math.ceil(total / limit));
    if (page > totalPages) {
      page = totalPages;
      return load();
    }

    renderClientesSelect();
    if (info) info.textContent = `${total} resultado(s)`;
    if (paginaAtual) paginaAtual.textContent = `Página ${page} de ${totalPages}`;
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= totalPages;

    renderTable();

    const totalsList = await fetchAllForTotals(baseParams);
    renderTotals(totalsList);
  }

  updateProcessosBadge();
  updateSortLabel();
  await load();

  if (novoHonorarioBtn) {
    novoHonorarioBtn.addEventListener('click', () => openAvulsoModal());
  }
  if (avulsoClose) avulsoClose.addEventListener('click', () => closeAvulsoModal());
  if (avulsoCancel) avulsoCancel.addEventListener('click', () => closeAvulsoModal());
  if (avulsoCliente) {
    avulsoCliente.addEventListener('change', () => {
      renderAvulsoProcessos(avulsoCliente.value);
    });
  }
  if (avulsoValorBase) {
    avulsoValorBase.addEventListener('input', calcularAvulso);
    avulsoValorBase.addEventListener('blur', calcularAvulso);
  }
  if (avulsoPercentual) {
    avulsoPercentual.addEventListener('input', calcularAvulso);
    avulsoPercentual.addEventListener('blur', calcularAvulso);
  }

  if (avulsoForm) {
    avulsoForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      showMessage(avulsoMessage, '');
      if (!avulsoCliente.value) {
        showMessage(avulsoMessage, 'Selecione um cliente.');
        return;
      }
        const processoValue = avulsoProcesso?.value || '';
        const payload = {
          cliente_id: Number(avulsoCliente.value),
          processo_id: processoValue && processoValue !== '-' ? Number(processoValue) : null,
          tipo: avulsoTipo?.value || 'honorarios_contratuais',
          descricao: avulsoDescricao?.value.trim() || '',
          valor_base: avulsoValorBase?.value.trim() || '',
        percentual: avulsoPercentual?.value.trim() || '',
        honorarios_calculados: avulsoHonorarios?.value.trim() || '',
        repasse_calculado: avulsoRepasse?.value.trim() || '',
        previsao_pagamento_mes: avulsoPrevisao?.value || '',
        pago: avulsoPago && avulsoPago.checked ? 'Sim' : 'No',
        repassado: avulsoRepassado && avulsoRepassado.checked ? 'Sim' : 'No',
        divisoes: [],
      };
      try {
        await api.financeiro.createAvulso(payload);
        closeAvulsoModal();
        await load();
      } catch (err) {
        showMessage(avulsoMessage, err.message);
      }
    });
  }

  busca?.addEventListener('input', () => {
    clearTimeout(buscaTimeout);
    buscaTimeout = setTimeout(() => {
      page = 1;
      load();
    }, 300);
  });

  filtroCliente?.addEventListener('change', () => {
    page = 1;
    load();
  });

  filtroStatus?.addEventListener('input', () => {
    page = 1;
    load();
  });

  limitSelect?.addEventListener('change', () => {
    limit = Number(limitSelect.value) || 20;
    page = 1;
    load();
  });

  if (sortBtn) {
    sortBtn.addEventListener('click', () => {
      sortDir = sortDir === 'desc' ? 'asc' : 'desc';
      updateSortLabel();
      page = 1;
      load();
    });
  }

  prevBtn?.addEventListener('click', () => {
    if (page > 1) {
      page -= 1;
      load();
    }
  });

  nextBtn?.addEventListener('click', () => {
    if (page * limit < total) {
      page += 1;
      load();
    }
  });
}

async function initAtividades() {
  await guardAuth();
  bindLogout();
  const canManageAtividades = canCreateDeleteAtividades();

  const columns = {
    a_fazer: qs('#colAFazer'),
    fazendo: qs('#colFazendo'),
    feito: qs('#colFeito'),
    cancelado: qs('#colCancelado'),
  };
  const columnList = Object.values(columns).filter(Boolean);
  const hasKanban = columnList.length > 0;

  const modal = qs('#atividadeModal');
  const detalheModal = qs('#atividadeDetalheModal');
  const detalheClose = qs('#fecharAtividadeDetalhe');
  const detalheEditar = qs('#atividadeDetalheEditar');
  const detalheExcluir = qs('#atividadeDetalheExcluir');
  const detalheTipo = qs('#atividadeDetalheTipo');
  const detalheTitulo = qs('#atividadeDetalheTituloTexto');
  const detalheCliente = qs('#atividadeDetalheCliente');
  const detalheProcesso = qs('#atividadeDetalheProcesso');
  const detalheStatus = qs('#atividadeDetalheStatus');
  const detalhePrioridade = qs('#atividadeDetalhePrioridade');
  const detalhePrazo = qs('#atividadeDetalhePrazo');
  const detalheDescricao = qs('#atividadeDetalheDescricao');
  const openBtn = qs('#novaAtividadeBtn');
  const closeBtn = qs('#fecharAtividadeModal');
  const form = qs('#atividadeForm');
  const formSubmitBtn = form
    ? form.querySelector('button[type="submit"], button:not([type]), input[type="submit"]')
    : null;
  const msg = qs('#atividadeMessage');
  const processoInput = qs('#atividadeProcessoCampo');
  const processoSugestoes = qs('#atividadeProcessoSugestoes');
  const clienteInput = qs('#atividadeClienteCampo');
  const clienteSugestoes = qs('#atividadeClienteSugestoes');
  const clienteHint = qs('#atividadeClienteHint');
  const tipoSelect = qs('#atividadeTipo');
  const filtroProcesso = qs('#atividadeFiltroProcesso');
  const filtroTipo = qs('#atividadeFiltroTipo');
  const filtroPrioridade = qs('#atividadeFiltroPrioridade');
  const busca = qs('#atividadeBusca');
  const limitSelect = qs('#atividadeLimit');
  const sortBtn = qs('#atividadeOrdenar');
  const info = qs('#atividadePaginacaoInfo');
  const prevBtn = qs('#atividadePrev');
  const nextBtn = qs('#atividadeNext');
  const paginaAtual = qs('#atividadePaginaAtual');
  const alertasEl = qs('#atividadeAlertas');
  const resumoTotal = qs('#countAtividadesTotal');
  const resumoAFazer = qs('#countAtividadesAFazer');
  const resumoFazendo = qs('#countAtividadesFazendo');
  const resumoFeito = qs('#countAtividadesFeito');
  const resumoCancelado = qs('#countAtividadesCancelado');
  const colCountAFazer = qs('#countColAFazer');
  const colCountFazendo = qs('#countColFazendo');
  const colCountFeito = qs('#countColFeito');
  const colCountCancelado = qs('#countColCancelado');
  const statusFilters = Array.from(document.querySelectorAll('[data-atividade-status]'));
  const statusColumns = Array.from(document.querySelectorAll('[data-status-column]'));
  const statusFilterWrap = qs('#atividadeStatusFiltro');
  const calendarWrap = qs('#atividadeCalendar');
  const calendarTitle = qs('#atividadeCalendarTitle');
  const calendarHeader = qs('#atividadeCalendarHeader');
  const calendarGridWrap = qs('#atividadeCalendarGridWrap');
  const calendarGrid = qs('#atividadeCalendarGrid');
  const calendarPrev = qs('#atividadeCalendarPrev');
  const calendarNext = qs('#atividadeCalendarNext');
  const calendarToday = qs('#atividadeCalendarToday');
  const calendarViewButtons = qsa('[data-calendar-view]');
  const calendarWeekdaysToggle = qs('#atividadeCalendarWeekdays');
  const calendarHideDoneToggle = qs('#atividadeCalendarHideDone');
  const semDataList = qs('#atividadeSemDataLista');
  const semDataCount = qs('#atividadeSemDataCount');
  const semDataSearch = qs('#atividadeSemDataBusca');
  const prazoHoraToggle = qs('#atividadePrazoHoraToggle');
  const prazoHoraWrap = qs('#atividadePrazoHoraWrap');
  const prazoHoraInput = qs('#atividadePrazoHora');
  const calcPublicacaoInput = qs('#atividadeCalcPublicacao');
  const calcDiasInput = qs('#atividadeCalcDias');
  const calcDiasUteisInput = qs('#atividadeCalcDiasUteis');
  const calcInicioEl = qs('#atividadeCalcInicio');
  const calcResultadoEl = qs('#atividadeCalcResultado');
  const calcAplicarBtn = qs('#atividadeCalcAplicar');
  const atividadeTopTabButtons = qsa('[data-atividade-top-tab]');
  const atividadeTopPanels = qsa('[data-atividade-top-panel]');
  const atividadeViewButtons = qsa('[data-atividade-view]');
  const atividadeViewPanels = qsa('[data-atividade-view-panel]');
  const atividadeListaVisualizacao = qs('#atividadeListaVisualizacao');
  const atividadePrazoLista = qs('#atividadePrazoLista');
  const atividadePaginacaoWrap = qs('#atividadePaginacaoWrap');

  let atividades = [];
  let processos = [];
  let page = 1;
  let limit = Number(limitSelect?.value) || 10;
  let total = 0;
  let buscaTimeout;
  let sortDir = 'desc';
  let statusFiltro = 'a_fazer';
  let atividadeTopTab = 'filtros';
  let atividadeView = 'lista';
  let statusTotals = null;
  const statusTotalsCache = new Map();
  let calendarDate = new Date();
  let calendarToken = 0;
  let calendarView = 'month';
  let calendarWeekdaysOnly = true;
  let calendarHideDone = false;
  let semDataToken = 0;
  let semDataItems = [];
  let calendarActivitiesIndex = new Map();
  let calendarDraggingId = null;
  let calendarIsDragging = false;
  let detalheAtividadeId = null;
  let processoSelecionadoId = null;
  let clienteSelecionadoId = null;
  let processosByNumero = new Map();
  let processosById = new Map();
  let processosIndex = [];
  let processosLoaded = false;
  let processosLoadingPromise = null;
  let clientesIndex = [];
  let clientesById = new Map();
  let clientesByNome = new Map();
  let clientesLoaded = false;
  let clientesLoadingPromise = null;
  let calcUltimaData = null;
  let atividadeFormSubmitting = false;
  const atividadePageParams = new URLSearchParams(window.location.search);
  const atividadePrefillCliente = {
    ativo:
      atividadePageParams.get('novo') === '1' &&
      String(atividadePageParams.get('origem') || '').trim().toLowerCase() === 'cliente',
    clienteId: String(atividadePageParams.get('cliente_id') || '').trim(),
    clienteNome: String(atividadePageParams.get('cliente_nome') || '').trim(),
  };
  const atividadePrefillNovoGenerico =
    atividadePageParams.get('novo') === '1' &&
    String(atividadePageParams.get('origem') || '')
      .trim()
      .toLowerCase() !== 'cliente';

  const tipos = [
    'Audiência',
    'Perícia',
    'Petição inicial',
    'Réplica',
    'Embargos de declaração',
    'Recurso inominado',
    'Cumprimento de sentença',
    'Manifestar ciência',
    'Aceitar acordo',
    'Informar cliente',
    'Responder cliente',
    'Administrativo BPC',
    'Prazo',
    'Melhoria',
  ];

  function getTipoFromTitulo(titulo = '') {
    const text = String(titulo);
    const match = tipos.find((t) => text.startsWith(`${t} - `) || text.startsWith(`${t}: `));
    return match || '';
  }

  function normalizeTipoText(text = '') {
    return String(text)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function getTipoFromAtividade(atividade = {}) {
    const categoriaRaw = String(atividade.categoria || '').trim();
    if (categoriaRaw) {
      const categoriaNorm = normalizeTipoText(categoriaRaw);
      const match = tipos.find(
        (t) =>
          categoriaNorm === normalizeTipoText(t) ||
          categoriaNorm.startsWith(normalizeTipoText(t)) ||
          categoriaNorm.includes(normalizeTipoText(t))
      );
      if (match) return match;
      if (categoriaNorm.includes('audiencia')) return 'Audiência';
      if (categoriaNorm.includes('pericia')) return 'Perícia';
      return categoriaRaw;
    }
    return getTipoFromTitulo(atividade.titulo || '');
  }

  function getTipoAbbr(tipo = '') {
    const cleaned = String(tipo || '')
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .trim();
    if (!cleaned) return 'AT';
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function getTipoIconStyle(tipo = '') {
    const norm = normalizeTipoText(tipo);
    if (norm.includes('audiencia')) return { bg: 'bg-indigo-100', text: 'text-indigo-700' };
    if (norm.includes('pericia')) return { bg: 'bg-amber-100', text: 'text-amber-700' };
    if (norm.includes('peticao') || norm.includes('replica') || norm.includes('embargos')) {
      return { bg: 'bg-emerald-100', text: 'text-emerald-700' };
    }
    if (norm.includes('recurso') || norm.includes('cumprimento') || norm.includes('prazo')) {
      return { bg: 'bg-sky-100', text: 'text-sky-700' };
    }
    if (norm.includes('manifestar') || norm.includes('informar') || norm.includes('responder')) {
      return { bg: 'bg-violet-100', text: 'text-violet-700' };
    }
    if (norm.includes('administrativo') || norm.includes('melhoria')) {
      return { bg: 'bg-stone-100', text: 'text-stone-600' };
    }
    return { bg: 'bg-stone-100', text: 'text-stone-600' };
  }

  function toDateKey(value) {
    if (!value) return '';
    const raw = String(value).trim();
    const isoDateMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
    if (isoDateMatch) {
      return `${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}`;
    }
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }

  function formatMonthTitle(date) {
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  function formatWeekTitle(start, end) {
    const startLabel = start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    const endLabel = end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    return `Semana de ${startLabel} a ${endLabel}`;
  }

  function getStartOfWeek(date, startsOnSunday) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay(); // 0 dom ... 6 sáb
    const diff = startsOnSunday ? day : (day === 0 ? 6 : day - 1);
    d.setDate(d.getDate() - diff);
    return d;
  }

  function applyCalendarViewUI() {
    if (!calendarViewButtons.length) return;
    calendarViewButtons.forEach((btn) => {
      const isActive = btn.dataset.calendarView === calendarView;
      btn.classList.toggle('bg-[#0C1B33]', isActive);
      btn.classList.toggle('text-white', isActive);
      btn.classList.toggle('text-stone-600', !isActive);
      btn.classList.toggle('hover:bg-stone-200', !isActive);
    });
  }

  function setCalendarGridColumns(count) {
    if (!calendarGridWrap) return;
    calendarGridWrap.classList.remove('grid-cols-5', 'grid-cols-7');
    calendarGridWrap.classList.add(count === 5 ? 'grid-cols-5' : 'grid-cols-7');
  }

  function renderCalendarHeader(labels) {
    if (!calendarHeader) return;
    calendarHeader.innerHTML = labels
      .map((label) => `<div class="bg-stone-50 px-2 py-1">${label}</div>`)
      .join('');
  }

  async function fetchCalendarActivities(from, to) {
    const baseParams = {
      page: 1,
      limit: 100,
      processo_id: filtroProcesso.value,
      prioridade: filtroPrioridade.value,
      search: busca.value.trim(),
      sort: 'created_at',
      dir: sortDir,
      prazo_from: from,
      prazo_to: to,
    };
    const first = await api.atividades.list(baseParams);
    let items = first.data || [];
    const totalPages = Math.max(1, Math.ceil((first.total || 0) / (first.limit || 100)));
    for (let p = 2; p <= totalPages; p += 1) {
      const resp = await api.atividades.list({ ...baseParams, page: p });
      items = items.concat(resp.data || []);
    }
    if (filtroTipo?.value) {
      items = items.filter((a) => getTipoFromAtividade(a) === filtroTipo.value);
    }
    if (calendarHideDone) {
      items = items.filter((a) => a.status !== 'feito');
    }
    return items;
  }

  async function fetchSemDataActivities() {
    const baseParams = {
      page: 1,
      limit: 100,
      processo_id: filtroProcesso.value,
      prioridade: filtroPrioridade.value,
      search: busca.value.trim(),
      sort: 'created_at',
      dir: sortDir,
      sem_prazo: 'true',
      status: statusFiltro === 'all' ? '' : statusFiltro,
    };
    const first = await api.atividades.list(baseParams);
    let items = first.data || [];
    const totalPages = Math.max(1, Math.ceil((first.total || 0) / (first.limit || 100)));
    for (let p = 2; p <= totalPages; p += 1) {
      const resp = await api.atividades.list({ ...baseParams, page: p });
      items = items.concat(resp.data || []);
    }
    if (filtroTipo?.value) {
      items = items.filter((a) => getTipoFromAtividade(a) === filtroTipo.value);
    }
    return items;
  }

  function renderSemDataInbox(items) {
    if (!semDataList) return;
    const query = (semDataSearch?.value || '').trim().toLowerCase();
    const filtered = query
      ? items.filter((a) => {
          const hay = [
            a.titulo,
            a.cliente_nome,
            a.numero_processo,
            a.categoria,
            a.orientacoes,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return hay.includes(query);
        })
      : items;

    if (semDataCount) semDataCount.textContent = filtered.length;

    if (!filtered.length) {
      semDataList.innerHTML = '<div class="text-sm text-stone-400">Nenhuma atividade sem data.</div>';
      return;
    }

    const statusLabels = {
      a_fazer: 'A fazer',
      fazendo: 'Fazendo',
      feito: 'Feito',
      cancelado: 'Cancelado',
    };
    const statusDot = {
      a_fazer: 'bg-amber-400',
      fazendo: 'bg-blue-400',
      feito: 'bg-emerald-400',
      cancelado: 'bg-stone-400',
    };

    semDataList.innerHTML = filtered
      .map((a) => {
        const tipoTitulo = getTipoFromAtividade(a) || getTipoFromTitulo(a.titulo || '');
        let displayTitle = tipoTitulo || a.titulo || 'Atividade';
        displayTitle = stripHashSuffix(displayTitle);
        const cliente = a.cliente_nome || 'Sem cliente';
        const numero = a.numero_processo || '-';
        const statusLabel = statusLabels[a.status] || 'A fazer';
        const dotClass = statusDot[a.status] || statusDot.a_fazer;
        return `
          <div
            class="flex items-center justify-between gap-3 py-2 border-b border-stone-100 last:border-b-0 cursor-pointer hover:bg-stone-50 rounded-lg px-2"
            data-semdata-open="${a.id}"
            data-atividade-id="${a.id}"
            draggable="true"
            role="button"
            tabindex="0"
          >
            <div class="min-w-0 pr-2">
              <div class="text-sm text-stone-900 truncate">${displayTitle}</div>
              <div class="text-xs text-stone-500 truncate inline-flex items-center gap-1">
                ${renderCopyProcessButton(numero)}
                <span>${cliente} • ${numero}</span>
              </div>
            </div>
            <div class="flex items-center gap-2 text-[10px] uppercase tracking-wide text-stone-500 shrink-0">
              <div class="flex items-center gap-2">
                <span class="inline-flex h-2 w-2 rounded-full ${dotClass}"></span>
                <span>${statusLabel}</span>
              </div>
              <div class="relative">
                <button
                  type="button"
                  data-semdata-menu-toggle="${a.id}"
                  class="h-7 w-7 inline-flex items-center justify-center rounded-md border border-stone-200 text-stone-500 hover:bg-stone-100"
                  title="Opções"
                  aria-label="Opções"
                >
                  &#x22EE;
                </button>
                <div
                  data-semdata-menu="${a.id}"
                  class="hidden absolute right-0 mt-1 w-28 rounded-lg border border-stone-200 bg-white shadow-lg z-20"
                >
                  <button type="button" data-semdata-assign-date="${a.id}" class="w-full text-left px-3 py-2 text-xs text-stone-700 hover:bg-stone-50">Atribuir data</button>
                  <button type="button" data-semdata-edit="${a.id}" class="w-full text-left px-3 py-2 text-xs text-stone-700 hover:bg-stone-50">Editar</button>
                  ${
                    canManageAtividades
                      ? `<button type="button" data-semdata-remove="${a.id}" class="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50">Excluir</button>`
                      : ''
                  }
                </div>
                <input
                  type="date"
                  data-semdata-date-input="${a.id}"
                  class="absolute right-0 top-full mt-1 h-0 w-0 opacity-0 pointer-events-none"
                  aria-hidden="true"
                  tabindex="-1"
                />
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  async function loadSemDataInbox() {
    if (!semDataList) return;
    const token = (semDataToken += 1);
    let items = [];
    try {
      items = await fetchSemDataActivities();
    } catch (_) {
      items = [];
    }
    if (token !== semDataToken) return;
    semDataItems = items;
    renderSemDataInbox(semDataItems);
  }

  async function renderCalendar() {
    if (!calendarWrap || !calendarGrid || !calendarTitle) return;
    const token = (calendarToken += 1);
    const now = new Date();
    const showWeekdaysOnly = !!calendarWeekdaysOnly;
    const weekStartsOnSunday = !showWeekdaysOnly;
    const labels = showWeekdaysOnly
      ? ['seg.', 'ter.', 'qua.', 'qui.', 'sex.']
      : ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];
    setCalendarGridColumns(labels.length);
    renderCalendarHeader(labels);

    let rangeStart;
    let rangeEnd;
    let year;
    let month;

    if (calendarView === 'week') {
      const weekStart = getStartOfWeek(calendarDate, weekStartsOnSunday);
      const dayCount = showWeekdaysOnly ? 5 : 7;
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + dayCount - 1);
      rangeStart = weekStart;
      rangeEnd = weekEnd;
      calendarTitle.textContent = formatWeekTitle(weekStart, weekEnd);
    } else {
      year = calendarDate.getFullYear();
      month = calendarDate.getMonth();
      rangeStart = new Date(year, month, 1);
      rangeEnd = new Date(year, month + 1, 0);
      calendarTitle.textContent = formatMonthTitle(rangeStart);
    }

    const from = rangeStart.toISOString().slice(0, 10);
    const to = rangeEnd.toISOString().slice(0, 10);
    let activities = [];
    try {
      activities = await fetchCalendarActivities(from, to);
    } catch (_) {
      activities = [];
    }
    if (token !== calendarToken) return;

    calendarActivitiesIndex = new Map(
      activities.filter((a) => a && a.id != null).map((a) => [String(a.id), a])
    );

    const byDate = new Map();
    activities.forEach((a) => {
      const key = toDateKey(a.prazo);
      if (!key) return;
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push(a);
    });

    const todayKey = toDateKey(now);
    const cells = [];

    function buildDayCell(cellDate, inRange, labelText) {
      if (!inRange) {
        return `<div class="bg-stone-50 min-h-[120px] p-2"></div>`;
      }
      const key = toDateKey(cellDate);
      const dayItems = key ? byDate.get(key) || [] : [];
      dayItems.sort((a, b) => {
        const horaA = String(a.prazo_hora || '');
        const horaB = String(b.prazo_hora || '');
        if (horaA && horaB && horaA !== horaB) return horaA.localeCompare(horaB);
        if (horaA && !horaB) return -1;
        if (!horaA && horaB) return 1;
        return String(a.titulo || '').localeCompare(String(b.titulo || ''));
      });
      const maxShow = 3;
      const itemsHtml = dayItems
        .slice(0, maxShow)
        .map((a) => {
          const rawTitle = String(a.titulo || '');
          const tipo = getTipoFromAtividade(a) || getTipoFromTitulo(rawTitle);
          let label = tipo || rawTitle;
          if (!tipo && rawTitle) {
            if (rawTitle.includes(' - ')) label = rawTitle.split(' - ')[0];
            else if (rawTitle.includes(': ')) label = rawTitle.split(': ')[0];
            else if (rawTitle.includes('\n')) label = rawTitle.split('\n')[0];
          }
          label = stripHashSuffix(label || 'Atividade');
          const icon = getTipoAbbr(tipo || label);
          const styles = getTipoIconStyle(tipo || label);
          const cliente = a.cliente_nome || '';
          const hora = a.prazo_hora ? String(a.prazo_hora).slice(0, 5) : '';
          return `
            <button
              type="button"
              draggable="true"
              data-atividade-id="${a.id}"
              title="${label}"
              class="w-full flex items-start justify-start gap-2 border border-stone-200 rounded-md px-2 py-1 bg-white hover:bg-stone-50 cursor-grab text-left"
            >
              <span class="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-semibold ${styles.bg} ${styles.text}">
                ${icon}
              </span>
              <span class="min-w-0 text-left">
                <span class="block text-xs font-medium text-stone-700 truncate">
                  ${label}
                  ${hora ? `<span class="ml-1 text-[10px] text-stone-400 font-normal">${hora}</span>` : ''}
                </span>
                ${cliente ? `<span class="block text-[11px] text-stone-500 truncate">${cliente}</span>` : ''}
              </span>
            </button>
          `;
        })
        .join('');
      const extra =
        dayItems.length > maxShow
          ? `<div class="text-[11px] text-stone-400">+${dayItems.length - maxShow} mais</div>`
          : '';
      return `
        <div
          class="bg-white min-h-[120px] p-2 ${key === todayKey ? 'ring-1 ring-stone-900/20' : ''}"
          data-cal-date="${key}"
        >
          <div class="text-xs font-semibold text-stone-500">${labelText}</div>
          <div class="mt-2 space-y-1">
            ${itemsHtml}
            ${extra}
          </div>
        </div>
      `;
    }

    if (calendarView === 'week') {
      const start = getStartOfWeek(calendarDate, weekStartsOnSunday);
      const dayCount = showWeekdaysOnly ? 5 : 7;
      for (let i = 0; i < dayCount; i += 1) {
        const cellDate = new Date(start);
        cellDate.setDate(start.getDate() + i);
        cells.push(buildDayCell(cellDate, true, cellDate.getDate()));
      }
      calendarGrid.innerHTML = cells.join('');
      return;
    }

    year = calendarDate.getFullYear();
    month = calendarDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    if (showWeekdaysOnly) {
      const weekdayOrder = [1, 2, 3, 4, 5]; // seg..sex
      let firstWeekday = null;
      for (let d = 1; d <= lastDay.getDate(); d += 1) {
        const date = new Date(year, month, d);
        if (weekdayOrder.includes(date.getDay())) {
          firstWeekday = date;
          break;
        }
      }
      const offset = firstWeekday ? weekdayOrder.indexOf(firstWeekday.getDay()) : 0;
      for (let i = 0; i < offset; i += 1) {
        cells.push('<div class="bg-stone-50 min-h-[120px] p-2"></div>');
      }
      for (let d = 1; d <= lastDay.getDate(); d += 1) {
        const cellDate = new Date(year, month, d);
        if (!weekdayOrder.includes(cellDate.getDay())) continue;
        cells.push(buildDayCell(cellDate, true, d));
      }
      while (cells.length % 5 !== 0) {
        cells.push('<div class="bg-stone-50 min-h-[120px] p-2"></div>');
      }
      calendarGrid.innerHTML = cells.join('');
      return;
    }

    const startWeekDay = firstDay.getDay(); // dom=0
    const totalCells = Math.ceil((startWeekDay + lastDay.getDate()) / 7) * 7;
    for (let i = 0; i < totalCells; i += 1) {
      const dayNum = i - startWeekDay + 1;
      const cellDate = new Date(year, month, dayNum);
      const inMonth = dayNum >= 1 && dayNum <= lastDay.getDate();
      cells.push(buildDayCell(cellDate, inMonth, inMonth ? dayNum : ''));
    }

    calendarGrid.innerHTML = cells.join('');
  }

  function buildTituloFromTipo(tipo, tituloAtual) {
    if (!tipo) return tituloAtual;
    const clean = String(tituloAtual || '').trim();
    if (clean && getTipoFromTitulo(clean)) return clean;
    if (clean) return `${tipo} - ${clean}`;
    return `${tipo} - `;
  }

  function stripHashSuffix(text) {
    return String(text || '').replace(/\s+[a-f0-9]{16,}$/i, '').trim();
  }

  function getPrazoInfo(prazo) {
    if (!prazo) return null;
    const data = new Date(prazo);
    if (Number.isNaN(data.getTime())) return null;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    data.setHours(0, 0, 0, 0);
    const diff = Math.round((data - hoje) / (1000 * 60 * 60 * 24));
    return { diff, data };
  }

  function formatPrazoDetalhe(prazo, hora) {
    if (!prazo) return 'Sem data';
    const formatted = formatDateOptionalTime(prazo, hora);
    return formatted === '-' ? 'Sem data' : formatted;
  }

  function syncPrazoHoraVisibility() {
    if (!prazoHoraToggle || !prazoHoraWrap) return;
    const show = prazoHoraToggle.checked;
    prazoHoraWrap.classList.toggle('hidden', !show);
    if (!show && prazoHoraInput) prazoHoraInput.value = '';
  }

  function setPrazoHoraFromAtividade(atividade) {
    if (!prazoHoraToggle || !prazoHoraInput) return;
    const hora = atividade?.prazo_hora ? String(atividade.prazo_hora).slice(0, 5) : '';
    prazoHoraToggle.checked = Boolean(hora);
    prazoHoraInput.value = hora;
    syncPrazoHoraVisibility();
  }

  function resetPrazoHora() {
    if (!prazoHoraToggle || !prazoHoraInput) return;
    prazoHoraToggle.checked = false;
    prazoHoraInput.value = '';
    syncPrazoHoraVisibility();
  }

  function initAtividadePrazoCalculator() {
    if (!calcPublicacaoInput || !calcDiasInput || !calcInicioEl || !calcResultadoEl) return;

    const formatLong = (date) =>
      date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    const formatWeekday = (date) => date.toLocaleDateString('pt-BR', { weekday: 'long' });
    const holidayCache = new Map();

    const dateKey = (date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    const getEasterDate = (year) => {
      const a = year % 19;
      const b = Math.floor(year / 100);
      const c = year % 100;
      const d = Math.floor(b / 4);
      const e = b % 4;
      const f = Math.floor((b + 8) / 25);
      const g = Math.floor((b - f + 1) / 3);
      const h = (19 * a + b - d - g + 15) % 30;
      const i = Math.floor(c / 4);
      const k = c % 4;
      const l = (32 + 2 * e + 2 * i - h - k) % 7;
      const m = Math.floor((a + 11 * h + 22 * l) / 451);
      const month = Math.floor((h + l - 7 * m + 114) / 31);
      const day = ((h + l - 7 * m + 114) % 31) + 1;
      return new Date(year, month - 1, day);
    };

    const getNationalHolidaysForYear = (year) => {
      if (holidayCache.has(year)) return holidayCache.get(year);
      const set = new Set();
      const fixed = [
        [1, 1],
        [4, 21],
        [5, 1],
        [9, 7],
        [10, 12],
        [11, 2],
        [11, 15],
        [12, 25],
      ];

      fixed.forEach(([month, day]) => {
        const d = new Date(year, month - 1, day);
        set.add(dateKey(d));
      });

      if (year >= 2024) {
        const d = new Date(year, 10, 20);
        set.add(dateKey(d));
      }

      const easter = getEasterDate(year);
      const goodFriday = new Date(easter);
      goodFriday.setDate(easter.getDate() - 2);
      set.add(dateKey(goodFriday));

      holidayCache.set(year, set);
      return set;
    };

    const isNationalHoliday = (date) => {
      const set = getNationalHolidaysForYear(date.getFullYear());
      return set.has(dateKey(date));
    };

    const toIsoDate = (date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    const compute = () => {
      const pubVal = calcPublicacaoInput.value;
      const diasVal = Number(calcDiasInput.value);
      if (!pubVal || !Number.isFinite(diasVal) || diasVal < 1) {
        calcInicioEl.textContent = 'Início: -';
        calcResultadoEl.textContent = 'Último dia: -';
        calcUltimaData = null;
        if (calcAplicarBtn) calcAplicarBtn.disabled = true;
        return;
      }

      const [year, month, day] = pubVal.split('-').map(Number);
      const base = new Date(year, month - 1, day);
      if (Number.isNaN(base.getTime())) {
        calcInicioEl.textContent = 'Início: -';
        calcResultadoEl.textContent = 'Último dia: -';
        calcUltimaData = null;
        if (calcAplicarBtn) calcAplicarBtn.disabled = true;
        return;
      }

      const onlyBusiness = calcDiasUteisInput ? calcDiasUteisInput.checked : true;
      const current = new Date(base);
      current.setHours(0, 0, 0, 0);
      current.setDate(current.getDate() + 1);

      let counted = 0;
      let inicio = null;
      while (counted < diasVal) {
        const dayOfWeek = current.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isHoliday = onlyBusiness ? isNationalHoliday(current) : false;
        const isBusinessDay = !isWeekend && !isHoliday;
        if (!onlyBusiness || isBusinessDay) {
          if (!inicio) inicio = new Date(current);
          counted += 1;
          if (counted === diasVal) break;
        }
        current.setDate(current.getDate() + 1);
      }

      if (!inicio) {
        calcInicioEl.textContent = 'Início: -';
        calcResultadoEl.textContent = 'Último dia: -';
        calcUltimaData = null;
        if (calcAplicarBtn) calcAplicarBtn.disabled = true;
        return;
      }

      calcInicioEl.textContent = `Início: ${formatLong(inicio)} (${formatWeekday(inicio)})`;
      calcResultadoEl.textContent = `Último dia: ${formatLong(current)} (${formatWeekday(current)})`;
      calcUltimaData = new Date(current);
      if (calcAplicarBtn) calcAplicarBtn.disabled = false;
      if (!qs('#atividadePrazo').value) qs('#atividadePrazo').value = toIsoDate(current);
    };

    calcPublicacaoInput.addEventListener('input', compute);
    calcDiasInput.addEventListener('input', compute);
    if (calcDiasUteisInput) calcDiasUteisInput.addEventListener('change', compute);
    if (calcAplicarBtn) {
      calcAplicarBtn.addEventListener('click', () => {
        if (!calcUltimaData) return;
        qs('#atividadePrazo').value = toIsoDate(calcUltimaData);
      });
    }
    compute();
  }

  function resetAtividadePrazoCalculator() {
    if (!calcPublicacaoInput || !calcDiasInput || !calcInicioEl || !calcResultadoEl) return;
    calcPublicacaoInput.value = '';
    calcDiasInput.value = '';
    if (calcDiasUteisInput) calcDiasUteisInput.checked = true;
    calcInicioEl.textContent = 'Início: -';
    calcResultadoEl.textContent = 'Último dia: -';
    calcUltimaData = null;
    if (calcAplicarBtn) calcAplicarBtn.disabled = true;
  }

  function openAtividadeDetalhe(atividade) {
    if (!detalheModal) return;
    const tipo = getTipoFromAtividade(atividade) || getTipoFromTitulo(atividade.titulo || '') || 'Atividade';
    const titulo = stripHashSuffix(atividade.titulo || '') || tipo;
    const cliente = atividade.cliente_nome || 'Sem cliente';
    const processo = atividade.numero_processo || 'Sem processo';
    const statusLabel = {
      a_fazer: 'A fazer',
      fazendo: 'Fazendo',
      feito: 'Feito',
      cancelado: 'Cancelado',
    }[atividade.status] || 'A fazer';
    const prioridadeLabel = { baixa: 'Baixa', media: 'Média', alta: 'Alta' }[atividade.prioridade] || 'Média';
    const descricao = atividade.descricao || atividade.orientacoes || 'Sem descrição';

    if (detalheTipo) detalheTipo.textContent = tipo;
    if (detalheTitulo) detalheTitulo.textContent = titulo;
    if (detalheCliente) detalheCliente.textContent = cliente;
    if (detalheProcesso) {
      detalheProcesso.innerHTML = `${renderCopyProcessButton(processo)} <span>${processo}</span>`;
      if (atividade.processo_id) {
        detalheProcesso.setAttribute('href', `./processo?id=${atividade.processo_id}`);
        detalheProcesso.classList.add('text-blue-600', 'hover:underline', 'underline-offset-2');
        detalheProcesso.classList.remove('text-stone-700', 'text-stone-600');
        detalheProcesso.removeAttribute('aria-disabled');
      } else {
        detalheProcesso.removeAttribute('href');
        detalheProcesso.classList.remove('text-blue-600', 'hover:underline', 'underline-offset-2');
        detalheProcesso.classList.add('text-stone-600');
        detalheProcesso.setAttribute('aria-disabled', 'true');
      }
    }
    if (detalheStatus) detalheStatus.textContent = statusLabel;
    if (detalhePrioridade) detalhePrioridade.textContent = prioridadeLabel;
    if (detalhePrazo) detalhePrazo.textContent = formatPrazoDetalhe(atividade.prazo, atividade.prazo_hora);
    if (detalheDescricao) detalheDescricao.textContent = descricao;
    detalheAtividadeId = String(atividade.id);

    openModal(detalheModal);
  }

  function openAtividadeEdicao(atividade) {
    if (!atividade) return;
    form.dataset.id = atividade.id;
    if (atividade.processo_id) {
      const processoMatch = processosById.get(String(atividade.processo_id)) || {
        id: atividade.processo_id,
        numero_processo: atividade.numero_processo || '',
        cliente_nome: atividade.cliente_nome || '',
        cliente_id: atividade.cliente_id || null,
      };
      applyProcessSelection(processoMatch);
    } else {
      processoSelecionadoId = null;
      if (processoInput) processoInput.value = atividade.numero_processo || '';
      if (clienteInput) clienteInput.value = atividade.cliente_nome || '';
      const clienteMatch = clientesByNome.get(normalizeTipoText(String(atividade.cliente_nome || '').trim()));
      clienteSelecionadoId = clienteMatch ? String(clienteMatch.id) : null;
      setClienteFieldReadOnly(false, false);
    }
    if (processoSugestoes) processoSugestoes.classList.add('hidden');
    if (clienteSugestoes) clienteSugestoes.classList.add('hidden');
    if (tipoSelect) tipoSelect.value = getTipoFromTitulo(atividade.titulo);
    qs('#atividadeTitulo').value = stripHashSuffix(atividade.titulo || '');
    qs('#atividadeDescricao').value = atividade.descricao || '';
    qs('#atividadeStatus').value = atividade.status || 'a_fazer';
    qs('#atividadePrioridade').value = atividade.prioridade || 'media';
    qs('#atividadePrazo').value = atividade.prazo ? normalizeDateValue(atividade.prazo) : '';
    setPrazoHoraFromAtividade(atividade);
    openModal(modal);
  }

  function findAtividadeById(id) {
    if (!id) return null;
    return (
      semDataItems.find((a) => String(a.id) === String(id)) ||
      calendarActivitiesIndex.get(String(id)) ||
      atividades.find((a) => String(a.id) === String(id)) ||
      null
    );
  }

  function closeSemDataMenus() {
    if (!semDataList) return;
    semDataList.querySelectorAll('[data-semdata-menu]').forEach((el) => el.classList.add('hidden'));
  }

  function renderProcessoSugestoes(query = '') {
    if (!processoSugestoes) return;
    const q = normalizeTipoText(query);
    const items = processosIndex
      .filter((p) => {
        if (!q) return true;
        const numero = normalizeTipoText(p.numero_processo || '');
        const cliente = normalizeTipoText(p.cliente_nome || '');
        return numero.includes(q) || cliente.includes(q);
      })
      .slice(0, 12);

    if (!items.length) {
      processoSugestoes.innerHTML =
        '<div class="px-3 py-2 text-sm text-stone-400">Nenhum processo encontrado.</div>';
      return;
    }

    processoSugestoes.innerHTML = items
      .map(
        (p) => `
          <button type="button" data-processo-id="${p.id}" data-processo-numero="${p.numero_processo}" data-processo-cliente-id="${p.cliente_id || ''}" data-processo-cliente-nome="${p.cliente_nome || ''}" class="w-full text-left px-3 py-2 hover:bg-stone-50">
            <div class="text-sm font-medium text-stone-800">${p.numero_processo}</div>
            <div class="text-xs text-stone-500">${p.cliente_nome || ''}</div>
          </button>
        `
      )
      .join('');
  }

  async function ensureClientesLoaded() {
    if (clientesLoaded) return;
    if (clientesLoadingPromise) return clientesLoadingPromise;
    clientesLoadingPromise = (async () => {
      const all = [];
      let clientePage = 1;
      const clienteLimit = 100;
      while (true) {
        const resp = await api.clientes.list({ page: clientePage, limit: clienteLimit, sort: 'nome', dir: 'asc' });
        const rows = resp?.data || [];
        all.push(...rows);
        if (rows.length < clienteLimit) break;
        clientePage += 1;
        if (clientePage > 50) break;
      }
      clientesIndex = all;
      clientesById = new Map();
      clientesByNome = new Map();
      all.forEach((c) => {
        clientesById.set(String(c.id), c);
        if (c.nome) clientesByNome.set(normalizeTipoText(c.nome), c);
      });
      clientesLoaded = true;
      clientesLoadingPromise = null;
    })();
    return clientesLoadingPromise;
  }

  async function ensureProcessosLoaded() {
    if (processosLoaded) return;
    if (processosLoadingPromise) return processosLoadingPromise;
    processosLoadingPromise = (async () => {
      const all = [];
      let processoPage = 1;
      const processoLimit = 100;
      while (true) {
        const resp = await api.processos.list({ page: processoPage, limit: processoLimit });
        const rows = resp?.data || [];
        all.push(...rows);
        if (rows.length < processoLimit) break;
        processoPage += 1;
        if (processoPage > 50) break;
      }
      processos = all;
      processosLoaded = true;
      processosLoadingPromise = null;
      renderProcessosSelect();
    })();
    return processosLoadingPromise;
  }

  function setClienteFieldReadOnly(isReadOnly, lockedByProcess = false) {
    if (!clienteInput) return;
    clienteInput.readOnly = !!isReadOnly;
    clienteInput.classList.toggle('bg-stone-100', !!isReadOnly);
    if (clienteHint) {
      clienteHint.textContent = lockedByProcess
        ? 'Cliente preenchido automaticamente pelo processo selecionado.'
        : 'Sem processo selecionado: busque o cliente por nome.';
    }
  }

  function applyProcessSelection(processo) {
    if (!processo) {
      processoSelecionadoId = null;
      if (processoInput && !processoInput.value.trim()) processoInput.value = '';
      setClienteFieldReadOnly(false, false);
      return;
    }
    processoSelecionadoId = String(processo.id);
    if (processoInput) processoInput.value = processo.numero_processo || '';
    if (clienteInput) clienteInput.value = processo.cliente_nome || '';
    clienteSelecionadoId = processo.cliente_id ? String(processo.cliente_id) : null;
    setClienteFieldReadOnly(true, true);
    if (processoSugestoes) processoSugestoes.classList.add('hidden');
    if (clienteSugestoes) clienteSugestoes.classList.add('hidden');
  }

  async function openNovaAtividadeModal(prefill = {}) {
    form.reset();
    form.dataset.id = '';
    atividadeFormSubmitting = false;
    showMessage(msg, '');
    if (formSubmitBtn) {
      formSubmitBtn.disabled = false;
      formSubmitBtn.classList.remove('opacity-60', 'cursor-not-allowed');
    }

    await Promise.all([ensureProcessosLoaded().catch(() => {}), ensureClientesLoaded().catch(() => {})]);
    renderProcessosSelect();

    const tipoPrefill = String(prefill.tipo || '').trim();
    if (tipoSelect) tipoSelect.value = tipoPrefill;
    const tituloEl = qs('#atividadeTitulo');
    if (tituloEl) {
      tituloEl.value = buildTituloFromTipo(tipoPrefill, String(prefill.titulo || '').trim());
    }

    if (processoInput) processoInput.value = '';
    if (clienteInput) clienteInput.value = '';
    processoSelecionadoId = null;
    clienteSelecionadoId = null;
    setClienteFieldReadOnly(false, false);

    const prefillClienteId = prefill.clienteId ? String(prefill.clienteId) : '';
    const prefillClienteNome = String(prefill.clienteNome || '').trim();
    if (prefillClienteId || prefillClienteNome) {
      let match = null;
      if (prefillClienteId) match = clientesById.get(prefillClienteId) || null;
      if (!match && prefillClienteNome) {
        match = clientesByNome.get(normalizeTipoText(prefillClienteNome)) || null;
      }
      if (match) {
        clienteSelecionadoId = String(match.id);
        if (clienteInput) clienteInput.value = match.nome || prefillClienteNome;
      } else {
        clienteSelecionadoId = prefillClienteId || null;
        if (clienteInput) clienteInput.value = prefillClienteNome;
      }
    }

    resetPrazoHora();
    resetAtividadePrazoCalculator();
    if (processoSugestoes) processoSugestoes.classList.add('hidden');
    if (clienteSugestoes) clienteSugestoes.classList.add('hidden');
    openModal(modal);
  }

  function renderClienteSugestoes(query = '') {
    if (!clienteSugestoes) return;
    const q = normalizeTipoText(query);
    const items = clientesIndex
      .filter((c) => {
        if (!q) return true;
        return normalizeTipoText(c.nome || '').includes(q);
      })
      .slice(0, 12);

    if (!items.length) {
      clienteSugestoes.innerHTML =
        '<div class="px-3 py-2 text-sm text-stone-400">Nenhum cliente encontrado.</div>';
      return;
    }

    clienteSugestoes.innerHTML = items
      .map(
        (c) => `
          <button type="button" data-cliente-id="${c.id}" data-cliente-nome="${c.nome || ''}" class="w-full text-left px-3 py-2 hover:bg-stone-50">
            <div class="text-sm font-medium text-stone-800">${c.nome || ''}</div>
          </button>
        `
      )
      .join('');
  }

  function updateSortLabel() {
    if (!sortBtn) return;
    const asc = sortDir === 'asc';
    sortBtn.textContent = asc ? '▲' : '▼';
    sortBtn.title = asc ? 'Mais antigas' : 'Mais recentes';
    sortBtn.setAttribute('aria-label', sortBtn.title);
  }

  function applyStatusFilterUI() {
    statusFilters.forEach((btn) => {
      const active = btn.dataset.atividadeStatus === statusFiltro;
      btn.classList.toggle('bg-[#0C1B33]', active);
      btn.classList.toggle('text-white', active);
      btn.classList.toggle('border-stone-900', active);
      btn.classList.toggle('bg-white', !active);
      btn.classList.toggle('text-stone-700', !active);
      btn.classList.toggle('border-stone-300', !active);
    });
    statusColumns.forEach((col) => {
      if (statusFiltro === 'all') {
        col.classList.remove('hidden');
        return;
      }
      col.classList.toggle('hidden', col.dataset.statusColumn !== statusFiltro);
    });
  }

  function applyTopTabsUI() {
    atividadeTopTabButtons.forEach((btn) => {
      const isActive = btn.dataset.atividadeTopTab === atividadeTopTab;
      btn.classList.toggle('is-active', isActive);
    });
    atividadeTopPanels.forEach((panel) => {
      const panelKey = panel.dataset.atividadeTopPanel;
      panel.classList.toggle('hidden', panelKey !== atividadeTopTab);
    });
  }

  function applyViewTabsUI() {
    atividadeViewButtons.forEach((btn) => {
      const isActive = btn.dataset.atividadeView === atividadeView;
      btn.classList.toggle('is-active', isActive);
    });
    atividadeViewPanels.forEach((panel) => {
      const panelKey = panel.dataset.atividadeViewPanel;
      panel.classList.toggle('hidden', panelKey !== atividadeView);
    });
    if (atividadePaginacaoWrap) {
      atividadePaginacaoWrap.classList.toggle('hidden', !['lista', 'prazo'].includes(atividadeView));
    }
  }

  function renderAtividadesListaViews(items = []) {
    if (!atividadeListaVisualizacao && !atividadePrazoLista) return;
    const statusLabel = {
      a_fazer: 'A fazer',
      fazendo: 'Fazendo',
      feito: 'Feito',
      cancelado: 'Cancelado',
    };
    const statusDot = {
      a_fazer: 'bg-amber-400',
      fazendo: 'bg-blue-400',
      feito: 'bg-emerald-400',
      cancelado: 'bg-stone-400',
    };

    const renderRows = (target, source, emptyText) => {
      if (!target) return;
      if (!source.length) {
        target.innerHTML = `<div class="py-4 text-sm text-stone-400">${emptyText}</div>`;
        return;
      }
      target.innerHTML = source
        .map((a) => {
          const rawTitle = String(a.titulo || '').trim();
          const tipo = getTipoFromAtividade(a) || getTipoFromTitulo(rawTitle) || 'Atividade';
          const title = stripHashSuffix(rawTitle || tipo);
          const processo = a.numero_processo || '-';
          const cliente = a.cliente_nome || 'Sem cliente';
          const prazo = formatDateOptionalTime(a.prazo, a.prazo_hora);
          const label = statusLabel[a.status] || 'A fazer';
          const dot = statusDot[a.status] || statusDot.a_fazer;
          return `
            <div class="py-3 flex items-start justify-between gap-3 hover:bg-stone-50 rounded-lg px-2" data-atividade-list-open="${a.id}" role="button" tabindex="0">
              <div class="min-w-0">
                <div class="text-sm font-medium text-stone-900 truncate">${title}</div>
                <div class="text-xs text-stone-500 mt-1 inline-flex items-center gap-1">
                  ${renderCopyProcessButton(processo)}
                  <span>${cliente} • ${processo}</span>
                </div>
              </div>
              <div class="text-right shrink-0">
                <div class="text-xs text-stone-500">${prazo === '-' ? 'Sem data' : prazo}</div>
                <div class="mt-1 inline-flex items-center gap-2 text-[11px] uppercase tracking-wide text-stone-500">
                  <span class="inline-flex h-2 w-2 rounded-full ${dot}"></span>
                  <span>${label}</span>
                </div>
              </div>
            </div>
          `;
        })
        .join('');
    };

    const listaItems = [...items];
    renderRows(atividadeListaVisualizacao, listaItems, 'Nenhuma atividade para esta visualização.');

    const prazoItems = [...items].sort((a, b) => {
      const keyA = toDateKey(a.prazo);
      const keyB = toDateKey(b.prazo);
      if (!keyA && !keyB) return String(a.titulo || '').localeCompare(String(b.titulo || ''));
      if (!keyA) return 1;
      if (!keyB) return -1;
      if (keyA !== keyB) return keyA.localeCompare(keyB);
      const horaA = String(a.prazo_hora || '');
      const horaB = String(b.prazo_hora || '');
      if (horaA && horaB && horaA !== horaB) return horaA.localeCompare(horaB);
      if (horaA && !horaB) return -1;
      if (!horaA && horaB) return 1;
      return String(a.titulo || '').localeCompare(String(b.titulo || ''));
    });
    renderRows(atividadePrazoLista, prazoItems, 'Nenhuma atividade com prazo na página atual.');
  }

  async function fetchStatusTotals() {
    if (filtroTipo?.value) return null;
    const filtroProcessoValue = filtroProcesso?.value || '';
    const semProcesso = filtroProcessoValue === 'sem_processo';
    const key = [
      filtroProcessoValue,
      filtroPrioridade?.value || '',
      busca?.value?.trim() || '',
    ].join('|');
    if (statusTotalsCache.has(key)) return statusTotalsCache.get(key);

    const baseParams = {
      page: 1,
      limit: 1,
      processo_id: semProcesso ? '' : filtroProcessoValue,
      sem_processo: semProcesso ? 'true' : '',
      prioridade: filtroPrioridade.value,
      search: busca.value.trim(),
      sort: 'created_at',
      dir: sortDir,
    };

    const [af, fz, fe, ca] = await Promise.all([
      api.atividades.list({ ...baseParams, status: 'a_fazer' }),
      api.atividades.list({ ...baseParams, status: 'fazendo' }),
      api.atividades.list({ ...baseParams, status: 'feito' }),
      api.atividades.list({ ...baseParams, status: 'cancelado' }),
    ]);

    const totals = {
      a_fazer: af.total || 0,
      fazendo: fz.total || 0,
      feito: fe.total || 0,
      cancelado: ca.total || 0,
    };
    statusTotalsCache.set(key, totals);
    return totals;
  }

  function renderProcessosSelect() {
    const source = Array.isArray(processos) ? [...processos] : [];
    processosByNumero = new Map();
    processosById = new Map();
    processosIndex = source;
    source.forEach((p) => {
      if (p.numero_processo) processosByNumero.set(String(p.numero_processo), p);
      processosById.set(String(p.id), p);
    });

    renderProcessoSugestoes('');
    filtroProcesso.innerHTML = ['<option value="">Todos os processos</option>', '<option value="sem_processo">Sem processo</option>']
      .concat(
        source.map((p) => `<option value="${p.id}">${p.numero_processo} - ${p.cliente_nome}</option>`)
      )
      .join('');
  }

  function renderKanban() {
    const tipoFiltro = filtroTipo?.value || '';
    const atividadesFiltradas = tipoFiltro
      ? atividades.filter((a) => getTipoFromAtividade(a) === tipoFiltro)
      : atividades;

    const statusCounts = {
      a_fazer: 0,
      fazendo: 0,
      feito: 0,
      cancelado: 0,
    };

    if (hasKanban) {
      columnList.forEach((col) => (col.innerHTML = ''));
    }

    atividadesFiltradas.forEach((a) => {
      if (statusCounts[a.status] !== undefined) statusCounts[a.status] += 1;
      if (!hasKanban) return;
      const card = document.createElement('div');
      card.className = 'bg-white border border-stone-200 rounded-2xl p-4 shadow-sm';
      const prazoInfo = getPrazoInfo(a.prazo);
      let prazoLabel = '';
      let prazoClass = 'text-xs text-stone-500';
      const prioridadeLabel = { baixa: 'Baixa', media: 'Média', alta: 'Alta' }[a.prioridade] || 'Sem';
      const prioridadeClass = {
        baixa: 'bg-stone-100 text-stone-600 border-stone-200',
        media: 'bg-amber-100 text-amber-700 border-amber-200',
        alta: 'bg-red-100 text-red-700 border-red-200',
      }[a.prioridade] || 'bg-stone-100 text-stone-600 border-stone-200';
      if (prazoInfo) {
        if (prazoInfo.diff < 0) {
          prazoLabel = `Atrasado ${Math.abs(prazoInfo.diff)} dia(s)`;
          prazoClass = 'text-xs text-red-600';
        } else if (prazoInfo.diff === 0) {
          prazoLabel = 'Vence hoje';
          prazoClass = 'text-xs text-amber-600';
        } else if (prazoInfo.diff <= 7) {
          prazoLabel = `Em ${prazoInfo.diff} dia(s)`;
          prazoClass = 'text-xs text-amber-600';
        } else {
          prazoLabel = `Em ${prazoInfo.diff} dia(s)`;
        }
      }
      const rawTitle = String(a.titulo || '');
      const tipoTitulo = getTipoFromAtividade(a) || getTipoFromTitulo(rawTitle);
      let displayTitle = rawTitle;
      if (tipoTitulo) {
        displayTitle = tipoTitulo;
      } else if (rawTitle.includes(' - ')) {
        displayTitle = rawTitle.split(' - ')[0];
      } else if (rawTitle.includes(': ')) {
        displayTitle = rawTitle.split(': ')[0];
      } else if (rawTitle.includes('\n')) {
        displayTitle = rawTitle.split('\n')[0];
      }
      displayTitle = stripHashSuffix(displayTitle);

      card.innerHTML = `
        <div class="text-sm text-stone-500 flex items-center gap-1">
          ${renderCopyProcessButton(a.numero_processo)}
          <span>${a.numero_processo} - ${a.cliente_nome}</span>
        </div>
        <div class="font-medium mt-1">${displayTitle}</div>
        <div class="mt-2 flex items-center gap-2 flex-wrap">
          <span class="text-[11px] uppercase tracking-wide border rounded-full px-2 py-0.5 ${prioridadeClass}">${prioridadeLabel}</span>
          ${prazoLabel ? `<span class="${prazoClass}">${prazoLabel}</span>` : ''}
        </div>
        <div class="mt-3 flex items-center justify-between">
          <select class="text-xs border border-stone-200 rounded px-2 py-1" data-status="${a.id}">
            <option value="a_fazer" ${a.status === 'a_fazer' ? 'selected' : ''}>A fazer</option>
            <option value="fazendo" ${a.status === 'fazendo' ? 'selected' : ''}>Fazendo</option>
            <option value="feito" ${a.status === 'feito' ? 'selected' : ''}>Feito</option>
            <option value="cancelado" ${a.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
          </select>
          <div class="text-right">
            <button class="text-xs text-blue-600 mr-2" data-edit="${a.id}">Editar</button>
            ${canManageAtividades ? `<button class="text-xs text-red-600" data-remove="${a.id}">Excluir</button>` : ''}
          </div>
        </div>
      `;
      columns[a.status]?.appendChild(card);
    });

    const usePageCounts = Boolean(tipoFiltro) || !statusTotals;
    const counts = usePageCounts ? statusCounts : statusTotals;
    const totalSum = statusTotals
      ? Object.values(statusTotals).reduce((acc, val) => acc + Number(val || 0), 0)
      : total;
    if (colCountAFazer) colCountAFazer.textContent = counts.a_fazer;
    if (colCountFazendo) colCountFazendo.textContent = counts.fazendo;
    if (colCountFeito) colCountFeito.textContent = counts.feito;
    if (colCountCancelado) colCountCancelado.textContent = counts.cancelado;
    if (resumoTotal)
      resumoTotal.textContent = usePageCounts ? atividadesFiltradas.length : totalSum;
    if (resumoAFazer) resumoAFazer.textContent = counts.a_fazer;
    if (resumoFazendo) resumoFazendo.textContent = counts.fazendo;
    if (resumoFeito) resumoFeito.textContent = counts.feito;
    if (resumoCancelado) resumoCancelado.textContent = counts.cancelado;
    renderAtividadesListaViews(atividadesFiltradas);
  }

  async function load() {
    const filtroProcessoValue = filtroProcesso.value;
    const semProcesso = filtroProcessoValue === 'sem_processo';
    const processosRequest = processosLoaded
      ? Promise.resolve({ data: processos })
      : api.processos.list({ page: 1, limit: 100 });
    const [atividadesResp, processosResp] = await Promise.all([
      api.atividades.list({
        page,
        limit,
        processo_id: semProcesso ? '' : filtroProcessoValue,
        sem_processo: semProcesso ? 'true' : '',
        status: statusFiltro === 'all' ? '' : statusFiltro,
        prioridade: filtroPrioridade.value,
        search: busca.value.trim(),
        sort: 'created_at',
        dir: sortDir,
      }),
      processosRequest,
    ]);
    atividades = atividadesResp.data;
    total = atividadesResp.total;
    statusTotals = atividadesResp.status_totals || null;
    if (!statusTotals) {
      try {
        statusTotals = await fetchStatusTotals();
      } catch (_) {
        statusTotals = null;
      }
    }
    if (!processosLoaded) processos = processosResp.data;
    if (alertasEl) {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      let atrasadas = 0;
      let hojeCount = 0;
      let proximas = 0;
      atividades.forEach((a) => {
        if (!a.prazo) return;
        const info = getPrazoInfo(a.prazo);
        if (!info) return;
        if (info.diff < 0) atrasadas += 1;
        if (info.diff === 0) hojeCount += 1;
        if (info.diff > 0 && info.diff <= 7) proximas += 1;
      });
      alertasEl.textContent = `Alertas: ${atrasadas} atrasadas, ${hojeCount} para hoje, ${proximas} nos próximos 7 dias.`;
    }
    const totalPages = Math.max(1, Math.ceil(total / limit));
    if (page > totalPages) {
      page = totalPages;
      return load();
    }
    renderProcessosSelect();
    applyStatusFilterUI();
    info.textContent = `${total} resultado(s)`;
    paginaAtual.textContent = `Página ${page} de ${totalPages}`;
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= totalPages;
    renderKanban();
    renderCalendar();
    loadSemDataInbox();
  }

  updateSortLabel();

  if (openBtn) {
    openBtn.classList.toggle('hidden', !canManageAtividades);
    openBtn.addEventListener('click', () => {
      openNovaAtividadeModal().catch((err) => {
        showMessage(msg, err?.message || 'Erro ao abrir formulário.');
      });
    });
  }

  closeBtn.addEventListener('click', () => closeModal(modal));

  if (prazoHoraToggle) {
    prazoHoraToggle.addEventListener('change', syncPrazoHoraVisibility);
    syncPrazoHoraVisibility();
  }
  initAtividadePrazoCalculator();

  if (detalheClose) {
    detalheClose.addEventListener('click', () => {
      detalheAtividadeId = null;
      closeModal(detalheModal);
    });
  }
  if (detalheModal) {
    detalheModal.addEventListener('click', (e) => {
      if (e.target === detalheModal) {
        detalheAtividadeId = null;
        closeModal(detalheModal);
      }
    });
  }

  if (detalheExcluir) {
    detalheExcluir.classList.toggle('hidden', !canManageAtividades);
    detalheExcluir.addEventListener('click', async () => {
      if (!canManageAtividades) return;
      if (!detalheAtividadeId) return;
      if (!confirm('Deseja excluir esta atividade?')) return;
      try {
        await api.atividades.remove(detalheAtividadeId);
        detalheAtividadeId = null;
        closeModal(detalheModal);
        await load();
      } catch (err) {
        alert(err.message || 'Não foi possível excluir a atividade.');
      }
    });
  }

  if (detalheEditar) {
    detalheEditar.addEventListener('click', () => {
      if (!detalheAtividadeId) return;
      const atividade =
        calendarActivitiesIndex.get(String(detalheAtividadeId)) ||
        atividades.find((a) => String(a.id) === String(detalheAtividadeId));
      if (!atividade) return;
      closeModal(detalheModal);
      openAtividadeEdicao(atividade);
    });
  }

  busca.addEventListener('input', () => {
    clearTimeout(buscaTimeout);
    buscaTimeout = setTimeout(() => {
      page = 1;
      load();
    }, 300);
  });

  filtroProcesso.addEventListener('change', () => {
    page = 1;
    load();
  });

  filtroPrioridade.addEventListener('change', () => {
    page = 1;
    load();
  });

  if (semDataSearch) {
    semDataSearch.addEventListener('input', () => renderSemDataInbox(semDataItems));
  }

  if (semDataList) {
    semDataList.addEventListener('dragstart', (e) => {
      const row = e.target.closest('[data-semdata-open]');
      if (!row) return;
      const id = row.getAttribute('data-semdata-open');
      if (!id) return;
      calendarIsDragging = true;
      calendarDraggingId = id;
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'move';
      }
      row.classList.add('opacity-60');
    });

    semDataList.addEventListener('dragend', (e) => {
      const row = e.target.closest('[data-semdata-open]');
      if (row) row.classList.remove('opacity-60');
      calendarDraggingId = null;
      calendarIsDragging = false;
      if (calendarGrid) {
        calendarGrid.querySelectorAll('[data-cal-date].ring-2').forEach((el) => {
          el.classList.remove('ring-2', 'ring-stone-900/20');
        });
      }
    });

    semDataList.addEventListener('click', async (e) => {
      const toggleBtn = e.target.closest('[data-semdata-menu-toggle]');
      if (toggleBtn) {
        e.stopPropagation();
        const id = toggleBtn.getAttribute('data-semdata-menu-toggle');
        const menu = semDataList.querySelector(`[data-semdata-menu="${id}"]`);
        const isHidden = menu?.classList.contains('hidden');
        closeSemDataMenus();
        if (menu && isHidden) menu.classList.remove('hidden');
        return;
      }

      const editBtn = e.target.closest('[data-semdata-edit]');
      if (editBtn) {
        e.stopPropagation();
        closeSemDataMenus();
        const id = editBtn.getAttribute('data-semdata-edit');
        const atividade = findAtividadeById(id);
        if (atividade) openAtividadeEdicao(atividade);
        return;
      }

      const assignDateBtn = e.target.closest('[data-semdata-assign-date]');
      if (assignDateBtn) {
        e.stopPropagation();
        const id = assignDateBtn.getAttribute('data-semdata-assign-date');
        closeSemDataMenus();
        if (!id) return;
        const input = semDataList.querySelector(`[data-semdata-date-input="${id}"]`);
        if (!input) return;
        input.value = '';
        if (typeof input.showPicker === 'function') input.showPicker();
        else input.focus();
        return;
      }

      const removeBtn = e.target.closest('[data-semdata-remove]');
      if (removeBtn) {
        e.stopPropagation();
        closeSemDataMenus();
        const id = removeBtn.getAttribute('data-semdata-remove');
        if (!id) return;
        if (!confirm('Deseja excluir esta atividade?')) return;
        try {
          await api.atividades.remove(id);
          await load();
        } catch (err) {
          alert(err.message || 'Não foi possível excluir a atividade.');
        }
        return;
      }

      const row = e.target.closest('[data-semdata-open]');
      if (!row) return;
      const id = row.getAttribute('data-semdata-open');
      const atividade = findAtividadeById(id);
      if (atividade) openAtividadeDetalhe(atividade);
    });

    semDataList.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = e.target.closest('[data-semdata-open]');
      if (!row) return;
      e.preventDefault();
      const id = row.getAttribute('data-semdata-open');
      const atividade = findAtividadeById(id);
      if (atividade) openAtividadeDetalhe(atividade);
    });

    semDataList.addEventListener('change', async (e) => {
      const input = e.target.closest('[data-semdata-date-input]');
      if (!input) return;
      const id = input.getAttribute('data-semdata-date-input');
      const targetDate = input.value;
      if (!id || !targetDate) return;
      const atividade = findAtividadeById(id);
      if (!atividade) return;
      try {
        await api.atividades.update(id, {
          ...atividade,
          processo_numero: atividade.processo_numero || atividade.numero_processo || null,
          prazo: targetDate,
        });
        await load();
      } catch (err) {
        alert(err.message || 'Não foi possível atribuir data.');
      } finally {
        input.value = '';
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (!semDataList) return;
    if (e.target.closest('[data-semdata-menu]') || e.target.closest('[data-semdata-menu-toggle]')) return;
    closeSemDataMenus();
  });

  if (processoInput) {
    processoInput.addEventListener('input', async () => {
      await ensureProcessosLoaded().catch(() => {});
      const value = (processoInput.value || '').trim();
      const match = processosByNumero.get(value);
      if (match) {
        applyProcessSelection(match);
      } else {
        processoSelecionadoId = null;
        setClienteFieldReadOnly(false, false);
      }
      renderProcessoSugestoes(value);
      if (processoSugestoes) processoSugestoes.classList.remove('hidden');
    });
    processoInput.addEventListener('blur', () => {
      setTimeout(() => {
        if (processoSugestoes) processoSugestoes.classList.add('hidden');
      }, 150);
      const value = (processoInput.value || '').trim();
      const match = processosByNumero.get(value);
      if (match) applyProcessSelection(match);
    });
    processoInput.addEventListener('focus', async () => {
      await ensureProcessosLoaded().catch(() => {});
      renderProcessoSugestoes((processoInput.value || '').trim());
      if (processoSugestoes) processoSugestoes.classList.remove('hidden');
    });
  }

  if (processoSugestoes) {
    processoSugestoes.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-processo-id]');
      if (!btn) return;
      const numero = btn.getAttribute('data-processo-numero') || '';
      const id = btn.getAttribute('data-processo-id') || '';
      const clienteId = btn.getAttribute('data-processo-cliente-id') || '';
      const clienteNome = btn.getAttribute('data-processo-cliente-nome') || '';
      if (id) {
        applyProcessSelection({
          id,
          numero_processo: numero,
          cliente_id: clienteId || null,
          cliente_nome: clienteNome || '',
        });
      } else {
        processoSelecionadoId = null;
      }
      if (processoInput) processoInput.value = numero;
      processoSugestoes.classList.add('hidden');
    });
  }

  if (clienteInput) {
    clienteInput.addEventListener('input', async () => {
      if (processoSelecionadoId) return;
      await ensureClientesLoaded().catch(() => {});
      const value = (clienteInput.value || '').trim();
      const match = clientesByNome.get(normalizeTipoText(value));
      clienteSelecionadoId = match ? String(match.id) : null;
      renderClienteSugestoes(value);
      if (clienteSugestoes) clienteSugestoes.classList.remove('hidden');
    });
    clienteInput.addEventListener('blur', () => {
      setTimeout(() => {
        if (clienteSugestoes) clienteSugestoes.classList.add('hidden');
      }, 150);
      if (processoSelecionadoId) return;
      const value = (clienteInput.value || '').trim();
      const match = clientesByNome.get(normalizeTipoText(value));
      clienteSelecionadoId = match ? String(match.id) : null;
    });
    clienteInput.addEventListener('focus', async () => {
      if (processoSelecionadoId) return;
      await ensureClientesLoaded().catch(() => {});
      renderClienteSugestoes((clienteInput.value || '').trim());
      if (clienteSugestoes) clienteSugestoes.classList.remove('hidden');
    });
  }

  if (clienteSugestoes) {
    clienteSugestoes.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cliente-id]');
      if (!btn) return;
      const id = btn.getAttribute('data-cliente-id') || '';
      const nome = btn.getAttribute('data-cliente-nome') || '';
      clienteSelecionadoId = id ? String(id) : null;
      if (clienteInput) clienteInput.value = nome;
      clienteSugestoes.classList.add('hidden');
    });
  }

  if (filtroTipo) {
    filtroTipo.addEventListener('change', () => {
      page = 1;
      renderKanban();
    });
  }

  if (atividadeTopTabButtons.length) {
    atividadeTopTabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        atividadeTopTab = btn.dataset.atividadeTopTab || 'filtros';
        applyTopTabsUI();
      });
    });
  }

  if (atividadeViewButtons.length) {
    atividadeViewButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        atividadeView = btn.dataset.atividadeView || 'lista';
        applyViewTabsUI();
      });
    });
  }

  limitSelect.addEventListener('change', () => {
    limit = Number(limitSelect.value) || 10;
    page = 1;
    load();
  });

  if (sortBtn) {
    sortBtn.addEventListener('click', () => {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      updateSortLabel();
      page = 1;
      load();
    });
  }

  const handleStatusClick = (btn) => {
    if (!btn) return;
    statusFiltro = btn.dataset.atividadeStatus || 'a_fazer';
    page = 1;
    applyStatusFilterUI();
    load();
  };

  statusFilters.forEach((btn) => {
    btn.addEventListener('click', () => handleStatusClick(btn));
  });

  if (statusFilterWrap) {
    statusFilterWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-atividade-status]');
      handleStatusClick(btn);
    });
  }

  if (calendarPrev) {
    calendarPrev.addEventListener('click', () => {
      if (calendarView === 'week') {
        const next = new Date(calendarDate);
        next.setDate(next.getDate() - 7);
        calendarDate = next;
      } else {
        calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1);
      }
      renderCalendar();
    });
  }
  if (calendarNext) {
    calendarNext.addEventListener('click', () => {
      if (calendarView === 'week') {
        const next = new Date(calendarDate);
        next.setDate(next.getDate() + 7);
        calendarDate = next;
      } else {
        calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1);
      }
      renderCalendar();
    });
  }
  if (calendarToday) {
    calendarToday.addEventListener('click', () => {
      calendarDate = new Date();
      renderCalendar();
    });
  }

  if (calendarGrid) {
    calendarGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-atividade-id]');
      if (!btn) return;
      if (calendarIsDragging) return;
      const id = btn.dataset.atividadeId || btn.getAttribute('data-atividade-id');
      if (!id) return;
      const atividade =
        calendarActivitiesIndex.get(String(id)) || atividades.find((a) => String(a.id) === String(id));
      if (atividade) openAtividadeDetalhe(atividade);
    });
  }

  if (calendarGrid) {
    const clearDropHighlight = () => {
      calendarGrid.querySelectorAll('[data-cal-date].ring-2').forEach((el) => {
        el.classList.remove('ring-2', 'ring-stone-900/20');
      });
    };

    calendarGrid.addEventListener('dragstart', (e) => {
      const item = e.target.closest('[data-atividade-id]');
      if (!item) return;
      calendarIsDragging = true;
      calendarDraggingId = item.dataset.atividadeId || item.getAttribute('data-atividade-id');
      if (e.dataTransfer && calendarDraggingId) {
        e.dataTransfer.setData('text/plain', calendarDraggingId);
        e.dataTransfer.effectAllowed = 'move';
      }
      item.classList.add('opacity-60');
    });

    calendarGrid.addEventListener('dragend', (e) => {
      const item = e.target.closest('[data-atividade-id]');
      if (item) item.classList.remove('opacity-60');
      calendarDraggingId = null;
      calendarIsDragging = false;
      clearDropHighlight();
    });

    calendarGrid.addEventListener('dragover', (e) => {
      const cell = e.target.closest('[data-cal-date]');
      if (!cell) return;
      e.preventDefault();
      clearDropHighlight();
      cell.classList.add('ring-2', 'ring-stone-900/20');
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    });

    calendarGrid.addEventListener('dragleave', (e) => {
      const cell = e.target.closest('[data-cal-date]');
      if (!cell) return;
      cell.classList.remove('ring-2', 'ring-stone-900/20');
    });

    calendarGrid.addEventListener('drop', async (e) => {
      const cell = e.target.closest('[data-cal-date]');
      if (!cell) return;
      e.preventDefault();
      clearDropHighlight();

      const targetDate = cell.getAttribute('data-cal-date');
      const id =
        (e.dataTransfer && e.dataTransfer.getData('text/plain')) || calendarDraggingId || '';
      if (!id || !targetDate) return;

      const atividade = findAtividadeById(id);
      if (!atividade) return;

      const currentDate = toDateKey(atividade.prazo);
      if (currentDate === targetDate) return;

      try {
        await api.atividades.update(id, {
          ...atividade,
          processo_numero: atividade.processo_numero || atividade.numero_processo || null,
          prazo: targetDate,
        });
        await load();
      } catch (err) {
        alert(err.message || 'Não foi possível mover a atividade.');
      }
    });
  }

  if (calendarWeekdaysToggle) {
    calendarWeekdaysToggle.addEventListener('change', () => {
      calendarWeekdaysOnly = calendarWeekdaysToggle.checked;
      renderCalendar();
    });
  }
  if (calendarHideDoneToggle) {
    calendarHideDoneToggle.addEventListener('change', () => {
      calendarHideDone = calendarHideDoneToggle.checked;
      renderCalendar();
    });
  }

  if (calendarViewButtons.length) {
    calendarViewButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        calendarView = btn.dataset.calendarView || 'month';
        applyCalendarViewUI();
        renderCalendar();
      });
    });
  }

  if (calendarWeekdaysToggle) {
    calendarWeekdaysToggle.checked = true;
    calendarWeekdaysOnly = calendarWeekdaysToggle.checked;
  }
  applyCalendarViewUI();
  applyTopTabsUI();
  applyViewTabsUI();

  prevBtn.addEventListener('click', () => {
    if (page > 1) {
      page -= 1;
      load();
    }
  });

  nextBtn.addEventListener('click', () => {
    if (page * limit < total) {
      page += 1;
      load();
    }
  });

  if (atividadeListaVisualizacao) {
    atividadeListaVisualizacao.addEventListener('click', (e) => {
      if (e.target.closest('[data-copy-process-number]')) return;
      const item = e.target.closest('[data-atividade-list-open]');
      if (!item) return;
      const id = item.getAttribute('data-atividade-list-open');
      const atividade = findAtividadeById(id);
      if (atividade) openAtividadeDetalhe(atividade);
    });
    atividadeListaVisualizacao.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const item = e.target.closest('[data-atividade-list-open]');
      if (!item) return;
      e.preventDefault();
      const id = item.getAttribute('data-atividade-list-open');
      const atividade = findAtividadeById(id);
      if (atividade) openAtividadeDetalhe(atividade);
    });
  }

  if (atividadePrazoLista) {
    atividadePrazoLista.addEventListener('click', (e) => {
      if (e.target.closest('[data-copy-process-number]')) return;
      const item = e.target.closest('[data-atividade-list-open]');
      if (!item) return;
      const id = item.getAttribute('data-atividade-list-open');
      const atividade = findAtividadeById(id);
      if (atividade) openAtividadeDetalhe(atividade);
    });
    atividadePrazoLista.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const item = e.target.closest('[data-atividade-list-open]');
      if (!item) return;
      e.preventDefault();
      const id = item.getAttribute('data-atividade-list-open');
      const atividade = findAtividadeById(id);
      if (atividade) openAtividadeDetalhe(atividade);
    });
  }

  if (hasKanban) {
    columnList.forEach((col) => {
      col.addEventListener('change', async (e) => {
        if (!e.target.dataset.status) return;
        const id = e.target.dataset.status;
        const atividade = atividades.find((a) => String(a.id) === id);
        if (!atividade) return;

        try {
          await api.atividades.update(id, { ...atividade, status: e.target.value });
          await load();
        } catch (err) {
          alert(err.message);
        }
      });

      col.addEventListener('click', (e) => {
        const editId = e.target.dataset.edit;
        const removeId = e.target.dataset.remove;

        if (editId) {
          const atividade = atividades.find((a) => String(a.id) === editId);
          if (!atividade) return;
          openAtividadeEdicao(atividade);
        }

        if (removeId) {
          if (confirm('Deseja excluir esta atividade?')) {
            api.atividades.remove(removeId).then(load).catch((err) => alert(err.message));
          }
        }
      });
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (atividadeFormSubmitting) return;
    showMessage(msg, '');

    const processoValorRaw = (processoInput?.value || '').trim();
    const processoNumero =
      processoValorRaw && processoValorRaw !== '-' ? processoValorRaw : null;
    const processoIdValue = processoSelecionadoId ? Number(processoSelecionadoId) : null;
    const clienteIdValue = clienteSelecionadoId ? Number(clienteSelecionadoId) : null;
    const clienteNomeValue = (clienteInput?.value || '').trim() || null;

    const prazoValue = qs('#atividadePrazo').value || null;
    const prazoHoraValue =
      prazoValue && prazoHoraToggle?.checked ? prazoHoraInput?.value || null : null;

    const payload = {
      processo_id: processoIdValue,
      cliente_id: clienteIdValue,
      processo_numero: processoIdValue ? null : processoNumero,
      cliente_nome: processoIdValue ? null : clienteNomeValue,
      titulo: buildTituloFromTipo(tipoSelect?.value || '', qs('#atividadeTitulo').value.trim()),
      descricao: qs('#atividadeDescricao').value.trim(),
      status: qs('#atividadeStatus').value,
      prioridade: qs('#atividadePrioridade').value,
      prazo: prazoValue,
      prazo_hora: prazoHoraValue,
    };

    atividadeFormSubmitting = true;
    if (formSubmitBtn) {
      formSubmitBtn.disabled = true;
      formSubmitBtn.classList.add('opacity-60', 'cursor-not-allowed');
    }

    try {
      if (form.dataset.id) {
        await api.atividades.update(form.dataset.id, payload);
      } else {
        await api.atividades.create(payload);
      }
      closeModal(modal);
      await load();
    } catch (err) {
      showMessage(msg, err.message);
    } finally {
      atividadeFormSubmitting = false;
      if (formSubmitBtn) {
        formSubmitBtn.disabled = false;
        formSubmitBtn.classList.remove('opacity-60', 'cursor-not-allowed');
      }
    }
  });

  if (tipoSelect) {
    tipoSelect.addEventListener('change', () => {
      const tituloEl = qs('#atividadeTitulo');
      if (!tituloEl) return;
      tituloEl.value = buildTituloFromTipo(tipoSelect.value, tituloEl.value);
    });
  }

  document.querySelectorAll('[data-template]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openNovaAtividadeModal({ tipo: btn.dataset.template || '' }).catch((err) => {
        showMessage(msg, err?.message || 'Erro ao abrir formulário.');
      });
    });
  });

  await load();

  if (atividadePrefillCliente.ativo && (atividadePrefillCliente.clienteId || atividadePrefillCliente.clienteNome)) {
    await openNovaAtividadeModal({
      clienteId: atividadePrefillCliente.clienteId,
      clienteNome: atividadePrefillCliente.clienteNome,
    });
    ['novo', 'origem', 'cliente_id', 'cliente_nome'].forEach((key) => atividadePageParams.delete(key));
    const nextSearch = atividadePageParams.toString();
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`
    );
  } else if (atividadePrefillNovoGenerico && canManageAtividades) {
    await openNovaAtividadeModal();
    ['novo', 'origem'].forEach((key) => atividadePageParams.delete(key));
    const nextSearch = atividadePageParams.toString();
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`
    );
  }
}

async function initPublicacoesDjen() {
  await guardAuth();
  bindLogout();

  const form = qs('#djenFiltroForm');
  const oabPresetGroup = qs('#djenOabPresetGroup');
  const oabCustomInput = qs('#djenOabCustom');
  const ufInput = qs('#djenUf');
  const dataInicioInput = qs('#djenDataInicio');
  const dataFimInput = qs('#djenDataFim');
  const limitInput = qs('#djenLimit');
  const tableBody = qs('#djenTableBody');
  const emptyEl = qs('#djenEmpty');
  const infoEl = qs('#djenInfo');
  const pageEl = qs('#djenPage');
  const prevBtn = qs('#djenPrev');
  const nextBtn = qs('#djenNext');
  const messageEl = qs('#djenMessage');
  const detailModal = qs('#djenDetailModal');
  const detailCloseBtn = qs('#djenDetailClose');
  const detailDataEl = qs('#djenDetailData');
  const detailProcessoEl = qs('#djenDetailProcesso');
  const detailTribunalEl = qs('#djenDetailTribunal');
  const detailOrgaoEl = qs('#djenDetailOrgao');
  const detailTipoEl = qs('#djenDetailTipo');
  const detailAdvogadosEl = qs('#djenDetailAdvogados');
  const detailTextoEl = qs('#djenDetailTexto');
  const detailLinkEl = qs('#djenDetailLink');
  const cadastroModal = qs('#djenCadastroModal');
  const cadastroCloseBtn = qs('#djenCadastroClose');
  const cadastroCancelBtn = qs('#djenCadastroCancel');
  const cadastroSubmitBtn = qs('#djenCadastroSubmit');
  const cadastroProcessoEl = qs('#djenCadastroProcesso');
  const cadastroPartesListEl = qs('#djenCadastroPartesList');
  const cadastroAdvogadosEl = qs('#djenCadastroAdvogados');
  const cadastroMessageEl = qs('#djenCadastroMessage');

  if (!form || !dataInicioInput || !dataFimInput || !tableBody) return;

  const toIsoDate = (value) => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  let selectedOabMode = 'outro';
  let oabsAjustes = [];
  let configAjustes = null;

  const oabModeById = (id) => `oab:${id}`;

  const selectedOabData = () => {
    if (!selectedOabMode.startsWith('oab:')) return null;
    const id = Number(selectedOabMode.split(':')[1]);
    return oabsAjustes.find((item) => Number(item.id) === id) || null;
  };

  const renderOabPresetButtons = () => {
    if (!oabPresetGroup) return;
    const buttons = oabsAjustes
      .filter((item) => item.ativo !== false)
      .map(
        (item) => `
          <button
            type="button"
            data-djen-oab-mode="${oabModeById(item.id)}"
            class="djen-oab-btn h-9 px-3 text-sm rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-50 whitespace-nowrap leading-none"
          >
            ${item.numero}${item.uf ? `/${item.uf}` : ''}
          </button>
        `
      )
      .join('');
    oabPresetGroup.innerHTML = `${buttons}
      <button
        type="button"
        data-djen-oab-mode="outro"
        class="djen-oab-btn h-9 px-3 text-sm rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-50 whitespace-nowrap leading-none"
      >
        Outra OAB
      </button>
    `;
  };

  const setOabButtonState = () => {
    qsa('[data-djen-oab-mode]').forEach((btn) => {
      const active = btn.getAttribute('data-djen-oab-mode') === selectedOabMode;
      btn.classList.toggle('bg-[#0C1B33]', active);
      btn.classList.toggle('text-white', active);
      btn.classList.toggle('border-stone-900', active);
      btn.classList.toggle('text-stone-700', !active);
      btn.classList.toggle('hover:bg-stone-50', !active);
    });
  };

  const applyOabFieldRules = () => {
    const selected = selectedOabData();
    if (selected) {
      if (oabCustomInput) {
        oabCustomInput.value = '';
        oabCustomInput.classList.add('hidden');
      }
      if (ufInput) {
        ufInput.value = String(selected.uf || configAjustes?.djen_uf_padrao || 'BA').toUpperCase();
        ufInput.disabled = true;
      }
      return;
    }

    if (selectedOabMode === 'outro') {
      if (oabCustomInput) {
        oabCustomInput.classList.remove('hidden');
        if (!oabCustomInput.value) oabCustomInput.focus();
      }
      if (ufInput) {
        if (!ufInput.value) ufInput.value = String(configAjustes?.djen_uf_padrao || 'BA').toUpperCase();
        ufInput.disabled = false;
      }
      return;
    }
  };

  if (!dataInicioInput.value || !dataFimInput.value) {
    const now = new Date();
    const end = new Date(now);
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    const today = toIsoDate(end);
    const sevenDaysAgo = toIsoDate(start);
    if (!dataInicioInput.value) dataInicioInput.value = today;
    if (!dataFimInput.value) dataFimInput.value = today;
    dataInicioInput.value = dataInicioInput.value || sevenDaysAgo;
    if (dataInicioInput.value === today) dataInicioInput.value = sevenDaysAgo;
  }

  const loadAjustesDjen = async () => {
    try {
      const [oabsResp, configResp] = await Promise.all([api.ajustes.listOabs(), api.ajustes.getConfig()]);
      oabsAjustes = Array.isArray(oabsResp?.data) ? oabsResp.data : [];
      configAjustes = configResp || null;
    } catch (_) {
      oabsAjustes = [];
      configAjustes = null;
    }

    if (ufInput && !ufInput.value) {
      ufInput.value = String(configAjustes?.djen_uf_padrao || 'BA').toUpperCase();
    }

    renderOabPresetButtons();
    const firstActive = oabsAjustes.find((item) => item.ativo !== false);
    selectedOabMode = firstActive ? oabModeById(firstActive.id) : 'outro';
    setOabButtonState();
    applyOabFieldRules();
  };

  await loadAjustesDjen();

  oabPresetGroup?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-djen-oab-mode]');
    if (!btn) return;
    selectedOabMode = btn.getAttribute('data-djen-oab-mode') || 'outro';
    setOabButtonState();
    applyOabFieldRules();
  });

  let page = 1;
  let total = 0;
  let limit = Number(limitInput?.value) || 20;
  let currentRows = [];
  let cadastroItem = null;
  let cadastroPartes = [];
  let cadastroParteSelecionada = '';

  const escapeHtml = (value) =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const normalizeCompare = (value) =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  const formatAdvogadoLabel = (adv) => {
    const nome = String(adv?.nome || '').trim();
    const uf = String(adv?.uf_oab || '').trim().toUpperCase();
    const numero = String(adv?.numero_oab || '').trim();
    if (!nome && !uf && !numero) return '';
    const oab = [uf, numero].filter(Boolean).join('-');
    return oab ? `${nome || 'Advogado'} (${oab})` : nome;
  };

  const getPartesFromItem = (item) => {
    const destinatarios = Array.isArray(item?.raw?.destinatarios) ? item.raw.destinatarios : [];
    const destinatarioAdvogados = Array.isArray(item?.raw?.destinatarioadvogados)
      ? item.raw.destinatarioadvogados
      : [];
    const map = new Map();

    const ensureParte = (nome, poloRaw) => {
      const nomeClean = String(nome || '').trim();
      const key = normalizeCompare(nomeClean);
      if (!key) return null;
      const polo = String(poloRaw || '').trim().toUpperCase();
      const poloLabel = polo === 'P' ? 'Polo ativo' : polo === 'A' ? 'Polo passivo' : '';
      if (!map.has(key)) {
        map.set(key, {
          nome: nomeClean,
          polo: poloLabel,
          advogados: [],
        });
      } else if (poloLabel && !map.get(key).polo) {
        map.get(key).polo = poloLabel;
      }
      return map.get(key);
    };

    const addAdvogadoToParte = (parte, adv) => {
      if (!parte) return;
      const label = formatAdvogadoLabel(adv);
      if (!label) return;
      const exists = parte.advogados.some((current) => normalizeCompare(current) === normalizeCompare(label));
      if (!exists) parte.advogados.push(label);
    };

    destinatarios.forEach((entry) => {
      const parte = ensureParte(entry?.nome, entry?.polo);
      if (!parte) return;
      if (Array.isArray(entry?.advogados)) {
        entry.advogados.forEach((adv) => addAdvogadoToParte(parte, adv));
      }
      if (entry?.advogado) addAdvogadoToParte(parte, entry.advogado);
    });

    destinatarioAdvogados.forEach((entry) => {
      const nomeDestinatario =
        entry?.destinatario?.nome ||
        entry?.destinatario_nome ||
        entry?.nome_destinatario ||
        '';
      const poloDestinatario = entry?.destinatario?.polo || '';
      const parte = ensureParte(nomeDestinatario, poloDestinatario);
      if (!parte) return;
      addAdvogadoToParte(parte, entry?.advogado);
    });

    return Array.from(map.values());
  };

  const getAdvogadosText = (item) => {
    const list = Array.isArray(item?.advogados) ? item.advogados : [];
    if (!list.length) return '-';
    return list
      .map((adv) => `${adv.nome || '-'} (${adv.uf_oab || '-'}-${adv.numero_oab || '-'})`)
      .join(' | ');
  };

  const renderCadastroPartes = () => {
    if (!cadastroPartesListEl) return;
    if (!cadastroPartes.length) {
      cadastroPartesListEl.innerHTML =
        '<div class="text-sm text-stone-500">Nenhuma parte encontrada nesta publicação.</div>';
      return;
    }
    cadastroPartesListEl.innerHTML = cadastroPartes
      .map(
        (parte, idx) => `
          <label class="flex items-start gap-2 border border-stone-200 rounded-lg px-3 py-2 hover:bg-stone-50">
            <input
              type="radio"
              name="djenCadastroParte"
              value="${escapeHtml(parte.nome)}"
              ${idx === 0 ? 'checked' : ''}
              class="mt-0.5 accent-[#0C1B33]"
            />
            <span>
              <span class="text-stone-900">${escapeHtml(parte.nome)}</span>
              ${parte.polo ? `<span class="block text-xs text-stone-500">${escapeHtml(parte.polo)}</span>` : ''}
              ${
                Array.isArray(parte.advogados) && parte.advogados.length
                  ? `<span class="block text-xs text-stone-500 mt-1">Advogado(s): ${escapeHtml(
                      parte.advogados.join(' | ')
                    )}</span>`
                  : ''
              }
            </span>
          </label>
        `
      )
      .join('');
    cadastroParteSelecionada = cadastroPartes[0]?.nome || '';
  };

  const closeCadastroModal = () => {
    if (!cadastroModal) return;
    cadastroModal.classList.add('hidden');
    cadastroModal.classList.remove('flex');
    cadastroItem = null;
    cadastroPartes = [];
    cadastroParteSelecionada = '';
    showMessage(cadastroMessageEl, '');
  };

  const openCadastroModal = (item) => {
    if (!item || !cadastroModal) return;
    cadastroItem = item;
    cadastroPartes = getPartesFromItem(item);
    cadastroParteSelecionada = cadastroPartes[0]?.nome || '';
    if (cadastroProcessoEl) {
      cadastroProcessoEl.textContent = item.numero_processo_mascara || item.numero_processo || '-';
    }
    if (cadastroAdvogadosEl) {
      cadastroAdvogadosEl.textContent = getAdvogadosText(item);
    }
    renderCadastroPartes();
    showMessage(cadastroMessageEl, '');
    if (cadastroSubmitBtn) cadastroSubmitBtn.disabled = !cadastroPartes.length;
    if (!cadastroPartes.length) {
      showMessage(cadastroMessageEl, 'Não foi possível identificar as partes desta publicação.');
    }
    cadastroModal.classList.remove('hidden');
    cadastroModal.classList.add('flex');
  };

  const findOrCreateCliente = async (nome) => {
    const searchResp = await api.clientes.list({ page: 1, limit: 30, search: nome });
    const data = Array.isArray(searchResp?.data) ? searchResp.data : [];
    const exact = data.find((c) => normalizeCompare(c.nome) === normalizeCompare(nome));
    if (exact) return exact;
    return api.clientes.create({
      nome,
      status: 'ativo',
      estado: (ufInput?.value || '').trim().toUpperCase() || null,
    });
  };

  const buildParteContraria = (selectedNome) => {
    return cadastroPartes
      .filter((parte) => normalizeCompare(parte.nome) !== normalizeCompare(selectedNome))
      .map((parte) => parte.nome)
      .join('; ');
  };

  const handleCadastroProcesso = async () => {
    if (!cadastroItem) return;
    if (!cadastroParteSelecionada) {
      showMessage(cadastroMessageEl, 'Selecione uma parte para cadastrar como cliente.');
      return;
    }
    const numeroProcesso = String(
      cadastroItem.numero_processo_mascara || cadastroItem.numero_processo || ''
    ).trim();
    if (!numeroProcesso || numeroProcesso === '-') {
      showMessage(cadastroMessageEl, 'Número de processo inválido na publicação.');
      return;
    }

    if (cadastroSubmitBtn) cadastroSubmitBtn.disabled = true;
    showMessage(cadastroMessageEl, 'Cadastrando cliente e processo...', 'sucesso');

    try {
      const cliente = await findOrCreateCliente(cadastroParteSelecionada);
      const payload = {
        cliente_id: Number(cliente.id),
        numero_processo: numeroProcesso,
        status: 'Ativo',
        classe: String(cadastroItem?.raw?.nomeClasse || '').trim(),
        orgao: String(cadastroItem.orgao || '').trim(),
        parte_contraria: buildParteContraria(cadastroParteSelecionada),
      };
      const created = await api.processos.create(payload);
      showMessage(cadastroMessageEl, 'Processo cadastrado com sucesso.', 'sucesso');
      setTimeout(() => {
        window.location.href = `./processo?id=${created.id}`;
      }, 350);
    } catch (err) {
      const existingProcessId = Number(err?.data?.processo_id);
      if (Number.isFinite(existingProcessId) && existingProcessId > 0) {
        showMessage(
          cadastroMessageEl,
          `Esse processo já existe (#${existingProcessId}). Abrindo o cadastro existente...`,
          'sucesso'
        );
        setTimeout(() => {
          window.location.href = `./processo?id=${existingProcessId}`;
        }, 500);
        return;
      }
      showMessage(cadastroMessageEl, err.message || 'Erro ao cadastrar processo.');
      if (cadastroSubmitBtn) cadastroSubmitBtn.disabled = false;
    }
  };

  const openDetail = (item) => {
    if (!item) return;
    const processo = item.numero_processo_mascara || item.numero_processo || '-';
    const advogados = (item.advogados || [])
      .map((adv) => `${adv.nome || '-'} (${adv.uf_oab || '-'}-${adv.numero_oab || '-'})`)
      .join(' | ');

    if (detailDataEl) detailDataEl.textContent = formatDateBR(item.data_disponibilizacao);
    if (detailProcessoEl) detailProcessoEl.textContent = processo;
    if (detailTribunalEl) detailTribunalEl.textContent = item.sigla_tribunal || '-';
    if (detailOrgaoEl) detailOrgaoEl.textContent = item.orgao || '-';
    if (detailTipoEl) detailTipoEl.textContent = item.tipo_comunicacao || '-';
    if (detailAdvogadosEl) detailAdvogadosEl.textContent = advogados || '-';
    if (detailTextoEl) detailTextoEl.textContent = String(item.texto || '').trim() || '-';
    if (detailLinkEl) {
      if (item.link) {
        detailLinkEl.href = item.link;
        detailLinkEl.classList.remove('pointer-events-none', 'opacity-50');
      } else {
        detailLinkEl.href = '#';
        detailLinkEl.classList.add('pointer-events-none', 'opacity-50');
      }
    }
    if (detailModal) {
      detailModal.classList.remove('hidden');
      detailModal.classList.add('flex');
    }
  };

  const closeDetail = () => {
    if (!detailModal) return;
    detailModal.classList.add('hidden');
    detailModal.classList.remove('flex');
  };

  const renderRows = (rows) => {
    currentRows = rows;
    if (!rows.length) {
      tableBody.innerHTML = '';
      emptyEl?.classList.remove('hidden');
      return;
    }

    emptyEl?.classList.add('hidden');
    tableBody.innerHTML = rows
      .map((item, index) => {
        const processo = item.numero_processo_mascara || item.numero_processo || '-';
        const data = formatDateBR(item.data_disponibilizacao);
        const hasLinkedProcess = Boolean(item.processo_encontrado && item.processo_id);
        const clienteVinculado = String(item.processo_cliente_nome || '').trim();
        const processoCell = hasLinkedProcess
          ? `<span class="inline-flex items-center gap-1 whitespace-nowrap">
              <a href="./processo?id=${item.processo_id}" class="text-blue-700 hover:text-blue-900 hover:underline underline-offset-2 font-medium">${escapeHtml(
                processo
              )}</a>
              ${clienteVinculado ? `<span class="text-xs text-stone-500">- ${escapeHtml(clienteVinculado)}</span>` : ''}
            </span>`
          : `<span>${escapeHtml(processo)}</span>`;
        const actions = hasLinkedProcess
          ? `
            <button
              type="button"
              data-djen-view="${index}"
              class="px-3 py-1.5 text-xs rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-50"
            >
              Visualizar
            </button>
          `
          : `
            <button
              type="button"
              data-djen-create="${index}"
              class="px-3 py-1.5 text-xs rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50"
            >
              Cadastrar processo
            </button>
            <button
              type="button"
              data-djen-view="${index}"
              class="px-3 py-1.5 text-xs rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-50"
            >
              Visualizar
            </button>
          `;

        return `
          <tr class="border-b border-stone-200 hover:bg-stone-50/40">
            <td class="py-3 pr-4 text-stone-800 whitespace-nowrap">${escapeHtml(data)}</td>
            <td class="py-3 pr-4 text-stone-800 whitespace-nowrap">${processoCell}</td>
            <td class="py-3 text-right">
              <div class="inline-flex items-center justify-end gap-2">
                ${actions}
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  };

  const updatePager = () => {
    const pages = Math.max(Math.ceil(total / limit), 1);
    if (pageEl) pageEl.textContent = `Página ${page} de ${pages}`;
    if (infoEl) infoEl.textContent = `${total} publicação(ões)`;
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= pages;
  };

  const load = async (targetPage = 1) => {
    limit = Number(limitInput?.value) || 20;
    page = targetPage;
    showMessage(messageEl, 'Buscando publicações...', 'sucesso');
    try {
      const selected = selectedOabData();
      const oabValue = selected ? selected.numero : oabCustomInput?.value?.trim() || '';
      const ufValue = selected
        ? String(selected.uf || configAjustes?.djen_uf_padrao || '').toUpperCase()
        : (ufInput?.value?.trim() || '').toUpperCase();

      const response = await api.publicacoesDjen.list({
        oab: oabValue,
        uf: ufValue,
        data_inicio: dataInicioInput.value,
        data_fim: dataFimInput.value,
        page,
        limit,
      });
      total = Number(response?.total || 0);
      renderRows(response?.data || []);
      showMessage(messageEl, '', 'sucesso');
      updatePager();
    } catch (err) {
      tableBody.innerHTML = '';
      emptyEl?.classList.add('hidden');
      total = 0;
      updatePager();
      showMessage(messageEl, err.message || 'Erro ao buscar publicações do DJEN.');
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await load(1);
  });

  limitInput?.addEventListener('change', () => {
    load(1);
  });

  prevBtn?.addEventListener('click', () => {
    if (page > 1) load(page - 1);
  });

  nextBtn?.addEventListener('click', () => {
    const pages = Math.max(Math.ceil(total / limit), 1);
    if (page < pages) load(page + 1);
  });

  tableBody.addEventListener('click', (event) => {
    const createBtn = event.target.closest('[data-djen-create]');
    if (createBtn) {
      const idx = Number(createBtn.getAttribute('data-djen-create'));
      if (!Number.isFinite(idx)) return;
      openCadastroModal(currentRows[idx]);
      return;
    }

    const btn = event.target.closest('[data-djen-view]');
    if (!btn) return;
    const idx = Number(btn.getAttribute('data-djen-view'));
    if (!Number.isFinite(idx)) return;
    openDetail(currentRows[idx]);
  });

  cadastroPartesListEl?.addEventListener('change', (event) => {
    const target = event.target.closest('input[name="djenCadastroParte"]');
    if (!target) return;
    cadastroParteSelecionada = String(target.value || '').trim();
  });

  cadastroCloseBtn?.addEventListener('click', closeCadastroModal);
  cadastroCancelBtn?.addEventListener('click', closeCadastroModal);
  cadastroSubmitBtn?.addEventListener('click', handleCadastroProcesso);
  cadastroModal?.addEventListener('click', (event) => {
    if (event.target === cadastroModal) closeCadastroModal();
  });

  detailCloseBtn?.addEventListener('click', closeDetail);
  detailModal?.addEventListener('click', (event) => {
    if (event.target === detailModal) closeDetail();
  });

  await load(1);
}

async function initClienteDetail() {
  await guardAuth();
  bindLogout();

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const nomeEl = qs('#clienteNome');
  const propsEl = qs('#clienteProps');
  const erroEl = qs('#clienteErro');
  const editBtn = qs('#editarClienteBtn');
  const atividadesBtn = qs('#clienteAtividadesBtn');
  const editModal = qs('#clienteEditModal');
  const editForm = qs('#clienteEditForm');
  const editMsg = qs('#clienteEditMessage');
  const editCancel = qs('#cancelarEditCliente');
  const editClose = qs('#fecharEditCliente');
  const editDataNascimento = qs('#clienteEditDataNascimento');
  const editIdadeInfo = qs('#clienteEditIdadeInfo');
  const editIdadeHidden = qs('#clienteEditIdade');
  const editCep = qs('#clienteEditCep');
  const editEndereco = qs('#clienteEditEndereco');
  const editCidade = qs('#clienteEditCidade');
  const editEstado = qs('#clienteEditEstado');
  const editCpf = qs('#clienteEditCpf');
  const editRg = qs('#clienteEditRg');
  const editResponsaveisList = qs('#clienteEditResponsaveisList');
  const editParceirosList = qs('#clienteEditParceirosList');

  if (!id) {
    erroEl.textContent = 'Cliente não informado.';
    return;
  }

  try {
    const cliente = await api.clientes.get(id);
    const processosResp = await api.processos.list({
      page: 1,
      limit: 200,
      cliente_id: id,
      sort: 'numero_processo',
      dir: 'asc',
    });
    const atividadesResp = await api.atividades.list({
      page: 1,
      limit: 5,
      cliente_id: id,
      sort: 'created_at',
      dir: 'desc',
    });
    const processosLinhas = (processosResp.data || [])
      .filter((p) => p.numero_processo)
      .map(
        (p) =>
          `<div class="inline-flex items-center gap-1">${renderCopyProcessButton(p.numero_processo)}<a class="text-blue-600 hover:text-blue-800" href="./processo?id=${p.id}">${p.numero_processo}</a></div>`
      );
    const processosHtml = processosLinhas.length ? `<div class="space-y-1">${processosLinhas.join('')}</div>` : '';
    nomeEl.textContent = cliente.nome || 'Cliente';
    if (atividadesBtn) {
      const paramsAtividade = new URLSearchParams({
        origem: 'cliente',
        novo: '1',
        cliente_id: String(cliente.id || id),
        cliente_nome: String(cliente.nome || ''),
      });
      atividadesBtn.setAttribute('href', `./atividades?${paramsAtividade.toString()}`);
      atividadesBtn.setAttribute('title', 'Nova atividade para este cliente');
    }

    const camposPrincipais = [
      ['data_chegada', 'Data de chegada'],
      ['telefone', 'Telefone'],
      ['email', 'E-mail'],
      ['cpf', 'CPF'],
      ['rg', 'RG'],
      ['data_nascimento', 'Data de nascimento'],
      ['idade', 'Idade'],
      ['filiacao', 'Filiação'],
      ['link_pasta', 'Link da pasta'],
    ];

    const camposDetalhes = [
      ['cpf_responsavel', 'CPF do responsável'],
      ['nacionalidade', 'Nacionalidade'],
      ['estado_civil', 'Estado civil'],
      ['profissao', 'Profissão'],
      ['endereco', 'Endereço'],
      ['numero_casa', 'Número'],
      ['cidade', 'Cidade'],
      ['estado', 'Estado'],
      ['cep', 'CEP'],
      ['acesso_gov', 'Acesso GOV'],
      ['created_at', 'Criado em'],
    ];

    const camposRelacionamento = [
      ['responsavel', 'Responsável'],
      ['parceiro', 'Parceiro'],
    ];

    const camposFinanceiros = [
      ['agencia', 'Agência'],
      ['conta', 'Conta'],
      ['banco', 'Banco'],
      ['tipo_conta', 'Tipo de conta'],
      ['dados_bancarios', 'Observações bancárias'],
    ];

    const formatValue = (key, value) => {
      if (key === 'processos_relacionados') {
        if (!processosHtml) return '-';
        return processosHtml;
      }
      if (!value) return '-';
      // Dates: always render as DD-MM-AAAA in the UI.
      if (key.startsWith('data_') || key.endsWith('_at')) return formatDateBR(value);
      if (key === 'link_pasta') {
        const val = String(value);
        if (val.startsWith('http://') || val.startsWith('https://')) {
          return `<a class="text-blue-600" href="${val}" target="_blank">Abrir</a>`;
        }
      }
      return String(value);
    };

    const renderRows = (rows) =>
      rows
        .map(([key, label]) => {
          const value = formatValue(key, cliente[key]);
          return `
            <div class="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-2 md:gap-6 py-2 border-b border-stone-100 last:border-b-0">
              <div class="text-[11px] uppercase tracking-wide text-stone-400">${label}</div>
              <div class="text-stone-900 break-words">${value}</div>
            </div>
          `;
        })
        .join('');

    const renderRowsCard = (rows) =>
      rows
        .map(([key, label]) => {
          const value = formatValue(key, cliente[key]);
          return `
            <div class="py-3">
              <div class="text-xs uppercase tracking-wide text-stone-400">${label}</div>
              <div class="mt-1 text-sm text-stone-700 break-words">${value}</div>
            </div>
          `;
        })
        .join('');

    const renderRowsCompact = (rows) =>
      rows
        .map(([key, label]) => {
          const value = formatValue(key, cliente[key]);
          return `
            <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 py-2 border-b border-stone-100 last:border-b-0">
              <div class="min-w-0 text-[11px] uppercase tracking-wide text-stone-400">${label}</div>
              <div class="min-w-0 text-stone-900 break-words text-right">${value}</div>
            </div>
          `;
        })
        .join('');
    const statusRaw = String(cliente.status || '').toLowerCase().trim();
    const hasProcessoAtivo = (processosResp.data || []).some((p) =>
      /ativo|andamento|em\s*andamento/i.test(String(p.status || ''))
    );
    const statusVisual =
      hasProcessoAtivo || statusRaw === 'ativo'
        ? { label: 'Cliente', sublabel: 'Com processo ativo', dot: 'bg-emerald-500' }
        : statusRaw === 'inativo'
          ? { label: 'Inativo', sublabel: 'Sem movimentação ativa', dot: 'bg-stone-400' }
          : { label: 'Lead', sublabel: 'Prospect/atendimento inicial', dot: 'bg-amber-400' };

    const processosCount = (processosResp.data || []).length;
    const processosAtivos = (processosResp.data || []).filter((p) =>
      /ativo|andamento|em\s*andamento/i.test(String(p.status || ''))
    ).length;
    const atividadesCliente = Array.isArray(atividadesResp?.data) ? atividadesResp.data : [];
    const atividadeStatusLabel = {
      a_fazer: 'A fazer',
      fazendo: 'Fazendo',
      feito: 'Feito',
      cancelado: 'Cancelado',
    };
    const atividadeStatusDot = {
      a_fazer: 'bg-amber-400',
      fazendo: 'bg-blue-400',
      feito: 'bg-emerald-400',
      cancelado: 'bg-stone-400',
    };
    const qualificacaoValue = getClienteQualificacaoText(cliente);
    const processosCardBody = processosHtml || '<span class="text-stone-400">Nenhum processo vinculado.</span>';
    const atividadesClienteHtml = atividadesCliente.length
      ? `<div class="space-y-2.5">${atividadesCliente
          .map((atividade, idx) => {
            const esc = (value) =>
              String(value || '')
                .replaceAll('&', '&amp;')
                .replaceAll('<', '&lt;')
                .replaceAll('>', '&gt;')
                .replaceAll('"', '&quot;')
                .replaceAll("'", '&#39;');
            const titulo = esc(stripHashSuffix(atividade.titulo || '') || 'Atividade');
            const processoNumero = esc(atividade.numero_processo || atividade.processo_numero || '');
            const status = String(atividade.status || 'a_fazer');
            const atividadeLink = `./atividades?origem=cliente&novo=1&cliente_id=${encodeURIComponent(String(cliente.id || id))}&cliente_nome=${encodeURIComponent(String(cliente.nome || ''))}`;
            const prazoDate = atividade.prazo ? parseDateTimeInput(atividade.prazo) : null;
            const prazoHora = String(atividade.prazo_hora || '').trim();
            const prazoLabel = atividade.prazo
              ? `Prazo ${formatDateLongBR(atividade.prazo)}${prazoHora ? `, ${prazoHora.slice(0, 5)}` : ''}`
              : 'Prazo não definido';
            const dia = prazoDate ? String(prazoDate.getDate()).padStart(2, '0') : '--';
            const mes = prazoDate
              ? prazoDate.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase()
              : '---';
            const horaRodape = prazoHora
              ? prazoHora.slice(0, 5)
              : prazoDate
                ? `${String(prazoDate.getHours()).padStart(2, '0')}:${String(prazoDate.getMinutes()).padStart(2, '0')}`
                : '--:--';
            const description = esc(atividade.descricao || stripHashSuffix(atividade.titulo || '') || 'Sem descrição');
            const cardHtml = `
              <article class="rounded-xl border border-stone-200 bg-[#f6f3fa] px-3 py-3">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex items-center gap-1.5 min-w-0">
                    <span class="inline-flex h-3.5 w-3.5 rounded border border-stone-400 bg-white"></span>
                    <div class="text-base leading-none"> ${titulo} </div>
                    <span class="text-xs text-stone-400 whitespace-nowrap">${atividade.created_at ? formatDateTimeBR(atividade.created_at).slice(11, 16) : ''}</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span class="inline-flex h-2.5 w-2.5 rounded-sm ${status === 'feito' ? 'bg-emerald-400' : 'bg-violet-400'}"></span>
                    <span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-stone-200 text-[10px] text-stone-600">👤</span>
                  </div>
                </div>

                <div class="mt-2.5 flex items-start gap-2.5">
                  <div class="w-16 shrink-0 rounded-xl bg-cyan-50 border border-cyan-100 text-center py-1.5">
                    <div class="text-2xl font-semibold text-slate-600 leading-none">${dia}</div>
                    <div class="text-[10px] font-semibold text-slate-400 uppercase">${mes}</div>
                    <div class="text-[10px] text-cyan-600">${horaRodape}</div>
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="inline-flex items-center rounded-lg bg-[#ede6f7] px-2.5 py-1.5 text-xs text-stone-600">
                      ${esc(prazoLabel)}
                    </div>
                    ${
                      processoNumero
                        ? `<div class="mt-1.5 text-[11px] text-stone-500">${processoNumero}</div>`
                        : ''
                    }
                    <div class="mt-1.5 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 break-words">${description}</div>
                  </div>
                </div>

                <div class="mt-3 flex items-center justify-between gap-2">
                  <div class="flex items-center gap-1.5">
                    <a href="${atividadeLink}" class="inline-flex items-center justify-center rounded-full bg-sky-500 px-3.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white hover:bg-sky-600">
                      Concluído
                    </a>
                    <a href="${atividadeLink}" class="inline-flex items-center justify-center rounded-full border border-stone-400 px-3.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-stone-600 hover:bg-stone-100">
                      Editar
                    </a>
                  </div>
                  <div class="text-[10px] text-stone-500">${atividadeStatusLabel[status] || 'A fazer'}</div>
                </div>
              </article>
            `;
            if (idx === 0 && atividadesCliente.length > 1) {
              return `${cardHtml}<div class="flex items-center justify-center py-0.5"><span class="inline-flex rounded-full bg-sky-500 px-3 py-0.5 text-[11px] font-semibold text-white">Hoje</span></div>`;
            }
            return cardHtml;
          })
          .join('')}</div>`
      : '<div class="text-sm text-stone-400">Nenhuma atividade vinculada a este cliente.</div>';

    propsEl.innerHTML = `
      <div class="space-y-6">
        <section class="bg-white border border-stone-200 rounded-2xl overflow-hidden">
          <header class="px-6 py-5 border-b border-stone-200/80">
            <h2 class="text-lg font-semibold text-stone-900">Dados essenciais</h2>
            <p class="text-sm text-stone-600 mt-1">Informações principais do cliente.</p>
          </header>
          <div class="px-6 py-4 text-sm">${renderRows(camposPrincipais)}</div>
        </section>

        <section class="bg-white border border-stone-200 rounded-2xl overflow-hidden">
          <header class="px-6 py-5 border-b border-stone-200/80">
            <h2 class="text-lg font-semibold text-stone-900">Dados complementares</h2>
            <p class="text-sm text-stone-600 mt-1">Documentação, endereço e cadastro.</p>
          </header>
          <div class="px-6 py-4 text-sm">${renderRows(camposDetalhes)}</div>
        </section>

        <section class="bg-white border border-stone-200 rounded-2xl overflow-hidden">
          <header class="px-6 py-5 border-b border-stone-200/80">
            <h2 class="text-lg font-semibold text-stone-900">Qualificação</h2>
            <p class="text-sm text-stone-600 mt-1">Texto completo para peças e atendimento.</p>
          </header>
          <div class="px-6 py-4">
            <div class="text-sm text-stone-700 whitespace-pre-wrap break-words">${
              qualificacaoValue || '<span class="text-stone-400">Não informada.</span>'
            }</div>
          </div>
        </section>

        <section class="bg-white border border-stone-200 rounded-2xl overflow-hidden">
          <header class="px-6 py-5 border-b border-stone-200/80">
            <h2 class="text-lg font-semibold text-stone-900">Processos vinculados</h2>
            <p class="text-sm text-stone-600 mt-1">Relação de processos associados ao cliente.</p>
          </header>
          <div class="px-6 py-4 text-sm">${processosCardBody}</div>
        </section>
      </div>

      <div class="space-y-6">
        <section class="bg-white border border-stone-200 rounded-2xl overflow-hidden">
          <header class="px-6 py-5 border-b border-stone-200/80">
            <h2 class="text-lg font-semibold text-stone-900">Resumo do cliente</h2>
            <p class="text-sm text-stone-600 mt-1">Status e indicadores rápidos.</p>
          </header>
          <div class="px-6 py-4 divide-y divide-stone-100">
            <div class="py-3">
              <div class="text-xs uppercase tracking-wide text-stone-400">Situação</div>
              <div class="mt-1 inline-flex items-center gap-2 text-sm text-stone-700">
                <span class="inline-flex h-2.5 w-2.5 rounded-full ${statusVisual.dot}"></span>
                <span class="font-medium">${statusVisual.label}</span>
              </div>
              <div class="mt-1 text-xs text-stone-500">${statusVisual.sublabel}</div>
            </div>
            <div class="py-3">
              <div class="text-xs uppercase tracking-wide text-stone-400">Processos</div>
              <div class="mt-1 text-sm text-stone-700">${processosCount} cadastrado(s)</div>
              <div class="mt-1 text-xs text-stone-500">${processosAtivos} ativo(s)</div>
            </div>
            <div class="py-3">
              <div class="text-xs uppercase tracking-wide text-stone-400">Nome</div>
              <div class="mt-1 text-sm text-stone-700 break-words">${cliente.nome || '-'}</div>
            </div>
          </div>
        </section>

        <section class="bg-white border border-stone-200 rounded-2xl overflow-hidden">
          <header class="px-6 py-3.5 border-b border-stone-200/80">
            <div class="flex items-center gap-1.5 text-xs mb-2.5">
              <span class="inline-flex rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 font-medium text-blue-700">Atividade</span>
              <span class="inline-flex rounded-lg px-2.5 py-1 text-stone-500">Comentário</span>
              <a
                href="./atividades?origem=cliente&novo=1&cliente_id=${encodeURIComponent(String(cliente.id || id))}&cliente_nome=${encodeURIComponent(String(cliente.nome || ''))}"
                class="ml-auto inline-flex items-center rounded-lg border border-stone-300 px-2.5 py-1 text-xs text-stone-700 hover:bg-stone-100"
              >
                Nova atividade
              </a>
            </div>
            <div class="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-400">Coisas a fazer</div>
          </header>
          <div class="px-6 py-4 bg-stone-50/70">
            <div class="mb-3 text-xs text-stone-500">${atividadesResp?.total || atividadesCliente.length} atividade(s) vinculada(s)</div>
            ${atividadesClienteHtml}
          </div>
        </section>

        <section class="bg-white border border-stone-200 rounded-2xl overflow-hidden">
          <header class="px-6 py-5 border-b border-stone-200/80">
            <h2 class="text-lg font-semibold text-stone-900">Relacionamentos</h2>
            <p class="text-sm text-stone-600 mt-1">Responsáveis e parceiros do atendimento.</p>
          </header>
          <div class="px-6 py-4 divide-y divide-stone-100">${renderRowsCard(camposRelacionamento)}</div>
        </section>

        <section class="bg-white border border-stone-200 rounded-2xl overflow-hidden">
          <header class="px-6 py-5 border-b border-stone-200/80">
            <h2 class="text-lg font-semibold text-stone-900">Dados financeiros</h2>
            <p class="text-sm text-stone-600 mt-1">Banco e informações para repasse.</p>
          </header>
          <div class="px-6 py-4 text-sm">${renderRowsCompact(camposFinanceiros)}</div>
        </section>
      </div>
    `;

    if (editBtn && editForm && editModal) {
      const resumoAjustes = await fetchAjustesResumoSafe();
      const colaboradoresAjustes = Array.isArray(resumoAjustes?.colaboradores)
        ? resumoAjustes.colaboradores
        : [];
      fillDatalistWithColaboradores(editResponsaveisList, colaboradoresAjustes);
      fillDatalistWithColaboradores(editParceirosList, colaboradoresAjustes);

      editBtn.addEventListener('click', () => {
        editModal.classList.remove('hidden');
        editModal.classList.add('flex');
      });
      if (editCancel) {
        editCancel.addEventListener('click', (e) => {
          e.preventDefault();
          editModal.classList.add('hidden');
          editModal.classList.remove('flex');
        });
      }
      if (editClose) {
        editClose.addEventListener('click', () => {
          editModal.classList.add('hidden');
          editModal.classList.remove('flex');
        });
      }
      editModal.addEventListener('click', (e) => {
        if (e.target === editModal) {
          editModal.classList.add('hidden');
          editModal.classList.remove('flex');
        }
      });

      qs('#clienteEditNome').value = cliente.nome || '';
      qs('#clienteEditEmail').value = cliente.email || '';
      qs('#clienteEditTelefone').value = cliente.telefone || '';
      qs('#clienteEditCpf').value = cliente.cpf || '';
      qs('#clienteEditDataChegada').value = cliente.data_chegada || '';
      qs('#clienteEditCpfResponsavel').value = cliente.cpf_responsavel || '';
      qs('#clienteEditNacionalidade').value = cliente.nacionalidade || '';
      qs('#clienteEditEstadoCivil').value = cliente.estado_civil || '';
      qs('#clienteEditProfissao').value = cliente.profissao || '';
      qs('#clienteEditDataNascimento').value = cliente.data_nascimento || '';
      qs('#clienteEditIdade').value = cliente.idade || '';
      qs('#clienteEditRg').value = cliente.rg || '';
      qs('#clienteEditFiliacao').value = cliente.filiacao || '';
      qs('#clienteEditEndereco').value = cliente.endereco || '';
      qs('#clienteEditNumeroCasa').value = cliente.numero_casa || '';
      qs('#clienteEditCidade').value = cliente.cidade || '';
      qs('#clienteEditEstado').value = cliente.estado || '';
      qs('#clienteEditCep').value = cliente.cep || '';
      qs('#clienteEditAcessoGov').value = cliente.acesso_gov || '';
      qs('#clienteEditParceiro').value = cliente.parceiro || '';
      qs('#clienteEditResponsavel').value = cliente.responsavel || '';
      qs('#clienteEditAgencia').value = cliente.agencia || '';
      qs('#clienteEditConta').value = cliente.conta || '';
      qs('#clienteEditBanco').value = cliente.banco || '';
      qs('#clienteEditTipoConta').value = cliente.tipo_conta || '';
      qs('#clienteEditDadosBancarios').value = cliente.dados_bancarios || '';
      qs('#clienteEditLinkPasta').value = cliente.link_pasta || '';
      qs('#clienteEditProcessosNotion').value = cliente.processos_notion || '';
      qs('#clienteEditQualificacao').value = getClienteQualificacaoText(cliente) || '';
      qs('#clienteEditStatus').value = cliente.status || 'lead';

      if (editDataNascimento && editDataNascimento.value) {
        atualizarIdade(editDataNascimento, editIdadeInfo, editIdadeHidden);
      } else if (editIdadeHidden && cliente.idade) {
        editIdadeHidden.value = cliente.idade;
        if (editIdadeInfo) editIdadeInfo.textContent = `Idade: ${cliente.idade} anos`;
      }

      if (editDataNascimento) {
        editDataNascimento.addEventListener('change', () =>
          atualizarIdade(editDataNascimento, editIdadeInfo, editIdadeHidden)
        );
      }
      setupCepAutoFill(editCep, editEndereco, editCidade, editEstado);
      bindMask(editCpf, formatCpf);
      bindMask(editRg, formatRg);

      editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (editMsg) editMsg.textContent = '';
        const payload = {
          nome: qs('#clienteEditNome').value.trim(),
          email: qs('#clienteEditEmail').value.trim(),
          telefone: qs('#clienteEditTelefone').value.trim(),
          cpf: qs('#clienteEditCpf').value.trim(),
          data_chegada: qs('#clienteEditDataChegada').value.trim(),
          cpf_responsavel: qs('#clienteEditCpfResponsavel').value.trim(),
          nacionalidade: qs('#clienteEditNacionalidade').value.trim(),
          estado_civil: qs('#clienteEditEstadoCivil').value.trim(),
          profissao: qs('#clienteEditProfissao').value.trim(),
          data_nascimento: qs('#clienteEditDataNascimento').value.trim(),
          idade: qs('#clienteEditIdade').value.trim(),
          rg: qs('#clienteEditRg').value.trim(),
          filiacao: qs('#clienteEditFiliacao').value.trim(),
          endereco: qs('#clienteEditEndereco').value.trim(),
          numero_casa: qs('#clienteEditNumeroCasa').value.trim(),
          cidade: qs('#clienteEditCidade').value.trim(),
          estado: qs('#clienteEditEstado').value.trim(),
          cep: qs('#clienteEditCep').value.trim(),
          acesso_gov: qs('#clienteEditAcessoGov').value.trim(),
          parceiro: qs('#clienteEditParceiro').value.trim(),
          responsavel: qs('#clienteEditResponsavel').value.trim(),
          agencia: qs('#clienteEditAgencia').value.trim(),
          conta: qs('#clienteEditConta').value.trim(),
          banco: qs('#clienteEditBanco').value.trim(),
          tipo_conta: qs('#clienteEditTipoConta').value.trim(),
          dados_bancarios: qs('#clienteEditDadosBancarios').value.trim(),
          link_pasta: qs('#clienteEditLinkPasta').value.trim(),
          processos_notion: qs('#clienteEditProcessosNotion').value.trim(),
          qualificacao: qs('#clienteEditQualificacao').value.trim(),
          status: qs('#clienteEditStatus').value,
        };
        if (!payload.qualificacao) {
          payload.qualificacao = buildClienteQualificacaoAuto(payload);
        }
        try {
          const atualizado = await api.clientes.update(id, payload);
          nomeEl.textContent = atualizado.nome || 'Cliente';
          editModal.classList.add('hidden');
          editModal.classList.remove('flex');
          if (editMsg) editMsg.textContent = 'Informações atualizadas.';
        } catch (err) {
          if (editMsg) editMsg.textContent = err.message || 'Erro ao atualizar.';
        }
      });
    }
  } catch (err) {
    erroEl.textContent = err.message || 'Erro ao carregar cliente.';
  }
}

async function initProcessoDetail() {
  await guardAuth();
  bindLogout();
  const hasFinanceAccess = canAccessFinanceiro();
  const canManageAtividades = canCreateDeleteAtividades();

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const nomeEl = qs('#processoTitulo');
  const propsEl = qs('#processoProps');
  const andamentosEl = qs('#processoAndamentos');
  const logsEl = qs('#processoAndamentosLogs');
  const editBtn = qs('#processoEditBtn');
  const editModal = qs('#processoEditModal');
  const editClose = qs('#processoEditClose');
  const editCancel = qs('#processoEditCancel');
  const editSubmit = qs('#processoEditSubmit');
  const editForm = qs('#processoEditForm');
  const editMessage = qs('#processoEditMessage');
  const editClienteInput = qs('#processoEditClienteInput');
  const editClienteOptions = qs('#processoEditClienteOptions');
  const editClienteId = qs('#processoEditClienteId');
  const editNumero = qs('#processoEditNumero');
  const editStatus = qs('#processoEditStatus');
  const editArea = qs('#processoEditArea');
  const editClasse = qs('#processoEditClasse');
  const editOrgao = qs('#processoEditOrgao');
  const editOrgaoGrid = qs('#processoEditOrgaoGrid');
  const editVara = qs('#processoEditVara');
  const editGrau = qs('#processoEditGrau');
  const editCidade = qs('#processoEditCidade');
  const editEstado = qs('#processoEditEstado');
  const editSistema = qs('#processoEditSistema');
  const editDistribuicao = qs('#processoEditDistribuicao');
  const editResultado = qs('#processoEditResultado');
  const editInterpostoRecurso = qs('#processoEditInterpostoRecurso');
  const editParteContraria = qs('#processoEditParteContraria');
  const editContaBeneficioWrap = qs('#processoEditContaBeneficioWrap');
  const editAbrirConta = qs('#processoEditAbrirConta');
  const editContaAberta = qs('#processoEditContaAberta');
  const erroEl = qs('#processoErro');
  const financeiroEl = qs('#processoFinanceiro');
  const financeiroModal = qs('#financeiroModal');
  const financeiroForm = qs('#financeiroForm');
  const financeiroClose = qs('#financeiroClose');
  const financeiroCancel = qs('#financeiroCancel');
  const financeiroMessage = qs('#financeiroMessage');
  const financeiroId = qs('#financeiroId');
  const financeiroTipo = qs('#financeiroTipo');
  const financeiroDescricao = qs('#financeiroDescricao');
  const financeiroValorBase = qs('#financeiroValorBase');
  const financeiroPercentual = qs('#financeiroPercentual');
  const financeiroHonorarios = qs('#financeiroHonorarios');
  const financeiroRepasse = qs('#financeiroRepasse');
  const financeiroPrevisao = qs('#financeiroPrevisao');
  const financeiroPago = qs('#financeiroPago');
  const financeiroRepassado = qs('#financeiroRepassado');
  const financeiroDivisoesSection = qs('#financeiroDivisoesSection');
  const financeiroDivisoesList = qs('#financeiroDivisoesList');
  const financeiroAddDivisao = qs('#financeiroAddDivisao');

  let financeiroItems = [];
  let areasAjustes = [];

  const loadAreasForProcessoEdit = async () => {
    try {
      const resp = await api.ajustes.listAreas();
      areasAjustes = Array.isArray(resp?.data) ? resp.data : [];
      fillSelectWithAreas(editArea, areasAjustes, { keepCurrent: true });
    } catch (_) {
      areasAjustes = [];
    }
  };

  const tipoLabel = (tipo) => {
    const map = {
      indenizacao_danos_morais: 'Indenização por danos morais',
      rpv: 'RPV',
      honorarios_contratuais: 'Honorários contratuais',
      outros: 'Outros',
      proveito_economico: 'Proveito econômico',
    };
    return map[tipo] || tipo || '—';
  };

  const toggleFinanceiroDivisoes = () => {
    if (!financeiroDivisoesSection || !financeiroTipo) return;
    const show = financeiroTipo.value === 'honorarios_contratuais';
    financeiroDivisoesSection.classList.toggle('hidden', !show);
  };

  const calcularFinanceiroModal = () => {
    if (!financeiroValorBase || !financeiroPercentual) return;
    const base = parseCurrencyValue(financeiroValorBase.value);
    const perc = parsePercentValue(financeiroPercentual.value);
    if (base === null || perc === null) return;
    const honor = base * (perc / 100);
    const rep = base - honor;
    if (financeiroHonorarios) financeiroHonorarios.value = formatCurrencyValue(honor);
    if (financeiroRepasse) financeiroRepasse.value = formatCurrencyValue(rep);
  };

  const addDivisaoRow = (data = {}) => {
    if (!financeiroDivisoesList) return;
    const row = document.createElement('div');
    row.className = 'grid grid-cols-1 md:grid-cols-[1.2fr_0.6fr_0.6fr_auto] gap-2 items-center';
    row.dataset.divRow = 'true';
    row.innerHTML = `
      <input
        class="financeiroDivParte border rounded-lg px-3 py-2 text-sm"
        placeholder="Parte"
        value="${data.parte ? String(data.parte) : ''}"
      />
      <input
        class="financeiroDivPercentual border rounded-lg px-3 py-2 text-sm"
        placeholder="%"
        value="${data.percentual ? String(data.percentual) : ''}"
      />
      <input
        class="financeiroDivValor border rounded-lg px-3 py-2 text-sm"
        placeholder="Valor"
        value="${data.valor ? String(data.valor) : ''}"
      />
      <button type="button" class="text-xs text-red-600 hover:text-red-700">Remover</button>
    `;
    row.querySelector('button')?.addEventListener('click', () => row.remove());
    financeiroDivisoesList.appendChild(row);
  };

  const openFinanceiroModal = (item = null) => {
    if (!financeiroModal || !financeiroForm) return;
    financeiroMessage.textContent = '';
    financeiroForm.reset();
    if (financeiroDivisoesList) financeiroDivisoesList.innerHTML = '';

    if (item) {
      financeiroId.value = item.id || '';
      if (financeiroTipo) financeiroTipo.value = item.tipo || 'outros';
      if (financeiroDescricao) financeiroDescricao.value = item.descricao || '';
      if (financeiroValorBase) financeiroValorBase.value = item.valor_base || '';
      if (financeiroPercentual) financeiroPercentual.value = item.percentual || '';
      if (financeiroHonorarios) financeiroHonorarios.value = item.honorarios_calculados || '';
      if (financeiroRepasse) financeiroRepasse.value = item.repasse_calculado || '';
      if (financeiroPrevisao)
        financeiroPrevisao.value = normalizeMonthValue(item.previsao_pagamento_mes || '');
      if (financeiroPago) financeiroPago.checked = isTruthyFlag(item.pago);
      if (financeiroRepassado) financeiroRepassado.checked = isTruthyFlag(item.repassado);
      if (Array.isArray(item.divisoes)) {
        item.divisoes.forEach((div) => addDivisaoRow(div));
      }
    } else {
      financeiroId.value = '';
      if (financeiroTipo) financeiroTipo.value = 'indenizacao_danos_morais';
    }

    toggleFinanceiroDivisoes();
    calcularFinanceiroModal();

    financeiroModal.classList.remove('hidden');
    financeiroModal.classList.add('flex');
  };

  const closeFinanceiroModal = () => {
    if (!financeiroModal) return;
    financeiroModal.classList.add('hidden');
    financeiroModal.classList.remove('flex');
  };

  if (!id) {
    erroEl.textContent = 'Processo não informado.';
    return;
  }

  const buildSystemLogo = (name) => {
    const label = String(name || '').trim();
    if (!label) return '';
    const palette = {
      pje: { bg: '#1f2937', fg: '#ffffff' },
      'pje 2g': { bg: '#1f2937', fg: '#ffffff' },
      esaj: { bg: '#2563eb', fg: '#ffffff' },
      'e-saj': { bg: '#2563eb', fg: '#ffffff' },
      projudi: { bg: '#0f766e', fg: '#ffffff' },
      eproc: { bg: '#7c3aed', fg: '#ffffff' },
    };
    const key = label.toLowerCase();
    const colors = palette[key] || { bg: '#0f172a', fg: '#ffffff' };
    const text = label.length > 6 ? label.slice(0, 6) : label;
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28">
          <rect width="28" height="28" rx="7" fill="${colors.bg}"/>
          <text x="14" y="18" text-anchor="middle" font-family="IBM Plex Sans, Arial" font-size="11" font-weight="600" fill="${colors.fg}">
            ${text}
          </text>
        </svg>
      `.trim();
    const uri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    return `<img src="${uri}" alt="${label}" class="w-6 h-6 rounded-md" />`;
  };

  const isPrevidenciario = (value) =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim() === 'previdenciario';

  const toggleEditContaBeneficio = () => {
    if (!editContaBeneficioWrap || !editArea) return;
    const show = isPrevidenciario(editArea.value);
    editContaBeneficioWrap.classList.toggle('hidden', !show);
    if (!show) {
      if (editAbrirConta) editAbrirConta.checked = false;
      if (editContaAberta) editContaAberta.checked = false;
    }
  };

  const syncEditCidadeByEstado = async (currentCidade = '') => {
    await hydrateCidadeSelectByEstado(editEstado?.value, editCidade, { currentValue: currentCidade });
  };

  try {
    await loadAreasForProcessoEdit();
    let processo = await api.processos.get(id);
    const shouldShowContaTag = () =>
      String(processo.abrir_conta || '').toLowerCase() === 'sim' &&
      String(processo.conta_aberta || '').toLowerCase() !== 'sim';
    const renderProcessoTitulo = () => {
      const processoNumero = processo.numero_processo || 'Processo';
      nomeEl.innerHTML = `
        <span class="inline-flex items-center gap-1">
          ${renderCopyProcessButton(processoNumero)}
          <span class="font-semibold">${processoNumero}</span>
        </span>
        ${
          processo.grau || processo.sistema || shouldShowContaTag()
            ? `<span class="inline-flex items-center gap-2 ml-2 align-middle">
                ${
                  processo.grau
                    ? `<span class="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 border border-stone-200">${processo.grau}</span>`
                    : ''
                }
                ${processo.sistema ? buildSystemLogo(String(processo.sistema)) : ''}
                ${
                  shouldShowContaTag()
                    ? '<span class="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 border border-stone-200">Conta a abrir</span>'
                    : ''
                }
              </span>`
            : ''
        }
      `;
    };
    renderProcessoTitulo();

    const uniqueJoin = (values, separator = ' • ') => {
      const cleaned = values
        .map((val) => String(val || '').trim())
        .filter(Boolean)
        .map((val) => val.replace(/\s+/g, ' '));
      const deduped = [];
      cleaned.forEach((val) => {
        const normalized = val.toLowerCase();
        if (!deduped.some((item) => item.toLowerCase() === normalized)) deduped.push(val);
      });
      return deduped.join(separator);
    };

    const buildTribunalLabel = () => {
      const orgaoRaw = String(processo.orgao || processo.juizo || '').trim();
      const cidadeRaw = String(processo.cidade || '').trim();
      const estadoRaw = String(processo.estado || '').trim();
      const local = [cidadeRaw, estadoRaw].filter(Boolean).join(', ');
      return uniqueJoin([orgaoRaw, local], ' · ');
    };

    const resultadoInfo = normalizeResultadoAndRecurso(processo.resultado, processo.recurso_inominado);

    const computed = {
      assunto_resumo: uniqueJoin([processo.area, processo.classe || processo.fase]),
      tribunal_resumo: buildTribunalLabel(),
      resultado_resumo: resultadoInfo.resultado || '',
    };

    const formatValue = (key, value, fallback = 'Não informado') => {
      const computedValue = Object.prototype.hasOwnProperty.call(computed, key) ? computed[key] : value;
      if (computedValue === null || computedValue === undefined || computedValue === '')
        return { html: `<span class="text-stone-400">${fallback}</span>`, empty: false };
      let text = String(computedValue);
      try {
        text = decodeURIComponent(text);
      } catch (_) {}
      if (
        key === 'area' ||
        key === 'classe' ||
        key === 'fase' ||
        key === 'assunto_resumo' ||
        key === 'tribunal_resumo'
      ) {
        text = text.replace(/\s*\([^)]*(\.(html|htlm)|[0-9a-f]{10,})[^)]*\)/gi, '');
        text = text.replace(/\s+[^\s]*\.(html|htlm)\b/gi, '');
      }
      if (key === 'cliente_nome' && processo.cliente_id) {
        return {
          html: `<a class="text-stone-900 underline underline-offset-4 decoration-stone-300 hover:decoration-stone-600" href="./cliente?id=${processo.cliente_id}">${text}</a>`,
          empty: false,
        };
      }
      if (text.startsWith('http://') || text.startsWith('https://')) {
        return {
          html: `<a class="text-stone-900 underline underline-offset-4 decoration-stone-300 hover:decoration-stone-600" href="${text}" target="_blank">Abrir</a>`,
          empty: false,
        };
      }
      return { html: text, empty: false };
    };

    const icon = (name) => {
      const icons = {
        processo: '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 7h8M8 12h8M8 17h5"/><path d="M6 3h9l3 3v15H6z"/></svg>',
        assunto: '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12h16"/><path d="M12 4v16"/><circle cx="12" cy="12" r="8"/></svg>',
        tribunal: '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 10h18M5 10v8h14v-8M9 10V6h6v4"/></svg>',
        resultado: '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12l4 4 10-10"/></svg>',
        envolvidos: '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M14.5 19c.2-2.1 1.9-3.8 4-4"/></svg>',
      };
      return icons[name] || icons.assunto;
    };

    const infoItems = [
      ['numero_processo', 'Número do processo', 'processo'],
      ['assunto_resumo', 'Assunto', 'assunto'],
      ['tribunal_resumo', 'Tribunal', 'tribunal'],
      ['resultado_resumo', 'Resultado', 'resultado'],
    ];

    const infoRows = infoItems
      .map(([key, label, iconName]) => {
        const fallback = key === 'resultado_resumo' ? 'Em tramitação' : 'Não informado';
        const value = formatValue(key, processo[key], fallback);
        return `
          <div class="py-3">
            <div class="flex items-center gap-2 text-stone-800">
              <span class="inline-flex items-center justify-center text-stone-600">${icon(iconName)}</span>
              <span class="text-[15px] font-semibold">${label}</span>
            </div>
            <div class="mt-1 pl-6 text-sm text-stone-600 break-words">${value.html}</div>
          </div>
        `;
      })
      .join('');

    const envolvidosHtml = `
      <div class="py-3">
        <div class="flex items-center gap-2 text-stone-800">
          <span class="inline-flex items-center justify-center text-stone-600">${icon('envolvidos')}</span>
          <span class="text-[15px] font-semibold">Envolvidos</span>
        </div>
        <div class="mt-2 pl-6 space-y-2">
          <div>
            <div class="text-xs uppercase tracking-wide text-stone-400">Polo ativo</div>
            <div class="text-sm text-stone-700 break-words">${formatValue('cliente_nome', processo.cliente_nome, 'Não informado').html}</div>
          </div>
          <div>
            <div class="text-xs uppercase tracking-wide text-stone-400">Polo passivo</div>
            <div class="text-sm text-stone-700 break-words">${formatValue('parte_contraria', processo.parte_contraria, 'Não informado').html}</div>
          </div>
        </div>
      </div>
    `;

    const infoCardHtml = `
      <section class="bg-white border border-stone-200 rounded-2xl overflow-hidden">
        <header class="px-6 py-5 border-b border-stone-200/80">
          <h2 class="text-lg font-semibold text-stone-900">Dados essenciais</h2>
          <p class="text-sm text-stone-600 mt-1">Resumo principal do processo.</p>
        </header>
        <div class="px-6 py-4 divide-y divide-stone-100">${infoRows}${envolvidosHtml}</div>
      </section>
    `;

    const atividadesPlaceholder = `
      <section id="processoAtividadesCard" class="bg-white border border-stone-200 rounded-2xl p-5">
        <h2 class="text-sm font-semibold text-stone-700 mb-2">Atividades do processo</h2>
        <div class="text-sm text-stone-500">Carregando atividades...</div>
      </section>
    `;
    const contaBeneficioPlaceholder = `
      <section id="processoContaBeneficioCard" class="bg-white border border-stone-200 rounded-2xl p-5">
        <h2 class="text-sm font-semibold text-stone-700 mb-2">Conta do benefício</h2>
        <div class="text-sm text-stone-500">Carregando dados...</div>
      </section>
    `;

    propsEl.innerHTML =
      `
        <div class="space-y-6">${infoCardHtml}</div>
        <div class="space-y-6">${atividadesPlaceholder}${contaBeneficioPlaceholder}</div>
      `;

    const formatDateTime = (dateValue, timeValue) => formatDateOptionalTime(dateValue, timeValue);

    const atividadesCard = qs('#processoAtividadesCard');
    const cleanText = (value) => {
      if (!value) return '';
      let text = String(value);
      try {
        text = decodeURIComponent(text);
      } catch (_) {}
      text = text.replace(/\s+[0-9a-f]{10,}$/i, '');
      text = text.replace(/\s*\\([^)]*(\\.(html|htlm)|[0-9a-f]{10,})[^)]*\\)/gi, '');
      return text.trim();
    };

    if (atividadesCard) {
      try {
        const atividades = await api.atividades.list({ processo_id: id, page: 1, limit: 50 });
        const items = (atividades.data || []).slice(0, 10);
        const dropdownHtml = canManageAtividades
          ? `
              <div class="relative inline-block mt-4">
                <button id="processoAtividadeNova" class="text-xs text-stone-500 hover:text-stone-900">
                  Nova atividade ▾
                </button>
                <div
                  id="processoAtividadeMenu"
                  class="hidden absolute right-0 mt-2 w-56 bg-white border border-stone-200 rounded-lg shadow-sm z-10"
                >
                  ${[
                    'Audiência',
                    'Perícia',
                    'Petição inicial',
                    'Réplica',
                    'Embargos de declaração',
                    'Recurso inominado',
                    'Cumprimento de sentença',
                    'Manifestar ciência',
                    'Aceitar acordo',
                    'Informar cliente',
                    'Responder cliente',
                    'Administrativo BPC',
                    'Prazo',
                    'Melhoria',
                  ]
                    .map(
                      (tipo) => `
                        <button
                          type="button"
                          class="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
                          data-atividade-template="${tipo}"
                        >
                          ${tipo}
                        </button>
                      `
                    )
                    .join('')}
                </div>
              </div>
            `
          : '';

        if (!items.length) {
          atividadesCard.innerHTML = `
            <h2 class="text-sm font-semibold text-stone-700 mb-2">Atividades do processo</h2>
            <div class="text-sm text-stone-500">Nenhuma atividade vinculada.</div>
            ${dropdownHtml}
          `;
        } else {
          const rows = items
            .map((a) => {
              const titulo = cleanText(a.titulo) || 'Atividade';
              const prazo = a.prazo ? formatDateTime(a.prazo, a.prazo_hora) : '';
              const status = a.status || '';
              const prioridade = a.prioridade || '';
              const prioridadeColor = (() => {
                if (prioridade === 'alta') return 'bg-red-400';
                if (prioridade === 'media') return 'bg-amber-400';
                if (prioridade === 'baixa') return 'bg-emerald-400';
                return 'bg-stone-300';
              })();
              return `
                <div class="py-3 flex items-start gap-3">
                  <input
                    type="checkbox"
                    class="mt-1 h-4 w-4 rounded border-stone-300"
                    data-atividade-id="${a.id}"
                    ${status === 'feito' ? 'checked' : ''}
                    aria-label="Concluir atividade"
                  />
                  <div class="flex-1">
                    <div class="text-sm text-stone-900">${titulo}</div>
                    <div class="text-xs text-stone-500 mt-1 flex items-center gap-2">
                      <span class="inline-flex h-2 w-2 rounded-full ${prioridadeColor}" title="Prioridade"></span>
                      ${prazo ? `<span>Data: ${prazo}</span>` : '<span>Caixa de entrada</span>'}
                    </div>
                  </div>
                  <div class="relative">
                    <button
                      type="button"
                      class="h-7 w-7 inline-flex items-center justify-center rounded-md border border-stone-200 text-stone-500 hover:bg-stone-100"
                      data-processo-atividade-menu-toggle="${a.id}"
                      title="Opções"
                      aria-label="Opções"
                    >
                      &#x22EE;
                    </button>
                    <div
                      data-processo-atividade-menu="${a.id}"
                      class="hidden absolute right-0 mt-1 w-32 rounded-lg border border-stone-200 bg-white shadow-lg z-20"
                    >
                      <button
                        type="button"
                        data-processo-atividade-edit="${a.id}"
                        class="w-full text-left px-3 py-2 text-xs text-stone-700 hover:bg-stone-50"
                      >
                        Editar
                      </button>
                      ${
                        canManageAtividades
                          ? `<button
                               type="button"
                               data-processo-atividade-remove="${a.id}"
                               class="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50"
                             >
                               Excluir
                             </button>`
                          : ''
                      }
                    </div>
                  </div>
                </div>
              `;
            })
            .join('');
          atividadesCard.innerHTML = `
            <h2 class="text-sm font-semibold text-stone-700 mb-2">Atividades do processo</h2>
            <div class="divide-y divide-stone-200/70">${rows}</div>
            ${dropdownHtml}
          `;

          atividadesCard.querySelectorAll('input[data-atividade-id]').forEach((checkbox) => {
            checkbox.addEventListener('change', async (event) => {
              const target = event.currentTarget;
              const atividadeId = target.dataset.atividadeId;
              if (!atividadeId) return;
              const feito = target.checked;
              target.disabled = true;
              try {
                const atividade = items.find((item) => String(item.id) === String(atividadeId));
                if (!atividade) return;
                await api.atividades.update(atividadeId, {
                  ...atividade,
                  status: feito ? 'feito' : 'a_fazer',
                });
              } catch (err) {
                target.checked = !feito;
              } finally {
                target.disabled = false;
              }
            });
          });

          const closeProcessoAtividadeMenus = () => {
            atividadesCard
              .querySelectorAll('[data-processo-atividade-menu]')
              .forEach((menuEl) => menuEl.classList.add('hidden'));
          };

          atividadesCard.querySelectorAll('[data-processo-atividade-menu-toggle]').forEach((btn) => {
            btn.addEventListener('click', (event) => {
              event.stopPropagation();
              const atividadeId = String(btn.getAttribute('data-processo-atividade-menu-toggle') || '');
              if (!atividadeId) return;
              const menuEl = atividadesCard.querySelector(
                `[data-processo-atividade-menu="${atividadeId}"]`
              );
              if (!menuEl) return;
              const willOpen = menuEl.classList.contains('hidden');
              closeProcessoAtividadeMenus();
              if (willOpen) menuEl.classList.remove('hidden');
            });
          });

          atividadesCard.querySelectorAll('[data-processo-atividade-edit]').forEach((btn) => {
            btn.addEventListener('click', (event) => {
              event.stopPropagation();
              const atividadeId = String(btn.getAttribute('data-processo-atividade-edit') || '');
              if (!atividadeId) return;
              const atividade = items.find((item) => String(item.id) === atividadeId);
              if (!atividade) return;
              closeProcessoAtividadeMenus();
              openQuickAtividadeModal({
                processo,
                atividade,
              });
            });
          });

          atividadesCard.querySelectorAll('[data-processo-atividade-remove]').forEach((btn) => {
            btn.addEventListener('click', async (event) => {
              event.stopPropagation();
              const atividadeId = String(btn.getAttribute('data-processo-atividade-remove') || '');
              if (!atividadeId) return;
              closeProcessoAtividadeMenus();
              if (!window.confirm('Excluir esta atividade?')) return;
              try {
                await api.atividades.remove(atividadeId);
                window.location.reload();
              } catch (err) {
                window.alert(err?.message || 'Não foi possível excluir a atividade.');
              }
            });
          });

          document.addEventListener('click', closeProcessoAtividadeMenus);
        }

        const novaBtn = qs('#processoAtividadeNova');
        const menu = qs('#processoAtividadeMenu');
        if (canManageAtividades && novaBtn && menu) {
          const toggleMenu = () => {
            menu.classList.toggle('hidden');
          };
          novaBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMenu();
          });
          document.addEventListener('click', () => {
            menu.classList.add('hidden');
          });
          menu.querySelectorAll('[data-atividade-template]').forEach((btn) => {
            btn.addEventListener('click', () => {
              const template = btn.dataset.atividadeTemplate || 'Atividade';
              menu.classList.add('hidden');
              openQuickAtividadeModal({
                processo,
                titulo: template,
              });
            });
          });
        }
      } catch (err) {
        atividadesCard.innerHTML = `
          <h2 class="text-sm font-semibold text-stone-700 mb-2">Atividades do processo</h2>
          <div class="text-sm text-stone-500">Não foi possível carregar as atividades.</div>
        `;
      }
    }

    const contaBeneficioCard = qs('#processoContaBeneficioCard');
    if (contaBeneficioCard) {
      const abrirContaChecked = String(processo.abrir_conta || '').toLowerCase() === 'sim';
      const contaAbertaChecked = String(processo.conta_aberta || '').toLowerCase() === 'sim';
      contaBeneficioCard.innerHTML = `
        <h2 class="text-sm font-semibold text-stone-700 mb-2">Conta do benefício</h2>
        <div class="space-y-3">
          <label class="inline-flex items-center gap-2 text-sm text-stone-800">
            <input id="processoContaAbrirCheck" type="checkbox" class="h-4 w-4 rounded border-stone-300" ${abrirContaChecked ? 'checked' : ''} />
            Conta para abrir
          </label>
          <label class="inline-flex items-center gap-2 text-sm text-stone-800">
            <input id="processoContaAbertaCheck" type="checkbox" class="h-4 w-4 rounded border-stone-300" ${contaAbertaChecked ? 'checked' : ''} />
            Conta aberta
          </label>
          <div id="processoContaBeneficioMsg" class="text-xs text-stone-500"></div>
        </div>
      `;

      const abrirContaCheck = qs('#processoContaAbrirCheck');
      const contaAbertaCheck = qs('#processoContaAbertaCheck');
      const contaMsg = qs('#processoContaBeneficioMsg');
      const setSavingState = (saving) => {
        if (abrirContaCheck) abrirContaCheck.disabled = saving;
        if (contaAbertaCheck) contaAbertaCheck.disabled = saving;
      };
      const buildUpdatePayload = (overrides = {}) => ({
        cliente_id: Number(processo.cliente_id),
        numero_processo: processo.numero_processo || '',
        status: processo.status || '',
        area: processo.area || '',
        fase: '',
        classe: processo.classe || '',
        orgao: processo.orgao || '',
        vara: processo.vara || '',
        grau: processo.grau || '',
        cidade: processo.cidade || '',
        estado: processo.estado || '',
        sistema: processo.sistema || '',
        distribuicao: processo.distribuicao || '',
        resultado: processo.resultado || '',
        recurso_inominado: processo.recurso_inominado || 'No',
        parte_contraria: processo.parte_contraria || '',
        abrir_conta: processo.abrir_conta || 'No',
        conta_aberta: processo.conta_aberta || 'No',
        ...overrides,
      });
      const persistContaBeneficio = async () => {
        if (!abrirContaCheck || !contaAbertaCheck) return;
        const nextAbrirConta = abrirContaCheck.checked ? 'Sim' : 'No';
        const nextContaAberta = contaAbertaCheck.checked ? 'Sim' : 'No';
        const prevAbrir = processo.abrir_conta;
        const prevAberta = processo.conta_aberta;
        if (contaMsg) contaMsg.textContent = 'Salvando...';
        setSavingState(true);
        try {
          const updated = await api.processos.update(
            id,
            buildUpdatePayload({
              abrir_conta: nextAbrirConta,
              conta_aberta: nextContaAberta,
            })
          );
          processo = { ...processo, ...updated };
          renderProcessoTitulo();
          if (contaMsg) contaMsg.textContent = 'Atualizado.';
        } catch (err) {
          processo.abrir_conta = prevAbrir;
          processo.conta_aberta = prevAberta;
          renderProcessoTitulo();
          abrirContaCheck.checked = String(prevAbrir || '').toLowerCase() === 'sim';
          contaAbertaCheck.checked = String(prevAberta || '').toLowerCase() === 'sim';
          if (contaMsg) contaMsg.textContent = err.message || 'Erro ao atualizar conta do benefício.';
        } finally {
          setSavingState(false);
        }
      };
      abrirContaCheck?.addEventListener('change', persistContaBeneficio);
      contaAbertaCheck?.addEventListener('change', persistContaBeneficio);
    }

    const renderFinanceiro = () => {
      if (!financeiroEl) return;
      const itens = Array.isArray(financeiroItems) ? financeiroItems : [];
      let totalProveito = 0;
      let totalHonorarios = 0;
      let totalRepasse = 0;
      itens.forEach((item) => {
        const base = parseCurrencyValue(item.valor_base);
        const honor = parseCurrencyValue(item.honorarios_calculados);
        const repasse = parseCurrencyValue(item.repasse_calculado);
        if (base !== null) totalProveito += base;
        if (honor !== null) totalHonorarios += honor;
        if (repasse !== null) totalRepasse += repasse;
      });
      const rows = itens
        .map((item) => {
          const base = formatCurrencyValue(item.valor_base);
          const honor = formatCurrencyValue(item.honorarios_calculados);
          const repasse = formatCurrencyValue(item.repasse_calculado);
          const previsao = normalizeMonthValue(item.previsao_pagamento_mes);
          const pago = isTruthyFlag(item.pago) ? 'Sim' : 'Não';
          const repassado = isTruthyFlag(item.repassado) ? 'Sim' : 'Não';
          const divisoes = Array.isArray(item.divisoes) && item.divisoes.length
            ? `<div class="mt-2 text-xs text-stone-500 space-y-1">
                ${item.divisoes
                  .map((d) => {
                    const percentual = d.percentual ? ` • ${d.percentual}` : '';
                    const valor = d.valor ? ` • ${d.valor}` : '';
                    return `<div>${d.parte}${percentual}${valor}</div>`;
                  })
                  .join('')}
              </div>`
            : '';
          return `
            <div class="border border-stone-200 rounded-xl p-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <div class="text-sm font-semibold text-stone-800">${tipoLabel(item.tipo)}</div>
                  <div class="text-xs text-stone-500">${item.descricao || ''}</div>
                </div>
                <div class="flex items-center gap-2 text-xs">
                  <button class="text-stone-500 hover:text-stone-900" data-fin-edit="${item.id}">Editar</button>
                  <button class="text-red-600 hover:text-red-700" data-fin-remove="${item.id}">Excluir</button>
                </div>
              </div>
              <div class="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <div class="text-xs uppercase tracking-wide text-stone-400">Proveito</div>
                  <div class="text-stone-900">${base}</div>
                </div>
                <div>
                  <div class="text-xs uppercase tracking-wide text-stone-400">Percentual</div>
                  <div class="text-stone-900">${item.percentual || '—'}</div>
                </div>
                <div>
                  <div class="text-xs uppercase tracking-wide text-stone-400">Honorários</div>
                  <div class="text-stone-900">${honor}</div>
                </div>
                <div>
                  <div class="text-xs uppercase tracking-wide text-stone-400">Repasse</div>
                  <div class="text-stone-900">${repasse}</div>
                </div>
              </div>
              <div class="mt-3 flex flex-wrap items-center gap-3 text-xs text-stone-500">
                <span>Previsão: ${previsao || '—'}</span>
                <span>Pago: ${pago}</span>
                <span>Repassado: ${repassado}</span>
              </div>
              ${divisoes}
            </div>
          `;
        })
        .join('');

      financeiroEl.innerHTML = `
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-semibold text-stone-700">Financeiro</h2>
          <button id="financeiroNovo" class="text-xs text-stone-500 hover:text-stone-900">Novo lançamento</button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div class="border border-stone-200 rounded-xl p-3 bg-stone-50">
            <div class="text-xs uppercase tracking-wide text-stone-400">Proveito total</div>
            <div class="text-sm font-semibold text-stone-900 mt-1">${formatCurrencyValue(totalProveito)}</div>
          </div>
          <div class="border border-stone-200 rounded-xl p-3 bg-stone-50">
            <div class="text-xs uppercase tracking-wide text-stone-400">Honorários totais</div>
            <div class="text-sm font-semibold text-stone-900 mt-1">${formatCurrencyValue(totalHonorarios)}</div>
          </div>
          <div class="border border-stone-200 rounded-xl p-3 bg-stone-50">
            <div class="text-xs uppercase tracking-wide text-stone-400">Repasse total</div>
            <div class="text-sm font-semibold text-stone-900 mt-1">${formatCurrencyValue(totalRepasse)}</div>
          </div>
        </div>
        <div class="space-y-3">
          ${rows || '<div class="text-sm text-stone-500">Nenhum lançamento financeiro.</div>'}
        </div>
      `;

      const novoBtn = qs('#financeiroNovo');
      if (novoBtn) {
        novoBtn.addEventListener('click', () => openFinanceiroModal());
      }
    };

    if (!hasFinanceAccess && financeiroEl) {
      financeiroEl.classList.add('hidden');
    }

    if (hasFinanceAccess && financeiroEl) {
      try {
        const resp = await api.financeiro.listByProcesso(id);
        financeiroItems = resp?.data || [];
        renderFinanceiro();
      } catch (err) {
        financeiroEl.innerHTML =
          '<div class="text-sm text-stone-500">Não foi possível carregar o financeiro.</div>';
      }
    }

    if (hasFinanceAccess && financeiroEl) {
      financeiroEl.addEventListener('click', (event) => {
        const editId = event.target.dataset.finEdit;
        const removeId = event.target.dataset.finRemove;
        if (editId) {
          const item = financeiroItems.find((it) => String(it.id) === String(editId));
          if (item) openFinanceiroModal(item);
        }
        if (removeId) {
          if (confirm('Deseja excluir este lançamento financeiro?')) {
            api.financeiro
              .remove(removeId)
              .then(async () => {
                const resp = await api.financeiro.listByProcesso(id);
                financeiroItems = resp?.data || [];
                renderFinanceiro();
              })
              .catch((err) => alert(err.message));
          }
        }
      });
    }

    const renderAndamentos = (resp, lastLog) => {
      if (!andamentosEl) return;
      const movimentos = Array.isArray(resp?.movimentos) ? resp.movimentos : [];
      const atualizadoEm = resp?.data?.created_at ? formatDateTime(resp.data.created_at) : '';
      const ultimaMov = resp?.data?.data_ultima_movimentacao
        ? formatDateTime(resp.data.data_ultima_movimentacao)
        : '';

      const itens = movimentos.slice(0, 10).map((mov) => {
        const dataMov =
          formatDateTime(mov?.dataHora || mov?.data || mov?.data_movimentacao || mov?.dataMovimento) || '—';
        const titulo = mov?.nome || mov?.descricao || mov?.movimento || mov?.codigo || 'Movimentação';
        const complemento = mov?.complemento || mov?.texto || '';
        return `
          <div class="py-3">
            <div class="text-xs uppercase tracking-wide text-stone-400">${dataMov}</div>
            <div class="text-sm text-stone-900 mt-1">${titulo}</div>
            ${complemento ? `<div class="text-sm text-stone-500 mt-1">${complemento}</div>` : ''}
          </div>
        `;
      });

      let bodyHtml = itens.length
        ? `<div class="divide-y divide-stone-200/70">${itens.join('')}</div>`
        : '<div class="text-sm text-stone-500">Sem andamentos disponíveis no momento.</div>';

      if (!itens.length && lastLog?.status === 'not_found') {
        bodyHtml = `<div class="text-sm text-stone-500">Processo não localizado no DataJud.</div>`;
      }

      andamentosEl.innerHTML = `
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-semibold text-stone-700">Andamentos</h2>
          <div class="flex items-center gap-3 text-xs">
            <button id="processoAndamentosSeen" class="text-stone-500 hover:text-stone-900">Marcar como lido</button>
            <button id="processoAndamentosSync" class="text-stone-500 hover:text-stone-900">Atualizar</button>
          </div>
        </div>
        <div class="bg-white border border-stone-200 rounded-2xl p-5">
          ${bodyHtml}
          <div class="mt-4 text-xs text-stone-400">
            ${ultimaMov ? `Última movimentação: ${ultimaMov}` : ''}
            ${ultimaMov && atualizadoEm ? ' • ' : ''}
            ${atualizadoEm ? `Atualizado em: ${atualizadoEm}` : ''}
          </div>
        </div>
      `;

      const syncBtn = qs('#processoAndamentosSync');
      if (syncBtn) {
        syncBtn.addEventListener('click', async () => {
          syncBtn.textContent = 'Atualizando...';
          syncBtn.disabled = true;
          try {
            const updated = await api.processos.syncAndamentos(id);
            const logs = await api.processos.andamentosLogs(id, { limit: 1 });
            renderAndamentos(updated, logs?.data?.[0]);
            updateProcessosBadge();
          } catch (err) {
            andamentosEl.innerHTML = `<div class="text-sm text-stone-500">Não foi possível atualizar os andamentos.</div>`;
          }
        });
      }

      const seenBtn = qs('#processoAndamentosSeen');
      if (seenBtn) {
        seenBtn.addEventListener('click', async () => {
          seenBtn.textContent = 'Marcando...';
          seenBtn.disabled = true;
          try {
            await api.processos.markAndamentosSeen(id);
            updateProcessosBadge();
          } catch (err) {
            // ignore
          } finally {
            seenBtn.textContent = 'Marcar como lido';
            seenBtn.disabled = false;
          }
        });
      }
    };

    const renderLogs = (logsResp) => {
      if (!logsEl) return;
      const logs = Array.isArray(logsResp?.data) ? logsResp.data : [];
      if (!logs.length) {
        logsEl.innerHTML = '<div class="text-sm text-stone-500">Nenhum log de sincronização.</div>';
        return;
      }
      const items = logs.slice(0, 12).map((log) => {
        const when = formatDateTime(log.created_at) || '—';
        const status = log.status || 'info';
        const msg = log.mensagem || '';
        return `
          <div class="py-2">
            <div class="text-xs uppercase tracking-wide text-stone-400">${when}</div>
            <div class="text-sm text-stone-900">${status}</div>
            ${msg ? `<div class="text-sm text-stone-500 mt-1">${msg}</div>` : ''}
          </div>
        `;
      });
      logsEl.innerHTML = `
        <div class="text-sm font-semibold text-stone-700 mb-2">Logs de sincronização</div>
        <div class="bg-white border border-stone-200 rounded-2xl p-5">
          <div class="divide-y divide-stone-200/70">${items.join('')}</div>
        </div>
      `;
    };

    if (editBtn && editModal && editForm) {
      editBtn.addEventListener('click', async () => {
        editForm.reset();
        showMessage(editMessage, '');
        try {
          const allClientes = [];
          let page = 1;
          const limit = 100;
          while (true) {
            const clientesResp = await api.clientes.list({ page, limit });
            allClientes.push(...clientesResp.data);
            if (clientesResp.data.length < limit) break;
            page += 1;
          }
          editClienteOptions.innerHTML = allClientes
            .map((c) => `<option value="${c.nome}" data-id="${c.id}"></option>`)
            .join('');
          editClienteInput.value = processo.cliente_nome || '';
          editClienteId.value = processo.cliente_id || '';
        } catch (_) {}

        if (!editClienteId.value && processo.cliente_id) {
          const fallbackNome = processo.cliente_nome || `Cliente #${processo.cliente_id}`;
          editClienteOptions.innerHTML = `<option value="${fallbackNome}" data-id="${processo.cliente_id}"></option>`;
          editClienteInput.value = fallbackNome;
          editClienteId.value = processo.cliente_id;
        }

        editNumero.value = processo.numero_processo || '';
        editStatus.value = processo.status || '';
        if (editArea) {
          const areaValue = processo.area || '';
          const hasArea = Array.from(editArea.options || []).some((opt) => opt.value === areaValue);
          if (areaValue && !hasArea) {
            const opt = document.createElement('option');
            opt.value = areaValue;
            opt.textContent = areaValue;
            editArea.appendChild(opt);
          }
          editArea.value = areaValue;
        }
        if (editClasse) {
          const classeValue = processo.classe || '';
          const hasClasse = Array.from(editClasse.options || []).some((opt) => opt.value === classeValue);
          if (classeValue && !hasClasse) {
            const opt = document.createElement('option');
            opt.value = classeValue;
            opt.textContent = classeValue;
            editClasse.appendChild(opt);
          }
          editClasse.value = classeValue;
        }
        editOrgao.value = processo.orgao || '';
        editVara.value = processo.vara || '';
        editGrau.value = processo.grau || '';
        editEstado.value = processo.estado || '';
        await syncEditCidadeByEstado(processo.cidade || '');
        editSistema.value = processo.sistema || '';
        editDistribuicao.value = processo.distribuicao || '';
        const editResultadoInfo = normalizeResultadoAndRecurso(processo.resultado, processo.recurso_inominado);
        editResultado.value = editResultadoInfo.resultado || '';
        if (editInterpostoRecurso) {
          editInterpostoRecurso.checked = editResultadoInfo.recurso === 'Sim';
        }
        editParteContraria.value = processo.parte_contraria || '';
        if (editAbrirConta) editAbrirConta.checked = String(processo.abrir_conta || '').toLowerCase() === 'sim';
        if (editContaAberta) editContaAberta.checked = String(processo.conta_aberta || '').toLowerCase() === 'sim';
        toggleEditContaBeneficio();
        if (editOrgaoGrid) {
          editOrgaoGrid.querySelectorAll('.orgao-btn').forEach((btn) => {
            const isActive = btn.dataset.value === editOrgao.value;
            btn.classList.toggle('border-stone-900', isActive);
            btn.classList.toggle('bg-stone-50', isActive);
          });
        }

        if (editClienteInput && editClienteOptions && editClienteId) {
          editClienteInput.addEventListener('input', () => {
            const match = Array.from(editClienteOptions.options).find(
              (opt) => opt.value === editClienteInput.value
            );
            editClienteId.value = match ? match.dataset.id : '';
          });
        }

        editModal.classList.remove('hidden');
        editModal.classList.add('flex');
      });
    }

    if (financeiroClose && financeiroModal) {
      financeiroClose.addEventListener('click', () => closeFinanceiroModal());
    }

    if (financeiroCancel && financeiroModal) {
      financeiroCancel.addEventListener('click', () => closeFinanceiroModal());
    }

    if (financeiroTipo) {
      financeiroTipo.addEventListener('change', () => {
        toggleFinanceiroDivisoes();
      });
    }

    if (financeiroValorBase) {
      financeiroValorBase.addEventListener('input', calcularFinanceiroModal);
      financeiroValorBase.addEventListener('blur', calcularFinanceiroModal);
    }
    if (financeiroPercentual) {
      financeiroPercentual.addEventListener('input', calcularFinanceiroModal);
      financeiroPercentual.addEventListener('blur', calcularFinanceiroModal);
    }

    if (financeiroAddDivisao) {
      financeiroAddDivisao.addEventListener('click', () => addDivisaoRow());
    }

    if (financeiroForm) {
      financeiroForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showMessage(financeiroMessage, '');

        if (!financeiroTipo.value) {
          showMessage(financeiroMessage, 'Informe o tipo do lançamento.');
          return;
        }

        const divisoes = financeiroDivisoesList
          ? qsa('[data-div-row]').map((row) => {
              const parte = row.querySelector('.financeiroDivParte')?.value || '';
              const percentual = row.querySelector('.financeiroDivPercentual')?.value || '';
              const valor = row.querySelector('.financeiroDivValor')?.value || '';
              return { parte, percentual, valor };
            })
          : [];

        const payload = {
          tipo: financeiroTipo.value,
          descricao: financeiroDescricao?.value.trim() || '',
          valor_base: financeiroValorBase?.value.trim() || '',
          percentual: financeiroPercentual?.value.trim() || '',
          honorarios_calculados: financeiroHonorarios?.value.trim() || '',
          repasse_calculado: financeiroRepasse?.value.trim() || '',
          previsao_pagamento_mes: financeiroPrevisao?.value || '',
          pago: financeiroPago && financeiroPago.checked ? 'Sim' : 'No',
          repassado: financeiroRepassado && financeiroRepassado.checked ? 'Sim' : 'No',
          divisoes,
        };

        try {
          if (financeiroId.value) {
            await api.financeiro.update(financeiroId.value, payload);
          } else {
            await api.financeiro.create(id, payload);
          }
          closeFinanceiroModal();
          const resp = await api.financeiro.listByProcesso(id);
          financeiroItems = resp?.data || [];
          renderFinanceiro();
        } catch (err) {
          showMessage(financeiroMessage, err.message);
        }
      });
    }

    const quickModal = qs('#atividadeQuickModal');
    const quickClose = qs('#atividadeQuickClose');
    const quickCancel = qs('#atividadeQuickCancel');
    const quickForm = qs('#atividadeQuickForm');
    const quickSubmitBtn = quickForm
      ? quickForm.querySelector('button[type="submit"], button:not([type]), input[type="submit"]')
      : null;
    const quickModalTitle = qs('#atividadeQuickModalTitle');
    const quickSubmitLabel = qs('#atividadeQuickSubmitLabel');
    const quickAtividadeId = qs('#atividadeQuickId');
    const quickMessage = qs('#atividadeQuickMessage');
    const quickProcessoId = qs('#atividadeQuickProcessoId');
    const quickNumero = qs('#atividadeQuickNumero');
    const quickCliente = qs('#atividadeQuickCliente');
    const quickTitulo = qs('#atividadeQuickTitulo');
    const quickDescricao = qs('#atividadeQuickDescricao');
    const quickPrazo = qs('#atividadeQuickPrazo');
    const quickHoraWrap = qs('#atividadeQuickHoraWrap');
    const quickHora = qs('#atividadeQuickHora');
    const quickRequiresHour = (title) => {
      const normalized = String(title || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
      return normalized.startsWith('audiencia') || normalized.startsWith('pericia');
    };

    let quickFormSubmitting = false;
    let quickEditingAtividade = null;

    const closeQuickAtividadeModal = () => {
      if (!quickModal) return;
      quickModal.classList.add('hidden');
      quickModal.classList.remove('flex');
    };

    const openQuickAtividadeModal = ({ processo, titulo, atividade = null }) => {
      if (!quickModal) return;
      quickMessage.textContent = '';
      quickFormSubmitting = false;
      quickEditingAtividade = atividade || null;
      if (quickSubmitBtn) {
        quickSubmitBtn.disabled = false;
        quickSubmitBtn.classList.remove('opacity-60', 'cursor-not-allowed');
      }
      if (quickModalTitle) {
        quickModalTitle.textContent = quickEditingAtividade ? 'Editar atividade' : 'Nova atividade';
      }
      if (quickSubmitLabel) {
        quickSubmitLabel.textContent = quickEditingAtividade ? 'Salvar alterações' : 'Salvar atividade';
      }
      if (quickAtividadeId) {
        quickAtividadeId.value = quickEditingAtividade?.id ? String(quickEditingAtividade.id) : '';
      }
      quickProcessoId.value = processo.id || '';
      quickNumero.value = processo.numero_processo || '';
      quickCliente.value = processo.cliente_nome || '';

      if (quickEditingAtividade) {
        quickTitulo.value = cleanText(quickEditingAtividade.titulo) || 'Atividade';
        if (quickDescricao) quickDescricao.value = quickEditingAtividade.descricao || '';
        quickPrazo.value = normalizeDateValue(quickEditingAtividade.prazo);
        if (quickHora) {
          quickHora.value = quickEditingAtividade.prazo_hora
            ? String(quickEditingAtividade.prazo_hora).slice(0, 5)
            : '';
        }
      } else {
        const clienteNome = processo.cliente_nome || '';
        const baseTitulo = titulo || '';
        quickTitulo.value =
          quickRequiresHour(baseTitulo) && clienteNome ? `${baseTitulo} ${clienteNome}` : baseTitulo;
        if (quickDescricao) quickDescricao.value = '';
        quickPrazo.value = '';
        if (quickHora) quickHora.value = '';
      }

      const precisaHora = quickRequiresHour(quickTitulo.value);
      if (quickHoraWrap) quickHoraWrap.classList.toggle('hidden', !precisaHora);
      if (!precisaHora && quickHora) quickHora.value = '';
      quickModal.classList.remove('hidden');
      quickModal.classList.add('flex');
    };

    if (quickTitulo && quickHoraWrap) {
      quickTitulo.addEventListener('input', () => {
        const precisaHora = quickRequiresHour(quickTitulo.value);
        quickHoraWrap.classList.toggle('hidden', !precisaHora);
        if (!precisaHora && quickHora) quickHora.value = '';
      });
    }

    if (quickClose && quickModal) {
      quickClose.addEventListener('click', () => {
        closeQuickAtividadeModal();
      });
    }

    if (quickCancel && quickModal) {
      quickCancel.addEventListener('click', () => {
        closeQuickAtividadeModal();
      });
    }

    if (quickForm) {
      quickForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (quickFormSubmitting) return;
        quickMessage.textContent = '';
        const titulo = quickTitulo.value.trim();
        const precisaHora = quickRequiresHour(titulo);
        if (!titulo) {
          showMessage(quickMessage, 'Informe o nome da atividade.');
          return;
        }
        if (precisaHora && quickPrazo.value && !quickHora.value) {
          showMessage(quickMessage, 'Informe a hora da atividade.');
          return;
        }
        const descricaoTexto = quickDescricao ? quickDescricao.value.trim() : '';
        const payload = {
          processo_id: Number(quickProcessoId.value) || null,
          titulo,
          prazo: quickPrazo.value || null,
          prazo_hora: quickPrazo.value && precisaHora && quickHora.value ? quickHora.value : null,
          descricao: descricaoTexto || null,
          status: quickEditingAtividade?.status || 'a_fazer',
          prioridade: quickEditingAtividade?.prioridade || 'media',
        };
        quickFormSubmitting = true;
        if (quickSubmitBtn) {
          quickSubmitBtn.disabled = true;
          quickSubmitBtn.classList.add('opacity-60', 'cursor-not-allowed');
        }
        try {
          const editId =
            Number(quickAtividadeId?.value || quickEditingAtividade?.id || 0) || null;
          if (editId) {
            await api.atividades.update(editId, payload);
          } else {
            await api.atividades.create(payload);
          }
          closeQuickAtividadeModal();
          window.location.reload();
        } catch (err) {
          showMessage(quickMessage, err.message);
        } finally {
          quickFormSubmitting = false;
          if (quickSubmitBtn) {
            quickSubmitBtn.disabled = false;
            quickSubmitBtn.classList.remove('opacity-60', 'cursor-not-allowed');
          }
        }
      });
    }

    if (editClose && editModal) {
      editClose.addEventListener('click', () => {
        editModal.classList.add('hidden');
        editModal.classList.remove('flex');
      });
    }

    if (editCancel && editModal) {
      editCancel.addEventListener('click', () => {
        editModal.classList.add('hidden');
        editModal.classList.remove('flex');
      });
    }

    if (editSubmit && editForm) {
      editSubmit.addEventListener('click', (event) => {
        event.preventDefault();
        showMessage(editMessage, 'Salvando...');
        if (typeof editForm.requestSubmit === 'function') {
          editForm.requestSubmit();
        } else {
          editForm.dispatchEvent(new Event('submit', { cancelable: true }));
        }
      });
    }

    if (editOrgaoGrid && editOrgao) {
      editOrgaoGrid.addEventListener('click', (event) => {
        const btn = event.target.closest('.orgao-btn');
        if (!btn) return;
        editOrgao.value = btn.dataset.value || '';
        editOrgaoGrid.querySelectorAll('.orgao-btn').forEach((item) => {
          const isActive = item === btn;
          item.classList.toggle('border-stone-900', isActive);
          item.classList.toggle('bg-stone-50', isActive);
        });
      });
    }

    if (editArea) {
      editArea.addEventListener('change', toggleEditContaBeneficio);
      editArea.addEventListener('input', toggleEditContaBeneficio);
    }
    if (editEstado) {
      editEstado.addEventListener('change', () => {
        syncEditCidadeByEstado('').catch(() => null);
      });
    }

    if (editForm) {
      editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showMessage(editMessage, '');
        if (!editClienteId.value && editClienteInput?.value && editClienteOptions) {
          const match = Array.from(editClienteOptions.options).find(
            (opt) => opt.value.toLowerCase() === editClienteInput.value.toLowerCase()
          );
          if (match?.dataset?.id) editClienteId.value = match.dataset.id;
        }
        if (!editClienteId.value || !editNumero.value.trim()) {
          showMessage(editMessage, 'Campos obrigatórios: cliente válido e número do processo.');
          return;
        }
        const payload = {
          cliente_id: Number(editClienteId.value),
          numero_processo: editNumero.value.trim(),
          status: editStatus.value.trim(),
          area: editArea.value.trim(),
          fase: '',
          classe: editClasse.value.trim(),
          orgao: editOrgao.value.trim(),
          vara: editVara.value.trim(),
          grau: editGrau.value.trim(),
          cidade: editCidade.value.trim(),
          estado: editEstado.value.trim(),
          sistema: editSistema.value.trim(),
          distribuicao: editDistribuicao.value.trim(),
          resultado: editResultado.value.trim(),
          recurso_inominado: editInterpostoRecurso?.checked ? 'Sim' : 'No',
          parte_contraria: editParteContraria.value.trim(),
          abrir_conta: isPrevidenciario(editArea.value) ? (editAbrirConta?.checked ? 'Sim' : 'No') : null,
          conta_aberta: isPrevidenciario(editArea.value) ? (editContaAberta?.checked ? 'Sim' : 'No') : null,
        };

        try {
          await api.processos.update(id, payload);
          editModal.classList.add('hidden');
          editModal.classList.remove('flex');
          window.location.reload();
        } catch (err) {
          showMessage(editMessage, err.message);
        }
      });
    }

    if (andamentosEl) {
      try {
        const andamentos = await api.processos.andamentos(id);
        const logs = await api.processos.andamentosLogs(id, { limit: 1 });
        renderAndamentos(andamentos, logs?.data?.[0]);
        updateProcessosBadge();
      } catch (err) {
        andamentosEl.innerHTML = `<div class="text-sm text-stone-500">Andamentos indisponíveis.</div>`;
      }
    }

    if (logsEl) {
      try {
        const logs = await api.processos.andamentosLogs(id, { limit: 20 });
        renderLogs(logs);
      } catch (err) {
        logsEl.innerHTML = '<div class="text-sm text-stone-500">Logs indisponíveis.</div>';
      }
    }
  } catch (err) {
    erroEl.textContent = err.message || 'Erro ao carregar processo.';
  }
}

async function initAjustes() {
  await guardAuth();
  bindLogout();

  const msgEl = qs('#ajustesMessage');
  const configForm = qs('#ajustesConfigForm');
  const configNome = qs('#ajustesNomeExibicao');
  const configUf = qs('#ajustesUfDjen');
  const configTema = qs('#ajustesTema');

  const colaboradorForm = qs('#ajustesColaboradorForm');
  const colaboradoresBody = qs('#ajustesColaboradoresBody');
  const colaboradorSenhaModal = qs('#colaboradorSenhaModal');
  const colaboradorSenhaForm = qs('#colaboradorSenhaForm');
  const colaboradorSenhaUsuarioInfo = qs('#colaboradorSenhaUsuarioInfo');
  const colaboradorSenhaInput = qs('#colaboradorSenhaNova');
  const colaboradorSenhaConfirmacaoInput = qs('#colaboradorSenhaConfirmacao');
  const colaboradorSenhaMessage = qs('#colaboradorSenhaMessage');
  const fecharColaboradorSenhaModalBtn = qs('#fecharColaboradorSenhaModal');
  const cancelarColaboradorSenhaModalBtn = qs('#cancelarColaboradorSenhaModal');
  const salvarColaboradorSenhaModalBtn = qs('#salvarColaboradorSenhaModal');
  const colaboradorSenhaNovaToggleBtn = qs('#colaboradorSenhaNovaToggle');
  const colaboradorSenhaConfirmacaoToggleBtn = qs('#colaboradorSenhaConfirmacaoToggle');

  const areaForm = qs('#ajustesAreaForm');
  const areaList = qs('#ajustesAreasList');

  const oabForm = qs('#ajustesOabForm');
  const oabList = qs('#ajustesOabsList');

  const procedimentoForm = qs('#ajustesProcedimentoForm');
  const procedimentosList = qs('#ajustesProcedimentosList');

  const importacaoForm = qs('#ajustesImportacaoForm');
  const importacaoOabPreset = qs('#ajustesImportacaoOabPreset');
  const importacaoOabNumero = qs('#ajustesImportacaoOabNumero');
  const importacaoOabUf = qs('#ajustesImportacaoOabUf');
  const importacaoDataInicio = qs('#ajustesImportacaoDataInicio');
  const importacaoDataFim = qs('#ajustesImportacaoDataFim');
  const importacaoMaxPaginas = qs('#ajustesImportacaoMaxPaginas');
  const importacaoMessage = qs('#ajustesImportacaoMessage');
  const importacaoResumo = qs('#ajustesImportacaoResumo');
  const importacaoBody = qs('#ajustesImportacaoBody');
  const importacaoSelecionarTodosBtn = qs('#ajustesImportacaoSelecionarTodos');
  const importacaoLimparSelecaoBtn = qs('#ajustesImportacaoLimparSelecao');
  const importacaoCadastrarTodosBtn = qs('#ajustesImportacaoCadastrarTodos');
  const importacaoAcoes = qs('#ajustesImportacaoAcoes');
  const importacaoCsvForm = qs('#ajustesImportacaoCsvForm');
  const importacaoCsvArquivo = qs('#ajustesImportacaoCsvArquivo');
  const importacaoCsvMessage = qs('#ajustesImportacaoCsvMessage');
  const importacaoCsvResumo = qs('#ajustesImportacaoCsvResumo');
  const importacaoCsvDownloadTemplate = qs('#ajustesImportacaoCsvDownloadTemplate');

  const escapeHtml = (value) =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  let state = {
    escritorio: null,
    config: null,
    colaboradores: [],
    areas: [],
    oabs: [],
    procedimentos: [],
    importacaoProcessos: [],
    importacaoResumo: null,
  };
  let colaboradorSenhaTargetId = null;

  const notify = (text, type = 'sucesso') => showMessage(msgEl, text, type);
  const normalizeAjustesPapel = (papel) => normalizeUserRole(papel);

  const resetPasswordToggle = (inputEl, buttonEl) => {
    if (!inputEl || !buttonEl) return;
    inputEl.type = 'password';
    buttonEl.textContent = 'Mostrar';
  };

  const togglePasswordVisibility = (inputEl, buttonEl) => {
    if (!inputEl || !buttonEl) return;
    const isPassword = inputEl.type === 'password';
    inputEl.type = isPassword ? 'text' : 'password';
    buttonEl.textContent = isPassword ? 'Ocultar' : 'Mostrar';
  };

  const closeColaboradorSenhaModal = () => {
    colaboradorSenhaTargetId = null;
    colaboradorSenhaForm?.reset();
    showMessage(colaboradorSenhaMessage, '');
    resetPasswordToggle(colaboradorSenhaInput, colaboradorSenhaNovaToggleBtn);
    resetPasswordToggle(colaboradorSenhaConfirmacaoInput, colaboradorSenhaConfirmacaoToggleBtn);
    closeModal(colaboradorSenhaModal);
  };

  const openColaboradorSenhaModal = (colaborador) => {
    if (!colaboradorSenhaModal || !colaborador) return;
    colaboradorSenhaTargetId = Number(colaborador.id);
    colaboradorSenhaForm?.reset();
    showMessage(colaboradorSenhaMessage, '');
    resetPasswordToggle(colaboradorSenhaInput, colaboradorSenhaNovaToggleBtn);
    resetPasswordToggle(colaboradorSenhaConfirmacaoInput, colaboradorSenhaConfirmacaoToggleBtn);
    if (colaboradorSenhaUsuarioInfo) {
      const identificador = colaborador.email || colaborador.usuario || '';
      colaboradorSenhaUsuarioInfo.textContent = identificador
        ? `Defina a nova senha para ${colaborador.nome} (${identificador}).`
        : `Defina a nova senha para ${colaborador.nome}.`;
    }
    openModal(colaboradorSenhaModal);
    colaboradorSenhaInput?.focus();
  };

  const normalizeText = (value) => String(value || '').trim();
  const normalizeDigits = (value) => String(value || '').replace(/\D/g, '');
  const numeroProcessoKey = (value) => {
    const digits = normalizeDigits(value);
    if (digits) return `d:${digits}`;
    const plain = normalizeText(value).toLowerCase();
    return plain ? `e:${plain}` : '';
  };

  const ensureImportacaoDateDefaults = () => {
    if (!importacaoDataInicio || !importacaoDataFim) return;
    if (importacaoDataInicio.value && importacaoDataFim.value) return;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 365);
    const toIso = (date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };
    if (!importacaoDataFim.value) importacaoDataFim.value = toIso(end);
    if (!importacaoDataInicio.value) importacaoDataInicio.value = toIso(start);
  };

  const collectImportacaoSelecionados = () =>
    (state.importacaoProcessos || []).filter(
      (item) => !item.excluido && !item.processo_encontrado && !item.importado_agora
    );

  const renderConfig = () => {
    if (configNome) configNome.value = state.config?.nome_exibicao || '';
    if (configUf) configUf.value = (state.config?.djen_uf_padrao || 'BA').toUpperCase();
    const temaAtual = normalizeThemeValue(state.config?.tema || getStoredThemeValue());
    if (configTema) configTema.value = temaAtual;
    applyTheme(temaAtual);
  };

  const renderColaboradores = () => {
    if (!colaboradoresBody) return;
    colaboradoresBody.innerHTML = state.colaboradores
      .map(
        (colab) => `
          <tr class="border-b border-stone-100">
            <td class="py-2 pr-3">
              <div class="font-medium text-stone-800">${escapeHtml(colab.nome)}</div>
              <div class="text-xs text-stone-400">${escapeHtml(colab.email || '-')}</div>
              <div class="text-xs text-stone-400">${escapeHtml(colab.usuario || '-')}</div>
            </td>
            <td class="py-2 pr-3">
              <select data-colab-papel="${colab.id}" class="border rounded-lg px-2 py-1 text-xs">
                <option value="administrador" ${normalizeAjustesPapel(colab.papel) === 'administrador' ? 'selected' : ''}>Administrador</option>
                <option value="advogado" ${normalizeAjustesPapel(colab.papel) === 'advogado' ? 'selected' : ''}>Advogado</option>
                <option value="estagiario" ${normalizeAjustesPapel(colab.papel) === 'estagiario' ? 'selected' : ''}>Estagiário</option>
              </select>
            </td>
            <td class="py-2 text-right">
              <div class="inline-flex gap-2">
                <button data-colab-password="${colab.id}" class="text-xs px-2 py-1 border rounded-md hover:bg-stone-50">Senha</button>
                <button data-colab-save="${colab.id}" class="text-xs px-2 py-1 border rounded-md hover:bg-stone-50">Salvar</button>
                <button data-colab-remove="${colab.id}" class="text-xs px-2 py-1 border border-red-200 text-red-600 rounded-md hover:bg-red-50">Remover</button>
              </div>
            </td>
          </tr>
        `
      )
      .join('');
  };

  const renderAreas = () => {
    if (!areaList) return;
    areaList.innerHTML = state.areas
      .map(
        (area) => `
          <div class="flex items-center justify-between border border-stone-200 rounded-lg px-3 py-2">
            <div>
              <div class="text-sm font-medium">${escapeHtml(area.nome)}</div>
              <div class="text-xs text-stone-400">Ordem: ${Number(area.ordem || 0)}</div>
            </div>
            <div class="inline-flex gap-2">
              <button data-area-toggle="${area.id}" class="text-xs px-2 py-1 border rounded-md hover:bg-stone-50">
                ${area.ativo ? 'Ativa' : 'Inativa'}
              </button>
              <button data-area-remove="${area.id}" class="text-xs px-2 py-1 border border-red-200 text-red-600 rounded-md hover:bg-red-50">Remover</button>
            </div>
          </div>
        `
      )
      .join('');
  };

  const renderOabs = () => {
    if (!oabList) return;
    oabList.innerHTML = state.oabs
      .map(
        (oab) => `
          <div class="flex items-center justify-between border border-stone-200 rounded-lg px-3 py-2">
            <div>
              <div class="text-sm font-medium">${escapeHtml(oab.numero)}/${escapeHtml(oab.uf)}</div>
              <div class="text-xs text-stone-400">${escapeHtml(oab.etiqueta || '-')}</div>
            </div>
            <div class="inline-flex gap-2">
              <button data-oab-toggle="${oab.id}" class="text-xs px-2 py-1 border rounded-md hover:bg-stone-50">
                ${oab.ativo ? 'Ativa' : 'Inativa'}
              </button>
              <button data-oab-remove="${oab.id}" class="text-xs px-2 py-1 border border-red-200 text-red-600 rounded-md hover:bg-red-50">Remover</button>
            </div>
          </div>
        `
      )
      .join('');
  };

  const renderProcedimentos = () => {
    if (!procedimentosList) return;
    procedimentosList.innerHTML = state.procedimentos
      .map(
        (item) => `
          <div class="border border-stone-200 rounded-xl p-3">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="text-sm font-semibold text-stone-800">${escapeHtml(item.titulo)}</div>
                <div class="text-xs text-stone-500 mt-1">${escapeHtml(item.descricao || '-')}</div>
                ${
                  item.anexo_url
                    ? `<a class="inline-flex mt-2 text-xs text-blue-700 hover:text-blue-900 underline" href="${item.anexo_url}" target="_blank">Visualizar anexo</a>`
                    : '<div class="text-xs text-stone-400 mt-2">Sem anexo</div>'
                }
              </div>
              <div class="inline-flex gap-2">
                <button data-proc-toggle="${item.id}" class="text-xs px-2 py-1 border rounded-md hover:bg-stone-50">
                  ${item.ativo ? 'Ativo' : 'Inativo'}
                </button>
                <button data-proc-remove="${item.id}" class="text-xs px-2 py-1 border border-red-200 text-red-600 rounded-md hover:bg-red-50">Remover</button>
              </div>
            </div>
          </div>
        `
      )
      .join('');
  };

  const renderImportacaoOabPreset = () => {
    if (!importacaoOabPreset) return;
    const options = (state.oabs || [])
      .filter((item) => item.ativo !== false)
      .map(
        (item) =>
          `<option value="${item.id}" data-numero="${escapeHtml(item.numero)}" data-uf="${escapeHtml(
            item.uf
          )}">${escapeHtml(item.numero)}/${escapeHtml(item.uf)}${item.etiqueta ? ` - ${escapeHtml(item.etiqueta)}` : ''}</option>`
      )
      .join('');
    importacaoOabPreset.innerHTML = `<option value="custom">Outra OAB</option>${options}`;
  };

  const applyImportacaoPresetValue = () => {
    if (!importacaoOabPreset || !importacaoOabNumero || !importacaoOabUf) return;
    const selectedValue = String(importacaoOabPreset.value || 'custom');
    if (selectedValue === 'custom') {
      importacaoOabNumero.disabled = false;
      importacaoOabUf.disabled = false;
      if (!importacaoOabUf.value && state.config?.djen_uf_padrao) {
        importacaoOabUf.value = String(state.config.djen_uf_padrao).toUpperCase();
      }
      return;
    }
    const selectedOption = importacaoOabPreset.options[importacaoOabPreset.selectedIndex];
    const numero = selectedOption?.dataset?.numero || '';
    const uf = selectedOption?.dataset?.uf || '';
    importacaoOabNumero.value = numero;
    importacaoOabUf.value = String(uf || state.config?.djen_uf_padrao || '').toUpperCase();
    importacaoOabNumero.disabled = true;
    importacaoOabUf.disabled = true;
  };

  const renderImportacaoResumo = () => {
    const total = Number((state.importacaoProcessos || []).length || 0);
    const selecionados = collectImportacaoSelecionados().length;

    if (importacaoAcoes) {
      importacaoAcoes.classList.toggle('hidden', total === 0);
      importacaoAcoes.classList.toggle('flex', total > 0);
    }

    if (importacaoResumo) {
      if (!total) {
        importacaoResumo.textContent = 'Nenhuma busca realizada.';
      } else {
        const jaCadastrados = (state.importacaoProcessos || []).filter((item) => item.processo_encontrado).length;
        const importadosAgora = (state.importacaoProcessos || []).filter((item) => item.importado_agora).length;
        importacaoResumo.textContent = `${total} processo(s) • ${jaCadastrados} já cadastrado(s) • ${importadosAgora} importado(s) • ${selecionados} selecionado(s)`;
      }
    }

    if (importacaoSelecionarTodosBtn) {
      importacaoSelecionarTodosBtn.disabled = total === 0;
      importacaoSelecionarTodosBtn.classList.toggle('opacity-50', total === 0);
      importacaoSelecionarTodosBtn.classList.toggle('cursor-not-allowed', total === 0);
    }
    if (importacaoLimparSelecaoBtn) {
      importacaoLimparSelecaoBtn.disabled = total === 0;
      importacaoLimparSelecaoBtn.classList.toggle('opacity-50', total === 0);
      importacaoLimparSelecaoBtn.classList.toggle('cursor-not-allowed', total === 0);
    }
    if (importacaoCadastrarTodosBtn) {
      importacaoCadastrarTodosBtn.disabled = selecionados === 0;
      importacaoCadastrarTodosBtn.classList.toggle('opacity-50', selecionados === 0);
      importacaoCadastrarTodosBtn.classList.toggle('cursor-not-allowed', selecionados === 0);
    }
  };

  const renderImportacaoResultados = () => {
    if (!importacaoBody) return;
    const rows = state.importacaoProcessos || [];
    if (!rows.length) {
      importacaoBody.innerHTML =
        '<tr><td colspan="5" class="py-6 px-3 text-center text-stone-400">Nenhum processo listado.</td></tr>';
      renderImportacaoResumo();
      return;
    }

    importacaoBody.innerHTML = rows
      .map((item, index) => {
        const numero = escapeHtml(item.numero_processo || '-');
        const clienteSugerido = escapeHtml(item.cliente_sugerido || '-');
        const historico = `${Number(item.total_publicacoes || 0)} publicação(ões)`;
        const periodo = `${formatDateBR(item.primeira_publicacao)} até ${formatDateBR(
          item.ultima_publicacao
        )}`;
        const processoLink = item.processo_id
          ? `<a href="./processo?id=${item.processo_id}" class="text-blue-700 hover:text-blue-900 underline">${numero}</a>`
          : numero;
        const bloqueado =
          item.processo_encontrado ||
          item.importado_agora ||
          item.importacao_status === 'ja_cadastrado_outro_escritorio' ||
          item.importacao_status === 'numero_invalido';
        const checked = !item.excluido && !bloqueado;
        const mutedClass = item.excluido && !bloqueado ? 'opacity-50' : '';

        let statusHtml =
          '<span class="inline-flex px-2 py-0.5 rounded-full text-xs bg-stone-100 text-stone-700">Selecionado</span>';
        if (item.importado_agora) {
          statusHtml =
            '<span class="inline-flex px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">Importado</span>';
        } else if (item.processo_encontrado) {
          statusHtml = `<span class="inline-flex px-2 py-0.5 rounded-full text-xs bg-stone-100 text-stone-700">Já cadastrado${
            item.processo_cliente_nome ? ` (${escapeHtml(item.processo_cliente_nome)})` : ''
          }</span>`;
        } else if (item.excluido) {
          statusHtml =
            '<span class="inline-flex px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">Excluído</span>';
        }
        if (item.importacao_status === 'ja_cadastrado_outro_escritorio') {
          statusHtml =
            '<span class="inline-flex px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">Em outro escritório</span>';
        }
        if (item.importacao_status === 'numero_invalido') {
          statusHtml =
            '<span class="inline-flex px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">Número inválido</span>';
        }
        if (item.importacao_status === 'erro_importacao') {
          statusHtml =
            '<span class="inline-flex px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">Erro</span>';
        }

        const btnCadastrar = !bloqueado
          ? `<button data-importacao-cadastrar="${index}" class="px-2 py-1 text-xs border border-stone-300 rounded-md hover:bg-stone-50">Cadastrar</button>`
          : '';
        const btnExcluir = !bloqueado
          ? `<button data-importacao-toggle="${index}" class="px-2 py-1 text-xs border border-stone-300 rounded-md hover:bg-stone-50">${
              item.excluido ? 'Reincluir' : 'Excluir'
            }</button>`
          : '';
        const acoes =
          btnCadastrar || btnExcluir
            ? `${btnCadastrar} ${btnExcluir}`
            : `<span class="text-xs text-stone-400">Sem ação</span>`;

        return `
          <tr class="border-b border-stone-100 ${mutedClass}">
            <td class="py-2 px-3 align-top">
              <input
                type="checkbox"
                data-importacao-checkbox="${index}"
                class="accent-[#0C1B33]"
                ${checked ? 'checked' : ''}
                ${bloqueado ? 'disabled' : ''}
              />
            </td>
            <td class="py-2 px-3 align-top">
              <div class="font-medium text-stone-900">${processoLink}</div>
              <div class="text-xs text-stone-500 mt-1">Cliente: ${clienteSugerido}</div>
              <div class="text-xs text-stone-500">${escapeHtml(item.tribunal || '-')} · ${escapeHtml(item.orgao || '-')}</div>
            </td>
            <td class="py-2 px-3 align-top">
              <div class="text-stone-700">${escapeHtml(historico)}</div>
              <div class="text-xs text-stone-500 mt-1">${escapeHtml(periodo)}</div>
            </td>
            <td class="py-2 px-3 align-top">${statusHtml}</td>
            <td class="py-2 px-3 align-top text-right">
              <div class="inline-flex items-center gap-1">${acoes}</div>
            </td>
          </tr>
        `;
      })
      .join('');

    renderImportacaoResumo();
  };

  const renderImportacaoCsvResumo = (resumo) => {
    if (!importacaoCsvResumo) return;
    if (!resumo) {
      importacaoCsvResumo.textContent = '';
      return;
    }
    const linhas = Number(resumo.linhas_total || 0);
    const clientesCriados = Number(resumo.clientes_criados || 0);
    const clientesEncontrados = Number(resumo.clientes_encontrados || 0);
    const processosCriados = Number(resumo.processos_criados || 0);
    const processosIgnorados = Number(resumo.processos_ignorados || 0);
    const invalidos = Number(resumo.invalidos || 0);
    const erros = Number(resumo.erros || 0);
    importacaoCsvResumo.textContent =
      `${linhas} linha(s) lida(s) • ` +
      `${clientesCriados} cliente(s) novo(s) • ` +
      `${clientesEncontrados} cliente(s) já existente(s) • ` +
      `${processosCriados} processo(s) criado(s) • ` +
      `${processosIgnorados} processo(s) ignorado(s) • ` +
      `${invalidos} inválido(s) • ${erros} erro(s)`;
  };

  const normalizeImportacaoRows = (rows) =>
    (rows || []).map((item) => ({
      ...item,
      cliente_sugerido: item.cliente_sugerido || '',
      parte_contraria_sugerida: item.parte_contraria_sugerida || '',
      numero_key: numeroProcessoKey(item.numero_processo || item.numero_processo_raw),
      excluido: Boolean(item.processo_encontrado),
      importado_agora: false,
      importacao_status: '',
    }));

  const aplicarResultadoImportacao = (result) => {
    const createdByKey = new Map(
      (result?.created || []).map((item) => [numeroProcessoKey(item.numero_processo), item])
    );
    const skippedByKey = new Map(
      (result?.skipped || []).map((item) => [numeroProcessoKey(item.numero_processo), item])
    );
    const errorsByKey = new Map(
      (result?.errors || [])
        .filter((item) => item?.numero_processo)
        .map((item) => [numeroProcessoKey(item.numero_processo), item])
    );
    const invalidByKey = new Map(
      (result?.invalidos || [])
        .filter((item) => item?.numero_processo)
        .map((item) => [numeroProcessoKey(item.numero_processo), item])
    );

    state.importacaoProcessos = (state.importacaoProcessos || []).map((item) => {
      const key = item.numero_key || numeroProcessoKey(item.numero_processo);
      const created = createdByKey.get(key);
      if (created) {
        return {
          ...item,
          importado_agora: true,
          processo_encontrado: true,
          processo_id: created.id,
          processo_cliente_nome: created.cliente_nome || item.processo_cliente_nome || item.cliente_sugerido || null,
          excluido: true,
          importacao_status: 'importado',
        };
      }
      const skipped = skippedByKey.get(key);
      if (skipped && skipped.motivo === 'ja_cadastrado') {
        return {
          ...item,
          processo_encontrado: true,
          processo_id: skipped.processo_id || item.processo_id || null,
          processo_cliente_nome: skipped.cliente_nome || item.processo_cliente_nome || null,
          excluido: true,
          importacao_status: 'ja_cadastrado',
        };
      }
      if (skipped && skipped.motivo === 'ja_cadastrado_outro_escritorio') {
        return {
          ...item,
          processo_encontrado: true,
          processo_id: skipped.processo_id || item.processo_id || null,
          processo_cliente_nome: skipped.cliente_nome || item.processo_cliente_nome || null,
          excluido: true,
          importacao_status: 'ja_cadastrado',
        };
      }
      if (invalidByKey.has(key)) {
        return {
          ...item,
          excluido: true,
          importacao_status: 'numero_invalido',
        };
      }
      if (errorsByKey.has(key)) {
        return {
          ...item,
          excluido: true,
          importacao_status: 'erro_importacao',
        };
      }
      return item;
    });
  };

  const load = async () => {
    notify('');
    const resumo = await api.ajustes.resumo();
    state = {
      ...state,
      escritorio: resumo.escritorio || null,
      config: resumo.config || null,
      colaboradores: resumo.colaboradores || [],
      areas: resumo.areas || [],
      oabs: resumo.oabs || [],
      procedimentos: resumo.procedimentos || [],
    };
    ensureImportacaoDateDefaults();
    renderConfig();
    renderColaboradores();
    renderAreas();
    renderOabs();
    renderImportacaoOabPreset();
    applyImportacaoPresetValue();
    renderImportacaoResultados();
    renderProcedimentos();
  };

  configForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const temaSelecionado = normalizeThemeValue(configTema?.value || getStoredThemeValue());
    try {
      await api.ajustes.updateConfig({
        nome_exibicao: configNome?.value?.trim() || '',
        djen_uf_padrao: configUf?.value?.trim() || 'BA',
        tema: temaSelecionado,
      });
      applyTheme(temaSelecionado);
      await load();
      notify('Configuração atualizada.', 'sucesso');
    } catch (err) {
      notify(err.message || 'Erro ao salvar configuração.', 'erro');
    }
  });

  configTema?.addEventListener('change', () => {
    applyTheme(configTema.value);
  });

  colaboradorForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api.ajustes.createColaborador({
        nome: qs('#ajustesColabNome')?.value?.trim() || '',
        email: qs('#ajustesColabEmail')?.value?.trim() || '',
        usuario: qs('#ajustesColabUsuario')?.value?.trim() || '',
        senha: qs('#ajustesColabSenha')?.value || '',
        papel: qs('#ajustesColabPapel')?.value || 'advogado',
      });
      colaboradorForm.reset();
      await load();
      notify('Colaborador salvo.', 'sucesso');
    } catch (err) {
      notify(err.message || 'Erro ao salvar colaborador.', 'erro');
    }
  });

  colaboradorSenhaNovaToggleBtn?.addEventListener('click', () =>
    togglePasswordVisibility(colaboradorSenhaInput, colaboradorSenhaNovaToggleBtn)
  );
  colaboradorSenhaConfirmacaoToggleBtn?.addEventListener('click', () =>
    togglePasswordVisibility(colaboradorSenhaConfirmacaoInput, colaboradorSenhaConfirmacaoToggleBtn)
  );

  fecharColaboradorSenhaModalBtn?.addEventListener('click', closeColaboradorSenhaModal);
  cancelarColaboradorSenhaModalBtn?.addEventListener('click', closeColaboradorSenhaModal);
  colaboradorSenhaModal?.addEventListener('click', (event) => {
    if (event.target === colaboradorSenhaModal) {
      closeColaboradorSenhaModal();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && colaboradorSenhaModal && !colaboradorSenhaModal.classList.contains('hidden')) {
      closeColaboradorSenhaModal();
    }
  });

  colaboradorSenhaForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!Number.isInteger(colaboradorSenhaTargetId) || colaboradorSenhaTargetId <= 0) {
      showMessage(colaboradorSenhaMessage, 'Colaborador inválido.');
      return;
    }

    const novaSenha = String(colaboradorSenhaInput?.value || '');
    const confirmacaoSenha = String(colaboradorSenhaConfirmacaoInput?.value || '');
    if (!novaSenha || novaSenha.length < 6) {
      showMessage(colaboradorSenhaMessage, 'A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (novaSenha !== confirmacaoSenha) {
      showMessage(colaboradorSenhaMessage, 'As senhas não conferem.');
      return;
    }

    try {
      if (salvarColaboradorSenhaModalBtn) salvarColaboradorSenhaModalBtn.disabled = true;
      showMessage(colaboradorSenhaMessage, '');
      await api.ajustes.updateColaborador(colaboradorSenhaTargetId, { senha: novaSenha });
      closeColaboradorSenhaModal();
      notify('Senha atualizada com sucesso.', 'sucesso');
    } catch (err) {
      showMessage(colaboradorSenhaMessage, err.message || 'Erro ao atualizar senha.');
    } finally {
      if (salvarColaboradorSenhaModalBtn) salvarColaboradorSenhaModalBtn.disabled = false;
    }
  });

  colaboradoresBody?.addEventListener('click', async (event) => {
    const saveId = event.target.getAttribute('data-colab-save');
    const removeId = event.target.getAttribute('data-colab-remove');
    const passwordId = event.target.getAttribute('data-colab-password');

    if (passwordId) {
      const colaborador = (state.colaboradores || []).find((item) => String(item.id) === String(passwordId));
      if (!colaborador) {
        notify('Colaborador não encontrado.', 'erro');
        return;
      }
      openColaboradorSenhaModal(colaborador);
      return;
    }

    if (saveId) {
      const papelInput = colaboradoresBody.querySelector(`[data-colab-papel="${saveId}"]`);
      try {
        await api.ajustes.updateColaborador(saveId, { papel: papelInput?.value || 'advogado' });
        await load();
        notify('Perfil do colaborador atualizado.', 'sucesso');
      } catch (err) {
        notify(err.message || 'Erro ao atualizar colaborador.', 'erro');
      }
    }

    if (removeId) {
      if (!confirm('Remover colaborador deste escritório?')) return;
      try {
        await api.ajustes.removeColaborador(removeId);
        await load();
        notify('Colaborador removido.', 'sucesso');
      } catch (err) {
        notify(err.message || 'Erro ao remover colaborador.', 'erro');
      }
    }
  });

  areaForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api.ajustes.createArea({
        nome: qs('#ajustesAreaNome')?.value?.trim() || '',
        ordem: Number(qs('#ajustesAreaOrdem')?.value || 0),
      });
      areaForm.reset();
      await load();
      notify('Área cadastrada.', 'sucesso');
    } catch (err) {
      notify(err.message || 'Erro ao cadastrar área.', 'erro');
    }
  });

  areaList?.addEventListener('click', async (event) => {
    const toggleId = event.target.getAttribute('data-area-toggle');
    const removeId = event.target.getAttribute('data-area-remove');
    if (toggleId) {
      const area = state.areas.find((item) => String(item.id) === String(toggleId));
      if (!area) return;
      try {
        await api.ajustes.updateArea(toggleId, { ativo: !area.ativo });
        await load();
      } catch (err) {
        notify(err.message || 'Erro ao atualizar área.', 'erro');
      }
    }
    if (removeId) {
      if (!confirm('Remover área?')) return;
      try {
        await api.ajustes.removeArea(removeId);
        await load();
      } catch (err) {
        notify(err.message || 'Erro ao remover área.', 'erro');
      }
    }
  });

  oabForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api.ajustes.createOab({
        numero: qs('#ajustesOabNumero')?.value?.trim() || '',
        uf: qs('#ajustesOabUf')?.value?.trim() || '',
        etiqueta: qs('#ajustesOabEtiqueta')?.value?.trim() || '',
      });
      oabForm.reset();
      await load();
      notify('OAB cadastrada.', 'sucesso');
    } catch (err) {
      notify(err.message || 'Erro ao cadastrar OAB.', 'erro');
    }
  });

  oabList?.addEventListener('click', async (event) => {
    const toggleId = event.target.getAttribute('data-oab-toggle');
    const removeId = event.target.getAttribute('data-oab-remove');
    if (toggleId) {
      const oab = state.oabs.find((item) => String(item.id) === String(toggleId));
      if (!oab) return;
      try {
        await api.ajustes.updateOab(toggleId, { ativo: !oab.ativo });
        await load();
      } catch (err) {
        notify(err.message || 'Erro ao atualizar OAB.', 'erro');
      }
    }
    if (removeId) {
      if (!confirm('Remover OAB?')) return;
      try {
        await api.ajustes.removeOab(removeId);
        await load();
      } catch (err) {
        notify(err.message || 'Erro ao remover OAB.', 'erro');
      }
    }
  });

  importacaoOabPreset?.addEventListener('change', () => {
    applyImportacaoPresetValue();
  });

  const executarImportacao = async (rows) => {
    const processos = (rows || []).map((item) => ({
      numero_processo: item.numero_processo,
      tribunal: item.tribunal || '',
      orgao: item.orgao || '',
      classe: item.classe || '',
      primeira_publicacao: item.primeira_publicacao || '',
      cliente_sugerido: item.cliente_sugerido || '',
      parte_contraria_sugerida: item.parte_contraria_sugerida || '',
    }));
    if (!processos.length) {
      showMessage(importacaoMessage, 'Nenhum processo selecionado para importar.', 'erro');
      return;
    }

    showMessage(importacaoMessage, 'Cadastrando processos selecionados...', 'sucesso');
    try {
      const result = await api.ajustes.importarProcessos({
        fonte: 'djen',
        processos,
      });
      aplicarResultadoImportacao(result);
      renderImportacaoResultados();

      const created = Number(result?.resumo?.created || 0);
      const skipped = Number(result?.resumo?.skipped || 0);
      const errors = Number(result?.resumo?.errors || 0);
      showMessage(
        importacaoMessage,
        `Importação concluída: ${created} criado(s), ${skipped} ignorado(s), ${errors} erro(s).`,
        errors ? 'erro' : 'sucesso'
      );
    } catch (err) {
      showMessage(importacaoMessage, err.message || 'Erro ao importar processos.', 'erro');
    }
  };

  importacaoForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      fonte: 'djen',
      numero_oab: importacaoOabNumero?.value?.trim() || '',
      uf_oab: importacaoOabUf?.value?.trim() || '',
      data_inicio: importacaoDataInicio?.value || '',
      data_fim: importacaoDataFim?.value || '',
      max_paginas: Number(importacaoMaxPaginas?.value || 20),
      itens_por_pagina: 100,
    };

    showMessage(importacaoMessage, 'Buscando processos vinculados à OAB...', 'sucesso');
    try {
      const response = await api.ajustes.previewImportacaoProcessos(payload);
      state.importacaoProcessos = normalizeImportacaoRows(response?.data || []);
      state.importacaoResumo = response?.resumo || null;
      renderImportacaoResultados();
      const total = Number(response?.resumo?.total_processos_identificados || 0);
      const truncado = response?.resumo?.truncado;
      const suffix = truncado ? ' (resultado parcial: aumente o limite de páginas)' : '';
      showMessage(importacaoMessage, `${total} processo(s) identificado(s).${suffix}`, 'sucesso');
    } catch (err) {
      state.importacaoProcessos = [];
      state.importacaoResumo = null;
      renderImportacaoResultados();
      showMessage(importacaoMessage, err.message || 'Erro ao buscar processos por OAB.', 'erro');
    }
  });

  importacaoCsvForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = importacaoCsvArquivo?.files?.[0] || null;
    if (!file) {
      showMessage(importacaoCsvMessage, 'Selecione um arquivo CSV para importar.', 'erro');
      renderImportacaoCsvResumo(null);
      return;
    }

    showMessage(importacaoCsvMessage, 'Importando CSV...', 'sucesso');
    renderImportacaoCsvResumo(null);
    try {
      const result = await api.ajustes.importarClientesProcessosCsv(file);
      const resumo = result?.resumo || {};
      const processosCriados = Number(resumo.processos_criados || 0);
      const erros = Number(resumo.erros || 0);
      const invalidos = Number(resumo.invalidos || 0);
      showMessage(
        importacaoCsvMessage,
        `Importação concluída: ${processosCriados} processo(s) criado(s), ${invalidos} inválido(s), ${erros} erro(s).`,
        erros ? 'erro' : 'sucesso'
      );
      renderImportacaoCsvResumo(resumo);
      importacaoCsvForm.reset();
    } catch (err) {
      showMessage(importacaoCsvMessage, err.message || 'Erro ao importar CSV.', 'erro');
      renderImportacaoCsvResumo(null);
    }
  });

  importacaoCsvDownloadTemplate?.addEventListener('click', async () => {
    try {
      await api.ajustes.downloadTemplateImportacaoCsv();
      showMessage(importacaoCsvMessage, 'Download do modelo iniciado.', 'sucesso');
    } catch (err) {
      showMessage(importacaoCsvMessage, err.message || 'Erro ao baixar template CSV.', 'erro');
    }
  });

  importacaoSelecionarTodosBtn?.addEventListener('click', () => {
    state.importacaoProcessos = (state.importacaoProcessos || []).map((item) => {
      if (item.processo_encontrado || item.importado_agora) return item;
      return { ...item, excluido: false };
    });
    renderImportacaoResultados();
  });

  importacaoLimparSelecaoBtn?.addEventListener('click', () => {
    state.importacaoProcessos = (state.importacaoProcessos || []).map((item) => {
      if (item.processo_encontrado || item.importado_agora) return item;
      return { ...item, excluido: true };
    });
    renderImportacaoResultados();
  });

  importacaoCadastrarTodosBtn?.addEventListener('click', async () => {
    const selecionados = collectImportacaoSelecionados();
    await executarImportacao(selecionados);
  });

  importacaoBody?.addEventListener('click', async (event) => {
    const toggleIndex = event.target.getAttribute('data-importacao-toggle');
    if (toggleIndex !== null && toggleIndex !== undefined) {
      const idx = Number(toggleIndex);
      if (Number.isFinite(idx) && state.importacaoProcessos[idx]) {
        const item = state.importacaoProcessos[idx];
        if (!item.processo_encontrado && !item.importado_agora) {
          state.importacaoProcessos[idx] = { ...item, excluido: !item.excluido };
          renderImportacaoResultados();
        }
      }
      return;
    }

    const cadastrarIndex = event.target.getAttribute('data-importacao-cadastrar');
    if (cadastrarIndex !== null && cadastrarIndex !== undefined) {
      const idx = Number(cadastrarIndex);
      if (!Number.isFinite(idx) || !state.importacaoProcessos[idx]) return;
      const item = state.importacaoProcessos[idx];
      await executarImportacao([item]);
    }
  });

  importacaoBody?.addEventListener('change', (event) => {
    const checkbox = event.target.closest('[data-importacao-checkbox]');
    if (!checkbox) return;
    const idx = Number(checkbox.getAttribute('data-importacao-checkbox'));
    if (!Number.isFinite(idx) || !state.importacaoProcessos[idx]) return;
    const item = state.importacaoProcessos[idx];
    if (item.processo_encontrado || item.importado_agora) return;
    state.importacaoProcessos[idx] = { ...item, excluido: !checkbox.checked };
    renderImportacaoResultados();
  });

  procedimentoForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const fileInput = qs('#ajustesProcedimentoAnexo');
      const file = fileInput?.files?.[0] || null;
      await api.ajustes.createProcedimento(
        {
          titulo: qs('#ajustesProcedimentoTitulo')?.value?.trim() || '',
          descricao: qs('#ajustesProcedimentoDescricao')?.value?.trim() || '',
          ordem: Number(qs('#ajustesProcedimentoOrdem')?.value || 0),
          ativo: true,
        },
        file
      );
      procedimentoForm.reset();
      await load();
      notify('Procedimento cadastrado.', 'sucesso');
    } catch (err) {
      notify(err.message || 'Erro ao cadastrar procedimento.', 'erro');
    }
  });

  procedimentosList?.addEventListener('click', async (event) => {
    const toggleId = event.target.getAttribute('data-proc-toggle');
    const removeId = event.target.getAttribute('data-proc-remove');
    if (toggleId) {
      const item = state.procedimentos.find((proc) => String(proc.id) === String(toggleId));
      if (!item) return;
      try {
        await api.ajustes.updateProcedimento(toggleId, { ativo: !item.ativo }, null);
        await load();
      } catch (err) {
        notify(err.message || 'Erro ao atualizar procedimento.', 'erro');
      }
    }
    if (removeId) {
      if (!confirm('Remover procedimento?')) return;
      try {
        await api.ajustes.removeProcedimento(removeId);
        await load();
      } catch (err) {
        notify(err.message || 'Erro ao remover procedimento.', 'erro');
      }
    }
  });

  await load();
}

async function init() {
  initTheme();
  captureTokenFromUrl();
  initProcessNumberCopy();
  ensureModalBodyScrollLockObserver();
  const page = document.body.dataset.page;
  if (page === 'login') return initLogin();
  if (page === 'dashboard') return initDashboard();
  if (page === 'clientes') return initClientes();
  if (page === 'processos') return initProcessos();
  if (page === 'financeiro') return initFinanceiro();
  if (page === 'atividades') return initAtividades();
  if (page === 'publicacoes-djen') return initPublicacoesDjen();
  if (page === 'ajustes') return initAjustes();
  if (page === 'cliente') return initClienteDetail();
  if (page === 'processo') return initProcessoDetail();
}

init();
