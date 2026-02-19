const db = require('../db');
const { requireFields } = require('../utils/validators');
const { syncAndamentosForProcessoId } = require('../services/processoAndamentosService');

function getEscritorioId(req) {
  return Number(req.escritorio && req.escritorio.id);
}

async function clientePertenceAoEscritorio(clienteId, escritorioId) {
  const result = await db.query('SELECT id FROM clientes WHERE id = $1 AND escritorio_id = $2', [
    clienteId,
    escritorioId,
  ]);
  return result.rows.length > 0;
}

function numeroParaComparacao(numero) {
  return {
    raw: String(numero || '').trim(),
    lowered: String(numero || '').trim().toLowerCase(),
    digits: String(numero || '').replace(/\D/g, ''),
  };
}

async function buscarProcessoDuplicadoPorNumero(escritorioId, numeroProcesso, ignoreId = null) {
  const normalized = numeroParaComparacao(numeroProcesso);
  const where = ['escritorio_id = $1'];
  const matchClauses = [];
  const params = [escritorioId];

  if (normalized.raw) {
    params.push(normalized.lowered);
    matchClauses.push(`LOWER(TRIM(numero_processo)) = $${params.length}`);
  }

  if (normalized.digits) {
    params.push(normalized.digits);
    matchClauses.push(`regexp_replace(numero_processo, '\\D', '', 'g') = $${params.length}`);
  }

  if (ignoreId) {
    params.push(Number(ignoreId));
    where.push(`id <> $${params.length}`);
  }

  if (!matchClauses.length) return null;
  where.push(`(${matchClauses.join(' OR ')})`);

  const result = await db.query(
    `SELECT id, numero_processo
     FROM processos
     WHERE ${where.join(' AND ')}
     ORDER BY id ASC
     LIMIT 1`,
    params
  );

  return result.rows[0] || null;
}

