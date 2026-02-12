const db = require('../db');

function getEscritorioId(req) {
  return Number(req.escritorio && req.escritorio.id);
}

function normalizeDivisoes(divisoes) {
  if (!Array.isArray(divisoes)) return [];
  return divisoes
    .map((item) => ({
      parte: String(item.parte || '').trim(),
      percentual: item.percentual !== undefined ? String(item.percentual || '').trim() : '',
      valor: item.valor !== undefined ? String(item.valor || '').trim() : '',
    }))
    .filter((item) => item.parte);
}

async function replaceDivisoes(lancamentoId, divisoes) {
  await db.query('DELETE FROM financeiro_divisoes WHERE lancamento_id = $1', [lancamentoId]);
  if (!divisoes.length) return;
  const values = [];
  const params = [];
  divisoes.forEach((div, index) => {
    const base = index * 4;
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
    params.push(lancamentoId, div.parte, div.percentual || null, div.valor || null);
  });
  await db.query(
    `INSERT INTO financeiro_divisoes (lancamento_id, parte, percentual, valor) VALUES ${values.join(',')}`,
    params
  );
}

async function listarPorProcesso(req, res) {
  try {
    const processoId = Number(req.params.processoId || req.params.id);
    if (!processoId) return res.status(400).json({ erro: 'Processo inválido.' });

    const escritorioId = getEscritorioId(req);

    const result = await db.query(
      `SELECT l.*, COALESCE(json_agg(d.*) FILTER (WHERE d.id IS NOT NULL), '[]') AS divisoes
       FROM financeiro_lancamentos l
       LEFT JOIN financeiro_divisoes d ON d.lancamento_id = l.id
       WHERE l.processo_id = $1
         AND l.escritorio_id = $2
       GROUP BY l.id
       ORDER BY l.created_at DESC`,
      [processoId, escritorioId]
    );

    return res.json({ data: result.rows });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao listar lançamentos financeiros.' });
  }
}

async function criar(req, res) {
  try {
    const processoId = Number(req.params.processoId || req.params.id);
    if (!processoId) return res.status(400).json({ erro: 'Processo inválido.' });

    const escritorioId = getEscritorioId(req);
    const processoResp = await db.query(
      'SELECT cliente_id FROM processos WHERE id = $1 AND escritorio_id = $2',
      [processoId, escritorioId]
    );
    if (!processoResp.rows.length) {
      return res.status(404).json({ erro: 'Processo não encontrado.' });
    }
    const clienteId = processoResp.rows[0].cliente_id;

    const {
      tipo,
      descricao,
      valor_base,
      percentual,
      honorarios_calculados,
      repasse_calculado,
      previsao_pagamento_mes,
      pago,
      repassado,
      divisoes,
    } = req.body;

    if (!tipo) return res.status(400).json({ erro: 'Tipo é obrigatório.' });

    const result = await db.query(
      `INSERT INTO financeiro_lancamentos (
        processo_id,
        cliente_id,
        escritorio_id,
        tipo,
        descricao,
        valor_base,
        percentual,
        honorarios_calculados,
        repasse_calculado,
        previsao_pagamento_mes,
        pago,
        repassado
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *`,
      [
        processoId,
        clienteId,
        escritorioId,
        tipo,
        descricao || null,
        valor_base || null,
        percentual || null,
        honorarios_calculados || null,
        repasse_calculado || null,
        previsao_pagamento_mes || null,
        pago || null,
        repassado || null,
      ]
    );

    const lancamento = result.rows[0];
    const divisoesNorm = normalizeDivisoes(divisoes);
    if (divisoesNorm.length) {
      await replaceDivisoes(lancamento.id, divisoesNorm);
    }

    const complete = await db.query(
      `SELECT l.*, COALESCE(json_agg(d.*) FILTER (WHERE d.id IS NOT NULL), '[]') AS divisoes
       FROM financeiro_lancamentos l
       LEFT JOIN financeiro_divisoes d ON d.lancamento_id = l.id
       WHERE l.id = $1
         AND l.escritorio_id = $2
       GROUP BY l.id`,
      [lancamento.id, escritorioId]
    );

    return res.status(201).json(complete.rows[0]);
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao criar lançamento financeiro.' });
  }
}

