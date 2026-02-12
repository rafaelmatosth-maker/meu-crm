const bcrypt = require('bcryptjs');
const db = require('../db');

function normalizeSlug(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function membershipsByUser(userId) {
  const result = await db.query(
    `SELECT e.id, e.nome, e.slug, me.papel
     FROM membros_escritorio me
     JOIN escritorios e ON e.id = me.escritorio_id
     WHERE me.usuario_id = $1
     ORDER BY CASE me.papel WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END, e.nome ASC`,
    [userId]
  );
  return result.rows;
}

async function membershipForUser(userId, escritorioId) {
  const result = await db.query(
    `SELECT me.escritorio_id, me.papel
     FROM membros_escritorio me
     WHERE me.usuario_id = $1 AND me.escritorio_id = $2`,
    [userId, escritorioId]
  );
  return result.rows[0] || null;
}

function canManageMembers(papel) {
  return papel === 'owner' || papel === 'admin';
}

async function listar(req, res) {
  try {
    const escritorios = await membershipsByUser(req.user.id);
    return res.json({ data: escritorios });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao listar escritórios.' });
  }
}

async function criar(req, res) {
  const nome = String(req.body.nome || '').trim();
  if (!nome) {
    return res.status(400).json({ erro: 'Nome do escritório é obrigatório.' });
  }

  const slugBase = normalizeSlug(nome) || 'escritorio';
  const slug = `${slugBase}-${Date.now()}`;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const created = await client.query(
      'INSERT INTO escritorios (nome, slug) VALUES ($1, $2) RETURNING id, nome, slug',
      [nome, slug]
    );

    await client.query(
      `INSERT INTO membros_escritorio (escritorio_id, usuario_id, papel)
       VALUES ($1, $2, 'owner')`,
      [created.rows[0].id, req.user.id]
    );
    await client.query('COMMIT');

    return res.status(201).json({
      escritorio: created.rows[0],
      papel: 'owner',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ erro: 'Erro ao criar escritório.' });
  } finally {
    client.release();
  }
}

async function listarMembros(req, res) {
  try {
    const escritorioId = Number(req.params.id);
    if (!escritorioId) {
      return res.status(400).json({ erro: 'Escritório inválido.' });
    }

    const membership = await membershipForUser(req.user.id, escritorioId);
    if (!membership) {
      return res.status(403).json({ erro: 'Sem acesso ao escritório.' });
    }

    const result = await db.query(
      `SELECT u.id, u.nome, u.email, me.papel, me.created_at
       FROM membros_escritorio me
       JOIN usuarios u ON u.id = me.usuario_id
       WHERE me.escritorio_id = $1
       ORDER BY CASE me.papel WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END, u.nome ASC`,
      [escritorioId]
    );

    return res.json({ data: result.rows });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao listar membros.' });
  }
}

async function adicionarColaborador(req, res) {
  const escritorioId = Number(req.params.id);
  if (!escritorioId) {
    return res.status(400).json({ erro: 'Escritório inválido.' });
  }

  const nome = String(req.body.nome || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const senha = String(req.body.senha || '');
  const papel = String(req.body.papel || 'colaborador').trim();
  const allowedRoles = ['admin', 'colaborador'];

  if (!nome || !email) {
    return res.status(400).json({ erro: 'Campos obrigatórios: nome, email' });
  }
  if (!allowedRoles.includes(papel)) {
    return res.status(400).json({ erro: 'Papel inválido. Use admin ou colaborador.' });
  }

  try {
    const membership = await membershipForUser(req.user.id, escritorioId);
    if (!membership || !canManageMembers(membership.papel)) {
      return res.status(403).json({ erro: 'Sem permissão para gerenciar colaboradores.' });
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const existingUser = await client.query('SELECT id, nome, email FROM usuarios WHERE email = $1', [
        email,
      ]);

      let user = existingUser.rows[0] || null;
      if (!user) {
        if (!senha || senha.length < 6) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            erro: 'Senha com no mínimo 6 caracteres é obrigatória para novo usuário.',
          });
        }
        const senhaHash = await bcrypt.hash(senha, 10);
        const createdUser = await client.query(
          `INSERT INTO usuarios (nome, email, senha_hash)
           VALUES ($1, $2, $3)
           RETURNING id, nome, email`,
          [nome, email, senhaHash]
        );
        user = createdUser.rows[0];
      }

      await client.query(
        `INSERT INTO membros_escritorio (escritorio_id, usuario_id, papel)
         VALUES ($1, $2, $3)
         ON CONFLICT (escritorio_id, usuario_id)
         DO UPDATE SET papel = EXCLUDED.papel`,
        [escritorioId, user.id, papel]
      );

      await client.query('COMMIT');
      return res.status(201).json({
        usuario: user,
        escritorio_id: escritorioId,
        papel,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      return res.status(500).json({ erro: 'Erro ao adicionar colaborador.' });
    } finally {
      client.release();
    }
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao adicionar colaborador.' });
  }
}

module.exports = {
  listar,
  criar,
  listarMembros,
  adicionarColaborador,
};