async function listar(req, res) {
  try {
    const escritorioId = getEscritorioId(req);
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 100);
    const offset = (page - 1) * limit;

    const where = ['p.escritorio_id = $1', 'c.escritorio_id = $1'];
    const params = [escritorioId];

    if (req.query.cliente_id) {
      params.push(req.query.cliente_id);
      where.push(`p.cliente_id = $${params.length}`);
    }

    if (req.query.status) {
      params.push(req.query.status);
      where.push(`p.status = $${params.length}`);
    }

    if (req.query.status_pagamento) {
      const statusPagamento = String(req.query.status_pagamento || '').trim();
      if (statusPagamento) {
        params.push(`%${statusPagamento}%`);
        where.push(`p.status_pagamento ILIKE $${params.length}`);
      }
    }

    if (req.query.andamentos_novos) {
      const flag = ['1', 'true', 'yes'].includes(String(req.query.andamentos_novos).toLowerCase());
      if (flag) {
        where.push('p.tem_novo_andamento = true');
      }
    }

    if (req.query.search) {
      const searchRaw = String(req.query.search || '').trim();
      if (searchRaw) {
        const likeTerm = `%${searchRaw}%`;
        params.push(likeTerm);
        const likeIdx = params.length;

        // For fuzzy client-name matching (typos/partial), we use pg_trgm's similarity.
        // Avoid enabling it for tiny strings to prevent broad matches.
        const enableSimilarity = searchRaw.length >= 3;
        if (enableSimilarity) {
          params.push(searchRaw);
        }
        const simIdx = params.length;

        // Accent/case-insensitive search for human-entered fields.
        // Requires Postgres extensions: unaccent (+ pg_trgm for similarity).
        const parts = [
          `p.numero_processo ILIKE $${likeIdx}`,
          `unaccent(coalesce(p.area, '')) ILIKE unaccent($${likeIdx})`,
          `unaccent(coalesce(p.orgao, '')) ILIKE unaccent($${likeIdx})`,
          `unaccent(coalesce(c.nome, '')) ILIKE unaccent($${likeIdx})`,
          `unaccent(coalesce(p.status_pagamento, '')) ILIKE unaccent($${likeIdx})`,
        ];
        if (enableSimilarity) {
          parts.push(
            `similarity(unaccent(coalesce(c.nome, '')), unaccent($${simIdx})) > 0.25`
          );
        }

        let clause = `(${parts.join(' OR ')})`;
        const digits = searchRaw.replace(/\D/g, '');
        if (digits) {
          params.push(`%${digits}%`);
          clause = `(${clause} OR regexp_replace(p.numero_processo, '\\D', '', 'g') ILIKE $${params.length})`;
        }
        where.push(clause);
      }
    }

    const includeSemProcesso = req.query.include_sem_processo === 'true';
    if (!includeSemProcesso) {
      where.push(`p.numero_processo NOT ILIKE 'SEM-PROCESSO-%'`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;

    const totalResult = await db.query(
      `SELECT COUNT(*) FROM processos p JOIN clientes c ON c.id = p.cliente_id ${whereSql}`,
      params
    );
    const total = Number(totalResult.rows[0].count);

    const dir = req.query.dir === 'desc' ? 'DESC' : 'ASC';

    let orderSql = `ORDER BY p.cnj_ano ${dir} NULLS LAST, p.cnj_tribunal ${dir} NULLS LAST, p.cnj_sequencial ${dir} NULLS LAST, LOWER(p.numero_processo) ${dir}`;
    if (req.query.sort && !['numero_processo', 'cnj'].includes(req.query.sort)) {
      orderSql = 'ORDER BY p.created_at DESC';
    }

    params.push(limit, offset);
    const result = await db.query(
      `SELECT p.*, c.nome AS cliente_nome
       FROM processos p
       JOIN clientes c ON c.id = p.cliente_id
       ${whereSql}
       ${orderSql}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({ data: result.rows, page, limit, total });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao listar processos.' });
  }
}

async function obter(req, res) {
  try {
    const escritorioId = getEscritorioId(req);
    const result = await db.query(
      `SELECT p.*, c.nome AS cliente_nome
       FROM processos p
       JOIN clientes c ON c.id = p.cliente_id
       WHERE p.id = $1 AND p.escritorio_id = $2 AND c.escritorio_id = $2`,
      [req.params.id, escritorioId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ erro: 'Processo não encontrado.' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao obter processo.' });
  }
}

async function criar(req, res) {
  const missing = requireFields(req.body, ['cliente_id', 'numero_processo']);
  if (missing.length) {
    return res.status(400).json({ erro: `Campos obrigatórios: ${missing.join(', ')}` });
  }

  const {
    cliente_id,
    numero_processo,
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
    honorario_adm,
    honorarios,
    honorarios_liquidos,
    repassado,
    repasse,
    parte_contraria,
    distribuicao,
  } = req.body;
  const escritorioId = getEscritorioId(req);

  if (!(await clientePertenceAoEscritorio(cliente_id, escritorioId))) {
    return res.status(400).json({ erro: 'Cliente inválido para este escritório.' });
  }

  if (String(numero_processo || '').toUpperCase().startsWith('SEM-PROCESSO-')) {
    return res.status(400).json({ erro: 'Número de processo inválido.' });
  }

  const duplicado = await buscarProcessoDuplicadoPorNumero(escritorioId, numero_processo);
  if (duplicado) {
    return res.status(409).json({
      erro: 'Número de processo já cadastrado.',
      processo_id: duplicado.id,
      processo_numero: duplicado.numero_processo,
    });
  }

  const digits = String(numero_processo || '').replace(/\D/g, '');
  const cnjAno = digits.length === 20 ? Number(digits.slice(9, 13)) : null;
  const cnjTribunal = digits.length === 20 ? Number(digits.slice(14, 16)) : null;
  const cnjSequencial = digits.length === 20 ? Number(digits.slice(0, 7)) : null;
  try {
    const result = await db.query(
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
        honorario_adm,
        honorarios,
        honorarios_liquidos,
        repassado,
        repasse,
        parte_contraria,
        distribuicao,
        escritorio_id
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37)
       RETURNING *`,
      [
        cliente_id,
        numero_processo,
        cnjAno,
        cnjTribunal,
        cnjSequencial,
        area || null,
        fase || null,
        status || null,
        orgao || null,
        situacao || null,
        classe || null,
        juizo || null,
        vara || null,
        grau || null,
        cidade || null,
        estado || null,
        sistema || null,
        percentual || null,
        abrir_conta || null,
        conta_aberta || null,
        aceitar_acordo || null,
        prazo || null,
        previsao || null,
        resultado || null,
        recurso_inominado || null,
        proveito_economico || null,
        proveito_pago || null,
        status_pagamento || null,
        comissao || null,
        honorario_adm || null,
        honorarios || null,
        honorarios_liquidos || null,
        repassado || null,
        repasse || null,
        parte_contraria || null,
        distribuicao || null,
        escritorioId,
      ]
    );
    const novo = result.rows[0];
    if (process.env.DATAJUD_API_KEY && process.env.DATAJUD_AUTO_SYNC !== 'false') {
      setImmediate(() => syncAndamentosForProcessoId(novo.id).catch(() => null));
    }
    return res.status(201).json(novo);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ erro: 'Número de processo já cadastrado.' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ erro: 'Cliente inválido.' });
    }
    return res.status(500).json({ erro: 'Erro ao criar processo.' });
  }
}

