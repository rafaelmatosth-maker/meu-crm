const db = require('../db');
const {
  getLatestWithOptionalRefresh,
  syncAndamentosForProcessoId,
  marcarAndamentosVistos,
  listLogs,
} = require('../services/processoAndamentosService');

function getEscritorioId(req) {
  return Number(req.escritorio && req.escritorio.id);
}

async function processoPertenceAoEscritorio(processoId, escritorioId) {
  const result = await db.query('SELECT id FROM processos WHERE id = $1 AND escritorio_id = $2', [
    processoId,
    escritorioId,
  ]);
  return result.rows.length > 0;
}

async function listar(req, res) {
  try {
    const processoId = Number(req.params.id);
    if (!processoId) {
      return res.status(400).json({ erro: 'Processo inválido.' });
    }

    const escritorioId = getEscritorioId(req);
    if (!(await processoPertenceAoEscritorio(processoId, escritorioId))) {
      return res.status(404).json({ erro: 'Processo não encontrado.' });
    }

    const { latest, refreshed } = await getLatestWithOptionalRefresh(processoId);
    const payload = latest?.payload || null;
    const movimentos = Array.isArray(payload?.movimentos) ? payload.movimentos : [];

    const response = {
      data: latest || null,
      movimentos,
      refresh_disparado: refreshed && !latest,
    };

    if (latest) {
      marcarAndamentosVistos(processoId).catch(() => null);
    }

    return res.json(response);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ erro: err.message || 'Erro ao obter andamentos.' });
  }
}

async function sincronizar(req, res) {
  try {
    const processoId = Number(req.params.id);
    if (!processoId) {
      return res.status(400).json({ erro: 'Processo inválido.' });
    }

    const escritorioId = getEscritorioId(req);
    if (!(await processoPertenceAoEscritorio(processoId, escritorioId))) {
      return res.status(404).json({ erro: 'Processo não encontrado.' });
    }

    const snapshot = await syncAndamentosForProcessoId(processoId);
    const payload = snapshot?.payload || null;
    const movimentos = Array.isArray(payload?.movimentos) ? payload.movimentos : [];

    return res.json({ data: snapshot || null, movimentos });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ erro: err.message || 'Erro ao sincronizar andamentos.' });
  }
}

async function marcarVistos(req, res) {
  try {
    const processoId = Number(req.params.id);
    if (!processoId) {
      return res.status(400).json({ erro: 'Processo inválido.' });
    }

    const escritorioId = getEscritorioId(req);
    if (!(await processoPertenceAoEscritorio(processoId, escritorioId))) {
      return res.status(404).json({ erro: 'Processo não encontrado.' });
    }

    await marcarAndamentosVistos(processoId);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao marcar andamentos.' });
  }
}

async function listarLogs(req, res) {
  try {
    const processoId = Number(req.params.id);
    if (!processoId) {
      return res.status(400).json({ erro: 'Processo inválido.' });
    }

    const escritorioId = getEscritorioId(req);
    if (!(await processoPertenceAoEscritorio(processoId, escritorioId))) {
      return res.status(404).json({ erro: 'Processo não encontrado.' });
    }

    const limit = Math.min(Math.max(Number(req.query.limit || 30), 1), 100);
    const logs = await listLogs(processoId, limit);
    return res.json({ data: logs });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao listar logs.' });
  }
}

module.exports = {
  listar,
  sincronizar,
  marcarVistos,
  listarLogs,
};
