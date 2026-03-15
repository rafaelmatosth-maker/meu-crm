const fs = require('fs');
const path = require('path');
const db = require('../db');
const { chatUploadDir } = require('../utils/chatUpload');

const CHAT_GERAL_TITULO = 'Geral';

function getEscritorioId(req) {
  return Number(req.escritorio && req.escritorio.id);
}

function getUsuarioId(req) {
  return Number(req.user && req.user.id);
}

function parseInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeLimit(value, defaultValue = 40, max = 100) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return defaultValue;
  return Math.min(parsed, max);
}

function cleanupUploadedFiles(files = []) {
  files.forEach((file) => {
    if (!file || !file.filename) return;
    fs.unlink(path.join(chatUploadDir, file.filename), () => {});
  });
}

async function ensureConversaGeral(escritorioId) {
  await db.query(
    `INSERT INTO chat_conversas (escritorio_id, tipo, titulo)
     VALUES ($1, 'grupo', $2)
     ON CONFLICT DO NOTHING`,
    [escritorioId, CHAT_GERAL_TITULO]
  );

  const conversaResp = await db.query(
    `SELECT id
     FROM chat_conversas
     WHERE escritorio_id = $1
       AND tipo = 'grupo'
       AND titulo = $2
     ORDER BY id ASC
     LIMIT 1`,
    [escritorioId, CHAT_GERAL_TITULO]
  );

  if (!conversaResp.rows.length) return null;
  const conversaId = Number(conversaResp.rows[0].id);

  await db.query(
    `INSERT INTO chat_participantes (conversa_id, usuario_id)
     SELECT $1, me.usuario_id
     FROM membros_escritorio me
     WHERE me.escritorio_id = $2
     ON CONFLICT (conversa_id, usuario_id) DO NOTHING`,
    [conversaId, escritorioId]
  );

  return conversaId;
}

