const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireFields } = require('../utils/validators');
const { sendVerificationCodeEmail } = require('../services/emailService');

const CADASTRO_EXPIRACAO_MINUTOS = Number(process.env.CADASTRO_CODE_TTL_MINUTES || 10);
const CADASTRO_MAX_TENTATIVAS = Number(process.env.CADASTRO_MAX_ATTEMPTS || 5);

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

function gerarCodigoVerificacao() {
  return String(crypto.randomInt(100000, 1000000));
}

function gerarHashCodigo(email, codigo) {
  return crypto
    .createHash('sha256')
    .update(`${String(email || '').toLowerCase()}::${String(codigo || '')}`)
    .digest('hex');
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
    {
      expiresIn: '8h',
    }
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

async function garantirEscritorioPadrao(user) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT me.escritorio_id AS id, e.nome, me.papel
       FROM membros_escritorio me
       JOIN escritorios e ON e.id = me.escritorio_id
       WHERE me.usuario_id = $1
       ORDER BY me.escritorio_id ASC
       LIMIT 1`,
      [user.id]
    );

    if (existing.rows.length) {
      await client.query('COMMIT');
      return {
        id: Number(existing.rows[0].id),
        nome: existing.rows[0].nome,
        papel: existing.rows[0].papel,
      };
    }

    const base = normalizeSlug(user.nome || 'escritorio') || 'escritorio';
    const slug = `${base}-${user.id}`;
    const createdOffice = await client.query(
      'INSERT INTO escritorios (nome, slug) VALUES ($1, $2) RETURNING id, nome',
      [`Escritorio de ${user.nome || 'Usuario'}`, slug]
    );

    const escritorio = createdOffice.rows[0];

    await client.query(
      `INSERT INTO membros_escritorio (escritorio_id, usuario_id, papel)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (escritorio_id, usuario_id) DO NOTHING`,
      [escritorio.id, user.id]
    );

    await client.query('COMMIT');

    return {
      id: Number(escritorio.id),
      nome: escritorio.nome,
      papel: 'owner',
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function escolherEscritorio(escritorios, requestedId) {
  if (!escritorios.length) {
    return null;
  }

  if (requestedId) {
    const requested = escritorios.find((item) => item.id === requestedId);
    if (requested) {
      return requested;
    }
  }

  return escritorios[0];
}

async function criarEscritorioComSlug(client, nomeEscritorio) {
  const base = normalizeSlug(nomeEscritorio) || 'escritorio';
  for (let i = 0; i < 6; i += 1) {
    const suffix = i === 0 ? '' : `-${crypto.randomInt(1000, 9999)}`;
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
  throw new Error('Não foi possível gerar slug único para escritório.');
}

async function registerStart(req, res) {
  const nomeEscritorio = String(req.body.nome_escritorio || req.body.escritorio || '').trim();
  const nome = String(req.body.nome || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const senha = String(req.body.senha || '');

  const missing = requireFields(
    { nome_escritorio: nomeEscritorio, nome, email, senha },
    ['nome_escritorio', 'nome', 'email', 'senha']
  );
  if (missing.length) {
    return res.status(400).json({ erro: `Campos obrigatórios: ${missing.join(', ')}` });
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ erro: 'E-mail inválido.' });
  }

  if (senha.length < 8) {
    return res.status(400).json({ erro: 'Senha deve ter no mínimo 8 caracteres.' });
  }

  try {
    const existing = await db.query('SELECT id FROM usuarios WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
    if (existing.rows.length) {
      return res.status(409).json({ erro: 'Este e-mail já está cadastrado.' });
    }

    const codigo = gerarCodigoVerificacao();
    const codigoHash = gerarHashCodigo(email, codigo);
    const senhaHash = await bcrypt.hash(senha, 10);

    await db.query(
      `INSERT INTO cadastro_verificacoes (
         email,
         codigo_hash,
         payload,
         expires_at,
         tentativas,
         consumed_at
       )
       VALUES (
         $1,
         $2,
         $3::jsonb,
         NOW() + (($4::text || ' minutes')::interval),
         0,
         NULL
       )`,
      [
        email,
        codigoHash,
        JSON.stringify({ nomeEscritorio, nome, senhaHash }),
        CADASTRO_EXPIRACAO_MINUTOS,
      ]
    );

    await sendVerificationCodeEmail({
      to: email,
      codigo,
      nomeEscritorio,
    });

    return res.status(201).json({
      mensagem: 'Código de verificação enviado para seu e-mail.',
      email,
      expira_em_minutos: CADASTRO_EXPIRACAO_MINUTOS,
      ...(process.env.NODE_ENV !== 'production' && !process.env.EMAIL_PROVIDER
        ? { codigo_debug: codigo }
        : {}),
    });
  } catch (err) {
    console.error('Erro em registerStart:', err.message);
    return res.status(500).json({ erro: 'Erro ao iniciar cadastro.' });
  }
}

async function registerVerify(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();
  const codigo = String(req.body.codigo || '').trim();

  const missing = requireFields({ email, codigo }, ['email', 'codigo']);
  if (missing.length) {
    return res.status(400).json({ erro: `Campos obrigatórios: ${missing.join(', ')}` });
  }

  try {
    const verificationResult = await db.query(
      `SELECT id, email, codigo_hash, payload, tentativas, expires_at
       FROM cadastro_verificacoes
       WHERE LOWER(email) = LOWER($1)
         AND consumed_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [email]
    );

    if (!verificationResult.rows.length) {
      return res.status(400).json({ erro: 'Código inválido ou expirado.' });
    }

    const verification = verificationResult.rows[0];
    if (new Date(verification.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ erro: 'Código expirado. Solicite um novo cadastro.' });
    }

    if (Number(verification.tentativas || 0) >= CADASTRO_MAX_TENTATIVAS) {
      return res.status(400).json({ erro: 'Limite de tentativas excedido. Solicite novo código.' });
    }

    const expectedHash = gerarHashCodigo(email, codigo);
    const valid = crypto.timingSafeEqual(
      Buffer.from(expectedHash),
      Buffer.from(String(verification.codigo_hash || ''))
    );

    if (!valid) {
      await db.query(
        'UPDATE cadastro_verificacoes SET tentativas = tentativas + 1 WHERE id = $1',
        [verification.id]
      );
      return res.status(400).json({ erro: 'Código inválido.' });
    }

    const payload = verification.payload || {};
    const nomeEscritorio = String(payload.nomeEscritorio || '').trim();
    const nome = String(payload.nome || '').trim();
    const senhaHash = String(payload.senhaHash || '');

    if (!nomeEscritorio || !nome || !senhaHash) {
      return res.status(400).json({ erro: 'Dados de cadastro inválidos. Inicie novamente.' });
    }

    const client = await db.pool.connect();
    let user;
    let escritorio;

    try {
      await client.query('BEGIN');

      const userExists = await client.query('SELECT id FROM usuarios WHERE LOWER(email) = LOWER($1) LIMIT 1', [
        email,
      ]);
      if (userExists.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ erro: 'Este e-mail já está cadastrado.' });
      }

      const createdUser = await client.query(
        `INSERT INTO usuarios (nome, email, senha_hash)
         VALUES ($1, $2, $3)
         RETURNING id, nome, email, usuario`,
        [nome, email, senhaHash]
      );
      user = createdUser.rows[0];

      escritorio = await criarEscritorioComSlug(client, nomeEscritorio);

      await client.query(
        `INSERT INTO membros_escritorio (escritorio_id, usuario_id, papel)
         VALUES ($1, $2, 'owner')`,
        [escritorio.id, user.id]
      );

      await client.query(
        `INSERT INTO escritorio_config (escritorio_id, nome_exibicao, djen_uf_padrao)
         VALUES ($1, $2, 'BA')
         ON CONFLICT (escritorio_id) DO NOTHING`,
        [escritorio.id, nomeEscritorio]
      );

      await client.query('UPDATE cadastro_verificacoes SET consumed_at = NOW() WHERE id = $1', [verification.id]);

      await client.query('COMMIT');
    } catch (err) {
      console.error(
        'Erro transacional registerVerify:',
        err.code || 'sem_codigo',
        err.message,
        err.detail || ''
      );
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('Erro no rollback registerVerify:', rollbackErr.message);
      }
      throw err;
    } finally {
      client.release();
    }

    const escritorios = await listarEscritoriosDoUsuario(user.id);
    const escritorioAtual = escolherEscritorio(escritorios, Number(escritorio.id));
    const token = gerarToken(user, escritorioAtual);

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
    });
    res.cookie('token_js', token, {
      httpOnly: false,
      sameSite: 'lax',
    });

    return res.status(201).json({
      mensagem: 'Cadastro concluído com sucesso.',
      token,
      usuario: { id: user.id, nome: user.nome, email: user.email, usuario: user.usuario || null },
      escritorios,
      escritorio_atual: escritorioAtual,
    });
  } catch (err) {
    console.error('Erro em registerVerify:', err.message);
    return res.status(500).json({ erro: 'Erro ao validar código de cadastro.' });
  }
}