async function criarAvulso(req, res) {
  try {
    const {
      processo_id,
      cliente_id,
      tipo,
      descricao,
      valor_base,
      percentual,
      honorarios_calculados,
      repasse_calculado,
      previsao_pagamento_mes,
      pago,
      repassado,
      divisoes,
    } = req.body;

    const escritorioId = getEscritorioId(req);
    const clienteId = Number(cliente_id);
    if (!clienteId) return res.status(400).json({ erro: 'Cliente é obrigatório.' });
    if (!tipo) return res.status(400).json({ erro: 'Tipo é obrigatório.' });

    const clienteResp = await db.query('SELECT id FROM clientes WHERE id = $1 AND escritorio_id = $2', [
      clienteId,
      escritorioId,
    ]);
    if (!clienteResp.rows.length) {
      return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }

    let processoId = null;
    if (processo_id) {
      const processoResp = await db.query(
        'SELECT id, cliente_id FROM processos WHERE id = $1 AND escritorio_id = $2',
        [processo_id, escritorioId]
      );
      if (!processoResp.rows.length) {
        return res.status(404).json({ erro: 'Processo não encontrado.' });
      }
      if (Number(processoResp.rows[0].cliente_id) !== clienteId) {
        return res.status(400).json({ erro: 'Cliente não corresponde ao processo.' });
      }
      processoId = Number(processo_id);
    }

    const result = await db.query(
      `INSERT INTO financeiro_lancamentos (
        processo_id,
        cliente_id,
        escritorio_id,
        tipo,
        descricao,
        valor_base,
        percentual,
        honorarios_calculados,
        repasse_calculado,
        previsao_pagamento_mes,
        pago,
        repassado
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *`,
      [
        processoId,
        clienteId,
        escritorioId,
        tipo,
        descricao || null,
        valor_base || null,
        percentual || null,
        honorarios_calculados || null,
        repasse_calculado || null,
        previsao_pagamento_mes || null,
        pago || null,
        repassado || null,
      ]
    );

    const lancamento = result.rows[0];
    const divisoesNorm = normalizeDivisoes(divisoes);
    if (divisoesNorm.length) {
      await replaceDivisoes(lancamento.id, divisoesNorm);
    }

    const complete = await db.query(
      `SELECT l.*, COALESCE(json_agg(d.*) FILTER (WHERE d.id IS NOT NULL), '[]') AS divisoes
       FROM financeiro_lancamentos l
       LEFT JOIN financeiro_divisoes d ON d.lancamento_id = l.id
       WHERE l.id = $1
         AND l.escritorio_id = $2
       GROUP BY l.id`,
      [lancamento.id, escritorioId]
    );

    return res.status(201).json(complete.rows[0]);
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao criar lançamento financeiro.' });
  }
}

async function atualizar(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ erro: 'Lançamento inválido.' });

    const {
      tipo,
      descricao,
      valor_base,
      percentual,
      honorarios_calculados,
      repasse_calculado,
      previsao_pagamento_mes,
      pago,
      repassado,
      divisoes,
    } = req.body;

    if (!tipo) return res.status(400).json({ erro: 'Tipo é obrigatório.' });

    const escritorioId = getEscritorioId(req);

    const result = await db.query(
      `UPDATE financeiro_lancamentos
       SET tipo = $1,
           descricao = $2,
           valor_base = $3,
           percentual = $4,
           honorarios_calculados = $5,
           repasse_calculado = $6,
           previsao_pagamento_mes = $7,
           pago = $8,
           repassado = $9
       WHERE id = $10
         AND escritorio_id = $11
       RETURNING *`,
      [
        tipo,
        descricao || null,
        valor_base || null,
        percentual || null,
        honorarios_calculados || null,
        repasse_calculado || null,
        previsao_pagamento_mes || null,
        pago || null,
        repassado || null,
        id,
        escritorioId,
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ erro: 'Lançamento não encontrado.' });
    }

    const divisoesNorm = normalizeDivisoes(divisoes);
    if (divisoes) {
      await replaceDivisoes(id, divisoesNorm);
    }

    const complete = await db.query(
      `SELECT l.*, COALESCE(json_agg(d.*) FILTER (WHERE d.id IS NOT NULL), '[]') AS divisoes
       FROM financeiro_lancamentos l
       LEFT JOIN financeiro_divisoes d ON d.lancamento_id = l.id
       WHERE l.id = $1
         AND l.escritorio_id = $2
       GROUP BY l.id`,
      [id, escritorioId]
    );

    return res.json(complete.rows[0]);
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao atualizar lançamento financeiro.' });
  }
}

async function remover(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ erro: 'Lançamento inválido.' });

    const escritorioId = getEscritorioId(req);

    const result = await db.query(
      'DELETE FROM financeiro_lancamentos WHERE id = $1 AND escritorio_id = $2 RETURNING id',
      [id, escritorioId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ erro: 'Lançamento não encontrado.' });
    }

    return res.json({ id });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao remover lançamento financeiro.' });
  }
}

module.exports = {
  listarPorProcesso,
  criar,
  criarAvulso,
  atualizar,
  remover,
};
