const db = require('../db');
const { requireFields } = require('../utils/validators');

function getEscritorioId(req) {
  return Number(req.escritorio && req.escritorio.id);
}

async function listar(req, res) {
  try {
    const escritorioId = getEscritorioId(req);
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 100);
    const offset = (page - 1) * limit;

    const baseWhere = ['a.escritorio_id = $1'];
    const baseParams = [escritorioId];

    if (req.query.processo_id) {
      baseParams.push(req.query.processo_id);
      baseWhere.push(`a.processo_id = $${baseParams.length}`);
    }

    if (!req.query.processo_id && req.query.sem_processo === 'true') {
      baseWhere.push('a.processo_id IS NULL');
    }

    if (req.query.prioridade) {
      baseParams.push(req.query.prioridade);
      baseWhere.push(`a.prioridade = $${baseParams.length}`);
    }

    if (req.query.prazo) {
      baseParams.push(req.query.prazo);
      baseWhere.push(`a.prazo = $${baseParams.length}`);
    }

    if (req.query.prazo_from) {
      baseParams.push(req.query.prazo_from);
      baseWhere.push(`a.prazo >= $${baseParams.length}`);
    }

    if (req.query.prazo_to) {
      baseParams.push(req.query.prazo_to);
      baseWhere.push(`a.prazo <= $${baseParams.length}`);
    }

    if (req.query.sem_prazo === 'true') {
      baseWhere.push('a.prazo IS NULL');
    }

    if (req.query.search) {
      baseParams.push(`%${req.query.search}%`);
      baseWhere.push(
        `(a.titulo ILIKE $${baseParams.length} OR a.descricao ILIKE $${baseParams.length})`
      );
    }

    if (req.query.categoria) {
      baseParams.push(`%${req.query.categoria}%`);
      baseWhere.push(
        `(a.categoria ILIKE $${baseParams.length} OR a.titulo ILIKE $${baseParams.length})`
      );
    }

    const statusFilter = req.query.status;
    const where = [...baseWhere];
    const params = [...baseParams];
    if (statusFilter) {
      params.push(statusFilter);
      where.push(`a.status = $${params.length}`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const whereBaseSql = `WHERE ${baseWhere.join(' AND ')}`;

    const totalResult = await db.query(`SELECT COUNT(*) FROM atividades a ${whereSql}`, params);
    const total = Number(totalResult.rows[0].count);

    const statusTotalsResult = await db.query(
      `SELECT a.status, COUNT(*)::int AS total FROM atividades a ${whereBaseSql} GROUP BY a.status`,
      baseParams
    );
    const statusTotals = { a_fazer: 0, fazendo: 0, feito: 0, cancelado: 0 };
    statusTotalsResult.rows.forEach((row) => {
      if (statusTotals[row.status] !== undefined) statusTotals[row.status] = Number(row.total);
    });

    const statusOrder = `
      CASE a.status
        WHEN 'a_fazer' THEN 1
        WHEN 'fazendo' THEN 2
        WHEN 'feito' THEN 3
        WHEN 'cancelado' THEN 4
        ELSE 5
      END
    `;
    let orderSql = `ORDER BY ${statusOrder}, a.created_at DESC`;
    if (req.query.sort === 'titulo') {
      const dir = req.query.dir === 'desc' ? 'DESC' : 'ASC';
      orderSql = `ORDER BY ${statusOrder}, LOWER(a.titulo) ${dir}, a.created_at DESC`;
    }
    if (req.query.sort === 'created_at') {
      const dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
      orderSql = `ORDER BY ${statusOrder}, a.created_at ${dir}`;
    }

    params.push(limit, offset);
    const result = await db.query(
      `SELECT a.*,
              COALESCE(p.numero_processo, a.processo_numero) AS numero_processo,
              COALESCE(c.nome, a.cliente_nome) AS cliente_nome,
              c.id AS cliente_id
       FROM atividades a
       LEFT JOIN processos p ON p.id = a.processo_id AND p.escritorio_id = a.escritorio_id
       LEFT JOIN clientes c ON c.id = p.cliente_id AND c.escritorio_id = a.escritorio_id
       ${whereSql}
       ${orderSql}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({ data: result.rows, page, limit, total, status_totals: statusTotals });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao listar atividades.' });
  }
}

async function obter(req, res) {
  try {
    const escritorioId = getEscritorioId(req);
    const result = await db.query(
      `SELECT a.*,
              COALESCE(p.numero_processo, a.processo_numero) AS numero_processo,
              COALESCE(c.nome, a.cliente_nome) AS cliente_nome,
              c.id AS cliente_id
       FROM atividades a
       LEFT JOIN processos p ON p.id = a.processo_id AND p.escritorio_id = a.escritorio_id
       LEFT JOIN clientes c ON c.id = p.cliente_id AND c.escritorio_id = a.escritorio_id
       WHERE a.id = $1 AND a.escritorio_id = $2`,
      [req.params.id, escritorioId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ erro: 'Atividade não encontrada.' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao obter atividade.' });
  }
}

async function criar(req, res) {
  const missing = requireFields(req.body, ['titulo']);
  if (missing.length) {
    return res.status(400).json({ erro: `Campos obrigatórios: ${missing.join(', ')}` });
  }

  const {
    processo_id,
    processo_numero,
    cliente_nome: cliente_nome_body,
    responsavel_id,
    titulo,
    descricao,
    status,
    prioridade,
    prazo,
    prazo_hora,
    concluida_em,
  } = req.body;

  const escritorioId = getEscritorioId(req);

  try {
    let numero_processo = null;
    let cliente_nome = null;
    if (processo_id) {
      const processoResult = await db.query(
        `SELECT p.numero_processo, c.nome AS cliente_nome
         FROM processos p
         JOIN clientes c ON c.id = p.cliente_id
         WHERE p.id = $1 AND p.escritorio_id = $2 AND c.escritorio_id = $2`,
        [processo_id, escritorioId]
      );
      if (!processoResult.rows.length) {
        return res.status(400).json({ erro: 'Processo inválido.' });
      }
      numero_processo = processoResult.rows[0].numero_processo;
      cliente_nome = processoResult.rows[0].cliente_nome;
    } else if (processo_numero) {
      numero_processo = String(processo_numero).trim() || null;
      cliente_nome = cliente_nome_body ? String(cliente_nome_body).trim() || null : null;
    } else if (cliente_nome_body) {
      cliente_nome = String(cliente_nome_body).trim() || null;
    }

    const result = await db.query(
      `INSERT INTO atividades
        (processo_id, responsavel_id, titulo, descricao, status, prioridade, prazo, prazo_hora, concluida_em, cliente_nome, processo_numero, escritorio_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        processo_id || null,
        responsavel_id || null,
        titulo,
        descricao || null,
        status || 'a_fazer',
        prioridade || 'media',
        prazo || null,
        prazo_hora || null,
        concluida_em || null,
        cliente_nome || null,
        numero_processo || null,
        escritorioId,
      ]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ erro: 'Processo ou responsável inválido.' });
    }
    return res.status(500).json({
      erro: err.message || 'Erro ao criar atividade.',
      codigo: err.code || null,
      detalhe: err.detail || null,
    });
  }
}

