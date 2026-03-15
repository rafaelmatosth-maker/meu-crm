const db = require('../db');

function normalizePapelValue(value) {
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

function parseEscritorioId(req) {
  const candidates = [
    req.headers['x-escritorio-id'],
    req.query.escritorio_id,
    req.body && req.body.escritorio_id,
    req.user && req.user.escritorio_id,
  ];

  for (const value of candidates) {
    if (value === undefined || value === null || value === '') continue;
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

async function attachEscritorioContext(req, res, next) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ erro: 'Não autorizado. Faça login.' });
    }

    const selectedEscritorioId = parseEscritorioId(req);
    const params = [req.user.id];
    let whereExtra = '';
    if (selectedEscritorioId) {
      params.push(selectedEscritorioId);
      whereExtra = ' AND me.escritorio_id = $2';
    }

    const membershipResult = await db.query(
      `SELECT me.escritorio_id, me.papel, e.nome
       FROM membros_escritorio me
       JOIN escritorios e ON e.id = me.escritorio_id
       WHERE me.usuario_id = $1${whereExtra}
       ORDER BY CASE
         WHEN me.papel IN ('owner', 'admin', 'administrador') THEN 1
         WHEN me.papel IN ('colaborador', 'advogado') THEN 2
         WHEN me.papel = 'estagiario' THEN 3
         ELSE 4
       END, me.escritorio_id ASC
       LIMIT 1`,
      params
    );

    if (!membershipResult.rows.length) {
      return res.status(403).json({ erro: 'Usuário sem vínculo com escritório.' });
    }

    const membership = membershipResult.rows[0];
    const papelNormalizado = normalizePapelValue(membership.papel);
    req.escritorio = {
      id: Number(membership.escritorio_id),
      nome: membership.nome,
      papel: papelNormalizado || membership.papel,
    };

    req.user.escritorio_id = req.escritorio.id;
    req.user.papel = req.escritorio.papel;

    return next();
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao validar escritório.' });
  }
}

function requirePapel(...allowedRoles) {
  const allowedNormalized = allowedRoles.map((role) => normalizePapelValue(role)).filter(Boolean);
  return (req, res, next) => {
    if (!req.escritorio || !req.escritorio.papel) {
      return res.status(403).json({ erro: 'Contexto de escritório não encontrado.' });
    }

    const currentRole = normalizePapelValue(req.escritorio.papel);
    if (!allowedNormalized.includes(currentRole)) {
      return res.status(403).json({ erro: 'Sem permissão para esta ação.' });
    }

    return next();
  };
}

function requireNotPapel(...blockedRoles) {
  const blockedNormalized = blockedRoles.map((role) => normalizePapelValue(role)).filter(Boolean);
  return (req, res, next) => {
    if (!req.escritorio || !req.escritorio.papel) {
      return res.status(403).json({ erro: 'Contexto de escritório não encontrado.' });
    }
    const currentRole = normalizePapelValue(req.escritorio.papel);
    if (blockedNormalized.includes(currentRole)) {
      return res.status(403).json({ erro: 'Sem permissão para esta ação.' });
    }
    return next();
  };
}

module.exports = {
  attachEscritorioContext,
  requirePapel,
  requireNotPapel,
  normalizePapelValue,
};
