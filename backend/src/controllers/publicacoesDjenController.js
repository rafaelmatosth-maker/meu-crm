const { buscarComunicacoesDjen } = require('../utils/djen');
const db = require('../db');

function toPositiveInt(value, fallback, max) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(Math.floor(num), max);
}

function todayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function parseOabInput(rawOab, rawUf) {
  const originalOab = String(rawOab || '').trim();
  const originalUf = String(rawUf || '').trim().toUpperCase();

  if (!originalOab && !originalUf) {
    return { numeroOab: '', ufOab: '' };
  }

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

  if (ufOab) ufOab = ufOab.slice(0, 2);

  return {
    numeroOab,
    ufOab,
  };
}

function normalizeItem(item) {
  const advogados = Array.isArray(item.destinatarioadvogados)
    ? item.destinatarioadvogados
        .map((entry) => entry?.advogado)
        .filter(Boolean)
        .map((adv) => ({
          nome: adv.nome || '',
          numero_oab: adv.numero_oab || '',
          uf_oab: adv.uf_oab || '',
        }))
    : [];

  return {
    id: item.id,
    data_disponibilizacao: item.data_disponibilizacao || item.datadisponibilizacao || '',
    sigla_tribunal: item.siglaTribunal || '',
    tipo_comunicacao: item.tipoComunicacao || '',
    numero_processo: item.numero_processo || '',
    numero_processo_mascara: item.numeroprocessocommascara || '',
    numero_comunicacao: item.numeroComunicacao || '',
    orgao: item.nomeOrgao || '',
    meio: item.meiocompleto || item.meio || '',
    link: item.link || '',
    texto: item.texto || '',
    hash: item.hash || '',
    status: item.status || '',
    motivo_cancelamento: item.motivo_cancelamento || '',
    advogados,
    raw: item,
  };
}