async function atualizar(req, res) {
  const {
    cliente_id,
    numero_processo,
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
    honorario_adm,
    honorarios,
    honorarios_liquidos,
    repassado,
    repasse,
    parte_contraria,
    distribuicao,
  } = req.body;
  if (!cliente_id || !numero_processo) {
    return res.status(400).json({ erro: 'Campos obrigatórios: cliente_id, numero_processo' });
  }

  const escritorioId = getEscritorioId(req);
  if (!(await clientePertenceAoEscritorio(cliente_id, escritorioId))) {
    return res.status(400).json({ erro: 'Cliente inválido para este escritório.' });
  }

  if (String(numero_processo || '').toUpperCase().startsWith('SEM-PROCESSO-')) {
    return res.status(400).json({ erro: 'Número de processo inválido.' });
  }

  const duplicado = await buscarProcessoDuplicadoPorNumero(escritorioId, numero_processo, req.params.id);
  if (duplicado) {
    return res.status(409).json({
      erro: 'Número de processo já cadastrado.',
      processo_id: duplicado.id,
      processo_numero: duplicado.numero_processo,
    });
  }

  const digits = String(numero_processo || '').replace(/\D/g, '');
  const cnjAno = digits.length === 20 ? Number(digits.slice(9, 13)) : null;
  const cnjTribunal = digits.length === 20 ? Number(digits.slice(14, 16)) : null;
  const cnjSequencial = digits.length === 20 ? Number(digits.slice(0, 7)) : null;

  try {
    const result = await db.query(
      `UPDATE processos
       SET cliente_id = $1,
           numero_processo = $2,
           cnj_ano = $3,
           cnj_tribunal = $4,
           cnj_sequencial = $5,
           area = $6,
           fase = $7,
           status = $8,
           orgao = $9,
           situacao = $10,
           classe = $11,
           juizo = $12,
           vara = $13,
           grau = $14,
           cidade = $15,
           estado = $16,
           sistema = $17,
           percentual = $18,
           abrir_conta = $19,
           conta_aberta = $20,
           aceitar_acordo = $21,
           prazo = $22,
           previsao = $23,
           resultado = $24,
           recurso_inominado = $25,
           proveito_economico = $26,
           proveito_pago = $27,
           status_pagamento = $28,
           comissao = $29,
           honorario_adm = $30,
           honorarios = $31,
           honorarios_liquidos = $32,
           repassado = $33,
           repasse = $34,
           parte_contraria = $35,
           distribuicao = $36
       WHERE id = $37 AND escritorio_id = $38
       RETURNING *`,
      [
        cliente_id,
        numero_processo,
        cnjAno,
        cnjTribunal,
        cnjSequencial,
        area || null,
        fase || null,
        status || null,
        orgao || null,
        situacao || null,
        classe || null,
        juizo || null,
        vara || null,
        grau || null,
        cidade || null,
        estado || null,
        sistema || null,
        percentual || null,
        abrir_conta || null,
        conta_aberta || null,
        aceitar_acordo || null,
        prazo || null,
        previsao || null,
        resultado || null,
        recurso_inominado || null,
        proveito_economico || null,
        proveito_pago || null,
        status_pagamento || null,
        comissao || null,
        honorario_adm || null,
        honorarios || null,
        honorarios_liquidos || null,
        repassado || null,
        repasse || null,
        parte_contraria || null,
        distribuicao || null,
        req.params.id,
        escritorioId,
      ]
    );
    if (!result.rows.length) {
      return res.status(404).json({ erro: 'Processo não encontrado.' });
    }
    const atualizado = result.rows[0];
    if (process.env.DATAJUD_API_KEY && process.env.DATAJUD_AUTO_SYNC !== 'false') {
      setImmediate(() => syncAndamentosForProcessoId(atualizado.id).catch(() => null));
    }
    return res.json(atualizado);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ erro: 'Número de processo já cadastrado.' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ erro: 'Cliente inválido.' });
    }
    return res.status(500).json({ erro: 'Erro ao atualizar processo.' });
  }
}

async function remover(req, res) {
  try {
    const escritorioId = getEscritorioId(req);
    const result = await db.query('DELETE FROM processos WHERE id = $1 AND escritorio_id = $2 RETURNING id', [
      req.params.id,
      escritorioId,
    ]);
    if (!result.rows.length) {
      return res.status(404).json({ erro: 'Processo não encontrado.' });
    }
    return res.json({ mensagem: 'Processo removido.' });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao remover processo.' });
  }
}

module.exports = {
  listar,
  obter,
  criar,
  atualizar,
  remover,
};
