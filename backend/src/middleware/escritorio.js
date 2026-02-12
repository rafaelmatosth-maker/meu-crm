const db = require('../db');

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
       ORDER BY CASE me.papel WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END, me.escritorio_id ASC
       LIMIT 1`,
      params
    );

    if (!membershipResult.rows.length) {
      return res.status(403).json({ erro: 'Usuário sem vínculo com escritório.' });
    }

    const membership = membershipResult.rows[0];
    req.escritorio = {
      id: Number(membership.escritorio_id),
      nome: membership.nome,
      papel: membership.papel,
    };

    req.user.escritorio_id = req.escritorio.id;
    req.user.papel = req.escritorio.papel;

    return next();
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao validar escritório.' });
  }
}

function requirePapel(...allowedRoles) {
  return (req, res, next) => {
    if (!req.escritorio || !req.escritorio.papel) {
      return res.status(403).json({ erro: 'Contexto de escritório não encontrado.' });
    }

    if (!allowedRoles.includes(req.escritorio.papel)) {
      return res.status(403).json({ erro: 'Sem permissão para esta ação.' });
    }

    return next();
  };
}

module.exports = {
  attachEscritorioContext,
  requirePapel,
};
