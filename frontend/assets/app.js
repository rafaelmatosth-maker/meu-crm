function qs(selector) {
  return document.querySelector(selector);
}

function qsa(selector) {
  return Array.from(document.querySelectorAll(selector));
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
  if (!value) return '-';
  const normalized = normalizeDateValue(value);
  const date = new Date(normalized.includes('T') ? normalized : `${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '-';
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}

function formatDateTimeBR(value) {
  if (!value) return '-';
  const normalized = normalizeDateValue(value);
  const date = new Date(normalized.includes('T') ? normalized : value);
  if (Number.isNaN(date.getTime())) return '-';
  const base = formatDateBR(date);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${base} ${hh}:${mm}`;
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

function openModal(modal) {
  modal.classList.remove('hidden');
}

function closeModal(modal) {
  modal.classList.add('hidden');
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

async function guardAuth() {
  try {
    await getMe();
    updateProcessosBadge();
  } catch (err) {
    clearToken();
    window.location.href = './login.html';
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
    window.location.href = './login.html';
  });
}

async function initLogin() {
  const msg = qs('#loginMessage');
  const params = new URLSearchParams(window.location.search);
  const erro = params.get('erro');
  if (erro === 'credenciais') {
    showMessage(msg, 'Credenciais inválidas. Tente novamente.');
  } else if (erro === 'campos') {
    showMessage(msg, 'Informe e-mail e senha.');
  } else if (erro === 'servidor') {
    showMessage(msg, 'Erro no servidor. Tente novamente.');
  } else {
    showMessage(msg, '');
  }
}

async function initDashboard() {
  await guardAuth();
  bindLogout();

  const [clientes, processos, atividades, atividadesFeitas] = await Promise.all([
    api.clientes.list({ page: 1, limit: 1 }),
    api.processos.list({ page: 1, limit: 1 }),
    api.atividades.list({ page: 1, limit: 1 }),
    api.atividades.list({ page: 1, limit: 1, status: 'feito' }),
  ]);

  qs('#countClientes').textContent = clientes.total;
  qs('#countProcessos').textContent = processos.total;
  qs('#countAtividades').textContent = atividades.total;
  qs('#countAtivas').textContent = atividades.total - atividadesFeitas.total;

  const listaEl = qs('#dashboardHojeLista');
  const vazioEl = qs('#dashboardHojeVazio');
  const infoEl = qs('#dashboardHojeInfo');

  const getTodayIso = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const renderHoje = async () => {
    const hoje = getTodayIso();
    const response = await api.atividades.list({ page: 1, limit: 100, prazo: hoje });
    const itens = response.data || [];
    infoEl.textContent = `${itens.length} item(s)`;
    if (!itens.length) {
      listaEl.innerHTML = '';
      vazioEl.classList.remove('hidden');
      return;
    }
    vazioEl.classList.add('hidden');
    listaEl.innerHTML = itens
      .map((a) => {
        const subtitulo = `${a.numero_processo || ''}${a.cliente_nome ? ` • ${a.cliente_nome}` : ''}`;
        return `
          <div class="border border-stone-200 rounded-xl p-4">
            <div class="font-medium text-stone-900">${a.titulo}</div>
            <div class="text-xs text-stone-500 mt-1">${subtitulo}</div>
            <div class="text-xs text-stone-500 mt-2">Prazo: ${a.prazo ? formatDateBR(a.prazo) : '-'}</div>
          </div>
        `;
      })
      .join('');
  };

  renderHoje();
  initSidebarWidgets();
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
          isToday ? 'bg-stone-900 text-white' : 'text-stone-600'
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

  let clientes = [];
  let page = 1;
  let limit = Number(limitSelect?.value) || 100;
  let total = 0;
  let buscaTimeout;
  let sortDir = 'asc';
  const processosCache = new Map();

  function updateSortLabel() {
    if (!sortBtn) return;
    const asc = sortDir === 'asc';
    sortBtn.textContent = asc ? '▲' : '▼';
    sortBtn.title = asc ? 'Ordenar A-Z' : 'Ordenar Z-A';
    sortBtn.setAttribute('aria-label', sortBtn.title);
  }

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
    qs('#clienteQualificacao').value = cliente.qualificacao || '';
    qs('#clienteProcessosNotion').value = cliente.processos_notion || '';
    qs('#clienteDataChegada').value = normalizeDateValue(cliente.data_chegada);
    qs('#clienteStatus').value = cliente.status || 'lead';

    atualizarIdade(dataNascimentoInput, idadeInfo, idadeHidden);
    bindMask(cpfInput, formatCpf);
    bindMask(rgInput, formatRg);
    openModal(modal);
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
              <a class="text-stone-900 hover:text-stone-700 font-medium" href="./cliente.html?id=${c.id}">
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
            `<div><a class="text-blue-600 hover:text-blue-800" href="./processo.html?id=${p.id}">${p.numero_processo}</a></div>`
        );
      const html = linhas.length ? `<div class="space-y-1">${linhas.join('')}</div>` : '-';
      processosCache.set(clienteId, html);
      container.innerHTML = html;
    } catch (_) {
      container.textContent = '-';
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

  openBtn.addEventListener('click', () => {
    form.reset();
    form.dataset.id = '';
    showMessage(msg, '');
    if (dataChegadaInput) {
      dataChegadaInput.value = new Date().toISOString().slice(0, 10);
    }
    atualizarIdade(dataNascimentoInput, idadeInfo, idadeHidden);
    openModal(modal);
  });

  closeBtn.addEventListener('click', () => closeModal(modal));

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

  await load();
}

async function initProcessos() {
  await guardAuth();
  bindLogout();

  const tableBody = qs('#processosTableBody');
  const modal = qs('#processoModal');
  const documentoModal = qs('#documentoModal');
  const openBtn = qs('#novoProcessoBtn');
  const closeBtn = qs('#fecharProcessoModal');
  const closeDocumentoBtn = qs('#fecharDocumentoModal');
  const form = qs('#processoForm');
  const msg = qs('#processoMessage');
  const clienteInput = qs('#processoClienteInput');
  const clienteOptions = qs('#processoClienteOptions');
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
  const faseInput = qs('#processoFase');
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
  const parteContrariaInput = qs('#processoParteContraria');
  const contaBeneficioWrap = qs('#processoContaBeneficioWrap');
  const abrirContaInput = qs('#processoAbrirConta');
  const contaAbertaInput = qs('#processoContaAberta');

  let processos = [];
  let clientes = [];
  let page = 1;
  let limit = Number(limitSelect?.value) || 10;
  let total = 0;
  let buscaTimeout;
  let processoDocumentoId = null;
  let sortDir = 'desc';
  let loadingClientes = null;
  let clientesModal = [];

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

  function renderClienteOptions(list) {
    if (!clienteOptions) return;
    clienteOptions.innerHTML = list
      .slice(0, 40)
      .map((c) => `<option value="${c.nome}" data-id="${c.id}"></option>`)
      .join('');
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
    filtroCliente.innerHTML = ['<option value="">Todos os clientes</option>']
      .concat(clientes.map((c) => `<option value="${c.id}">${c.nome}</option>`))
      .join('');
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

  function renderTable() {
    tableBody.innerHTML = processos
      .map(
        (p) => `
        <tr class="border-b border-stone-200">
          <td class="py-3">
            <a class="text-stone-900 hover:text-stone-700 font-medium" href="./processo.html?id=${p.id}">
              ${p.numero_processo}
            </a>
            ${
              p.tem_novo_andamento
                ? '<span class="ml-2 inline-flex h-2 w-2 rounded-full bg-amber-400" title="Novo andamento"></span>'
                : ''
            }
          </td>
          <td class="py-3">${p.cliente_nome}</td>
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
        cliente_id: filtroCliente.value,
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

  const openProcessoModal = async () => {
    await loadAllClientes().catch(() => null);
    form.reset();
    form.dataset.id = '';
    showMessage(msg, '');
    renderClienteOptions(clientesModal);
    if (clienteId) clienteId.value = '';
    if (orgaoInput) orgaoInput.value = '';
    if (abrirContaInput) abrirContaInput.checked = false;
    if (contaAbertaInput) contaAbertaInput.checked = false;
    toggleContaBeneficio();
    if (orgaoGrid) {
      orgaoGrid.querySelectorAll('.orgao-btn').forEach((btn) => {
        btn.classList.remove('border-stone-900', 'bg-stone-50');
      });
    }
    openModal(modal);
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
      btn.className = 'bg-stone-900 text-white px-4 py-2 rounded-lg hover:bg-stone-800';
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

  busca.addEventListener('input', () => {
    clearTimeout(buscaTimeout);
    buscaTimeout = setTimeout(() => {
      page = 1;
      load();
    }, 300);
  });

  filtroCliente.addEventListener('change', () => {
    page = 1;
    load();
  });

  filtroStatus.addEventListener('input', () => {
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

  tableBody.addEventListener('click', (e) => {
    const editId = e.target.dataset.edit;
    const removeId = e.target.dataset.remove;
    const docsId = e.target.dataset.docs;

    if (editId) {
      const processo = processos.find((p) => String(p.id) === editId);
      if (!processo) return;
      form.dataset.id = processo.id;
      numeroInput.value = processo.numero_processo || '';
      areaInput.value = processo.area || '';
      faseInput.value = processo.fase || '';
      statusInput.value = processo.status || '';
      classeInput.value = processo.classe || '';
      orgaoInput.value = processo.orgao || '';
      varaInput.value = processo.vara || '';
      grauInput.value = processo.grau || '';
      cidadeInput.value = processo.cidade || '';
      estadoInput.value = processo.estado || '';
      sistemaInput.value = processo.sistema || '';
      distribuicaoInput.value = normalizeDateValue(processo.distribuicao || '');
      resultadoInput.value = processo.resultado || '';
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
      fase: faseInput.value.trim(),
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
      showMessage(msg, err.message);
    }
  });

  if (clienteInput && clienteOptions && clienteId) {
    clienteInput.addEventListener('input', () => {
      const query = clienteInput.value.trim();
      const source = clientesModal.length ? clientesModal : clientes;
      if (!query) {
        renderClienteOptions(source);
        clienteId.value = '';
        return;
      }
      const ranked = source
        .map((c, idx) => ({ c, idx, score: similarityScore(query, c.nome) }))
        .filter((it) => it.score >= 180)
        .sort((a, b) => (b.score - a.score) || (a.idx - b.idx))
        .map((it) => it.c);
      renderClienteOptions(ranked);
      const exact = ranked.find((c) => normalizeText(c.nome) === normalizeText(query));
      if (exact) {
        clienteId.value = exact.id;
        return;
      }
      const best = ranked[0];
      clienteId.value = best ? best.id : '';
    });
  }

  await load();
}

async function initAtividades() {
  await guardAuth();
  bindLogout();

  const columns = {
    a_fazer: qs('#colAFazer'),
    fazendo: qs('#colFazendo'),
    feito: qs('#colFeito'),
    cancelado: qs('#colCancelado'),
  };

  const modal = qs('#atividadeModal');
  const openBtn = qs('#novaAtividadeBtn');
  const closeBtn = qs('#fecharAtividadeModal');
  const form = qs('#atividadeForm');
  const msg = qs('#atividadeMessage');
  const processoSelect = qs('#atividadeProcesso');
  const processoNumeroInput = qs('#atividadeProcessoNumero');
  const filtroProcesso = qs('#atividadeFiltroProcesso');
  const filtroPrioridade = qs('#atividadeFiltroPrioridade');
  const busca = qs('#atividadeBusca');
  const limitSelect = qs('#atividadeLimit');
  const sortBtn = qs('#atividadeOrdenar');
  const info = qs('#atividadePaginacaoInfo');
  const prevBtn = qs('#atividadePrev');
  const nextBtn = qs('#atividadeNext');
  const paginaAtual = qs('#atividadePaginaAtual');

  let atividades = [];
  let processos = [];
  let page = 1;
  let limit = Number(limitSelect?.value) || 10;
  let total = 0;
  let buscaTimeout;
  let sortDir = 'asc';

  function updateSortLabel() {
    if (!sortBtn) return;
    const asc = sortDir === 'asc';
    sortBtn.textContent = asc ? '▲' : '▼';
    sortBtn.title = asc ? 'Ordenar A-Z' : 'Ordenar Z-A';
    sortBtn.setAttribute('aria-label', sortBtn.title);
  }

  function renderProcessosSelect() {
    processoSelect.innerHTML = ['<option value="">-</option>']
      .concat(processos.map((p) => `<option value="${p.id}">${p.numero_processo} - ${p.cliente_nome}</option>`))
      .join('');
    filtroProcesso.innerHTML = ['<option value="">Todos os processos</option>', '<option value="sem_processo">Sem processo</option>']
      .concat(
        processos.map((p) => `<option value="${p.id}">${p.numero_processo} - ${p.cliente_nome}</option>`)
      )
      .join('');
  }

  function renderKanban() {
    Object.values(columns).forEach((col) => (col.innerHTML = ''));

    atividades.forEach((a) => {
      const card = document.createElement('div');
      const subtitleParts = [];
      if (a.numero_processo) subtitleParts.push(a.numero_processo);
      if (a.cliente_nome) subtitleParts.push(a.cliente_nome);
      const subtitle = subtitleParts.length ? subtitleParts.join(' - ') : '-';
      card.className = 'bg-white border border-stone-200 rounded-xl p-4 shadow-sm';
      card.innerHTML = `
        <div class="text-sm text-stone-500">${subtitle}</div>
        <div class="font-medium mt-1">${a.titulo}</div>
        <div class="text-xs text-stone-500 mt-1">Prioridade: ${a.prioridade}</div>
        <div class="mt-3 flex items-center justify-between">
          <select class="text-xs border border-stone-200 rounded px-2 py-1" data-status="${a.id}">
            <option value="a_fazer" ${a.status === 'a_fazer' ? 'selected' : ''}>A fazer</option>
            <option value="fazendo" ${a.status === 'fazendo' ? 'selected' : ''}>Fazendo</option>
            <option value="feito" ${a.status === 'feito' ? 'selected' : ''}>Feito</option>
            <option value="cancelado" ${a.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
          </select>
          <div class="text-right">
            <button class="text-xs text-blue-600 mr-2" data-edit="${a.id}">Editar</button>
            <button class="text-xs text-red-600" data-remove="${a.id}">Excluir</button>
          </div>
        </div>
      `;
      columns[a.status]?.appendChild(card);
    });
  }

  async function load() {
    const filtroProcessoValue = filtroProcesso.value;
    const semProcesso = filtroProcessoValue === 'sem_processo';
    const [atividadesResp, processosResp] = await Promise.all([
      api.atividades.list({
        page,
        limit,
        processo_id: semProcesso ? '' : filtroProcessoValue,
        sem_processo: semProcesso ? 'true' : '',
        prioridade: filtroPrioridade.value,
        search: busca.value.trim(),
        sort: 'titulo',
        dir: sortDir,
      }),
      api.processos.list({ page: 1, limit: 100 }),
    ]);
    atividades = atividadesResp.data;
    total = atividadesResp.total;
    processos = processosResp.data;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    if (page > totalPages) {
      page = totalPages;
      return load();
    }
    renderProcessosSelect();
    info.textContent = `${total} resultado(s)`;
    paginaAtual.textContent = `Página ${page} de ${totalPages}`;
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= totalPages;
    renderKanban();
  }

  updateSortLabel();

  openBtn.addEventListener('click', () => {
    form.reset();
    form.dataset.id = '';
    showMessage(msg, '');
    renderProcessosSelect();
    if (processoNumeroInput) {
      processoNumeroInput.value = '';
      processoNumeroInput.disabled = false;
    }
    openModal(modal);
  });

  closeBtn.addEventListener('click', () => closeModal(modal));

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

  if (processoSelect && processoNumeroInput) {
    processoSelect.addEventListener('change', () => {
      const selected = processos.find((p) => String(p.id) === processoSelect.value);
      if (selected) {
        processoNumeroInput.value = selected.numero_processo || '';
        processoNumeroInput.disabled = true;
      } else {
        processoNumeroInput.value = '';
        processoNumeroInput.disabled = false;
      }
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

  Object.values(columns).forEach((col) => {
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
        form.dataset.id = atividade.id;
        processoSelect.value = atividade.processo_id || '';
        if (processoNumeroInput) {
          processoNumeroInput.value = atividade.numero_processo || '';
          processoNumeroInput.disabled = Boolean(atividade.processo_id);
        }
        qs('#atividadeTitulo').value = atividade.titulo || '';
        qs('#atividadeDescricao').value = atividade.descricao || '';
        qs('#atividadeStatus').value = atividade.status || 'a_fazer';
        qs('#atividadePrioridade').value = atividade.prioridade || 'media';
        qs('#atividadePrazo').value = atividade.prazo ? atividade.prazo.split('T')[0] : '';
        openModal(modal);
      }

      if (removeId) {
        if (confirm('Deseja excluir esta atividade?')) {
          api.atividades.remove(removeId).then(load).catch((err) => alert(err.message));
        }
      }
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showMessage(msg, '');

    const payload = {
      processo_id: processoSelect.value ? Number(processoSelect.value) : null,
      processo_numero: processoSelect.value
        ? null
        : (processoNumeroInput?.value || '').trim() || null,
      titulo: qs('#atividadeTitulo').value.trim(),
      descricao: qs('#atividadeDescricao').value.trim(),
      status: qs('#atividadeStatus').value,
      prioridade: qs('#atividadePrioridade').value,
      prazo: qs('#atividadePrazo').value || null,
    };

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
    }
  });

  await load();
}

async function initDocumentos() {
  await guardAuth();
  bindLogout();

  const modeloNome = qs('#modeloNome');
  const modeloArquivo = qs('#modeloArquivo');
  const modeloUploadBtn = qs('#modeloUploadBtn');
  const modeloUploadMsg = qs('#modeloUploadMsg');
  const modelosLista = qs('#modelosLista');

  const docClienteInput = qs('#docClienteInput');
  const docClientesDropdown = qs('#docClientesDropdown');
  const docModelo = qs('#docModelo');
  const docPreviewBtn = qs('#docPreviewBtn');
  const docDocxBtn = qs('#docDocxBtn');
  const docPdfBtn = qs('#docPdfBtn');
  const docPreview = qs('#docPreview');
  const docPreviewEmpty = qs('#docPreviewEmpty');
  const docActionMsg = qs('#docActionMsg');

  let modelos = [];
  let clientes = [];

  function normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function levenshtein(a, b) {
    const s = a || '';
    const t = b || '';
    const m = s.length;
    const n = t.length;
    if (!m) return n;
    if (!n) return m;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i += 1) dp[i][0] = i;
    for (let j = 0; j <= n; j += 1) dp[0][j] = j;
    for (let i = 1; i <= m; i += 1) {
      for (let j = 1; j <= n; j += 1) {
        const cost = s[i - 1] === t[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[m][n];
  }

  function renderModelosLista() {
    if (!modelosLista) return;
    if (!modelos.length) {
      modelosLista.innerHTML = '<div class="text-sm text-stone-500">Nenhum modelo enviado.</div>';
      return;
    }
    modelosLista.innerHTML = modelos
      .map(
        (m) => `
        <div class="flex items-center justify-between border border-stone-200 rounded-lg px-3 py-2">
          <div>
            <div class="font-medium">${fixMojibake(m.nome)}</div>
            <div class="text-xs text-stone-500">${fixMojibake(m.nome_original)}</div>
          </div>
          <button class="text-red-600 text-xs" data-remove-modelo="${m.id}">Excluir</button>
        </div>
      `
      )
      .join('');
  }

  function renderSelects() {
    renderClientesDropdown('');
    if (docModelo) {
      const options = modelos.length
        ? ['<option value="">Selecione um modelo</option>']
            .concat(
              modelos.map((m) => {
                const nome = fixMojibake(m.nome || m.nome_original || 'Modelo');
                return `<option value="${m.id}" title="${nome}">${nome}</option>`;
              })
            )
            .join('')
        : '<option value="">Nenhum modelo encontrado</option>';
      docModelo.innerHTML = options;
    }
  }

  function renderClientesDropdown(filterText) {
    if (!docClientesDropdown) return;
    const filtro = normalizeText(filterText);
    const lista = filtro
      ? clientes
          .map((c) => {
            const nome = c.nome || c.cliente_nome || c.razao_social || 'Cliente';
            const n = normalizeText(nome);
            let score = 0;
            if (n.startsWith(filtro)) score += 3;
            if (n.includes(filtro)) score += 2;
            const dist = levenshtein(n, filtro);
            const maxLen = Math.max(n.length, filtro.length) || 1;
            const sim = 1 - dist / maxLen;
            score += sim;
            return { c, nome, score };
          })
          .filter((x) => x.score > 0.45)
          .sort((a, b) => b.score - a.score)
          .slice(0, 20)
      : [];
    if (!lista.length) {
      docClientesDropdown.innerHTML = '';
      docClientesDropdown.classList.add('hidden');
      return;
    }
    docClientesDropdown.innerHTML = lista
      .map((item) => {
        const nome = item.nome;
        return `<button type="button" class="w-full text-left px-3 py-2 text-sm hover:bg-stone-50" data-cliente-id="${item.c.id}" data-cliente-nome="${nome}">${nome}</button>`;
      })
      .join('');
    docClientesDropdown.classList.remove('hidden');
  }

  async function loadBase() {
    const [modelosResult, clientesResult] = await Promise.allSettled([
      api.documentosModelos.list(),
      fetchAllClientes(),
    ]);

    if (modelosResult.status === 'fulfilled') {
      modelos = modelosResult.value || [];
    } else {
      modelos = [];
      if (modelosLista) {
        modelosLista.innerHTML =
          '<div class="text-sm text-red-600">Não foi possível carregar modelos. Reinicie o backend e tente novamente.</div>';
      }
    }

    if (clientesResult.status === 'fulfilled') {
      clientes = clientesResult.value || [];
    } else {
      clientes = [];
      showMessage(docActionMsg, 'Não foi possível carregar clientes.');
    }

    renderModelosLista();
    renderSelects();
  }

  async function fetchAllClientes() {
    const all = [];
    let page = 1;
    const limit = 200;
    let total = 0;
    do {
      const resp = await api.clientes.list({ page, limit, sort: 'nome', dir: 'asc' });
      const data = resp.data || [];
      total = resp.total || data.length;
      all.push(...data);
      page += 1;
    } while (all.length < total && page <= 50);
    return all;
  }

  if (modeloUploadBtn) {
    modeloUploadBtn.addEventListener('click', async () => {
      showMessage(modeloUploadMsg, '');
      if (!modeloNome || !modeloArquivo) return;
      const nome = modeloNome.value.trim();
      const file = modeloArquivo.files[0];
      if (!nome) {
        showMessage(modeloUploadMsg, 'Informe o nome do modelo.');
        return;
      }
      if (!file) {
        showMessage(modeloUploadMsg, 'Selecione um arquivo .docx.');
        return;
      }
      try {
        await api.documentosModelos.upload(nome, file);
        modeloNome.value = '';
        modeloArquivo.value = '';
        showMessage(modeloUploadMsg, 'Modelo enviado.', 'sucesso');
        await loadBase();
      } catch (err) {
        const msg = err.message || 'Erro ao enviar modelo.';
        showMessage(
          modeloUploadMsg,
          msg.includes('Rota não encontrada')
            ? 'Rota não encontrada. Reinicie o backend para ativar /documentos-modelos.'
            : msg
        );
      }
    });
  }

  if (modelosLista) {
    modelosLista.addEventListener('click', async (e) => {
      const removeId = e.target.dataset.removeModelo;
      if (removeId && confirm('Deseja excluir este modelo?')) {
        try {
          await api.documentosModelos.remove(removeId);
          await loadBase();
        } catch (err) {
          alert(err.message);
        }
      }
    });
  }

  function resolveClienteId() {
    const nomeRaw = String(docClienteInput?.value || '').trim();
    if (!nomeRaw) return '';
    const alvo = normalizeText(nomeRaw);
    let best = null;
    let bestScore = 0;
    clientes.forEach((c) => {
      const nome = c.nome || c.cliente_nome || c.razao_social || 'Cliente';
      const n = normalizeText(nome);
      let score = 0;
      if (n.startsWith(alvo)) score += 3;
      if (n.includes(alvo)) score += 2;
      const dist = levenshtein(n, alvo);
      const maxLen = Math.max(n.length, alvo.length) || 1;
      const sim = 1 - dist / maxLen;
      score += sim;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    });
    return best && bestScore > 0.5 ? String(best.id) : '';
  }

  if (docPreviewBtn) {
    docPreviewBtn.addEventListener('click', async () => {
      showMessage(docActionMsg, '');
      const modeloId = docModelo?.value;
      const clienteId = resolveClienteId();
      if (!modeloId || !clienteId) {
        showMessage(docActionMsg, 'Informe um cliente válido e selecione um modelo.');
        return;
      }
      try {
        const resp = await api.documentosModelos.preview(modeloId, Number(clienteId));
        if (docPreview) docPreview.innerHTML = resp.html || '';
        if (docPreviewEmpty) docPreviewEmpty.classList.add('hidden');
        showMessage(docActionMsg, 'Pré-visualização pronta.', 'sucesso');
      } catch (err) {
        showMessage(docActionMsg, err.message);
      }
    });
  }

  if (docPdfBtn) {
    docPdfBtn.addEventListener('click', async () => {
      showMessage(docActionMsg, '');
      const modeloId = docModelo?.value;
      const clienteId = resolveClienteId();
      if (!modeloId || !clienteId) {
        showMessage(docActionMsg, 'Informe um cliente válido e selecione um modelo.');
        return;
      }
      try {
        const modelo = modelos.find((m) => String(m.id) === String(modeloId));
        const cliente = clientes.find((c) => String(c.id) === String(clienteId));
        const filename = `${modelo?.nome || 'documento'}-${cliente?.nome || 'cliente'}.pdf`;
        await api.documentosModelos.downloadPdf(modeloId, Number(clienteId), filename);
      } catch (err) {
        showMessage(docActionMsg, err.message);
      }
    });
  }

  if (docDocxBtn) {
    docDocxBtn.addEventListener('click', async () => {
      showMessage(docActionMsg, '');
      const modeloId = docModelo?.value;
      const clienteId = resolveClienteId();
      if (!modeloId || !clienteId) {
        showMessage(docActionMsg, 'Informe um cliente válido e selecione um modelo.');
        return;
      }
      try {
        const modelo = modelos.find((m) => String(m.id) === String(modeloId));
        const cliente = clientes.find((c) => String(c.id) === String(clienteId));
        const filename = `${modelo?.nome || 'documento'}-${cliente?.nome || 'cliente'}.docx`;
        await api.documentosModelos.downloadDocx(modeloId, Number(clienteId), filename);
      } catch (err) {
        showMessage(docActionMsg, err.message);
      }
    });
  }

  if (docClienteInput) {
    docClienteInput.addEventListener('input', (e) => {
      renderClientesDropdown(e.target.value);
    });
    docClienteInput.addEventListener('focus', (e) => {
      renderClientesDropdown(e.target.value);
    });
  }

  if (docClientesDropdown) {
    docClientesDropdown.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-cliente-id]');
      if (!btn) return;
      if (docClienteInput) {
        docClienteInput.value = btn.dataset.clienteNome || '';
      }
      docClientesDropdown.classList.add('hidden');
    });
  }

  document.addEventListener('click', (e) => {
    if (!docClientesDropdown || !docClienteInput) return;
    if (docClientesDropdown.contains(e.target) || docClienteInput.contains(e.target)) return;
    docClientesDropdown.classList.add('hidden');
  });

  await loadBase();
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
    const processosLinhas = (processosResp.data || [])
      .filter((p) => p.numero_processo)
      .map(
        (p) =>
          `<div><a class="text-blue-600 hover:text-blue-800" href="./processo.html?id=${p.id}">${p.numero_processo}</a></div>`
      );
    const processosHtml = processosLinhas.length ? `<div class="space-y-1">${processosLinhas.join('')}</div>` : '';
    nomeEl.textContent = cliente.nome || 'Cliente';

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
      if (key === 'processos_relacionados') {
        if (!processosHtml) return '-';
        return processosHtml;
      }
      if (!value) return '-';
      if (key === 'link_pasta') {
        const val = String(value);
        if (val.startsWith('http://') || val.startsWith('https://')) {
          return `<a class="text-blue-600" href="${val}" target="_blank">Abrir</a>`;
        }
      }
      return String(value);
    };

    propsEl.innerHTML = `
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

    if (editBtn && editForm && editModal) {
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
      qs('#clienteEditQualificacao').value = cliente.qualificacao || '';
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
  const editForm = qs('#processoEditForm');
  const editMessage = qs('#processoEditMessage');
  const editClienteInput = qs('#processoEditClienteInput');
  const editClienteOptions = qs('#processoEditClienteOptions');
  const editClienteId = qs('#processoEditClienteId');
  const editNumero = qs('#processoEditNumero');
  const editStatus = qs('#processoEditStatus');
  const editArea = qs('#processoEditArea');
  const editFase = qs('#processoEditFase');
  const editClasse = qs('#processoEditClasse');
  const editOrgao = qs('#processoEditOrgao');
  const editOrgaoGrid = qs('#processoEditOrgaoGrid');
  const editVara = qs('#processoEditVara');
  const editGrau = qs('#processoEditGrau');
  const editCidade = qs('#processoEditCidade');
  const editEstado = qs('#processoEditEstado');
  const editSistema = qs('#processoEditSistema');
  const editPercentual = qs('#processoEditPercentual');
  const editDistribuicao = qs('#processoEditDistribuicao');
  const editPrevisao = qs('#processoEditPrevisao');
  const editResultado = qs('#processoEditResultado');
  const editStatusPagamento = qs('#processoEditStatusPagamento');
  const editComissao = qs('#processoEditComissao');
  const editHonorarioAdm = qs('#processoEditHonorarioAdm');
  const editHonorarios = qs('#processoEditHonorarios');
  const editHonorariosLiquidos = qs('#processoEditHonorariosLiquidos');
  const editRepassado = qs('#processoEditRepassado');
  const editRepasse = qs('#processoEditRepasse');
  const editParteContraria = qs('#processoEditParteContraria');
  const erroEl = qs('#processoErro');

  if (!id) {
    erroEl.textContent = 'Processo não informado.';
    return;
  }

  try {
    let processo = await api.processos.get(id);
    nomeEl.textContent = processo.numero_processo || 'Processo';

    const grupos = [
      {
        titulo: 'Essenciais',
        campos: [
          ['cliente_nome', 'Cliente'],
          ['numero_processo', 'Número do processo'],
          ['status', 'Status'],
          ['situacao', 'Situação'],
          ['area', 'Área'],
          ['fase', 'Fase'],
          ['classe', 'Classe'],
          ['parte_contraria', 'Parte ré'],
          ['orgao', 'Órgão'],
          ['juizo', 'Juízo'],
        ],
      },
      {
        titulo: 'Local e Instância',
        campos: [
          ['vara', 'Vara'],
          ['grau', 'Grau'],
          ['cidade', 'Cidade'],
          ['estado', 'Estado'],
          ['sistema', 'Sistema'],
          ['ano', 'Ano'],
          ['mes', 'Mês'],
        ],
      },
    ];

    const formatValue = (key, value) => {
      if (value === null || value === undefined || value === '') return { html: '', empty: true };
      let text = String(value);
      try {
        text = decodeURIComponent(text);
      } catch (_) {}
      if (key === 'area' || key === 'classe' || key === 'fase') {
        text = text.replace(/\s*\([^)]*(\.html|[0-9a-f]{10,})[^)]*\)/gi, '');
        text = text.replace(/\s+[^\s]*\.html\b/gi, '');
      }
      if (key === 'cliente_nome' && processo.cliente_id) {
        return {
          html: `<a class="text-stone-900 underline underline-offset-4 decoration-stone-300 hover:decoration-stone-600" href="./cliente.html?id=${processo.cliente_id}">${text}</a>`,
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

    const renderGrupo = (grupo) => {
      const rows = grupo.campos
        .map(([key, label]) => {
          const value = formatValue(key, processo[key]);
          if (value.empty) return '';
          return `
            <div class="py-3 grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-2">
              <div class="text-xs uppercase tracking-wide text-stone-400">${label}</div>
              <div class="text-sm text-stone-900 break-words">${value.html}</div>
            </div>
          `;
        })
        .filter(Boolean)
        .join('');

      if (!rows) return '';

      return `
        <section class="bg-white border border-stone-200 rounded-2xl p-5">
          <h2 class="text-sm font-semibold text-stone-700 mb-2">${grupo.titulo}</h2>
          <div class="divide-y divide-stone-200/70">${rows}</div>
        </section>
      `;
    };

    const [essenciais, ...restante] = grupos;
    const essenciaisHtml = renderGrupo(essenciais);
    const rightHtml = restante.map(renderGrupo).filter(Boolean).join('');
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
      (essenciaisHtml || rightHtml
        ? `
          <div class="space-y-6">${essenciaisHtml}</div>
          <div class="space-y-6">${rightHtml}${atividadesPlaceholder}${contaBeneficioPlaceholder}</div>
        `
        : '<div class="text-sm text-stone-500">Nenhum detalhe adicional disponível.</div>');

    const formatDateTime = (value) => {
      return value ? formatDateTimeBR(value) : '';
    };

    const atividadesCard = qs('#processoAtividadesCard');
    const cleanText = (value) => {
      if (!value) return '';
      let text = String(value);
      try {
        text = decodeURIComponent(text);
      } catch (_) {}
      text = text.replace(/\s+[0-9a-f]{10,}$/i, '');
      text = text.replace(/\s*\\([^)]*(\\.html|[0-9a-f]{10,})[^)]*\\)/gi, '');
      return text.trim();
    };

    if (atividadesCard) {
      try {
        const atividades = await api.atividades.list({ processo_id: id, page: 1, limit: 50 });
        const items = (atividades.data || []).slice(0, 10);
        const dropdownHtml = `
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
        `;

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
              const prazo = a.prazo ? formatDateTime(a.prazo) : '';
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
                      ${prazo ? `<span>Prazo: ${prazo}</span>` : ''}
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
        }

        const novaBtn = qs('#processoAtividadeNova');
        const menu = qs('#processoAtividadeMenu');
        if (novaBtn && menu) {
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
        fase: processo.fase || '',
        classe: processo.classe || '',
        orgao: processo.orgao || '',
        vara: processo.vara || '',
        grau: processo.grau || '',
        cidade: processo.cidade || '',
        estado: processo.estado || '',
        sistema: processo.sistema || '',
        distribuicao: processo.distribuicao || '',
        resultado: processo.resultado || '',
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
          if (contaMsg) contaMsg.textContent = 'Atualizado.';
        } catch (err) {
          processo.abrir_conta = prevAbrir;
          processo.conta_aberta = prevAberta;
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

    const quickModal = qs('#atividadeQuickModal');
    const quickClose = qs('#atividadeQuickClose');
    const quickCancel = qs('#atividadeQuickCancel');
    const quickForm = qs('#atividadeQuickForm');
    const quickMessage = qs('#atividadeQuickMessage');
    const quickProcessoId = qs('#atividadeQuickProcessoId');
    const quickNumero = qs('#atividadeQuickNumero');
    const quickCliente = qs('#atividadeQuickCliente');
    const quickTitulo = qs('#atividadeQuickTitulo');
    const quickPrazo = qs('#atividadeQuickPrazo');
    const quickHoraWrap = qs('#atividadeQuickHoraWrap');
    const quickHora = qs('#atividadeQuickHora');

    const openQuickAtividadeModal = ({ processo, titulo }) => {
      if (!quickModal) return;
      quickMessage.textContent = '';
      quickProcessoId.value = processo.id || '';
      quickNumero.value = processo.numero_processo || '';
      quickCliente.value = processo.cliente_nome || '';
      const clienteNome = processo.cliente_nome || '';
      const baseTitulo = titulo || '';
      const isAudiencia = baseTitulo === 'Audiência';
      const isPericia = baseTitulo === 'Perícia';
      quickTitulo.value =
        (isAudiencia || isPericia) && clienteNome ? `${baseTitulo} ${clienteNome}` : baseTitulo;
      quickPrazo.value = '';
      const precisaHora = isAudiencia || isPericia;
      if (quickHoraWrap) quickHoraWrap.classList.toggle('hidden', !precisaHora);
      if (quickHora) quickHora.value = '';
      quickModal.classList.remove('hidden');
      quickModal.classList.add('flex');
    };

    if (quickClose && quickModal) {
      quickClose.addEventListener('click', () => {
        quickModal.classList.add('hidden');
        quickModal.classList.remove('flex');
      });
    }

    if (quickCancel && quickModal) {
      quickCancel.addEventListener('click', () => {
        quickModal.classList.add('hidden');
        quickModal.classList.remove('flex');
      });
    }

    if (quickForm) {
      quickForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        quickMessage.textContent = '';
        const baseTitulo = quickTitulo.value.replace(/\\s+.+$/, '');
        const precisaHora = ['Audiência', 'Perícia'].includes(baseTitulo);
        if (!quickPrazo.value) {
          showMessage(quickMessage, 'Informe a data da atividade.');
          return;
        }
        if (precisaHora && !quickHora.value) {
          showMessage(quickMessage, 'Informe a hora da atividade.');
          return;
        }
        const descricao = precisaHora && quickHora.value ? `Hora: ${quickHora.value}` : '';
        const payload = {
          processo_id: Number(quickProcessoId.value),
          titulo: quickTitulo.value.trim(),
          prazo: quickPrazo.value || null,
          descricao,
          status: 'a_fazer',
        };
        try {
          await api.atividades.create(payload);
          quickModal.classList.add('hidden');
          quickModal.classList.remove('flex');
          window.location.reload();
        } catch (err) {
          showMessage(quickMessage, err.message);
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

        if (editClienteInput && editClienteOptions && editClienteId) {
          editClienteInput.addEventListener('input', () => {
            const match = Array.from(editClienteOptions.options).find(
              (opt) => opt.value === editClienteInput.value
            );
            editClienteId.value = match ? match.dataset.id : '';
          });
        }

        editNumero.value = processo.numero_processo || '';
        editStatus.value = processo.status || '';
        editArea.value = processo.area || '';
        editFase.value = processo.fase || '';
        editClasse.value = processo.classe || '';
        editOrgao.value = processo.orgao || '';
        editVara.value = processo.vara || '';
        editGrau.value = processo.grau || '';
        editCidade.value = processo.cidade || '';
        editEstado.value = processo.estado || '';
        editSistema.value = processo.sistema || '';
        editPercentual.value = processo.percentual || '';
        editDistribuicao.value = processo.distribuicao || '';
        editPrevisao.value = processo.previsao || '';
        editResultado.value = processo.resultado || '';
        editStatusPagamento.value = processo.status_pagamento || '';
        editComissao.value = processo.comissao || '';
        editHonorarioAdm.value = processo.honorario_adm || '';
        editHonorarios.value = processo.honorarios || '';
        editHonorariosLiquidos.value = processo.honorarios_liquidos || '';
        editRepassado.value = processo.repassado || '';
        editRepasse.value = processo.repasse || '';
        editParteContraria.value = processo.parte_contraria || '';
        if (editOrgaoGrid) {
          editOrgaoGrid.querySelectorAll('.orgao-btn').forEach((btn) => {
            const isActive = btn.dataset.value === editOrgao.value;
            btn.classList.toggle('border-stone-900', isActive);
            btn.classList.toggle('bg-stone-50', isActive);
          });
        }

        editModal.classList.remove('hidden');
        editModal.classList.add('flex');
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

    if (editForm) {
      editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showMessage(editMessage, '');
        if (!editClienteId.value || !editNumero.value.trim()) {
          showMessage(editMessage, 'Campos obrigatórios: cliente e número do processo.');
          return;
        }
        const payload = {
          cliente_id: Number(editClienteId.value),
          numero_processo: editNumero.value.trim(),
          status: editStatus.value.trim(),
          area: editArea.value.trim(),
          fase: editFase.value.trim(),
          classe: editClasse.value.trim(),
          orgao: editOrgao.value.trim(),
          vara: editVara.value.trim(),
          grau: editGrau.value.trim(),
          cidade: editCidade.value.trim(),
          estado: editEstado.value.trim(),
          sistema: editSistema.value.trim(),
          percentual: editPercentual.value.trim(),
          distribuicao: editDistribuicao.value.trim(),
          previsao: editPrevisao.value.trim(),
          resultado: editResultado.value.trim(),
          status_pagamento: editStatusPagamento.value.trim(),
          comissao: editComissao.value.trim(),
          honorario_adm: editHonorarioAdm.value.trim(),
          honorarios: editHonorarios.value.trim(),
          honorarios_liquidos: editHonorariosLiquidos.value.trim(),
          repassado: editRepassado.value.trim(),
          repasse: editRepasse.value.trim(),
          parte_contraria: editParteContraria.value.trim(),
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

async function init() {
  captureTokenFromUrl();
  const page = document.body.dataset.page;
  if (page === 'login') return initLogin();
  if (page === 'dashboard') return initDashboard();
  if (page === 'clientes') return initClientes();
  if (page === 'processos') return initProcessos();
  if (page === 'atividades') return initAtividades();
  if (page === 'documentos') return initDocumentos();
  if (page === 'cliente') return initClienteDetail();
  if (page === 'processo') return initProcessoDetail();
}

init();
  function fixMojibake(value) {
    const text = String(value || '');
    // If it's already fine, return as-is.
    if (!/[ÃÂ�]/.test(text)) return text;
    try {
      // Common fix for latin1 -> utf8 mojibake
      const decoded = decodeURIComponent(escape(text));
      if (decoded && decoded !== text) return decoded;
    } catch (_) {}
    try {
      const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0));
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    } catch (_) {
      return text;
    }
  }
