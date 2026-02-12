const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { procedimentoUploadDir } = require('../utils/procedimentoUpload');

function getEscritorioId(req) {
  return Number(req.escritorio && req.escritorio.id);
}

function toBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'sim', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'nao', 'não', 'no'].includes(normalized)) return false;
  return fallback;
}

function normalizeUsername(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9._-]/g, '');
  if (!normalized) return null;
  return normalized;
}

function normalizeEmail(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || null;
}

function normalizeUf(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 2);
  return normalized || null;
}

function normalizeOabNumero(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');
  return normalized || null;
}

function deleteFileSafe(filePath) {
  if (!filePath) return;
  fs.unlink(filePath, () => {});
}

function buildProcedimentoPayload(row) {
  return {
    ...row,
    anexo_url: row.anexo_caminho ? `/ajustes/procedimentos/${row.id}/anexo` : null,
  };
}

async function listarColaboradoresBase(escritorioId) {
  const result = await db.query(
    `SELECT
        u.id,
        u.nome,
        u.email,
        u.usuario,
        me.papel,
        me.created_at
     FROM membros_escritorio me
     JOIN usuarios u ON u.id = me.usuario_id
     WHERE me.escritorio_id = $1
     ORDER BY CASE me.papel WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END, LOWER(u.nome) ASC`,
    [escritorioId]
  );
  return result.rows;
}

async function listarAreasBase(escritorioId) {
  const result = await db.query(
    `SELECT id, nome, ordem, ativo, created_at
     FROM escritorio_areas_atuacao
     WHERE escritorio_id = $1
     ORDER BY ordem ASC, LOWER(nome) ASC`,
    [escritorioId]
  );
  return result.rows;
}

async function listarOabsBase(escritorioId) {
  const result = await db.query(
    `SELECT id, numero, uf, etiqueta, ativo, created_at
     FROM escritorio_oabs_djen
     WHERE escritorio_id = $1
     ORDER BY ativo DESC, uf ASC, numero ASC`,
    [escritorioId]
  );
  return result.rows;
}

async function listarProcedimentosBase(escritorioId) {
  const result = await db.query(
    `SELECT
        id,
        titulo,
        descricao,
        anexo_nome_original,
        anexo_caminho,
        anexo_mime_type,
        anexo_tamanho,
        ordem,
        ativo,
        created_at,
        updated_at
     FROM escritorio_procedimentos
     WHERE escritorio_id = $1
     ORDER BY ordem ASC, created_at DESC`,
    [escritorioId]
  );
  return result.rows.map(buildProcedimentoPayload);
}

async function obterConfigBase(escritorioId, escritorioNome) {
  const result = await db.query(
    `SELECT escritorio_id, nome_exibicao, djen_uf_padrao, created_at, updated_at
     FROM escritorio_config
     WHERE escritorio_id = $1`,
    [escritorioId]
  );
  if (result.rows.length) return result.rows[0];
  return {
    escritorio_id: escritorioId,
    nome_exibicao: escritorioNome || '',
    djen_uf_padrao: 'BA',
    created_at: null,
    updated_at: null,
  };
}

function canManage(req) {
  return req.escritorio && ['owner', 'admin'].includes(req.escritorio.papel);
}

function validatePapel(papel) {
  return ['owner', 'admin', 'colaborador'].includes(String(papel || '').trim());
}