async function buscarConversas(escritorioId, usuarioId, conversaId = null) {
  const params = [escritorioId, usuarioId];
  let whereExtra = '';
  if (conversaId) {
    params.push(conversaId);
    whereExtra = ' AND c.id = $3';
  }

  const result = await db.query(
    `SELECT
       c.id,
       c.tipo,
       c.titulo,
       c.created_at,
       c.updated_at,
       cp.ultimo_lido_em,
       outro_usuario.id AS outro_usuario_id,
       outro_usuario.nome AS outro_usuario_nome,
       ultima_mensagem.id AS ultima_mensagem_id,
       ultima_mensagem.texto AS ultima_mensagem_texto,
       ultima_mensagem.created_at AS ultima_mensagem_em,
       ultima_mensagem.autor_id AS ultima_mensagem_autor_id,
       ultima_mensagem.autor_nome AS ultima_mensagem_autor_nome,
       COALESCE(nao_lidas.total, 0)::int AS nao_lidas
     FROM chat_conversas c
     JOIN chat_participantes cp
       ON cp.conversa_id = c.id
      AND cp.usuario_id = $2
     LEFT JOIN LATERAL (
       SELECT u.id, u.nome
       FROM chat_participantes cp2
       JOIN usuarios u ON u.id = cp2.usuario_id
       WHERE cp2.conversa_id = c.id
         AND cp2.usuario_id <> $2
       ORDER BY u.nome ASC
       LIMIT 1
     ) AS outro_usuario ON c.tipo = 'direta'
     LEFT JOIN LATERAL (
       SELECT
         m.id,
         m.texto,
         m.created_at,
         m.autor_id,
         COALESCE(u.nome, 'Usuario removido') AS autor_nome
       FROM chat_mensagens m
       LEFT JOIN usuarios u ON u.id = m.autor_id
       WHERE m.conversa_id = c.id
         AND m.deleted_at IS NULL
       ORDER BY m.id DESC
       LIMIT 1
     ) AS ultima_mensagem ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS total
       FROM chat_mensagens m2
       WHERE m2.conversa_id = c.id
         AND m2.deleted_at IS NULL
         AND m2.autor_id <> $2
         AND (cp.ultimo_lido_em IS NULL OR m2.created_at > cp.ultimo_lido_em)
     ) AS nao_lidas ON true
     WHERE c.escritorio_id = $1${whereExtra}
     ORDER BY COALESCE(ultima_mensagem.created_at, c.updated_at, c.created_at) DESC, c.id DESC`,
    params
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    tipo: row.tipo,
    titulo: row.titulo,
    nome_exibicao: row.tipo === 'direta' ? row.outro_usuario_nome || 'Conversa direta' : row.titulo || 'Grupo',
    outro_usuario_id: row.outro_usuario_id ? Number(row.outro_usuario_id) : null,
    outro_usuario_nome: row.outro_usuario_nome || null,
    ultima_mensagem_id: row.ultima_mensagem_id ? Number(row.ultima_mensagem_id) : null,
    ultima_mensagem_texto: row.ultima_mensagem_texto || null,
    ultima_mensagem_em: row.ultima_mensagem_em || null,
    ultima_mensagem_autor_id: row.ultima_mensagem_autor_id ? Number(row.ultima_mensagem_autor_id) : null,
    ultima_mensagem_autor_nome: row.ultima_mensagem_autor_nome || null,
    nao_lidas: Number(row.nao_lidas || 0),
    ultimo_lido_em: row.ultimo_lido_em || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

async function validarParticipacao(conversaId, escritorioId, usuarioId) {
  const result = await db.query(
    `SELECT c.id, c.tipo, c.titulo
     FROM chat_conversas c
     JOIN chat_participantes cp
       ON cp.conversa_id = c.id
      AND cp.usuario_id = $3
     WHERE c.id = $1
       AND c.escritorio_id = $2
     LIMIT 1`,
    [conversaId, escritorioId, usuarioId]
  );

  return result.rows[0] || null;
}

async function listarConversas(req, res) {
  try {
    const escritorioId = getEscritorioId(req);
    const usuarioId = getUsuarioId(req);

    await ensureConversaGeral(escritorioId);
    const conversas = await buscarConversas(escritorioId, usuarioId);

    const totalNaoLidas = conversas.reduce((acc, item) => acc + Number(item.nao_lidas || 0), 0);
    return res.json({ data: conversas, total_nao_lidas: totalNaoLidas });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao listar conversas.' });
  }
}

async function listarColaboradores(req, res) {
  try {
    const escritorioId = getEscritorioId(req);
    const usuarioId = getUsuarioId(req);

    const result = await db.query(
      `SELECT u.id, u.nome, u.email, me.papel
       FROM membros_escritorio me
       JOIN usuarios u ON u.id = me.usuario_id
       WHERE me.escritorio_id = $1
         AND u.id <> $2
       ORDER BY u.nome ASC`,
      [escritorioId, usuarioId]
    );

    const data = result.rows.map((row) => ({
      id: Number(row.id),
      nome: row.nome,
      email: row.email,
      papel: row.papel,
    }));

    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao listar colaboradores do chat.' });
  }
}

async function criarConversaDireta(req, res) {
  const escritorioId = getEscritorioId(req);
  const usuarioId = getUsuarioId(req);
  const outroUsuarioId = parseInteger(req.body && req.body.usuario_id);

  if (!outroUsuarioId) {
    return res.status(400).json({ erro: 'Informe um usuario_id valido.' });
  }

  if (outroUsuarioId === usuarioId) {
    return res.status(400).json({ erro: 'Nao e possivel criar conversa com o proprio usuario.' });
  }

  try {
    const membroResp = await db.query(
      `SELECT 1
       FROM membros_escritorio
       WHERE escritorio_id = $1
         AND usuario_id = $2
       LIMIT 1`,
      [escritorioId, outroUsuarioId]
    );
    if (!membroResp.rows.length) {
      return res.status(400).json({ erro: 'Colaborador nao pertence ao escritorio atual.' });
    }

    const existenteResp = await db.query(
      `SELECT c.id
       FROM chat_conversas c
       JOIN chat_participantes cp ON cp.conversa_id = c.id
       WHERE c.escritorio_id = $1
         AND c.tipo = 'direta'
       GROUP BY c.id
       HAVING COUNT(*) = 2
          AND COUNT(*) FILTER (WHERE cp.usuario_id IN ($2, $3)) = 2
       LIMIT 1`,
      [escritorioId, usuarioId, outroUsuarioId]
    );

    let conversaId = existenteResp.rows.length ? Number(existenteResp.rows[0].id) : null;
    if (!conversaId) {
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        const createResp = await client.query(
          `INSERT INTO chat_conversas (escritorio_id, tipo, criada_por_usuario_id)
           VALUES ($1, 'direta', $2)
           RETURNING id`,
          [escritorioId, usuarioId]
        );
        conversaId = Number(createResp.rows[0].id);

        await client.query(
          `INSERT INTO chat_participantes (conversa_id, usuario_id)
           VALUES ($1, $2), ($1, $3)
           ON CONFLICT (conversa_id, usuario_id) DO NOTHING`,
          [conversaId, usuarioId, outroUsuarioId]
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    const conversa = (await buscarConversas(escritorioId, usuarioId, conversaId))[0];
    return res.status(201).json({ conversa });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao criar conversa direta.' });
  }
}

async function listarMensagens(req, res) {
  const escritorioId = getEscritorioId(req);
  const usuarioId = getUsuarioId(req);
  const conversaId = parseInteger(req.params.id);

  if (!conversaId) {
    return res.status(400).json({ erro: 'Conversa invalida.' });
  }

  try {
    const conversa = await validarParticipacao(conversaId, escritorioId, usuarioId);
    if (!conversa) {
      return res.status(404).json({ erro: 'Conversa nao encontrada.' });
    }

    const limit = normalizeLimit(req.query.limit, 40, 100);
    const beforeId = parseInteger(req.query.before_id);

    const result = await db.query(
      `WITH mensagens_base AS (
         SELECT
           m.id,
           m.conversa_id,
           m.autor_id,
           m.texto,
           m.created_at,
           m.updated_at,
           COALESCE(u.nome, 'Usuario removido') AS autor_nome
         FROM chat_mensagens m
         LEFT JOIN usuarios u ON u.id = m.autor_id
         WHERE m.conversa_id = $1
           AND m.deleted_at IS NULL
           AND ($2::int IS NULL OR m.id < $2)
         ORDER BY m.id DESC
         LIMIT $3
       )
       SELECT
         mb.id,
         mb.conversa_id,
         mb.autor_id,
         mb.autor_nome,
         mb.texto,
         mb.created_at,
         mb.updated_at,
         COALESCE(
           json_agg(
             json_build_object(
               'id', a.id,
               'nome_original', a.nome_original,
               'mime_type', a.mime_type,
               'tamanho', a.tamanho,
               'created_at', a.created_at
             )
             ORDER BY a.id ASC
           ) FILTER (WHERE a.id IS NOT NULL),
           '[]'::json
         ) AS anexos
       FROM mensagens_base mb
       LEFT JOIN chat_anexos a ON a.mensagem_id = mb.id
       GROUP BY
         mb.id,
         mb.conversa_id,
         mb.autor_id,
         mb.autor_nome,
         mb.texto,
         mb.created_at,
         mb.updated_at
       ORDER BY mb.id ASC`,
      [conversaId, beforeId, limit]
    );

    await db.query(
      `UPDATE chat_participantes
       SET ultimo_lido_em = NOW()
       WHERE conversa_id = $1
         AND usuario_id = $2`,
      [conversaId, usuarioId]
    );

    return res.json({
      conversa: {
        id: Number(conversa.id),
        tipo: conversa.tipo,
        titulo: conversa.titulo,
      },
      data: result.rows.map((row) => ({
        id: Number(row.id),
        conversa_id: Number(row.conversa_id),
        autor_id: row.autor_id ? Number(row.autor_id) : null,
        autor_nome: row.autor_nome,
        texto: row.texto,
        created_at: row.created_at,
        updated_at: row.updated_at,
        anexos: Array.isArray(row.anexos) ? row.anexos : [],
      })),
      limit,
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao listar mensagens.' });
  }
}

async function enviarMensagem(req, res) {
  const escritorioId = getEscritorioId(req);
  const usuarioId = getUsuarioId(req);
  const conversaId = parseInteger(req.params.id);
  const arquivos = Array.isArray(req.files) ? req.files : [];
  const texto = String((req.body && req.body.texto) || '').trim();

  if (!conversaId) {
    cleanupUploadedFiles(arquivos);
    return res.status(400).json({ erro: 'Conversa invalida.' });
  }

  if (!texto && !arquivos.length) {
    cleanupUploadedFiles(arquivos);
    return res.status(400).json({ erro: 'Envie uma mensagem de texto ou ao menos um arquivo.' });
  }

  try {
    const conversa = await validarParticipacao(conversaId, escritorioId, usuarioId);
    if (!conversa) {
      cleanupUploadedFiles(arquivos);
      return res.status(404).json({ erro: 'Conversa nao encontrada.' });
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const mensagemResp = await client.query(
        `INSERT INTO chat_mensagens (conversa_id, autor_id, texto)
         VALUES ($1, $2, $3)
         RETURNING id, conversa_id, autor_id, texto, created_at, updated_at`,
        [conversaId, usuarioId, texto || null]
      );
      const mensagem = mensagemResp.rows[0];

      const anexos = [];
      for (const arquivo of arquivos) {
        const anexoResp = await client.query(
          `INSERT INTO chat_anexos (mensagem_id, nome_original, caminho, tamanho, mime_type)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, nome_original, mime_type, tamanho, created_at`,
          [mensagem.id, arquivo.originalname, arquivo.filename, arquivo.size, arquivo.mimetype]
        );
        anexos.push(anexoResp.rows[0]);
      }

      await client.query(
        `UPDATE chat_conversas
         SET updated_at = NOW()
         WHERE id = $1`,
        [conversaId]
      );

      await client.query(
        `UPDATE chat_participantes
         SET ultimo_lido_em = NOW()
         WHERE conversa_id = $1
           AND usuario_id = $2`,
        [conversaId, usuarioId]
      );

      await client.query('COMMIT');

      return res.status(201).json({
        mensagem: {
          id: Number(mensagem.id),
          conversa_id: Number(mensagem.conversa_id),
          autor_id: Number(mensagem.autor_id),
          autor_nome: req.user && req.user.nome ? req.user.nome : 'Voce',
          texto: mensagem.texto,
          created_at: mensagem.created_at,
          updated_at: mensagem.updated_at,
          anexos: anexos.map((anexo) => ({
            id: Number(anexo.id),
            nome_original: anexo.nome_original,
            mime_type: anexo.mime_type,
            tamanho: Number(anexo.tamanho),
            created_at: anexo.created_at,
          })),
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      cleanupUploadedFiles(arquivos);
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao enviar mensagem.' });
  }
}

async function marcarComoLida(req, res) {
  const escritorioId = getEscritorioId(req);
  const usuarioId = getUsuarioId(req);
  const conversaId = parseInteger(req.params.id);

  if (!conversaId) {
    return res.status(400).json({ erro: 'Conversa invalida.' });
  }

  try {
    const conversa = await validarParticipacao(conversaId, escritorioId, usuarioId);
    if (!conversa) {
      return res.status(404).json({ erro: 'Conversa nao encontrada.' });
    }

    await db.query(
      `UPDATE chat_participantes
       SET ultimo_lido_em = NOW()
       WHERE conversa_id = $1
         AND usuario_id = $2`,
      [conversaId, usuarioId]
    );

    return res.json({ mensagem: 'Conversa marcada como lida.' });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao marcar conversa como lida.' });
  }
}

async function baixarAnexo(req, res) {
  const escritorioId = getEscritorioId(req);
  const usuarioId = getUsuarioId(req);
  const anexoId = parseInteger(req.params.id);

  if (!anexoId) {
    return res.status(400).json({ erro: 'Anexo invalido.' });
  }

  try {
    const result = await db.query(
      `SELECT a.nome_original, a.caminho
       FROM chat_anexos a
       JOIN chat_mensagens m ON m.id = a.mensagem_id
       JOIN chat_conversas c ON c.id = m.conversa_id
       JOIN chat_participantes cp
         ON cp.conversa_id = c.id
        AND cp.usuario_id = $3
       WHERE a.id = $1
         AND c.escritorio_id = $2
       LIMIT 1`,
      [anexoId, escritorioId, usuarioId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ erro: 'Anexo nao encontrado.' });
    }

    const anexo = result.rows[0];
    return res.download(path.join(chatUploadDir, anexo.caminho), anexo.nome_original);
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao baixar anexo.' });
  }
}

module.exports = {
  listarConversas,
  listarColaboradores,
  criarConversaDireta,
  listarMensagens,
  enviarMensagem,
  marcarComoLida,
  baixarAnexo,
};
