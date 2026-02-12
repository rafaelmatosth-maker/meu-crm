const fs = require('fs');
const path = require('path');
const db = require('../db');
const { uploadDir } = require('../utils/upload');

function getEscritorioId(req) {
  return Number(req.escritorio && req.escritorio.id);
}

async function listar(req, res) {
  const { processo_id } = req.query;
  if (!processo_id) {
    return res.status(400).json({ erro: 'Informe processo_id.' });
  }

  try {
    const escritorioId = getEscritorioId(req);
    const result = await db.query(
      `SELECT d.id, d.processo_id, d.nome_original, d.caminho, d.tamanho, d.mime_type, d.uploaded_at
       FROM documentos d
       JOIN processos p ON p.id = d.processo_id
       WHERE d.processo_id = $1
         AND p.escritorio_id = $2
       ORDER BY d.uploaded_at DESC`,
      [processo_id, escritorioId]
    );
    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao listar documentos.' });
  }
}

async function criar(req, res) {
  const { processo_id } = req.body;
  if (!processo_id) {
    return res.status(400).json({ erro: 'Informe processo_id.' });
  }

  if (!req.file) {
    return res.status(400).json({ erro: 'Arquivo não enviado.' });
  }

  try {
    const escritorioId = getEscritorioId(req);
    const processoResp = await db.query('SELECT id FROM processos WHERE id = $1 AND escritorio_id = $2', [
      processo_id,
      escritorioId,
    ]);
    if (!processoResp.rows.length) {
      fs.unlink(path.join(uploadDir, req.file.filename), () => {});
      return res.status(400).json({ erro: 'Processo inválido.' });
    }

    const result = await db.query(
      `INSERT INTO documentos (processo_id, nome_original, caminho, tamanho, mime_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [processo_id, req.file.originalname, req.file.filename, req.file.size, req.file.mimetype]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (req.file) {
      fs.unlink(path.join(uploadDir, req.file.filename), () => {});
    }
    if (err.code === '23503') {
      return res.status(400).json({ erro: 'Processo inválido.' });
    }
    return res.status(500).json({ erro: 'Erro ao salvar documento.' });
  }
}

async function baixar(req, res) {
  try {
    const escritorioId = getEscritorioId(req);
    const result = await db.query(
      `SELECT d.nome_original, d.caminho, d.mime_type
       FROM documentos d
       JOIN processos p ON p.id = d.processo_id
       WHERE d.id = $1
         AND p.escritorio_id = $2`,
      [req.params.id, escritorioId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ erro: 'Documento não encontrado.' });
    }

    const doc = result.rows[0];
    const filePath = path.join(uploadDir, doc.caminho);
    return res.download(filePath, doc.nome_original);
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao baixar documento.' });
  }
}

async function remover(req, res) {
  try {
    const escritorioId = getEscritorioId(req);
    const result = await db.query(
      `DELETE FROM documentos d
       USING processos p
       WHERE d.processo_id = p.id
         AND d.id = $1
         AND p.escritorio_id = $2
       RETURNING d.caminho`,
      [req.params.id, escritorioId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ erro: 'Documento não encontrado.' });
    }

    const filePath = path.join(uploadDir, result.rows[0].caminho);
    fs.unlink(filePath, () => {});
    return res.json({ mensagem: 'Documento removido.' });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao remover documento.' });
  }
}

module.exports = {
  listar,
  criar,
  baixar,
  remover,
};