async function resumo(req, res) {
  try {
    const escritorioId = getEscritorioId(req);
    const [colaboradores, areas, oabs, procedimentos, config] = await Promise.all([
      listarColaboradoresBase(escritorioId),
      listarAreasBase(escritorioId),
      listarOabsBase(escritorioId),
      listarProcedimentosBase(escritorioId),
      obterConfigBase(escritorioId, req.escritorio?.nome || ''),
    ]);

    return res.json({
      escritorio: req.escritorio,
      config,
      colaboradores,
      areas,
      oabs,
      procedimentos,
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao carregar ajustes.' });
  }
}

async function listarColaboradores(req, res) {
  try {
    const escritorioId = getEscritorioId(req);
    const data = await listarColaboradoresBase(escritorioId);
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao listar colaboradores.' });
  }
}

async function criarColaborador(req, res) {
  const escritorioId = getEscritorioId(req);
  const nome = String(req.body.nome || '').trim();
  const email = normalizeEmail(req.body.email);
  const usuario = normalizeUsername(req.body.usuario);
  const senha = String(req.body.senha || '');
  const papel = String(req.body.papel || 'colaborador').trim().toLowerCase();

  if (!canManage(req)) {
    return res.status(403).json({ erro: 'Sem permissão para gerenciar colaboradores.' });
  }
  if (!nome) {
    return res.status(400).json({ erro: 'Campo obrigatório: nome.' });
  }
  if (!email && !usuario) {
    return res.status(400).json({ erro: 'Informe e-mail ou usuário.' });
  }
  if (!validatePapel(papel)) {
    return res.status(400).json({ erro: 'Papel inválido.' });
  }
  if (papel === 'owner' && req.escritorio.papel !== 'owner') {
    return res.status(403).json({ erro: 'Apenas owner pode adicionar outro owner.' });
  }
  if (usuario && !/^[a-z0-9._-]{3,80}$/.test(usuario)) {
    return res
      .status(400)
      .json({ erro: 'Usuário inválido. Use de 3 a 80 caracteres: letras, números, ponto, traço ou underline.' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const existingUser = await client.query(
      `SELECT id, nome, email, usuario
       FROM usuarios
       WHERE ($1::text IS NOT NULL AND LOWER(email) = LOWER($1))
          OR ($2::text IS NOT NULL AND LOWER(usuario) = LOWER($2))
       LIMIT 1`,
      [email, usuario]
    );

    let userId;
    if (existingUser.rows.length) {
      userId = Number(existingUser.rows[0].id);
      await client.query(
        `UPDATE usuarios
         SET nome = $1,
             email = COALESCE($2, email),
             usuario = COALESCE($3, usuario)
         WHERE id = $4`,
        [nome, email, usuario, userId]
      );
    } else {
      if (!senha || senha.length < 6) {
        await client.query('ROLLBACK');
        return res.status(400).json({ erro: 'Senha com no mínimo 6 caracteres é obrigatória.' });
      }
      const senhaHash = await bcrypt.hash(senha, 10);
      const created = await client.query(
        `INSERT INTO usuarios (nome, email, usuario, senha_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [nome, email, usuario, senhaHash]
      );
      userId = Number(created.rows[0].id);
    }

    await client.query(
      `INSERT INTO membros_escritorio (escritorio_id, usuario_id, papel)
       VALUES ($1, $2, $3)
       ON CONFLICT (escritorio_id, usuario_id)
       DO UPDATE SET papel = EXCLUDED.papel`,
      [escritorioId, userId, papel]
    );

    const output = await client.query(
      `SELECT u.id, u.nome, u.email, u.usuario, me.papel, me.created_at
       FROM membros_escritorio me
       JOIN usuarios u ON u.id = me.usuario_id
       WHERE me.escritorio_id = $1 AND me.usuario_id = $2`,
      [escritorioId, userId]
    );

    await client.query('COMMIT');
    return res.status(201).json(output.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(400).json({ erro: 'E-mail ou usuário já cadastrado.' });
    }
    return res.status(500).json({ erro: 'Erro ao criar colaborador.' });
  } finally {
    client.release();
  }
}

async function atualizarColaborador(req, res) {
  const escritorioId = getEscritorioId(req);
  const usuarioId = Number(req.params.usuarioId);

  if (!canManage(req)) {
    return res.status(403).json({ erro: 'Sem permissão para gerenciar colaboradores.' });
  }
  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    return res.status(400).json({ erro: 'Colaborador inválido.' });
  }

  const nome = req.body.nome !== undefined ? String(req.body.nome || '').trim() : undefined;
  const email = req.body.email !== undefined ? normalizeEmail(req.body.email) : undefined;
  const usuario = req.body.usuario !== undefined ? normalizeUsername(req.body.usuario) : undefined;
  const senha = req.body.senha !== undefined ? String(req.body.senha || '') : undefined;
  const papel = req.body.papel !== undefined ? String(req.body.papel || '').trim().toLowerCase() : undefined;

  if (usuario !== undefined && usuario && !/^[a-z0-9._-]{3,80}$/.test(usuario)) {
    return res
      .status(400)
      .json({ erro: 'Usuário inválido. Use de 3 a 80 caracteres: letras, números, ponto, traço ou underline.' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const membership = await client.query(
      `SELECT me.papel, u.id, u.nome, u.email, u.usuario
       FROM membros_escritorio me
       JOIN usuarios u ON u.id = me.usuario_id
       WHERE me.escritorio_id = $1 AND me.usuario_id = $2`,
      [escritorioId, usuarioId]
    );
    if (!membership.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Colaborador não encontrado.' });
    }

    const currentRole = membership.rows[0].papel;
    if ((currentRole === 'owner' || papel === 'owner') && req.escritorio.papel !== 'owner') {
      await client.query('ROLLBACK');
      return res.status(403).json({ erro: 'Apenas owner pode alterar owner.' });
    }
    if (papel !== undefined && !validatePapel(papel)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ erro: 'Papel inválido.' });
    }
    if (senha !== undefined && senha && senha.length < 6) {
      await client.query('ROLLBACK');
      return res.status(400).json({ erro: 'Senha deve ter no mínimo 6 caracteres.' });
    }

    const userUpdates = [];
    const userValues = [];
    if (nome !== undefined) {
      if (!nome) {
        await client.query('ROLLBACK');
        return res.status(400).json({ erro: 'Campo obrigatório: nome.' });
      }
      userValues.push(nome);
      userUpdates.push(`nome = $${userValues.length}`);
    }
    if (email !== undefined) {
      userValues.push(email);
      userUpdates.push(`email = $${userValues.length}`);
    }
    if (usuario !== undefined) {
      userValues.push(usuario);
      userUpdates.push(`usuario = $${userValues.length}`);
    }
    if (senha !== undefined && senha) {
      const senhaHash = await bcrypt.hash(senha, 10);
      userValues.push(senhaHash);
      userUpdates.push(`senha_hash = $${userValues.length}`);
    }

    if (userUpdates.length) {
      userValues.push(usuarioId);
      await client.query(
        `UPDATE usuarios
         SET ${userUpdates.join(', ')}
         WHERE id = $${userValues.length}`,
        userValues
      );
    }

    if (papel !== undefined) {
      await client.query(
        `UPDATE membros_escritorio
         SET papel = $1
         WHERE escritorio_id = $2 AND usuario_id = $3`,
        [papel, escritorioId, usuarioId]
      );
    }

    const output = await client.query(
      `SELECT u.id, u.nome, u.email, u.usuario, me.papel, me.created_at
       FROM membros_escritorio me
       JOIN usuarios u ON u.id = me.usuario_id
       WHERE me.escritorio_id = $1 AND me.usuario_id = $2`,
      [escritorioId, usuarioId]
    );
    await client.query('COMMIT');
    return res.json(output.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(400).json({ erro: 'E-mail ou usuário já cadastrado.' });
    }
    return res.status(500).json({ erro: 'Erro ao atualizar colaborador.' });
  } finally {
    client.release();
  }
}

async function removerColaborador(req, res) {
  const escritorioId = getEscritorioId(req);
  const usuarioId = Number(req.params.usuarioId);
  if (!canManage(req)) {
    return res.status(403).json({ erro: 'Sem permissão para gerenciar colaboradores.' });
  }
  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    return res.status(400).json({ erro: 'Colaborador inválido.' });
  }
  if (usuarioId === Number(req.user.id)) {
    return res.status(400).json({ erro: 'Não é permitido remover seu próprio acesso por aqui.' });
  }

  try {
    const current = await db.query(
      `SELECT papel
       FROM membros_escritorio
       WHERE escritorio_id = $1 AND usuario_id = $2`,
      [escritorioId, usuarioId]
    );
    if (!current.rows.length) {
      return res.status(404).json({ erro: 'Colaborador não encontrado.' });
    }
    if (current.rows[0].papel === 'owner') {
      const owners = await db.query(
        `SELECT COUNT(*)::int AS total
         FROM membros_escritorio
         WHERE escritorio_id = $1 AND papel = 'owner'`,
        [escritorioId]
      );
      if (Number(owners.rows[0].total) <= 1) {
        return res.status(400).json({ erro: 'Não é possível remover o único owner do escritório.' });
      }
    }

    await db.query(
      `DELETE FROM membros_escritorio
       WHERE escritorio_id = $1 AND usuario_id = $2`,
      [escritorioId, usuarioId]
    );
    return res.json({ mensagem: 'Colaborador removido do escritório.' });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao remover colaborador.' });
  }
}

async function listarAreas(req, res) {
  try {
    const escritorioId = getEscritorioId(req);
    const data = await listarAreasBase(escritorioId);
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao listar áreas.' });
  }
}

async function criarArea(req, res) {
  const escritorioId = getEscritorioId(req);
  const nome = String(req.body.nome || '').trim();
  const ordem = Number.isFinite(Number(req.body.ordem)) ? Math.trunc(Number(req.body.ordem)) : 0;
  const ativo = toBoolean(req.body.ativo, true);

  if (!canManage(req)) {
    return res.status(403).json({ erro: 'Sem permissão para alterar áreas.' });
  }
  if (!nome) {
    return res.status(400).json({ erro: 'Campo obrigatório: nome.' });
  }

  try {
    const result = await db.query(
      `INSERT INTO escritorio_areas_atuacao (escritorio_id, nome, ordem, ativo)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nome, ordem, ativo, created_at`,
      [escritorioId, nome, ordem, ativo]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ erro: 'Área já cadastrada.' });
    }
    return res.status(500).json({ erro: 'Erro ao criar área.' });
  }
}

async function atualizarArea(req, res) {
  const escritorioId = getEscritorioId(req);
  const areaId = Number(req.params.id);
  if (!canManage(req)) {
    return res.status(403).json({ erro: 'Sem permissão para alterar áreas.' });
  }
  if (!Number.isInteger(areaId) || areaId <= 0) {
    return res.status(400).json({ erro: 'Área inválida.' });
  }

  const updates = [];
  const values = [];
  if (req.body.nome !== undefined) {
    const nome = String(req.body.nome || '').trim();
    if (!nome) return res.status(400).json({ erro: 'Campo obrigatório: nome.' });
    values.push(nome);
    updates.push(`nome = $${values.length}`);
  }
  if (req.body.ordem !== undefined) {
    const ordem = Number(req.body.ordem);
    values.push(Number.isFinite(ordem) ? Math.trunc(ordem) : 0);
    updates.push(`ordem = $${values.length}`);
  }
  if (req.body.ativo !== undefined) {
    values.push(toBoolean(req.body.ativo, true));
    updates.push(`ativo = $${values.length}`);
  }
  if (!updates.length) {
    return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });
  }

  values.push(areaId, escritorioId);
  try {
    const result = await db.query(
      `UPDATE escritorio_areas_atuacao
       SET ${updates.join(', ')}
       WHERE id = $${values.length - 1} AND escritorio_id = $${values.length}
       RETURNING id, nome, ordem, ativo, created_at`,
      values
    );
    if (!result.rows.length) {
      return res.status(404).json({ erro: 'Área não encontrada.' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ erro: 'Área já cadastrada.' });
    }
    return res.status(500).json({ erro: 'Erro ao atualizar área.' });
  }
}

async function removerArea(req, res) {
  const escritorioId = getEscritorioId(req);
  const areaId = Number(req.params.id);
  if (!canManage(req)) {
    return res.status(403).json({ erro: 'Sem permissão para alterar áreas.' });
  }
  if (!Number.isInteger(areaId) || areaId <= 0) {
    return res.status(400).json({ erro: 'Área inválida.' });
  }

  try {
    const result = await db.query(
      `DELETE FROM escritorio_areas_atuacao
       WHERE id = $1 AND escritorio_id = $2
       RETURNING id`,
      [areaId, escritorioId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ erro: 'Área não encontrada.' });
    }
    return res.json({ mensagem: 'Área removida.' });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao remover área.' });
  }
}

async function listarOabs(req, res) {
  try {
    const escritorioId = getEscritorioId(req);
    const data = await listarOabsBase(escritorioId);
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao listar OABs.' });
  }
}

async function criarOab(req, res) {
  const escritorioId = getEscritorioId(req);
  const numero = normalizeOabNumero(req.body.numero || req.body.oab);
  const uf = normalizeUf(req.body.uf || req.body.uf_oab);
  const etiqueta = String(req.body.etiqueta || '').trim() || null;
  const ativo = toBoolean(req.body.ativo, true);

  if (!canManage(req)) {
    return res.status(403).json({ erro: 'Sem permissão para alterar OABs.' });
  }
  if (!numero || !uf) {
    return res.status(400).json({ erro: 'Campos obrigatórios: número da OAB e UF.' });
  }

  try {
    const result = await db.query(
      `INSERT INTO escritorio_oabs_djen (escritorio_id, numero, uf, etiqueta, ativo)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, numero, uf, etiqueta, ativo, created_at`,
      [escritorioId, numero, uf, etiqueta, ativo]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ erro: 'OAB já cadastrada.' });
    }
    return res.status(500).json({ erro: 'Erro ao criar OAB.' });
  }
}

async function atualizarOab(req, res) {
  const escritorioId = getEscritorioId(req);
  const oabId = Number(req.params.id);
  if (!canManage(req)) {
    return res.status(403).json({ erro: 'Sem permissão para alterar OABs.' });
  }
  if (!Number.isInteger(oabId) || oabId <= 0) {
    return res.status(400).json({ erro: 'OAB inválida.' });
  }

  const updates = [];
  const values = [];
  if (req.body.numero !== undefined || req.body.oab !== undefined) {
    const numero = normalizeOabNumero(req.body.numero || req.body.oab);
    if (!numero) return res.status(400).json({ erro: 'Número da OAB inválido.' });
    values.push(numero);
    updates.push(`numero = $${values.length}`);
  }
  if (req.body.uf !== undefined || req.body.uf_oab !== undefined) {
    const uf = normalizeUf(req.body.uf || req.body.uf_oab);
    if (!uf) return res.status(400).json({ erro: 'UF da OAB inválida.' });
    values.push(uf);
    updates.push(`uf = $${values.length}`);
  }
  if (req.body.etiqueta !== undefined) {
    values.push(String(req.body.etiqueta || '').trim() || null);
    updates.push(`etiqueta = $${values.length}`);
  }
  if (req.body.ativo !== undefined) {
    values.push(toBoolean(req.body.ativo, true));
    updates.push(`ativo = $${values.length}`);
  }

  if (!updates.length) {
    return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });
  }

  values.push(oabId, escritorioId);
  try {
    const result = await db.query(
      `UPDATE escritorio_oabs_djen
       SET ${updates.join(', ')}
       WHERE id = $${values.length - 1} AND escritorio_id = $${values.length}
       RETURNING id, numero, uf, etiqueta, ativo, created_at`,
      values
    );
    if (!result.rows.length) {
      return res.status(404).json({ erro: 'OAB não encontrada.' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ erro: 'OAB já cadastrada.' });
    }
    return res.status(500).json({ erro: 'Erro ao atualizar OAB.' });
  }
}

async function removerOab(req, res) {
  const escritorioId = getEscritorioId(req);
  const oabId = Number(req.params.id);
  if (!canManage(req)) {
    return res.status(403).json({ erro: 'Sem permissão para alterar OABs.' });
  }
  if (!Number.isInteger(oabId) || oabId <= 0) {
    return res.status(400).json({ erro: 'OAB inválida.' });
  }
  try {
    const result = await db.query(
      `DELETE FROM escritorio_oabs_djen
       WHERE id = $1 AND escritorio_id = $2
       RETURNING id`,
      [oabId, escritorioId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ erro: 'OAB não encontrada.' });
    }
    return res.json({ mensagem: 'OAB removida.' });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao remover OAB.' });
  }
}

async function listarProcedimentos(req, res) {
  try {
    const escritorioId = getEscritorioId(req);
    const data = await listarProcedimentosBase(escritorioId);
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao listar procedimentos.' });
  }
}

async function criarProcedimento(req, res) {
  const escritorioId = getEscritorioId(req);
  const titulo = String(req.body.titulo || '').trim();
  const descricao = String(req.body.descricao || '').trim() || null;
  const ordem = Number.isFinite(Number(req.body.ordem)) ? Math.trunc(Number(req.body.ordem)) : 0;
  const ativo = toBoolean(req.body.ativo, true);

  if (!canManage(req)) {
    if (req.file) deleteFileSafe(path.join(procedimentoUploadDir, req.file.filename));
    return res.status(403).json({ erro: 'Sem permissão para alterar procedimentos.' });
  }
  if (!titulo) {
    if (req.file) deleteFileSafe(path.join(procedimentoUploadDir, req.file.filename));
    return res.status(400).json({ erro: 'Campo obrigatório: título.' });
  }

  try {
    const result = await db.query(
      `INSERT INTO escritorio_procedimentos (
        escritorio_id, titulo, descricao, anexo_nome_original, anexo_caminho, anexo_mime_type, anexo_tamanho, ordem, ativo
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, titulo, descricao, anexo_nome_original, anexo_caminho, anexo_mime_type, anexo_tamanho, ordem, ativo, created_at, updated_at`,
      [
        escritorioId,
        titulo,
        descricao,
        req.file ? req.file.originalname : null,
        req.file ? req.file.filename : null,
        req.file ? req.file.mimetype : null,
        req.file ? req.file.size : null,
        ordem,
        ativo,
      ]
    );
    return res.status(201).json(buildProcedimentoPayload(result.rows[0]));
  } catch (err) {
    if (req.file) deleteFileSafe(path.join(procedimentoUploadDir, req.file.filename));
    return res.status(500).json({ erro: 'Erro ao criar procedimento.' });
  }
}

async function atualizarProcedimento(req, res) {
  const escritorioId = getEscritorioId(req);
  const procedimentoId = Number(req.params.id);
  if (!canManage(req)) {
    if (req.file) deleteFileSafe(path.join(procedimentoUploadDir, req.file.filename));
    return res.status(403).json({ erro: 'Sem permissão para alterar procedimentos.' });
  }
  if (!Number.isInteger(procedimentoId) || procedimentoId <= 0) {
    if (req.file) deleteFileSafe(path.join(procedimentoUploadDir, req.file.filename));
    return res.status(400).json({ erro: 'Procedimento inválido.' });
  }

  const existing = await db.query(
    `SELECT id, anexo_caminho
     FROM escritorio_procedimentos
     WHERE id = $1 AND escritorio_id = $2`,
    [procedimentoId, escritorioId]
  );
  if (!existing.rows.length) {
    if (req.file) deleteFileSafe(path.join(procedimentoUploadDir, req.file.filename));
    return res.status(404).json({ erro: 'Procedimento não encontrado.' });
  }

  const updates = [];
  const values = [];
  if (req.body.titulo !== undefined) {
    const titulo = String(req.body.titulo || '').trim();
    if (!titulo) {
      if (req.file) deleteFileSafe(path.join(procedimentoUploadDir, req.file.filename));
      return res.status(400).json({ erro: 'Campo obrigatório: título.' });
    }
    values.push(titulo);
    updates.push(`titulo = $${values.length}`);
  }
  if (req.body.descricao !== undefined) {
    values.push(String(req.body.descricao || '').trim() || null);
    updates.push(`descricao = $${values.length}`);
  }
  if (req.body.ordem !== undefined) {
    const ordem = Number(req.body.ordem);
    values.push(Number.isFinite(ordem) ? Math.trunc(ordem) : 0);
    updates.push(`ordem = $${values.length}`);
  }
  if (req.body.ativo !== undefined) {
    values.push(toBoolean(req.body.ativo, true));
    updates.push(`ativo = $${values.length}`);
  }

  let shouldRemoveOldFile = false;
  if (toBoolean(req.body.remover_anexo, false)) {
    updates.push('anexo_nome_original = NULL');
    updates.push('anexo_caminho = NULL');
    updates.push('anexo_mime_type = NULL');
    updates.push('anexo_tamanho = NULL');
    shouldRemoveOldFile = true;
  }

  if (req.file) {
    values.push(req.file.originalname);
    updates.push(`anexo_nome_original = $${values.length}`);
    values.push(req.file.filename);
    updates.push(`anexo_caminho = $${values.length}`);
    values.push(req.file.mimetype);
    updates.push(`anexo_mime_type = $${values.length}`);
    values.push(req.file.size);
    updates.push(`anexo_tamanho = $${values.length}`);
    shouldRemoveOldFile = true;
  }

  if (!updates.length) {
    if (req.file) deleteFileSafe(path.join(procedimentoUploadDir, req.file.filename));
    return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });
  }
  updates.push('updated_at = NOW()');

  values.push(procedimentoId, escritorioId);
  try {
    const result = await db.query(
      `UPDATE escritorio_procedimentos
       SET ${updates.join(', ')}
       WHERE id = $${values.length - 1} AND escritorio_id = $${values.length}
       RETURNING id, titulo, descricao, anexo_nome_original, anexo_caminho, anexo_mime_type, anexo_tamanho, ordem, ativo, created_at, updated_at`,
      values
    );
    if (shouldRemoveOldFile && existing.rows[0].anexo_caminho) {
      deleteFileSafe(path.join(procedimentoUploadDir, existing.rows[0].anexo_caminho));
    }
    return res.json(buildProcedimentoPayload(result.rows[0]));
  } catch (err) {
    if (req.file) deleteFileSafe(path.join(procedimentoUploadDir, req.file.filename));
    return res.status(500).json({ erro: 'Erro ao atualizar procedimento.' });
  }
}

async function removerProcedimento(req, res) {
  const escritorioId = getEscritorioId(req);
  const procedimentoId = Number(req.params.id);
  if (!canManage(req)) {
    return res.status(403).json({ erro: 'Sem permissão para alterar procedimentos.' });
  }
  if (!Number.isInteger(procedimentoId) || procedimentoId <= 0) {
    return res.status(400).json({ erro: 'Procedimento inválido.' });
  }

  try {
    const result = await db.query(
      `DELETE FROM escritorio_procedimentos
       WHERE id = $1 AND escritorio_id = $2
       RETURNING anexo_caminho`,
      [procedimentoId, escritorioId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ erro: 'Procedimento não encontrado.' });
    }
    if (result.rows[0].anexo_caminho) {
      deleteFileSafe(path.join(procedimentoUploadDir, result.rows[0].anexo_caminho));
    }
    return res.json({ mensagem: 'Procedimento removido.' });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao remover procedimento.' });
  }
}

async function baixarAnexoProcedimento(req, res) {
  const escritorioId = getEscritorioId(req);
  const procedimentoId = Number(req.params.id);
  if (!Number.isInteger(procedimentoId) || procedimentoId <= 0) {
    return res.status(400).json({ erro: 'Procedimento inválido.' });
  }

  try {
    const result = await db.query(
      `SELECT anexo_nome_original, anexo_caminho, anexo_mime_type
       FROM escritorio_procedimentos
       WHERE id = $1 AND escritorio_id = $2`,
      [procedimentoId, escritorioId]
    );
    if (!result.rows.length || !result.rows[0].anexo_caminho) {
      return res.status(404).json({ erro: 'Anexo não encontrado.' });
    }
    const row = result.rows[0];
    const filePath = path.resolve(procedimentoUploadDir, row.anexo_caminho);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ erro: 'Arquivo não encontrado no servidor.' });
    }

    res.setHeader('Content-Type', row.anexo_mime_type || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(row.anexo_nome_original || 'anexo')}"`
    );
    return res.sendFile(filePath);
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao abrir anexo.' });
  }
}

async function obterConfig(req, res) {
  try {
    const escritorioId = getEscritorioId(req);
    const config = await obterConfigBase(escritorioId, req.escritorio?.nome || '');
    return res.json(config);
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao carregar configuração.' });
  }
}

async function atualizarConfig(req, res) {
  const escritorioId = getEscritorioId(req);
  if (!canManage(req)) {
    return res.status(403).json({ erro: 'Sem permissão para alterar configurações.' });
  }

  const nomeExibicao = String(req.body.nome_exibicao || '').trim() || null;
  const djenUfPadrao = normalizeUf(req.body.djen_uf_padrao || req.body.uf_djen);
  if (djenUfPadrao && !/^[A-Z]{2}$/.test(djenUfPadrao)) {
    return res.status(400).json({ erro: 'UF padrão do DJEN inválida.' });
  }

  try {
    const result = await db.query(
      `INSERT INTO escritorio_config (escritorio_id, nome_exibicao, djen_uf_padrao, created_at, updated_at)
       VALUES ($1, $2, COALESCE($3, 'BA'), NOW(), NOW())
       ON CONFLICT (escritorio_id)
       DO UPDATE SET
         nome_exibicao = EXCLUDED.nome_exibicao,
         djen_uf_padrao = COALESCE(EXCLUDED.djen_uf_padrao, escritorio_config.djen_uf_padrao),
         updated_at = NOW()
       RETURNING escritorio_id, nome_exibicao, djen_uf_padrao, created_at, updated_at`,
      [escritorioId, nomeExibicao, djenUfPadrao]
    );
    return res.json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao atualizar configuração.' });
  }
}

module.exports = {
  resumo,
  listarColaboradores,
  criarColaborador,
  atualizarColaborador,
  removerColaborador,
  listarAreas,
  criarArea,
  atualizarArea,
  removerArea,
  listarOabs,
  criarOab,
  atualizarOab,
  removerOab,
  listarProcedimentos,
  criarProcedimento,
  atualizarProcedimento,
  removerProcedimento,
  baixarAnexoProcedimento,
  obterConfig,
  atualizarConfig,
};
