const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { normalizePapelValue } = require('../middleware/escritorio');
const { procedimentoUploadDir } = require('../utils/procedimentoUpload');
const { buscarComunicacoesDjen } = require('../utils/djen');

function getEscritorioId(req) {
  return Number(req.escritorio && req.escritorio.id);
}

function toBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'sim', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'nao', 'não', 'no'].includes(normalized)) return false;
  return fallback;
}

function normalizeUsername(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9._-]/g, '');
  if (!normalized) return null;
  return normalized;
}

function normalizeEmail(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || null;
}

function normalizeUf(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 2);
  return normalized || null;
}

function normalizeTheme(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  if (['classic', 'aurora', 'oceano', 'amanhecer'].includes(normalized)) return normalized;
  return null;
}

function normalizeOabNumero(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');
  return normalized || null;
}

function deleteFileSafe(filePath) {
  if (!filePath) return;
  fs.unlink(filePath, () => {});
}

function buildProcedimentoPayload(row) {
  return {
    ...row,
    anexo_url: row.anexo_caminho ? `/ajustes/procedimentos/${row.id}/anexo` : null,
  };
}

async function listarColaboradoresBase(escritorioId) {
  const result = await db.query(
    `SELECT
        u.id,
        u.nome,
        u.email,
        u.usuario,
        me.papel,
        me.created_at
     FROM membros_escritorio me
     JOIN usuarios u ON u.id = me.usuario_id
     WHERE me.escritorio_id = $1
     ORDER BY CASE
       WHEN me.papel IN ('owner', 'admin', 'administrador') THEN 1
       WHEN me.papel IN ('colaborador', 'advogado') THEN 2
       WHEN me.papel = 'estagiario' THEN 3
       ELSE 4
     END, LOWER(u.nome) ASC`,
    [escritorioId]
  );
  return result.rows;
}

async function listarAreasBase(escritorioId) {
  const result = await db.query(
    `SELECT id, nome, ordem, ativo, created_at
     FROM escritorio_areas_atuacao
     WHERE escritorio_id = $1
     ORDER BY ordem ASC, LOWER(nome) ASC`,
    [escritorioId]
  );
  return result.rows;
}

async function listarOabsBase(escritorioId) {
  const result = await db.query(
    `SELECT id, numero, uf, etiqueta, ativo, created_at
     FROM escritorio_oabs_djen
     WHERE escritorio_id = $1
     ORDER BY ativo DESC, uf ASC, numero ASC`,
    [escritorioId]
  );
  return result.rows;
}

async function listarProcedimentosBase(escritorioId) {
  const result = await db.query(
    `SELECT
        id,
        titulo,
        descricao,
        anexo_nome_original,
        anexo_caminho,
        anexo_mime_type,
        anexo_tamanho,
        ordem,
        ativo,
        created_at,
        updated_at
     FROM escritorio_procedimentos
     WHERE escritorio_id = $1
     ORDER BY ordem ASC, created_at DESC`,
    [escritorioId]
  );
  return result.rows.map(buildProcedimentoPayload);
}

async function obterConfigBase(escritorioId, escritorioNome) {
  const result = await db.query(
    `SELECT escritorio_id, nome_exibicao, djen_uf_padrao, tema, created_at, updated_at
     FROM escritorio_config
     WHERE escritorio_id = $1`,
    [escritorioId]
  );
  if (result.rows.length) return result.rows[0];
  return {
    escritorio_id: escritorioId,
    nome_exibicao: escritorioNome || '',
    djen_uf_padrao: 'BA',
    tema: 'classic',
    created_at: null,
    updated_at: null,
  };
}

function canManage(req) {
  return req.escritorio && normalizePapelValue(req.escritorio.papel) === 'administrador';
}

function validatePapel(papel) {
  return ['administrador', 'advogado', 'estagiario'].includes(normalizePapelValue(papel));
}

function toPositiveInt(value, fallback, max = 1000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function todayIsoDate() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function toIsoDateInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const brSlash = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brSlash) return `${brSlash[3]}-${brSlash[2]}-${brSlash[1]}`;
  const brDash = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (brDash) return `${brDash[3]}-${brDash[2]}-${brDash[1]}`;
  return '';
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function parseOabInput(rawOab, rawUf) {
  const originalOab = String(rawOab || '').trim();
  const originalUf = String(rawUf || '').trim().toUpperCase();

  const compact = originalOab.toUpperCase().replace(/[^A-Z0-9]/g, '');
  let ufOab = originalUf;
  let numeroOab = compact;

  if (!ufOab && /^[A-Z]{2}[0-9A-Z]+$/.test(compact)) {
    ufOab = compact.slice(0, 2);
    numeroOab = compact.slice(2);
  }
  if (ufOab && compact.startsWith(ufOab) && compact.length > 2) {
    numeroOab = compact.slice(2);
  }

  return {
    numeroOab: normalizeOabNumero(numeroOab) || '',
    ufOab: normalizeUf(ufOab) || '',
  };
}

