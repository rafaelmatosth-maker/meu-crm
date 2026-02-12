const db = require('../db');
const { parseCnjNumber } = require('../utils/cnj');
const { fetchProcessoMovimentos } = require('../utils/datajud');

const DEFAULT_STALE_HOURS = Number(process.env.DATAJUD_STALE_HOURS || 24);

function hoursDiff(dateA, dateB) {
  const ms = Math.abs(dateA - dateB);
  return ms / (1000 * 60 * 60);
}

async function getProcessoById(id) {
  const result = await db.query('SELECT * FROM processos WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function getLatestSnapshot(processoId) {
  const result = await db.query(
    `SELECT *
     FROM processo_andamentos
     WHERE processo_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [processoId]
  );
  return result.rows[0] || null;
}

async function logSyncEvent({ processoId, status, mensagem, numeroProcesso, alias, payload }) {
  await db.query(
    `INSERT INTO processo_andamentos_logs
      (processo_id, status, mensagem, numero_processo, tribunal_alias, payload)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [processoId || null, status, mensagem || null, numeroProcesso || null, alias || null, payload || null]
  );
}

async function saveSnapshot({ processoId, numeroProcesso, alias, dataUltima, payload }) {
  const result = await db.query(
    `INSERT INTO processo_andamentos
      (processo_id, numero_processo, tribunal_alias, data_ultima_movimentacao, payload)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [processoId, numeroProcesso, alias, dataUltima || null, payload]
  );
  return result.rows[0];
}

async function updateProcessoStatus({ processoId, dataUltima }) {
  const current = await db.query(
    `SELECT ultima_movimentacao_em, tem_novo_andamento
     FROM processos
     WHERE id = $1`,
    [processoId]
  );
  const prev = current.rows[0] || {};
  let temNovo = Boolean(prev.tem_novo_andamento);
  let novaUltima = prev.ultima_movimentacao_em;

  if (dataUltima) {
    const prevDate = prev.ultima_movimentacao_em ? new Date(prev.ultima_movimentacao_em) : null;
    const nextDate = new Date(dataUltima);
    if (!prevDate || (nextDate && nextDate > prevDate)) {
      temNovo = true;
      novaUltima = dataUltima;
    }
  }

  await db.query(
    `UPDATE processos
     SET ultima_movimentacao_em = $1,
         ultima_sincronizacao_em = NOW(),
         tem_novo_andamento = $2
     WHERE id = $3`,
    [novaUltima || null, temNovo, processoId]
  );
}

async function marcarAndamentosVistos(processoId) {
  await db.query(
    `UPDATE processos
     SET tem_novo_andamento = false
     WHERE id = $1`,
    [processoId]
  );
}

async function syncAndamentosForProcessoId(processoId) {
  const processo = await getProcessoById(processoId);
  if (!processo) {
    const error = new Error('Processo não encontrado.');
    error.status = 404;
    await logSyncEvent({ processoId, status: 'error', mensagem: error.message });
    throw error;
  }

  const cnjParts = parseCnjNumber(processo.numero_processo);
  if (!cnjParts) {
    const error = new Error('Número CNJ inválido para consulta DataJud.');
    error.status = 400;
    await logSyncEvent({
      processoId,
      status: 'invalid',
      mensagem: error.message,
      numeroProcesso: processo.numero_processo,
    });
    throw error;
  }

  const { alias, numeroProcesso, hit } = await fetchProcessoMovimentos(cnjParts);
  if (!hit) {
    await logSyncEvent({
      processoId,
      status: 'not_found',
      mensagem: 'Processo não localizado no DataJud.',
      numeroProcesso,
      alias,
    });
    return null;
  }

  const movimentos = Array.isArray(hit.movimentos) ? hit.movimentos : [];
  const latestFromMoves = movimentos
    .map((m) => m?.dataHora || m?.data || m?.data_movimentacao || m?.dataMovimento)
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b - a)[0];
  const dataUltima = hit.dataUltimaMovimentacao || (latestFromMoves ? latestFromMoves.toISOString() : null);

  const snapshot = await saveSnapshot({
    processoId,
    numeroProcesso,
    alias,
    dataUltima,
    payload: hit,
  });

  await updateProcessoStatus({ processoId, dataUltima });
  await logSyncEvent({
    processoId,
    status: 'success',
    numeroProcesso,
    alias,
    payload: { dataUltimaMovimentacao: dataUltima },
  });

  return snapshot;
}

async function getLatestWithOptionalRefresh(processoId) {
  const latest = await getLatestSnapshot(processoId);
  const staleHours = DEFAULT_STALE_HOURS;
  if (latest && !Number.isNaN(staleHours)) {
    const age = hoursDiff(new Date(), new Date(latest.created_at));
    if (age <= staleHours) {
      return { latest, refreshed: false };
    }
  }

  if (process.env.DATAJUD_API_KEY) {
    syncAndamentosForProcessoId(processoId).catch(() => null);
  }
  return { latest, refreshed: true };
}

async function listProcessosIdsForSync() {
  const result = await db.query(
    `SELECT id
     FROM processos
     WHERE LENGTH(REGEXP_REPLACE(numero_processo, '\\\\D', '', 'g')) = 20`
  );
  return result.rows.map((row) => row.id);
}

async function syncAllProcessos() {
  const ids = await listProcessosIdsForSync();
  const resumo = { total: ids.length, sucesso: 0, erro: 0 };

  for (const processoId of ids) {
    try {
      await syncAndamentosForProcessoId(processoId);
      resumo.sucesso += 1;
    } catch (err) {
      resumo.erro += 1;
    }
  }

  return resumo;
}

async function listLogs(processoId, limit = 30) {
  const result = await db.query(
    `SELECT *
     FROM processo_andamentos_logs
     WHERE processo_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [processoId, limit]
  );
  return result.rows;
}

module.exports = {
  getLatestSnapshot,
  getLatestWithOptionalRefresh,
  syncAndamentosForProcessoId,
  syncAllProcessos,
  marcarAndamentosVistos,
  listLogs,
};