async function login(req, res) {
  const identificador = req.body.email || req.body.usuario || '';
  const senha = req.body.senha || req.body.password || '';
  const requestedEscritorioId = Number(
    req.headers['x-escritorio-id'] || req.body.escritorio_id || req.query.escritorio_id || 0
  );
  const missing = requireFields({ identificador, senha }, ['identificador', 'senha']);
  const accept = req.headers.accept || '';
  const isForm = (req.headers['content-type'] || '').includes('application/x-www-form-urlencoded');
  if (missing.length) {
    if (isForm && accept.includes('text/html')) {
      return res.redirect('/?erro=campos');
    }
    return res.status(400).json({ erro: 'Campos obrigatórios: usuário/e-mail e senha.' });
  }

  try {
    const result = await db.query(
      `SELECT id, nome, email, usuario, senha_hash
       FROM usuarios
       WHERE LOWER(email) = LOWER($1)
          OR (usuario IS NOT NULL AND LOWER(usuario) = LOWER($1))
       LIMIT 1`,
      [identificador]
    );
    if (!result.rows.length) {
      if (isForm && accept.includes('text/html')) {
        return res.redirect('/?erro=credenciais');
      }
      return res.status(401).json({ erro: 'Credenciais inválidas.' });
    }

    const user = result.rows[0];
    const ok = await bcrypt.compare(senha, user.senha_hash);
    if (!ok) {
      if (isForm && accept.includes('text/html')) {
        return res.redirect('/?erro=credenciais');
      }
      return res.status(401).json({ erro: 'Credenciais inválidas.' });
    }

    await garantirEscritorioPadrao(user);
    const escritorios = await listarEscritoriosDoUsuario(user.id);
    const escritorioAtual = escolherEscritorio(escritorios, requestedEscritorioId);

    if (!escritorioAtual) {
      return res.status(403).json({ erro: 'Usuário sem vínculo com escritório.' });
    }

    const token = gerarToken(user, escritorioAtual);

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
    });
    res.cookie('token_js', token, {
      httpOnly: false,
      sameSite: 'lax',
    });

    if (isForm && accept.includes('text/html')) {
      return res.redirect(`/dashboard.html?token=${encodeURIComponent(token)}`);
    }

    return res.json({
      token,
      usuario: { id: user.id, nome: user.nome, email: user.email, usuario: user.usuario || null },
      escritorios,
      escritorio_atual: escritorioAtual,
    });
  } catch (err) {
    if (isForm && accept.includes('text/html')) {
      return res.redirect('/?erro=servidor');
    }
    return res.status(500).json({ erro: 'Erro ao realizar login.' });
  }
}

function logout(req, res) {
  res.clearCookie('token');
  res.clearCookie('token_js');
  return res.json({ mensagem: 'Logout realizado.' });
}

async function me(req, res) {
  try {
    const escritorios = await listarEscritoriosDoUsuario(req.user.id);
    return res.json({
      usuario: {
        ...req.user,
        escritorio_id: req.escritorio ? req.escritorio.id : req.user.escritorio_id,
        papel: req.escritorio ? req.escritorio.papel : req.user.papel,
      },
      escritorios,
      escritorio_atual: req.escritorio || null,
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao carregar usuário.' });
  }
}

module.exports = {
  login,
  logout,
  me,
  registerStart,
  registerVerify,
};