function normalizeNumeroExact(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeNumeroDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function annotateWithoutMatch(items) {
  return items.map((item) => ({
    ...item,
    processo_encontrado: false,
    processo_id: null,
    processo_numero: null,
    processo_cliente_id: null,
    processo_cliente_nome: null,
  }));
}

async function vincularProcessos(escritorioId, items) {
  if (!escritorioId || !Array.isArray(items) || !items.length) {
    return annotateWithoutMatch(items || []);
  }

  const exactSet = new Set();
  const digitsSet = new Set();

  items.forEach((item) => {
    const exactA = normalizeNumeroExact(item.numero_processo);
    const exactB = normalizeNumeroExact(item.numero_processo_mascara);
    const digitsA = normalizeNumeroDigits(item.numero_processo);
    const digitsB = normalizeNumeroDigits(item.numero_processo_mascara);

    if (exactA) exactSet.add(exactA);
    if (exactB) exactSet.add(exactB);
    if (digitsA) digitsSet.add(digitsA);
    if (digitsB) digitsSet.add(digitsB);
  });

  const exactList = Array.from(exactSet);
  const digitsList = Array.from(digitsSet);

  if (!exactList.length && !digitsList.length) {
    return annotateWithoutMatch(items);
  }

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

  const byExact = new Map();
  const byDigits = new Map();

  result.rows.forEach((row) => {
    if (row.numero_norm && !byExact.has(row.numero_norm)) byExact.set(row.numero_norm, row);
    if (row.numero_digits && !byDigits.has(row.numero_digits)) byDigits.set(row.numero_digits, row);
  });

  return items.map((item) => {
    const exactCandidates = [normalizeNumeroExact(item.numero_processo), normalizeNumeroExact(item.numero_processo_mascara)]
      .filter(Boolean);
    const digitsCandidates = [
      normalizeNumeroDigits(item.numero_processo),
      normalizeNumeroDigits(item.numero_processo_mascara),
    ].filter(Boolean);

    let processo = null;
    for (const key of exactCandidates) {
      if (byExact.has(key)) {
        processo = byExact.get(key);
        break;
      }
    }
    if (!processo) {
      for (const key of digitsCandidates) {
        if (byDigits.has(key)) {
          processo = byDigits.get(key);
          break;
        }
      }
    }

    return {
      ...item,
      processo_encontrado: Boolean(processo),
      processo_id: processo?.id || null,
      processo_numero: processo?.numero_processo || null,
      processo_cliente_id: processo?.cliente_id || null,
      processo_cliente_nome: processo?.cliente_nome || null,
    };
  });
}

async function listar(req, res) {
  try {
    const page = toPositiveInt(req.query.page, 1, 9999);
    const limit = toPositiveInt(req.query.limit, 20, 100);
    const singleDate = String(req.query.data || '').trim();
    const dataInicioRaw = String(req.query.data_inicio || '').trim();
    const dataFimRaw = String(req.query.data_fim || '').trim();
    let oabInfo = parseOabInput(req.query.oab || req.query.numero_oab, req.query.uf || req.query.uf_oab);

    let dataInicio = dataInicioRaw;
    let dataFim = dataFimRaw;

    if (!dataInicio && !dataFim) {
      const baseDate = singleDate || todayIsoDate();
      dataInicio = baseDate;
      dataFim = baseDate;
    } else {
      if (!dataInicio && dataFim) dataInicio = dataFim;
      if (!dataFim && dataInicio) dataFim = dataInicio;
    }

    if (!isIsoDate(dataInicio) || !isIsoDate(dataFim)) {
      return res
        .status(400)
        .json({ erro: 'Data inválida. Use o formato YYYY-MM-DD em data inicial/final.' });
    }

    if (dataInicio > dataFim) {
      return res.status(400).json({ erro: 'Data inicial não pode ser maior que a data final.' });
    }

    if ((oabInfo.ufOab && !oabInfo.numeroOab) || (oabInfo.ufOab && !/^[A-Z]{2}$/.test(oabInfo.ufOab))) {
      return res.status(400).json({ erro: 'UF da OAB inválida.' });
    }

    if (!oabInfo.numeroOab && req.escritorio?.id) {
      const defaultOabResult = await db.query(
        `SELECT numero, uf
         FROM escritorio_oabs_djen
         WHERE escritorio_id = $1 AND ativo = true
         ORDER BY created_at ASC
         LIMIT 1`,
        [req.escritorio.id]
      );

      if (defaultOabResult.rows.length) {
        oabInfo = {
          numeroOab: defaultOabResult.rows[0].numero,
          ufOab: defaultOabResult.rows[0].uf,
        };
      }
    }

    if (oabInfo.numeroOab && !oabInfo.ufOab && req.escritorio?.id) {
      const configResult = await db.query(
        `SELECT djen_uf_padrao
         FROM escritorio_config
         WHERE escritorio_id = $1`,
        [req.escritorio.id]
      );
      if (configResult.rows.length && configResult.rows[0].djen_uf_padrao) {
        oabInfo.ufOab = String(configResult.rows[0].djen_uf_padrao).toUpperCase().slice(0, 2);
      }
    }

    if ((oabInfo.ufOab && !oabInfo.numeroOab) || (oabInfo.ufOab && !/^[A-Z]{2}$/.test(oabInfo.ufOab))) {
      return res.status(400).json({ erro: 'UF da OAB inválida.' });
    }

    const payload = {
      pagina: page,
      itensPorPagina: limit,
      dataDisponibilizacaoInicio: dataInicio,
      dataDisponibilizacaoFim: dataFim,
    };

    if (oabInfo.numeroOab) payload.numeroOab = oabInfo.numeroOab;
    if (oabInfo.ufOab) payload.ufOab = oabInfo.ufOab;

    const response = await buscarComunicacoesDjen(payload);
    const items = Array.isArray(response?.items) ? response.items : [];
    const total = Number(response?.count || 0);
    const normalizedItems = items.map(normalizeItem);
    let data = annotateWithoutMatch(normalizedItems);

    try {
      data = await vincularProcessos(req.escritorio?.id, normalizedItems);
    } catch (_) {
      data = annotateWithoutMatch(normalizedItems);
    }

    return res.json({
      data,
      page,
      limit,
      total,
      filtros: {
        data_inicio: dataInicio,
        data_fim: dataFim,
        numero_oab: oabInfo.numeroOab || '',
        uf_oab: oabInfo.ufOab || '',
      },
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      erro: err.message || 'Erro ao consultar publicações do DJEN.',
      detalhe: err.data || null,
    });
  }
}

module.exports = {
  listar,
};
