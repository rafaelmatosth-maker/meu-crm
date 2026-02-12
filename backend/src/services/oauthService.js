const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

function normalizeSlug(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function randomSenhaTemporaria() {
  return `oauth-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function gerarToken(user, escritorioAtual) {
  return jwt.sign(
    {
      id: user.id,
      nome: user.nome,
      email: user.email,
      usuario: user.usuario || null,
      escritorio_id: escritorioAtual.id,
      papel: escritorioAtual.papel,
    },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
}

async function listarEscritoriosDoUsuario(usuarioId) {
  const memberships = await db.query(
    `SELECT me.escritorio_id AS id, e.nome, me.papel
     FROM membros_escritorio me
     JOIN escritorios e ON e.id = me.escritorio_id
     WHERE me.usuario_id = $1
     ORDER BY CASE me.papel WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END, me.escritorio_id ASC`,
    [usuarioId]
  );

  return memberships.rows.map((row) => ({
    id: Number(row.id),
    nome: row.nome,
    papel: row.papel,
  }));
}

function escolherEscritorio(escritorios, requestedId) {
  if (!escritorios.length) return null;
  if (requestedId) {
    const match = escritorios.find((item) => item.id === requestedId);
    if (match) return match;
  }
  return escritorios[0];
}

async function criarEscritorioComSlug(client, nomeEscritorio) {
  const base = normalizeSlug(nomeEscritorio) || 'escritorio';
  for (let i = 0; i < 6; i += 1) {
    const suffix = i === 0 ? '' : `-${Math.floor(Math.random() * 9000) + 1000}`;
    const slug = `${base}${suffix}`.slice(0, 70);
    try {
      const created = await client.query(
        'INSERT INTO escritorios (nome, slug) VALUES ($1, $2) RETURNING id, nome, slug',
        [nomeEscritorio, slug]
      );
      return created.rows[0];
    } catch (err) {
      if (err.code !== '23505') throw err;
    }
  }
  throw new Error('Falha ao criar escritório para novo usuário OAuth.');
}

async function ensureOfficeForUser(client, userId, fallbackOfficeName) {
  const existing = await client.query(
    `SELECT me.escritorio_id AS id, e.nome, me.papel
     FROM membros_escritorio me
     JOIN escritorios e ON e.id = me.escritorio_id
     WHERE me.usuario_id = $1
     ORDER BY me.escritorio_id ASC
     LIMIT 1`,
    [userId]
  );

  if (existing.rows.length) {
    return {
      id: Number(existing.rows[0].id),
      nome: existing.rows[0].nome,
      papel: existing.rows[0].papel,
    };
  }

  const office = await criarEscritorioComSlug(client, fallbackOfficeName);

  await client.query(
    `INSERT INTO membros_escritorio (escritorio_id, usuario_id, papel)
     VALUES ($1, $2, 'owner')
     ON CONFLICT (escritorio_id, usuario_id) DO NOTHING`,
    [office.id, userId]
  );

  await client.query(
    `INSERT INTO escritorio_config (escritorio_id, nome_exibicao, djen_uf_padrao)
     VALUES ($1, $2, 'BA')
     ON CONFLICT (escritorio_id) DO NOTHING`,
    [office.id, office.nome]
  );

  return { id: Number(office.id), nome: office.nome, papel: 'owner' };
}

async function loginOrCreateFromOAuth({ provider, providerId, email, nome, escritorioNome }) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const providerLower = String(provider || '').toLowerCase();
    const providerIdSafe = String(providerId || '').trim();
    const emailLower = String(email || '').trim().toLowerCase();
    const nomeSafe = String(nome || '').trim() || 'Usuário';

    let user = null;

    if (providerIdSafe) {
      const byProvider = await client.query(
        `SELECT id, nome, email, usuario, oauth_provider, oauth_sub
         FROM usuarios
         WHERE oauth_provider = $1 AND oauth_sub = $2
         LIMIT 1`,
        [providerLower, providerIdSafe]
      );
      if (byProvider.rows.length) {
        user = byProvider.rows[0];
      }
    }

    if (!user && emailLower) {
      const byEmail = await client.query(
        `SELECT id, nome, email, usuario, oauth_provider, oauth_sub
         FROM usuarios
         WHERE LOWER(email) = LOWER($1)
         LIMIT 1`,
        [emailLower]
      );
      if (byEmail.rows.length) {
        user = byEmail.rows[0];
      }
    }

    if (!user) {
      const senhaHash = await bcrypt.hash(randomSenhaTemporaria(), 10);
      const createdUser = await client.query(
        `INSERT INTO usuarios (nome, email, senha_hash, oauth_provider, oauth_sub)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, nome, email, usuario, oauth_provider, oauth_sub`,
        [nomeSafe, emailLower, senhaHash, providerLower || null, providerIdSafe || null]
      );
      user = createdUser.rows[0];
    } else if (providerLower && providerIdSafe && (!user.oauth_provider || !user.oauth_sub)) {
      const updated = await client.query(
        `UPDATE usuarios
         SET oauth_provider = COALESCE(oauth_provider, $1),
             oauth_sub = COALESCE(oauth_sub, $2)
         WHERE id = $3
         RETURNING id, nome, email, usuario, oauth_provider, oauth_sub`,
        [providerLower, providerIdSafe, user.id]
      );
      user = updated.rows[0];
    }

    await ensureOfficeForUser(client, user.id, escritorioNome || `Escritorio de ${nomeSafe}`);

    await client.query('COMMIT');

    const escritorios = await listarEscritoriosDoUsuario(user.id);
    const escritorioAtual = escolherEscritorio(escritorios);
    const token = gerarToken(user, escritorioAtual);

    return {
      token,
      usuario: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        usuario: user.usuario || null,
      },
      escritorios,
      escritorio_atual: escritorioAtual,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  loginOrCreateFromOAuth,
};