async function atualizar(req, res) {
  const {
    processo_id,
    processo_numero,
    cliente_nome: cliente_nome_body,
    responsavel_id,
    titulo,
    descricao,
    status,
    prioridade,
    prazo,
    prazo_hora,
    concluida_em,
  } = req.body;

  if (!titulo) {
    return res.status(400).json({ erro: 'Campos obrigatórios: titulo' });
  }

  const escritorioId = getEscritorioId(req);

  try {
    let numero_processo = null;
    let cliente_nome = null;
    if (processo_id) {
      const processoResult = await db.query(
        `SELECT p.numero_processo, c.nome AS cliente_nome
         FROM processos p
         JOIN clientes c ON c.id = p.cliente_id
         WHERE p.id = $1 AND p.escritorio_id = $2 AND c.escritorio_id = $2`,
        [processo_id, escritorioId]
      );
      if (!processoResult.rows.length) {
        return res.status(400).json({ erro: 'Processo inválido.' });
      }
      numero_processo = processoResult.rows[0].numero_processo;
      cliente_nome = processoResult.rows[0].cliente_nome;
    } else if (processo_numero) {
      numero_processo = String(processo_numero).trim() || null;
      cliente_nome = cliente_nome_body ? String(cliente_nome_body).trim() || null : null;
    } else if (cliente_nome_body) {
      cliente_nome = String(cliente_nome_body).trim() || null;
    }

    const result = await db.query(
      `UPDATE atividades
       SET processo_id = $1,
           responsavel_id = $2,
           titulo = $3,
           descricao = $4,
           status = $5,
           prioridade = $6,
           prazo = $7,
           prazo_hora = $8,
           concluida_em = $9,
           processo_numero = $10,
           cliente_nome = $11
       WHERE id = $12 AND escritorio_id = $13
       RETURNING *`,
      [
        processo_id || null,
        responsavel_id || null,
        titulo,
        descricao || null,
        status || 'a_fazer',
        prioridade || 'media',
        prazo || null,
        prazo_hora || null,
        concluida_em || null,
        numero_processo,
        cliente_nome,
        req.params.id,
        escritorioId,
      ]
    );
    if (!result.rows.length) {
      return res.status(404).json({ erro: 'Atividade não encontrada.' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ erro: 'Processo ou responsável inválido.' });
    }
    return res.status(500).json({ erro: 'Erro ao atualizar atividade.' });
  }
}

async function remover(req, res) {
  try {
    const escritorioId = getEscritorioId(req);
    const result = await db.query(
      'DELETE FROM atividades WHERE id = $1 AND escritorio_id = $2 RETURNING id',
      [req.params.id, escritorioId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ erro: 'Atividade não encontrada.' });
    }
    return res.json({ mensagem: 'Atividade removida.' });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao remover atividade.' });
  }
}

module.exports = {
  listar,
  obter,
  criar,
  atualizar,
  remover,
};