function normalizeNumeroExact(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeNumeroDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function numeroKey(value) {
  const digits = normalizeNumeroDigits(value);
  if (digits) return `d:${digits}`;
  const exact = normalizeNumeroExact(value);
  if (exact) return `e:${exact}`;
  return '';
}

function numeroDisplayPrincipal(rawItem = {}) {
  const candidates = [
    rawItem.numero_processo_mascara,
    rawItem.numeroprocessocommascara,
    rawItem.numero_processo,
    rawItem.numeroprocesso,
  ];
  for (const value of candidates) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
}

function normalizeComunicacaoItem(item) {
  const destinatariosRaw = Array.isArray(item?.destinatarios) ? item.destinatarios : [];
  const destinatarios = destinatariosRaw
    .map((entry) => ({
      nome: String(entry?.nome || '').trim(),
      polo: String(entry?.polo || '').trim().toUpperCase(),
    }))
    .filter((entry) => entry.nome);
  const poloAtivo = destinatarios.filter((entry) => entry.polo === 'P').map((entry) => entry.nome);
  const poloPassivo = destinatarios.filter((entry) => entry.polo === 'A').map((entry) => entry.nome);
  const clienteSugerido = poloAtivo[0] || destinatarios[0]?.nome || '';
  let parteContrariaSugerida = '';
  if (clienteSugerido && poloPassivo.length) {
    parteContrariaSugerida = poloPassivo.join('; ');
  } else if (destinatarios.length > 1) {
    parteContrariaSugerida = destinatarios
      .map((entry) => entry.nome)
      .filter((nome) => nome !== clienteSugerido)
      .join('; ');
  }

  const dataDisponibilizacao = String(
    item?.data_disponibilizacao || item?.datadisponibilizacao || ''
  ).trim();
  return {
    numero_processo: numeroDisplayPrincipal(item),
    numero_processo_raw: String(item?.numero_processo || '').trim(),
    sigla_tribunal: String(item?.siglaTribunal || item?.sigla_tribunal || '').trim(),
    orgao: String(item?.nomeOrgao || item?.nome_orgao || '').trim(),
    classe: String(item?.nomeClasse || item?.nome_classe || '').trim(),
    data_disponibilizacao: dataDisponibilizacao,
    link: String(item?.link || '').trim(),
    cliente_sugerido: clienteSugerido,
    parte_contraria_sugerida: parteContrariaSugerida,
  };
}

function normalizeDateComparable(value) {
  const iso = toIsoDateInput(value);
  if (iso) return iso;
  return '';
}

function mergeComunicacaoIntoResumo(base, comunicacao) {
  const dataIso = normalizeDateComparable(comunicacao.data_disponibilizacao);
  const next = { ...base };
  next.total_publicacoes = Number(next.total_publicacoes || 0) + 1;
  if (!next.numero_processo && comunicacao.numero_processo) {
    next.numero_processo = comunicacao.numero_processo;
  }
  if (!next.tribunal && comunicacao.sigla_tribunal) {
    next.tribunal = comunicacao.sigla_tribunal;
  }
  if (!next.orgao && comunicacao.orgao) {
    next.orgao = comunicacao.orgao;
  }
  if (!next.classe && comunicacao.classe) {
    next.classe = comunicacao.classe;
  }
  if (!next.link && comunicacao.link) {
    next.link = comunicacao.link;
  }
  if (!next.cliente_sugerido && comunicacao.cliente_sugerido) {
    next.cliente_sugerido = comunicacao.cliente_sugerido;
  }
  if (!next.parte_contraria_sugerida && comunicacao.parte_contraria_sugerida) {
    next.parte_contraria_sugerida = comunicacao.parte_contraria_sugerida;
  }
  if (dataIso) {
    if (!next.primeira_publicacao || dataIso < next.primeira_publicacao) {
      next.primeira_publicacao = dataIso;
    }
    if (!next.ultima_publicacao || dataIso > next.ultima_publicacao) {
      next.ultima_publicacao = dataIso;
    }
  }
  return next;
}

async function mapProcessosExistentes(escritorioId, numeros) {
  const exactSet = new Set();
  const digitsSet = new Set();

  (numeros || []).forEach((numero) => {
    const exact = normalizeNumeroExact(numero);
    const digits = normalizeNumeroDigits(numero);
    if (exact) exactSet.add(exact);
    if (digits) digitsSet.add(digits);
  });

  const exactList = Array.from(exactSet);
  const digitsList = Array.from(digitsSet);
  if (!exactList.length && !digitsList.length) return new Map();

  const whereParts = [];
  const params = [escritorioId];
  if (exactList.length) {
    params.push(exactList);
    whereParts.push(`LOWER(TRIM(p.numero_processo)) = ANY($${params.length}::text[])`);
  }
  if (digitsList.length) {
    params.push(digitsList);
    whereParts.push(`regexp_replace(p.numero_processo, '\\D', '', 'g') = ANY($${params.length}::text[])`);
  }

  const result = await db.query(
    `SELECT
        p.id,
        p.numero_processo,
        p.cliente_id,
        c.nome AS cliente_nome,
        LOWER(TRIM(p.numero_processo)) AS numero_norm,
        regexp_replace(p.numero_processo, '\\D', '', 'g') AS numero_digits
     FROM processos p
     JOIN clientes c ON c.id = p.cliente_id
     WHERE p.escritorio_id = $1
       AND c.escritorio_id = $1
       AND (${whereParts.join(' OR ')})`,
    params
  );

  const map = new Map();
  result.rows.forEach((row) => {
    if (row.numero_digits) map.set(`d:${row.numero_digits}`, row);
    if (row.numero_norm) map.set(`e:${row.numero_norm}`, row);
  });
  return map;
}

function findProcessoExistenteByNumero(map, numero) {
  const digitKey = `d:${normalizeNumeroDigits(numero)}`;
  const exactKey = `e:${normalizeNumeroExact(numero)}`;
  if (map.has(digitKey)) return map.get(digitKey);
  if (map.has(exactKey)) return map.get(exactKey);
  return null;
}

function cnjParts(numeroProcesso) {
  const digits = normalizeNumeroDigits(numeroProcesso);
  if (digits.length !== 20) {
    return { cnjAno: null, cnjTribunal: null, cnjSequencial: null };
  }
  return {
    cnjAno: Number(digits.slice(9, 13)),
    cnjTribunal: Number(digits.slice(14, 16)),
    cnjSequencial: Number(digits.slice(0, 7)),
  };
}

async function ensureClienteNaoInformado(escritorioId) {
  const nomePadrao = 'Cliente não informado';
  const existing = await db.query(
    `SELECT id
     FROM clientes
     WHERE escritorio_id = $1
       AND unaccent(LOWER(nome)) = unaccent(LOWER($2))
     ORDER BY id ASC
     LIMIT 1`,
    [escritorioId, nomePadrao]
  );
  if (existing.rows.length) return Number(existing.rows[0].id);

  const created = await db.query(
    `INSERT INTO clientes (escritorio_id, nome, status)
     VALUES ($1, $2, 'lead')
     RETURNING id`,
    [escritorioId, nomePadrao]
  );
  return Number(created.rows[0].id);
}

function normalizePessoaNome(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function ensureClienteByNome(escritorioId, nome) {
  const nomeLimpo = String(nome || '').replace(/\s+/g, ' ').trim();
  if (!nomeLimpo) return null;

  const existing = await db.query(
    `SELECT id, nome
     FROM clientes
     WHERE escritorio_id = $1
       AND unaccent(LOWER(nome)) = unaccent(LOWER($2))
     ORDER BY id ASC
     LIMIT 1`,
    [escritorioId, nomeLimpo]
  );
  if (existing.rows.length) {
    return {
      id: Number(existing.rows[0].id),
      nome: existing.rows[0].nome,
    };
  }

  const created = await db.query(
    `INSERT INTO clientes (escritorio_id, nome, status)
     VALUES ($1, $2, 'ativo')
     RETURNING id, nome`,
    [escritorioId, nomeLimpo]
  );
  return {
    id: Number(created.rows[0].id),
    nome: created.rows[0].nome,
  };
}

function normalizeCsvHeader(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase();
}

function normalizeCsvCell(value) {
  return String(value || '').replace(/\r/g, '').trim();
}

function csvNull(value) {
  const normalized = normalizeCsvCell(value);
  return normalized || null;
}

function detectCsvDelimiter(text) {
  const firstLine = String(text || '')
    .split('\n')
    .find((line) => String(line || '').trim());
  if (!firstLine) return ',';
  const commas = (firstLine.match(/,/g) || []).length;
  const semicolons = (firstLine.match(/;/g) || []).length;
  return semicolons > commas ? ';' : ',';
}

function parseCsvMatrix(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  const input = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }
    if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += ch;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function parseCsvBuffer(buffer) {
  const rawText = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer || '');
  const text = rawText.replace(/^\uFEFF/, '');
  const delimiter = detectCsvDelimiter(text);
  const matrix = parseCsvMatrix(text, delimiter);
  if (!matrix.length) {
    return { headers: [], rows: [] };
  }

  const headers = matrix[0].map((header) => normalizeCsvHeader(header));
  const rows = [];
  for (let i = 1; i < matrix.length; i += 1) {
    const source = matrix[i] || [];
    const rowObj = {};
    let hasValue = false;
    for (let col = 0; col < headers.length; col += 1) {
      const key = headers[col];
      if (!key) continue;
      const value = normalizeCsvCell(source[col] || '');
      if (value) hasValue = true;
      rowObj[key] = value;
    }
    if (!hasValue) continue;
    rowObj.__line = i + 1;
    rows.push(rowObj);
  }

  return { headers, rows };
}

function normalizeClienteStatusCsv(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'lead';
  if (raw === 'ativo' || raw === 'cliente' || raw === 'sim') return 'ativo';
  if (raw === 'inativo' || raw === 'nao' || raw === 'não') return 'inativo';
  if (raw === 'lead' || raw === 'prospect') return 'lead';
  return 'lead';
}

function normalizeSimNo(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  if (['sim', 's', 'yes', 'y', 'true', '1'].includes(raw)) return 'Sim';
  if (['nao', 'não', 'n', 'no', 'false', '0'].includes(raw)) return 'No';
  return String(value || '').trim();
}

function buildClientePayloadFromCsv(row) {
  return {
    nome: normalizeCsvCell(row.cliente_nome),
    cpf: csvNull(row.cliente_cpf),
    telefone: csvNull(row.cliente_telefone),
    email: csvNull(row.cliente_email),
    status: normalizeClienteStatusCsv(row.cliente_status),
    data_nascimento: csvNull(row.cliente_data_nascimento),
    profissao: csvNull(row.cliente_profissao),
    qualificacao: csvNull(row.cliente_qualificacao),
    endereco: csvNull(row.cliente_endereco),
    numero_casa: csvNull(row.cliente_numero_casa),
    cidade: csvNull(row.cliente_cidade),
    estado: csvNull(row.cliente_estado),
    cep: csvNull(row.cliente_cep),
    nacionalidade: csvNull(row.cliente_nacionalidade),
    estado_civil: csvNull(row.cliente_estado_civil),
    rg: csvNull(row.cliente_rg),
    filiacao: csvNull(row.cliente_filiacao),
    responsavel: csvNull(row.cliente_responsavel),
    cpf_responsavel: csvNull(row.cliente_cpf_responsavel),
    parceiro: csvNull(row.cliente_parceiro),
    link_pasta: csvNull(row.cliente_link_pasta),
    acesso_gov: csvNull(row.cliente_acesso_gov),
    dados_bancarios: csvNull(row.cliente_dados_bancarios),
    banco: csvNull(row.cliente_banco),
    agencia: csvNull(row.cliente_agencia),
    conta: csvNull(row.cliente_conta),
    tipo_conta: csvNull(row.cliente_tipo_conta),
    data_chegada: csvNull(row.cliente_data_chegada),
    processos_notion: csvNull(row.cliente_processos_notion),
  };
}

function buildProcessoPayloadFromCsv(row) {
  return {
    numero_processo: normalizeCsvCell(row.processo_numero_processo),
    status: csvNull(row.processo_status) || 'Ativo',
    area: csvNull(row.processo_area),
    fase: csvNull(row.processo_fase),
    classe: csvNull(row.processo_classe),
    orgao: csvNull(row.processo_orgao),
    vara: csvNull(row.processo_vara),
    grau: csvNull(row.processo_grau),
    cidade: csvNull(row.processo_cidade),
    estado: csvNull(row.processo_estado),
    sistema: csvNull(row.processo_sistema),
    distribuicao: csvNull(row.processo_distribuicao),
    parte_contraria: csvNull(row.processo_parte_contraria),
    resultado: csvNull(row.processo_resultado),
    recurso_inominado: normalizeSimNo(row.processo_recurso_inominado),
    abrir_conta: normalizeSimNo(row.processo_abrir_conta),
    conta_aberta: normalizeSimNo(row.processo_conta_aberta),
    aceitar_acordo: normalizeSimNo(row.processo_aceitar_acordo),
    percentual: csvNull(row.processo_percentual),
    honorarios: csvNull(row.processo_honorarios),
    honorarios_liquidos: csvNull(row.processo_honorarios_liquidos),
    repasse: csvNull(row.processo_repasse),
    repassado: normalizeSimNo(row.processo_repassado),
    status_pagamento: csvNull(row.processo_status_pagamento),
    proveito_economico: csvNull(row.processo_proveito_economico),
    proveito_pago: csvNull(row.processo_proveito_pago),
    comissao: csvNull(row.processo_comissao),
    pericia: csvNull(row.processo_pericia),
    prazo: csvNull(row.processo_prazo),
    audiencia: csvNull(row.processo_audiencia),
    informar_cliente: normalizeSimNo(row.processo_informar_cliente),
    responder_cliente: normalizeSimNo(row.processo_responder_cliente),
    manifestar_ciencia: normalizeSimNo(row.processo_manifestar_ciencia),
    embargos_declaracao: normalizeSimNo(row.processo_embargos_declaracao),
    replica: normalizeSimNo(row.processo_replica),
    juizo: csvNull(row.processo_juizo),
    place: csvNull(row.processo_place),
    previsao: csvNull(row.processo_previsao),
    situacao: csvNull(row.processo_situacao),
    ano: csvNull(row.processo_ano),
    mes: csvNull(row.processo_mes),
    atividades_notion: csvNull(row.processo_atividades_notion),
    ultima_edicao: csvNull(row.processo_ultima_edicao),
    parceiro: csvNull(row.processo_parceiro),
  };
}

function buildClienteCacheKeys(payload) {
  const keys = [];
  const cpfDigits = normalizeNumeroDigits(payload.cpf || '');
  if (cpfDigits) keys.push(`cpf:${cpfDigits}`);

  const email = normalizeEmail(payload.email || '');
  if (email) keys.push(`email:${email}`);

  const nome = normalizePessoaNome(payload.nome || '');
  if (nome) keys.push(`nome:${nome}`);
  return keys;
}

function cacheClienteCsv(cache, payload, cliente) {
  buildClienteCacheKeys(payload).forEach((key) => cache.set(key, cliente));
}

async function ensureClienteFromCsvRow(escritorioId, payload, cache, clientePadraoId, client) {
  const nome = String(payload.nome || '').replace(/\s+/g, ' ').trim();
  if (!nome) {
    return {
      id: clientePadraoId,
      nome: 'Cliente não informado',
      created: false,
    };
  }

  const keys = buildClienteCacheKeys(payload);
  for (const key of keys) {
    if (cache.has(key)) {
      return {
        ...cache.get(key),
        created: false,
      };
    }
  }

  const whereParts = [];
  const params = [escritorioId];
  const cpfDigits = normalizeNumeroDigits(payload.cpf || '');
  const email = normalizeEmail(payload.email || '');
  if (cpfDigits) {
    params.push(cpfDigits);
    whereParts.push(`regexp_replace(COALESCE(cpf, ''), '\\D', '', 'g') = $${params.length}`);
  }
  if (email) {
    params.push(email);
    whereParts.push(`LOWER(COALESCE(email, '')) = $${params.length}`);
  }
  params.push(nome);
  whereParts.push(`unaccent(LOWER(nome)) = unaccent(LOWER($${params.length}))`);

  const existing = await client.query(
    `SELECT id, nome
     FROM clientes
     WHERE escritorio_id = $1
       AND (${whereParts.join(' OR ')})
     ORDER BY id ASC
     LIMIT 1`,
    params
  );

  if (existing.rows.length) {
    const cliente = {
      id: Number(existing.rows[0].id),
      nome: existing.rows[0].nome,
    };
    cacheClienteCsv(cache, { ...payload, nome: cliente.nome }, cliente);
    return {
      ...cliente,
      created: false,
    };
  }

  const created = await client.query(
    `INSERT INTO clientes (
      nome,
      cpf,
      telefone,
      email,
      status,
      acesso_gov,
      cep,
      cpf_responsavel,
      cidade,
      dados_bancarios,
      data_chegada,
      data_nascimento,
      endereco,
      numero_casa,
      estado,
      estado_civil,
      filiacao,
      link_pasta,
      nacionalidade,
      agencia,
      conta,
      banco,
      tipo_conta,
      parceiro,
      processos_notion,
      profissao,
      qualificacao,
      rg,
      responsavel,
      escritorio_id
    )
    VALUES (
      $1,$2,$3,$4,$5,
      $6,$7,$8,$9,$10,
      $11,$12,$13,$14,$15,
      $16,$17,$18,$19,$20,
      $21,$22,$23,$24,$25,
      $26,$27,$28,$29,$30
    )
    RETURNING id, nome`,
    [
      nome,
      payload.cpf || null,
      payload.telefone || null,
      payload.email || null,
      payload.status || 'lead',
      payload.acesso_gov || null,
      payload.cep || null,
      payload.cpf_responsavel || null,
      payload.cidade || null,
      payload.dados_bancarios || null,
      payload.data_chegada || null,
      payload.data_nascimento || null,
      payload.endereco || null,
      payload.numero_casa || null,
      payload.estado || null,
      payload.estado_civil || null,
      payload.filiacao || null,
      payload.link_pasta || null,
      payload.nacionalidade || null,
      payload.agencia || null,
      payload.conta || null,
      payload.banco || null,
      payload.tipo_conta || null,
      payload.parceiro || null,
      payload.processos_notion || null,
      payload.profissao || null,
      payload.qualificacao || null,
      payload.rg || null,
      payload.responsavel || null,
      escritorioId,
    ]
  );

  const cliente = {
    id: Number(created.rows[0].id),
    nome: created.rows[0].nome,
  };
  cacheClienteCsv(cache, { ...payload, nome: cliente.nome }, cliente);
  return {
    ...cliente,
    created: true,
  };
}

async function resumo(req, res) {
  try {
    const escritorioId = getEscritorioId(req);
    const [colaboradores, areas, oabs, procedimentos, config] = await Promise.all([
      listarColaboradoresBase(escritorioId),
      listarAreasBase(escritorioId),
      listarOabsBase(escritorioId),
      listarProcedimentosBase(escritorioId),
      obterConfigBase(escritorioId, req.escritorio?.nome || ''),
    ]);

    return res.json({
      escritorio: req.escritorio,
      config,
      colaboradores,
      areas,
      oabs,
      procedimentos,
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao carregar ajustes.' });
  }
}

async function listarColaboradores(req, res) {
  try {
    const escritorioId = getEscritorioId(req);
    const data = await listarColaboradoresBase(escritorioId);
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao listar colaboradores.' });
  }
}

async function criarColaborador(req, res) {
  const escritorioId = getEscritorioId(req);
  const nome = String(req.body.nome || '').trim();
  const email = normalizeEmail(req.body.email);
  const usuario = normalizeUsername(req.body.usuario);
  const senha = String(req.body.senha || '');
  const papel = normalizePapelValue(req.body.papel || 'advogado');

  if (!canManage(req)) {
    return res.status(403).json({ erro: 'Sem permissão para gerenciar colaboradores.' });
  }
  if (!nome) {
    return res.status(400).json({ erro: 'Campo obrigatório: nome.' });
  }
  if (!email && !usuario) {
    return res.status(400).json({ erro: 'Informe e-mail ou usuário.' });
  }
  if (!validatePapel(papel)) {
    return res.status(400).json({ erro: 'Papel inválido.' });
  }
  if (usuario && !/^[a-z0-9._-]{3,80}$/.test(usuario)) {
    return res
      .status(400)
      .json({ erro: 'Usuário inválido. Use de 3 a 80 caracteres: letras, números, ponto, traço ou underline.' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const existingUser = await client.query(
      `SELECT id, nome, email, usuario
       FROM usuarios
       WHERE ($1::text IS NOT NULL AND LOWER(email) = LOWER($1))
          OR ($2::text IS NOT NULL AND LOWER(usuario) = LOWER($2))
       LIMIT 1`,
      [email, usuario]
    );

    let userId;
    if (existingUser.rows.length) {
      userId = Number(existingUser.rows[0].id);
      const userUpdates = [
        'nome = $1',
        'email = COALESCE($2, email)',
        'usuario = COALESCE($3, usuario)',
      ];
      const userValues = [nome, email, usuario];
      if (senha) {
        if (senha.length < 6) {
          await client.query('ROLLBACK');
          return res.status(400).json({ erro: 'Senha deve ter no mínimo 6 caracteres.' });
        }
        const senhaHash = await bcrypt.hash(senha, 10);
        userValues.push(senhaHash);
        userUpdates.push(`senha_hash = $${userValues.length}`);
      }
      userValues.push(userId);
      await client.query(
        `UPDATE usuarios
         SET ${userUpdates.join(', ')}
         WHERE id = $${userValues.length}`,
        userValues
      );
    } else {
      if (!senha || senha.length < 6) {
        await client.query('ROLLBACK');
        return res.status(400).json({ erro: 'Senha com no mínimo 6 caracteres é obrigatória.' });
      }
      const senhaHash = await bcrypt.hash(senha, 10);
      const created = await client.query(
        `INSERT INTO usuarios (nome, email, usuario, senha_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [nome, email, usuario, senhaHash]
      );
      userId = Number(created.rows[0].id);
    }

    await client.query(
      `INSERT INTO membros_escritorio (escritorio_id, usuario_id, papel)
       VALUES ($1, $2, $3)
       ON CONFLICT (escritorio_id, usuario_id)
       DO UPDATE SET papel = EXCLUDED.papel`,
      [escritorioId, userId, papel]
    );

    const output = await client.query(
      `SELECT u.id, u.nome, u.email, u.usuario, me.papel, me.created_at
       FROM membros_escritorio me
       JOIN usuarios u ON u.id = me.usuario_id
       WHERE me.escritorio_id = $1 AND me.usuario_id = $2`,
      [escritorioId, userId]
    );

    await client.query('COMMIT');
    return res.status(201).json(output.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(400).json({ erro: 'E-mail ou usuário já cadastrado.' });
    }
    return res.status(500).json({ erro: 'Erro ao criar colaborador.' });
  } finally {
    client.release();
  }
}

async function atualizarColaborador(req, res) {
  const escritorioId = getEscritorioId(req);
  const usuarioId = Number(req.params.usuarioId);

  if (!canManage(req)) {
    return res.status(403).json({ erro: 'Sem permissão para gerenciar colaboradores.' });
  }
  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    return res.status(400).json({ erro: 'Colaborador inválido.' });
  }

  const nome = req.body.nome !== undefined ? String(req.body.nome || '').trim() : undefined;
  const email = req.body.email !== undefined ? normalizeEmail(req.body.email) : undefined;
  const usuario = req.body.usuario !== undefined ? normalizeUsername(req.body.usuario) : undefined;
  const senha = req.body.senha !== undefined ? String(req.body.senha || '') : undefined;
  const papel = req.body.papel !== undefined ? normalizePapelValue(req.body.papel) : undefined;

  if (usuario !== undefined && usuario && !/^[a-z0-9._-]{3,80}$/.test(usuario)) {
    return res
      .status(400)
      .json({ erro: 'Usuário inválido. Use de 3 a 80 caracteres: letras, números, ponto, traço ou underline.' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const membership = await client.query(
      `SELECT me.papel, u.id, u.nome, u.email, u.usuario
       FROM membros_escritorio me
       JOIN usuarios u ON u.id = me.usuario_id
       WHERE me.escritorio_id = $1 AND me.usuario_id = $2`,
      [escritorioId, usuarioId]
    );
    if (!membership.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Colaborador não encontrado.' });
    }

    const currentRole = normalizePapelValue(membership.rows[0].papel);
    if (papel !== undefined && !validatePapel(papel)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ erro: 'Papel inválido.' });
    }
    if (senha !== undefined && senha && senha.length < 6) {
      await client.query('ROLLBACK');
      return res.status(400).json({ erro: 'Senha deve ter no mínimo 6 caracteres.' });
    }

    const userUpdates = [];
    const userValues = [];
    if (nome !== undefined) {
      if (!nome) {
        await client.query('ROLLBACK');
        return res.status(400).json({ erro: 'Campo obrigatório: nome.' });
      }
      userValues.push(nome);
      userUpdates.push(`nome = $${userValues.length}`);
    }
    if (email !== undefined) {
      userValues.push(email);
      userUpdates.push(`email = $${userValues.length}`);
    }
    if (usuario !== undefined) {
      userValues.push(usuario);
      userUpdates.push(`usuario = $${userValues.length}`);
    }
    if (senha !== undefined && senha) {
      const senhaHash = await bcrypt.hash(senha, 10);
      userValues.push(senhaHash);
      userUpdates.push(`senha_hash = $${userValues.length}`);
    }

    if (userUpdates.length) {
      userValues.push(usuarioId);
      await client.query(
        `UPDATE usuarios
         SET ${userUpdates.join(', ')}
         WHERE id = $${userValues.length}`,
        userValues
      );
    }

    if (papel !== undefined) {
      await client.query(
        `UPDATE membros_escritorio
         SET papel = $1
         WHERE escritorio_id = $2 AND usuario_id = $3`,
        [papel, escritorioId, usuarioId]
      );
    }

    const output = await client.query(
      `SELECT u.id, u.nome, u.email, u.usuario, me.papel, me.created_at
       FROM membros_escritorio me
       JOIN usuarios u ON u.id = me.usuario_id
       WHERE me.escritorio_id = $1 AND me.usuario_id = $2`,
      [escritorioId, usuarioId]
    );
    await client.query('COMMIT');
    return res.json(output.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(400).json({ erro: 'E-mail ou usuário já cadastrado.' });
    }
    return res.status(500).json({ erro: 'Erro ao atualizar colaborador.' });
  } finally {
    client.release();
  }
}

async function removerColaborador(req, res) {
  const escritorioId = getEscritorioId(req);
  const usuarioId = Number(req.params.usuarioId);
  if (!canManage(req)) {
    return res.status(403).json({ erro: 'Sem permissão para gerenciar colaboradores.' });
  }
  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    return res.status(400).json({ erro: 'Colaborador inválido.' });
  }
  if (usuarioId === Number(req.user.id)) {
    return res.status(400).json({ erro: 'Não é permitido remover seu próprio acesso por aqui.' });
  }

  try {
    const current = await db.query(
      `SELECT papel
       FROM membros_escritorio
       WHERE escritorio_id = $1 AND usuario_id = $2`,
      [escritorioId, usuarioId]
    );
    if (!current.rows.length) {
      return res.status(404).json({ erro: 'Colaborador não encontrado.' });
    }
    if (normalizePapelValue(current.rows[0].papel) === 'administrador') {
      const admins = await db.query(
        `SELECT COUNT(*)::int AS total
         FROM membros_escritorio
         WHERE escritorio_id = $1 AND papel IN ('owner', 'admin', 'administrador')`,
        [escritorioId]
      );
      if (Number(admins.rows[0].total) <= 1) {
        return res.status(400).json({ erro: 'Não é possível remover o único administrador do escritório.' });
      }
    }

    await db.query(
      `DELETE FROM membros_escritorio
       WHERE escritorio_id = $1 AND usuario_id = $2`,
      [escritorioId, usuarioId]
    );
    return res.json({ mensagem: 'Colaborador removido do escritório.' });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao remover colaborador.' });
  }
}

async function listarAreas(req, res) {
  try {
    const escritorioId = getEscritorioId(req);
    const data = await listarAreasBase(escritorioId);
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao listar áreas.' });
  }
}

async function criarArea(req, res) {
  const escritorioId = getEscritorioId(req);
  const nome = String(req.body.nome || '').trim();
  const ordem = Number.isFinite(Number(req.body.ordem)) ? Math.trunc(Number(req.body.ordem)) : 0;
  const ativo = toBoolean(req.body.ativo, true);

  if (!canManage(req)) {
    return res.status(403).json({ erro: 'Sem permissão para alterar áreas.' });
  }
  if (!nome) {
    return res.status(400).json({ erro: 'Campo obrigatório: nome.' });
  }

  try {
    const result = await db.query(
      `INSERT INTO escritorio_areas_atuacao (escritorio_id, nome, ordem, ativo)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nome, ordem, ativo, created_at`,
      [escritorioId, nome, ordem, ativo]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ erro: 'Área já cadastrada.' });
    }
    return res.status(500).json({ erro: 'Erro ao criar área.' });
  }
}

async function atualizarArea(req, res) {
  const escritorioId = getEscritorioId(req);
  const areaId = Number(req.params.id);
  if (!canManage(req)) {
    return res.status(403).json({ erro: 'Sem permissão para alterar áreas.' });
  }
  if (!Number.isInteger(areaId) || areaId <= 0) {
    return res.status(400).json({ erro: 'Área inválida.' });
  }

  const updates = [];
  const values = [];
  if (req.body.nome !== undefined) {
    const nome = String(req.body.nome || '').trim();
    if (!nome) return res.status(400).json({ erro: 'Campo obrigatório: nome.' });
    values.push(nome);
    updates.push(`nome = $${values.length}`);
  }
  if (req.body.ordem !== undefined) {
    const ordem = Number(req.body.ordem);
    values.push(Number.isFinite(ordem) ? Math.trunc(ordem) : 0);
    updates.push(`ordem = $${values.length}`);
  }
  if (req.body.ativo !== undefined) {
    values.push(toBoolean(req.body.ativo, true));
    updates.push(`ativo = $${values.length}`);
  }
  if (!updates.length) {
    return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });
  }

  values.push(areaId, escritorioId);
  try {
    const result = await db.query(
      `UPDATE escritorio_areas_atuacao
       SET ${updates.join(', ')}
       WHERE id = $${values.length - 1} AND escritorio_id = $${values.length}
       RETURNING id, nome, ordem, ativo, created_at`,
      values
    );
    if (!result.rows.length) {
      return res.status(404).json({ erro: 'Área não encontrada.' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ erro: 'Área já cadastrada.' });
    }
    return res.status(500).json({ erro: 'Erro ao atualizar área.' });
  }
}

async function removerArea(req, res) {
  const escritorioId = getEscritorioId(req);
  const areaId = Number(req.params.id);
  if (!canManage(req)) {
    return res.status(403).json({ erro: 'Sem permissão para alterar áreas.' });
  }
  if (!Number.isInteger(areaId) || areaId <= 0) {
    return res.status(400).json({ erro: 'Área inválida.' });
  }

  try {
    const result = await db.query(
      `DELETE FROM escritorio_areas_atuacao
       WHERE id = $1 AND escritorio_id = $2
       RETURNING id`,
      [areaId, escritorioId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ erro: 'Área não encontrada.' });
    }
    return res.json({ mensagem: 'Área removida.' });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao remover área.' });
  }
}

async function listarOabs(req, res) {
  try {
    const escritorioId = getEscritorioId(req);
    const data = await listarOabsBase(escritorioId);
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao listar OABs.' });
  }
}

async function criarOab(req, res) {
  const escritorioId = getEscritorioId(req);
  const numero = normalizeOabNumero(req.body.numero || req.body.oab);
  const uf = normalizeUf(req.body.uf || req.body.uf_oab);
  const etiqueta = String(req.body.etiqueta || '').trim() || null;
  const ativo = toBoolean(req.body.ativo, true);

  if (!canManage(req)) {
    return res.status(403).json({ erro: 'Sem permissão para alterar OABs.' });
  }
  if (!numero || !uf) {
    return res.status(400).json({ erro: 'Campos obrigatórios: número da OAB e UF.' });
  }

  try {
    const result = await db.query(
      `INSERT INTO escritorio_oabs_djen (escritorio_id, numero, uf, etiqueta, ativo)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, numero, uf, etiqueta, ativo, created_at`,
      [escritorioId, numero, uf, etiqueta, ativo]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ erro: 'OAB já cadastrada.' });
    }
    return res.status(500).json({ erro: 'Erro ao criar OAB.' });
  }
}

async function atualizarOab(req, res) {
  const escritorioId = getEscritorioId(req);
  const oabId = Number(req.params.id);
  if (!canManage(req)) {
    return res.status(403).json({ erro: 'Sem permissão para alterar OABs.' });
  }
  if (!Number.isInteger(oabId) || oabId <= 0) {
    return res.status(400).json({ erro: 'OAB inválida.' });
  }

  const updates = [];
  const values = [];
  if (req.body.numero !== undefined || req.body.oab !== undefined) {
    const numero = normalizeOabNumero(req.body.numero || req.body.oab);
    if (!numero) return res.status(400).json({ erro: 'Número da OAB inválido.' });
    values.push(numero);
    updates.push(`numero = $${values.length}`);
  }
  if (req.body.uf !== undefined || req.body.uf_oab !== undefined) {
    const uf = normalizeUf(req.body.uf || req.body.uf_oab);
    if (!uf) return res.status(400).json({ erro: 'UF da OAB inválida.' });
    values.push(uf);
    updates.push(`uf = $${values.length}`);
  }
  if (req.body.etiqueta !== undefined) {
    values.push(String(req.body.etiqueta || '').trim() || null);
    updates.push(`etiqueta = $${values.length}`);
  }
  if (req.body.ativo !== undefined) {
    values.push(toBoolean(req.body.ativo, true));
    updates.push(`ativo = $${values.length}`);
  }

  if (!updates.length) {
    return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });
  }

  values.push(oabId, escritorioId);
  try {
    const result = await db.query(
      `UPDATE escritorio_oabs_djen
       SET ${updates.join(', ')}
       WHERE id = $${values.length - 1} AND escritorio_id = $${values.length}
       RETURNING id, numero, uf, etiqueta, ativo, created_at`,
      values
    );
    if (!result.rows.length) {
      return res.status(404).json({ erro: 'OAB não encontrada.' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ erro: 'OAB já cadastrada.' });
    }
    return res.status(500).json({ erro: 'Erro ao atualizar OAB.' });
  }
}

async function removerOab(req, res) {
  const escritorioId = getEscritorioId(req);
  const oabId = Number(req.params.id);
  if (!canManage(req)) {
    return res.status(403).json({ erro: 'Sem permissão para alterar OABs.' });
  }
  if (!Number.isInteger(oabId) || oabId <= 0) {
    return res.status(400).json({ erro: 'OAB inválida.' });
  }
  try {
    const result = await db.query(
      `DELETE FROM escritorio_oabs_djen
       WHERE id = $1 AND escritorio_id = $2
       RETURNING id`,
      [oabId, escritorioId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ erro: 'OAB não encontrada.' });
    }
    return res.json({ mensagem: 'OAB removida.' });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao remover OAB.' });
  }
}

async function listarProcedimentos(req, res) {
  try {
    const escritorioId = getEscritorioId(req);
    const data = await listarProcedimentosBase(escritorioId);
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao listar procedimentos.' });
  }
}

async function criarProcedimento(req, res) {
  const escritorioId = getEscritorioId(req);
  const titulo = String(req.body.titulo || '').trim();
  const descricao = String(req.body.descricao || '').trim() || null;
  const ordem = Number.isFinite(Number(req.body.ordem)) ? Math.trunc(Number(req.body.ordem)) : 0;
  const ativo = toBoolean(req.body.ativo, true);

  if (!canManage(req)) {
    if (req.file) deleteFileSafe(path.join(procedimentoUploadDir, req.file.filename));
    return res.status(403).json({ erro: 'Sem permissão para alterar procedimentos.' });
  }
  if (!titulo) {
    if (req.file) deleteFileSafe(path.join(procedimentoUploadDir, req.file.filename));
    return res.status(400).json({ erro: 'Campo obrigatório: título.' });
  }

  try {
    const result = await db.query(
      `INSERT INTO escritorio_procedimentos (
        escritorio_id, titulo, descricao, anexo_nome_original, anexo_caminho, anexo_mime_type, anexo_tamanho, ordem, ativo
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, titulo, descricao, anexo_nome_original, anexo_caminho, anexo_mime_type, anexo_tamanho, ordem, ativo, created_at, updated_at`,
      [
        escritorioId,
        titulo,
        descricao,
        req.file ? req.file.originalname : null,
        req.file ? req.file.filename : null,
        req.file ? req.file.mimetype : null,
        req.file ? req.file.size : null,
        ordem,
        ativo,
      ]
    );
    return res.status(201).json(buildProcedimentoPayload(result.rows[0]));
  } catch (err) {
    if (req.file) deleteFileSafe(path.join(procedimentoUploadDir, req.file.filename));
    return res.status(500).json({ erro: 'Erro ao criar procedimento.' });
  }
}

async function atualizarProcedimento(req, res) {
  const escritorioId = getEscritorioId(req);
  const procedimentoId = Number(req.params.id);
  if (!canManage(req)) {
    if (req.file) deleteFileSafe(path.join(procedimentoUploadDir, req.file.filename));
    return res.status(403).json({ erro: 'Sem permissão para alterar procedimentos.' });
  }
  if (!Number.isInteger(procedimentoId) || procedimentoId <= 0) {
    if (req.file) deleteFileSafe(path.join(procedimentoUploadDir, req.file.filename));
    return res.status(400).json({ erro: 'Procedimento inválido.' });
  }

  const existing = await db.query(
    `SELECT id, anexo_caminho
     FROM escritorio_procedimentos
     WHERE id = $1 AND escritorio_id = $2`,
    [procedimentoId, escritorioId]
  );
  if (!existing.rows.length) {
    if (req.file) deleteFileSafe(path.join(procedimentoUploadDir, req.file.filename));
    return res.status(404).json({ erro: 'Procedimento não encontrado.' });
  }

  const updates = [];
  const values = [];
  if (req.body.titulo !== undefined) {
    const titulo = String(req.body.titulo || '').trim();
    if (!titulo) {
      if (req.file) deleteFileSafe(path.join(procedimentoUploadDir, req.file.filename));
      return res.status(400).json({ erro: 'Campo obrigatório: título.' });
    }
    values.push(titulo);
    updates.push(`titulo = $${values.length}`);
  }
  if (req.body.descricao !== undefined) {
    values.push(String(req.body.descricao || '').trim() || null);
    updates.push(`descricao = $${values.length}`);
  }
  if (req.body.ordem !== undefined) {
    const ordem = Number(req.body.ordem);
    values.push(Number.isFinite(ordem) ? Math.trunc(ordem) : 0);
    updates.push(`ordem = $${values.length}`);
  }
  if (req.body.ativo !== undefined) {
    values.push(toBoolean(req.body.ativo, true));
    updates.push(`ativo = $${values.length}`);
  }

  let shouldRemoveOldFile = false;
  if (toBoolean(req.body.remover_anexo, false)) {
    updates.push('anexo_nome_original = NULL');
    updates.push('anexo_caminho = NULL');
    updates.push('anexo_mime_type = NULL');
    updates.push('anexo_tamanho = NULL');
    shouldRemoveOldFile = true;
  }

  if (req.file) {
    values.push(req.file.originalname);
    updates.push(`anexo_nome_original = $${values.length}`);
    values.push(req.file.filename);
    updates.push(`anexo_caminho = $${values.length}`);
    values.push(req.file.mimetype);
    updates.push(`anexo_mime_type = $${values.length}`);
    values.push(req.file.size);
    updates.push(`anexo_tamanho = $${values.length}`);
    shouldRemoveOldFile = true;
  }

  if (!updates.length) {
    if (req.file) deleteFileSafe(path.join(procedimentoUploadDir, req.file.filename));
    return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });
  }
  updates.push('updated_at = NOW()');

  values.push(procedimentoId, escritorioId);
  try {
    const result = await db.query(
      `UPDATE escritorio_procedimentos
       SET ${updates.join(', ')}
       WHERE id = $${values.length - 1} AND escritorio_id = $${values.length}
       RETURNING id, titulo, descricao, anexo_nome_original, anexo_caminho, anexo_mime_type, anexo_tamanho, ordem, ativo, created_at, updated_at`,
      values
    );
    if (shouldRemoveOldFile && existing.rows[0].anexo_caminho) {
      deleteFileSafe(path.join(procedimentoUploadDir, existing.rows[0].anexo_caminho));
    }
    return res.json(buildProcedimentoPayload(result.rows[0]));
  } catch (err) {
    if (req.file) deleteFileSafe(path.join(procedimentoUploadDir, req.file.filename));
    return res.status(500).json({ erro: 'Erro ao atualizar procedimento.' });
  }
}

async function removerProcedimento(req, res) {
  const escritorioId = getEscritorioId(req);
  const procedimentoId = Number(req.params.id);
  if (!canManage(req)) {
    return res.status(403).json({ erro: 'Sem permissão para alterar procedimentos.' });
  }
  if (!Number.isInteger(procedimentoId) || procedimentoId <= 0) {
    return res.status(400).json({ erro: 'Procedimento inválido.' });
  }

  try {
    const result = await db.query(
      `DELETE FROM escritorio_procedimentos
       WHERE id = $1 AND escritorio_id = $2
       RETURNING anexo_caminho`,
      [procedimentoId, escritorioId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ erro: 'Procedimento não encontrado.' });
    }
    if (result.rows[0].anexo_caminho) {
      deleteFileSafe(path.join(procedimentoUploadDir, result.rows[0].anexo_caminho));
    }
    return res.json({ mensagem: 'Procedimento removido.' });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao remover procedimento.' });
  }
}

async function baixarAnexoProcedimento(req, res) {
  const escritorioId = getEscritorioId(req);
  const procedimentoId = Number(req.params.id);
  if (!Number.isInteger(procedimentoId) || procedimentoId <= 0) {
    return res.status(400).json({ erro: 'Procedimento inválido.' });
  }

  try {
    const result = await db.query(
      `SELECT anexo_nome_original, anexo_caminho, anexo_mime_type
       FROM escritorio_procedimentos
       WHERE id = $1 AND escritorio_id = $2`,
      [procedimentoId, escritorioId]
    );
    if (!result.rows.length || !result.rows[0].anexo_caminho) {
      return res.status(404).json({ erro: 'Anexo não encontrado.' });
    }
    const row = result.rows[0];
    const filePath = path.resolve(procedimentoUploadDir, row.anexo_caminho);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ erro: 'Arquivo não encontrado no servidor.' });
    }

    res.setHeader('Content-Type', row.anexo_mime_type || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(row.anexo_nome_original || 'anexo')}"`
    );
    return res.sendFile(filePath);
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao abrir anexo.' });
  }
}

async function previewImportacaoProcessos(req, res) {
  const escritorioId = getEscritorioId(req);
  if (!canManage(req)) {
    return res.status(403).json({ erro: 'Sem permissão para importar processos.' });
  }

  const fonte = String(req.body.fonte || 'djen').trim().toLowerCase();
  if (fonte !== 'djen') {
    return res.status(400).json({ erro: 'Fonte ainda não suportada. Use DJEN.' });
  }

  let { numeroOab, ufOab } = parseOabInput(
    req.body.oab || req.body.numero_oab || req.body.oab_numero,
    req.body.uf || req.body.uf_oab
  );

  if (!numeroOab) {
    return res.status(400).json({ erro: 'Informe o número da OAB.' });
  }

  if (!ufOab) {
    try {
      const config = await obterConfigBase(escritorioId, req.escritorio?.nome || '');
      ufOab = normalizeUf(config?.djen_uf_padrao) || '';
    } catch (_) {
      ufOab = '';
    }
  }

  if (!ufOab || !/^[A-Z]{2}$/.test(ufOab)) {
    return res.status(400).json({ erro: 'UF da OAB inválida.' });
  }

  const rawFim = req.body.data_fim || req.body.dataFim || req.body.data_final;
  const rawInicio = req.body.data_inicio || req.body.dataInicio || req.body.data_inicial;

  const dataFim = toIsoDateInput(rawFim) || todayIsoDate();
  const fallbackInicioDate = new Date();
  fallbackInicioDate.setDate(fallbackInicioDate.getDate() - 365);
  const fallbackInicio = `${fallbackInicioDate.getFullYear()}-${String(
    fallbackInicioDate.getMonth() + 1
  ).padStart(2, '0')}-${String(fallbackInicioDate.getDate()).padStart(2, '0')}`;
  const dataInicio = toIsoDateInput(rawInicio) || fallbackInicio;

  if (!isIsoDate(dataInicio) || !isIsoDate(dataFim)) {
    return res.status(400).json({ erro: 'Datas inválidas. Use o formato AAAA-MM-DD.' });
  }
  if (dataInicio > dataFim) {
    return res.status(400).json({ erro: 'Data inicial não pode ser maior que a data final.' });
  }

  const itensPorPagina = toPositiveInt(req.body.itens_por_pagina, 100, 100);
  const maxPaginas = toPositiveInt(req.body.max_paginas, 20, 200);

  try {
    let totalApi = 0;
    let paginasConsultadas = 0;
    const comunicacoes = [];

    for (let pagina = 1; pagina <= maxPaginas; pagina += 1) {
      const response = await buscarComunicacoesDjen({
        pagina,
        itensPorPagina,
        dataDisponibilizacaoInicio: dataInicio,
        dataDisponibilizacaoFim: dataFim,
        numeroOab,
        ufOab,
      });
      paginasConsultadas += 1;

      totalApi = Number(response?.count || totalApi || 0);
      const items = Array.isArray(response?.items) ? response.items : [];
      if (!items.length) break;

      items.forEach((item) => comunicacoes.push(normalizeComunicacaoItem(item)));

      if (totalApi > 0 && comunicacoes.length >= totalApi) break;
      if (items.length < itensPorPagina) break;
    }

    const processoMap = new Map();
    comunicacoes.forEach((comunicacao) => {
      const numeroBase = comunicacao.numero_processo || comunicacao.numero_processo_raw;
      const key = numeroKey(numeroBase);
      if (!key) return;

      const atual = processoMap.get(key) || {
        numero_key: key,
        numero_processo: numeroBase,
        tribunal: '',
        orgao: '',
        classe: '',
        cliente_sugerido: '',
        parte_contraria_sugerida: '',
        link: '',
        total_publicacoes: 0,
        primeira_publicacao: '',
        ultima_publicacao: '',
      };

      processoMap.set(key, mergeComunicacaoIntoResumo(atual, comunicacao));
    });

    const processos = Array.from(processoMap.values());
    const existentesMap = await mapProcessosExistentes(
      escritorioId,
      processos.map((item) => item.numero_processo)
    );

    const data = processos
      .map((item) => {
        const existente = findProcessoExistenteByNumero(existentesMap, item.numero_processo);
        return {
          ...item,
          processo_encontrado: Boolean(existente),
          processo_id: existente?.id || null,
          processo_cliente_id: existente?.cliente_id || null,
          processo_cliente_nome: existente?.cliente_nome || null,
        };
      })
      .sort((a, b) => {
        const dateA = normalizeDateComparable(a.ultima_publicacao);
        const dateB = normalizeDateComparable(b.ultima_publicacao);
        if (dateA && dateB && dateA !== dateB) return dateA < dateB ? 1 : -1;
        if (a.processo_encontrado !== b.processo_encontrado) return a.processo_encontrado ? 1 : -1;
        return String(a.numero_processo).localeCompare(String(b.numero_processo), 'pt-BR');
      });

    const truncado = totalApi > 0 && comunicacoes.length < totalApi && paginasConsultadas >= maxPaginas;

    return res.json({
      data,
      resumo: {
        total_processos_identificados: data.length,
        total_publicacoes_analisadas: comunicacoes.length,
        total_publicacoes_api: totalApi,
        paginas_consultadas: paginasConsultadas,
        truncado,
      },
      filtros: {
        fonte,
        numero_oab: numeroOab,
        uf_oab: ufOab,
        data_inicio: dataInicio,
        data_fim: dataFim,
        itens_por_pagina: itensPorPagina,
        max_paginas: maxPaginas,
      },
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      erro: err.message || 'Erro ao buscar processos no DJEN.',
      detalhe: err.data || null,
    });
  }
}

async function importarProcessos(req, res) {
  const escritorioId = getEscritorioId(req);
  if (!canManage(req)) {
    return res.status(403).json({ erro: 'Sem permissão para importar processos.' });
  }

  const fonte = String(req.body.fonte || 'djen').trim().toLowerCase();
  if (fonte !== 'djen') {
    return res.status(400).json({ erro: 'Fonte ainda não suportada. Use DJEN.' });
  }

  const processosInput = Array.isArray(req.body.processos) ? req.body.processos : [];
  if (!processosInput.length) {
    return res.status(400).json({ erro: 'Nenhum processo selecionado para importação.' });
  }

  const dedupMap = new Map();
  const invalidos = [];

  processosInput.forEach((item, index) => {
    const numero = numeroDisplayPrincipal(item);
    const key = numeroKey(numero);
    if (!numero || !key) {
      invalidos.push({
        indice: index,
        numero_processo: numero || null,
        motivo: 'numero_invalido',
      });
      return;
    }
    if (!dedupMap.has(key)) {
      dedupMap.set(key, {
        numero_key: key,
        numero_processo: numero,
        tribunal: String(item.tribunal || item.sigla_tribunal || '').trim(),
        orgao: String(item.orgao || '').trim(),
        classe: String(item.classe || '').trim(),
        primeira_publicacao: toIsoDateInput(item.primeira_publicacao || item.distribuicao || ''),
        cliente_sugerido: String(item.cliente_sugerido || item.cliente_nome || '').trim(),
        parte_contraria_sugerida: String(item.parte_contraria_sugerida || item.parte_contraria || '').trim(),
      });
    } else {
      const current = dedupMap.get(key);
      if (!current.cliente_sugerido && item.cliente_sugerido) {
        current.cliente_sugerido = String(item.cliente_sugerido || '').trim();
      }
      if (!current.parte_contraria_sugerida && item.parte_contraria_sugerida) {
        current.parte_contraria_sugerida = String(item.parte_contraria_sugerida || '').trim();
      }
    }
  });

  const processos = Array.from(dedupMap.values());
  if (!processos.length) {
    return res.status(400).json({ erro: 'Nenhum número de processo válido para importar.' });
  }

  try {
    const clientePadraoId = await ensureClienteNaoInformado(escritorioId);
    const clienteByNomeCache = new Map();
    const existentesMap = await mapProcessosExistentes(
      escritorioId,
      processos.map((item) => item.numero_processo)
    );

    const created = [];
    const skipped = [];
    const errors = [];

    const client = await db.pool.connect();
    try {
      for (const item of processos) {
        const numeroProcesso = item.numero_processo;
        if (String(numeroProcesso).toUpperCase().startsWith('SEM-PROCESSO-')) {
          skipped.push({
            numero_processo: numeroProcesso,
            motivo: 'numero_invalido',
          });
          continue;
        }

        const existente = findProcessoExistenteByNumero(existentesMap, numeroProcesso);
        if (existente) {
          skipped.push({
            numero_processo: numeroProcesso,
            motivo: 'ja_cadastrado',
            processo_id: existente.id || null,
            cliente_nome: existente.cliente_nome || null,
          });
          continue;
        }

        let clienteId = clientePadraoId;
        let clienteNome = 'Cliente não informado';
        const nomeSugerido = String(item.cliente_sugerido || '').trim();
        if (nomeSugerido) {
          const nomeKey = normalizePessoaNome(nomeSugerido);
          if (nomeKey && clienteByNomeCache.has(nomeKey)) {
            const fromCache = clienteByNomeCache.get(nomeKey);
            clienteId = fromCache.id;
            clienteNome = fromCache.nome;
          } else {
            try {
              const ensured = await ensureClienteByNome(escritorioId, nomeSugerido);
              if (ensured && ensured.id) {
                clienteId = ensured.id;
                clienteNome = ensured.nome || nomeSugerido;
                if (nomeKey) {
                  clienteByNomeCache.set(nomeKey, { id: clienteId, nome: clienteNome });
                }
              }
            } catch (_) {}
          }
        }

        const { cnjAno, cnjTribunal, cnjSequencial } = cnjParts(numeroProcesso);
        try {
          const inserted = await client.query(
            `INSERT INTO processos (
               cliente_id,
               numero_processo,
               cnj_ano,
               cnj_tribunal,
               cnj_sequencial,
               status,
               orgao,
               classe,
               parte_contraria,
               distribuicao,
               escritorio_id
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING id, numero_processo`,
            [
              clienteId,
              numeroProcesso,
              cnjAno,
              cnjTribunal,
              cnjSequencial,
              'Ativo',
              item.orgao || item.tribunal || null,
              item.classe || null,
              item.parte_contraria_sugerida || null,
              item.primeira_publicacao || null,
              escritorioId,
            ]
          );

          const novo = inserted.rows[0];
          created.push({
            id: novo.id,
            numero_processo: novo.numero_processo,
            cliente_nome: clienteNome,
          });

          const exact = normalizeNumeroExact(novo.numero_processo);
          const digits = normalizeNumeroDigits(novo.numero_processo);
          const snapshot = {
            id: novo.id,
            numero_processo: novo.numero_processo,
            cliente_id: clienteId,
            cliente_nome: clienteNome,
            numero_norm: exact,
            numero_digits: digits,
          };
          if (digits) existentesMap.set(`d:${digits}`, snapshot);
          if (exact) existentesMap.set(`e:${exact}`, snapshot);
        } catch (insertErr) {
          if (insertErr.code === '23505') {
            const localMap = await mapProcessosExistentes(escritorioId, [numeroProcesso]);
            const existenteLocal = findProcessoExistenteByNumero(localMap, numeroProcesso);
            skipped.push({
              numero_processo: numeroProcesso,
              motivo: 'ja_cadastrado',
              processo_id: existenteLocal?.id || null,
              cliente_nome: existenteLocal?.cliente_nome || null,
            });
          } else {
            errors.push({
              numero_processo: numeroProcesso,
              motivo: 'erro_interno',
            });
          }
        }
      }
    } finally {
      client.release();
    }

    return res.json({
      resumo: {
        recebidos: processosInput.length,
        validos: processos.length,
        invalidos: invalidos.length,
        created: created.length,
        skipped: skipped.length,
        errors: errors.length,
      },
      created,
      skipped,
      errors,
      invalidos,
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao importar processos.' });
  }
}

async function importarClientesProcessosCsv(req, res) {
  const escritorioId = getEscritorioId(req);
  if (!canManage(req)) {
    return res.status(403).json({ erro: 'Sem permissão para importar CSV.' });
  }
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ erro: 'Envie um arquivo CSV no campo "arquivo".' });
  }

  let parsed;
  try {
    parsed = parseCsvBuffer(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ erro: 'Não foi possível ler o CSV informado.' });
  }

  const requiredHeaders = ['cliente_nome', 'processo_numero_processo'];
  const missingHeaders = requiredHeaders.filter((header) => !parsed.headers.includes(header));
  if (missingHeaders.length) {
    return res.status(400).json({
      erro: `Cabeçalhos obrigatórios ausentes: ${missingHeaders.join(', ')}.`,
    });
  }
  if (!parsed.rows.length) {
    return res.status(400).json({ erro: 'CSV vazio.' });
  }

  const linhas = parsed.rows.map((row) => ({
    line: Number(row.__line || 0),
    cliente: buildClientePayloadFromCsv(row),
    processo: buildProcessoPayloadFromCsv(row),
  }));

  const numeros = linhas
    .map((item) => item.processo.numero_processo)
    .filter((value) => String(value || '').trim());

  try {
    const clientePadraoId = await ensureClienteNaoInformado(escritorioId);
    const clienteCache = new Map();
    const existentesMap = await mapProcessosExistentes(escritorioId, numeros);
    const processadosNoArquivo = new Set();

    const created = [];
    const skipped = [];
    const invalidos = [];
    const errors = [];
    let clientesCriados = 0;
    let clientesEncontrados = 0;

    const client = await db.pool.connect();
    try {
      for (const linha of linhas) {
        const numeroProcesso = String(linha.processo.numero_processo || '').trim();
        const clienteNome = String(linha.cliente.nome || '').trim();
        if (!clienteNome && !numeroProcesso) {
          invalidos.push({
            linha: linha.line || null,
            motivo: 'linha_vazia',
          });
          continue;
        }

        let cliente;
        try {
          cliente = await ensureClienteFromCsvRow(
            escritorioId,
            linha.cliente,
            clienteCache,
            clientePadraoId,
            client
          );
          if (cliente.created) clientesCriados += 1;
          else clientesEncontrados += 1;
        } catch (_) {
          errors.push({
            linha: linha.line || null,
            numero_processo: numeroProcesso || null,
            motivo: 'erro_cliente',
          });
          continue;
        }

        if (!numeroProcesso) {
          skipped.push({
            linha: linha.line || null,
            motivo: 'processo_nao_informado',
            cliente_nome: cliente.nome,
          });
          continue;
        }

        const key = numeroKey(numeroProcesso);
        if (!key || String(numeroProcesso).toUpperCase().startsWith('SEM-PROCESSO-')) {
          invalidos.push({
            linha: linha.line || null,
            numero_processo: numeroProcesso || null,
            motivo: 'numero_invalido',
          });
          continue;
        }

        if (processadosNoArquivo.has(key)) {
          skipped.push({
            linha: linha.line || null,
            numero_processo: numeroProcesso,
            motivo: 'duplicado_no_arquivo',
          });
          continue;
        }
        processadosNoArquivo.add(key);

        const existente = findProcessoExistenteByNumero(existentesMap, numeroProcesso);
        if (existente) {
          skipped.push({
            linha: linha.line || null,
            numero_processo: numeroProcesso,
            motivo: 'ja_cadastrado',
            processo_id: existente.id || null,
            cliente_nome: existente.cliente_nome || null,
          });
          continue;
        }

        const { cnjAno, cnjTribunal, cnjSequencial } = cnjParts(numeroProcesso);
        try {
          const inserted = await client.query(
            `INSERT INTO processos (
               cliente_id,
               numero_processo,
               cnj_ano,
               cnj_tribunal,
               cnj_sequencial,
               area,
               fase,
               status,
               orgao,
               situacao,
               classe,
               juizo,
               vara,
               grau,
               cidade,
               estado,
               sistema,
               percentual,
               abrir_conta,
               conta_aberta,
               aceitar_acordo,
               prazo,
               previsao,
               resultado,
               recurso_inominado,
               proveito_economico,
               proveito_pago,
               status_pagamento,
               comissao,
               honorarios,
               honorarios_liquidos,
               repassado,
               repasse,
               parte_contraria,
               distribuicao,
               parceiro,
               pericia,
               audiencia,
               informar_cliente,
               responder_cliente,
               manifestar_ciencia,
               embargos_declaracao,
               replica,
               place,
               ano,
               mes,
               atividades_notion,
               ultima_edicao,
               escritorio_id
             )
             VALUES (
               $1,$2,$3,$4,$5,
               $6,$7,$8,$9,$10,
               $11,$12,$13,$14,$15,
               $16,$17,$18,$19,$20,
               $21,$22,$23,$24,$25,
               $26,$27,$28,$29,$30,
               $31,$32,$33,$34,$35,
               $36,$37,$38,$39,$40,
               $41,$42,$43,$44,$45,
               $46,$47,$48,$49
             )
             RETURNING id, numero_processo`,
            [
              cliente.id,
              numeroProcesso,
              cnjAno,
              cnjTribunal,
              cnjSequencial,
              linha.processo.area || null,
              linha.processo.fase || null,
              linha.processo.status || 'Ativo',
              linha.processo.orgao || null,
              linha.processo.situacao || null,
              linha.processo.classe || null,
              linha.processo.juizo || null,
              linha.processo.vara || null,
              linha.processo.grau || null,
              linha.processo.cidade || null,
              linha.processo.estado || null,
              linha.processo.sistema || null,
              linha.processo.percentual || null,
              linha.processo.abrir_conta || null,
              linha.processo.conta_aberta || null,
              linha.processo.aceitar_acordo || null,
              linha.processo.prazo || null,
              linha.processo.previsao || null,
              linha.processo.resultado || null,
              linha.processo.recurso_inominado || null,
              linha.processo.proveito_economico || null,
              linha.processo.proveito_pago || null,
              linha.processo.status_pagamento || null,
              linha.processo.comissao || null,
              linha.processo.honorarios || null,
              linha.processo.honorarios_liquidos || null,
              linha.processo.repassado || null,
              linha.processo.repasse || null,
              linha.processo.parte_contraria || null,
              linha.processo.distribuicao || null,
              linha.processo.parceiro || null,
              linha.processo.pericia || null,
              linha.processo.audiencia || null,
              linha.processo.informar_cliente || null,
              linha.processo.responder_cliente || null,
              linha.processo.manifestar_ciencia || null,
              linha.processo.embargos_declaracao || null,
              linha.processo.replica || null,
              linha.processo.place || null,
              linha.processo.ano || null,
              linha.processo.mes || null,
              linha.processo.atividades_notion || null,
              linha.processo.ultima_edicao || null,
              escritorioId,
            ]
          );

          const novo = inserted.rows[0];
          created.push({
            linha: linha.line || null,
            id: novo.id,
            numero_processo: novo.numero_processo,
            cliente_nome: cliente.nome,
          });

          const snapshot = {
            id: novo.id,
            numero_processo: novo.numero_processo,
            cliente_id: cliente.id,
            cliente_nome: cliente.nome,
            numero_norm: normalizeNumeroExact(novo.numero_processo),
            numero_digits: normalizeNumeroDigits(novo.numero_processo),
          };
          if (snapshot.numero_digits) existentesMap.set(`d:${snapshot.numero_digits}`, snapshot);
          if (snapshot.numero_norm) existentesMap.set(`e:${snapshot.numero_norm}`, snapshot);
        } catch (insertErr) {
          if (insertErr.code === '23505') {
            const localMap = await mapProcessosExistentes(escritorioId, [numeroProcesso]);
            const existenteLocal = findProcessoExistenteByNumero(localMap, numeroProcesso);
            skipped.push({
              linha: linha.line || null,
              numero_processo: numeroProcesso,
              motivo: 'ja_cadastrado',
              processo_id: existenteLocal?.id || null,
              cliente_nome: existenteLocal?.cliente_nome || null,
            });
          } else {
            errors.push({
              linha: linha.line || null,
              numero_processo: numeroProcesso,
              motivo: 'erro_importacao',
            });
          }
        }
      }
    } finally {
      client.release();
    }

    return res.json({
      resumo: {
        linhas_total: linhas.length,
        clientes_criados: clientesCriados,
        clientes_encontrados: clientesEncontrados,
        processos_criados: created.length,
        processos_ignorados: skipped.length,
        invalidos: invalidos.length,
        erros: errors.length,
      },
      created,
      skipped,
      invalidos,
      errors,
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao importar CSV de clientes e processos.' });
  }
}

function baixarTemplateImportacaoCsv(req, res) {
  const templatePath = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'templates',
    'importacao_clientes_processos_template.csv'
  );
  if (!fs.existsSync(templatePath)) {
    return res.status(404).json({ erro: 'Template CSV não encontrado no servidor.' });
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="importacao_clientes_processos_template.csv"');
  return res.sendFile(templatePath);
}

async function obterConfig(req, res) {
  try {
    const escritorioId = getEscritorioId(req);
    const config = await obterConfigBase(escritorioId, req.escritorio?.nome || '');
    return res.json(config);
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao carregar configuração.' });
  }
}

async function atualizarConfig(req, res) {
  const escritorioId = getEscritorioId(req);
  if (!canManage(req)) {
    return res.status(403).json({ erro: 'Sem permissão para alterar configurações.' });
  }

  const nomeExibicao = String(req.body.nome_exibicao || '').trim() || null;
  const djenUfPadrao = normalizeUf(req.body.djen_uf_padrao || req.body.uf_djen);
  const temaInput = req.body.tema;
  const tema = temaInput === undefined || temaInput === null || String(temaInput).trim() === ''
    ? null
    : normalizeTheme(temaInput);
  if (djenUfPadrao && !/^[A-Z]{2}$/.test(djenUfPadrao)) {
    return res.status(400).json({ erro: 'UF padrão do DJEN inválida.' });
  }
  if (temaInput !== undefined && temaInput !== null && String(temaInput).trim() !== '' && !tema) {
    return res.status(400).json({ erro: 'Tema inválido.' });
  }

  try {
    const result = await db.query(
      `INSERT INTO escritorio_config (escritorio_id, nome_exibicao, djen_uf_padrao, tema, created_at, updated_at)
       VALUES ($1, $2, COALESCE($3, 'BA'), COALESCE($4, 'classic'), NOW(), NOW())
       ON CONFLICT (escritorio_id)
       DO UPDATE SET
         nome_exibicao = EXCLUDED.nome_exibicao,
         djen_uf_padrao = COALESCE(EXCLUDED.djen_uf_padrao, escritorio_config.djen_uf_padrao),
         tema = COALESCE(EXCLUDED.tema, escritorio_config.tema, 'classic'),
         updated_at = NOW()
       RETURNING escritorio_id, nome_exibicao, djen_uf_padrao, tema, created_at, updated_at`,
      [escritorioId, nomeExibicao, djenUfPadrao, tema]
    );
    return res.json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao atualizar configuração.' });
  }
}

module.exports = {
  resumo,
  listarColaboradores,
  criarColaborador,
  atualizarColaborador,
  removerColaborador,
  listarAreas,
  criarArea,
  atualizarArea,
  removerArea,
  listarOabs,
  criarOab,
  atualizarOab,
  removerOab,
  previewImportacaoProcessos,
  importarProcessos,
  importarClientesProcessosCsv,
  baixarTemplateImportacaoCsv,
  listarProcedimentos,
  criarProcedimento,
  atualizarProcedimento,
  removerProcedimento,
  baixarAnexoProcedimento,
  obterConfig,
  atualizarConfig,
};
