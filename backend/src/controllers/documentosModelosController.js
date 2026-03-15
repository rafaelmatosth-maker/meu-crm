const fs = require('fs');
const path = require('path');
const db = require('../db');
const { templateUploadDir } = require('../utils/templateUpload');
const { renderDocxBuffer, formatMergeData, convertDocxToHtml, convertDocxToPdf } = require('../utils/docx');

const chunksRootDir = path.join(templateUploadDir, '.chunks');
const maxTemplateSizeBytes = 10 * 1024 * 1024;

if (!fs.existsSync(chunksRootDir)) {
  fs.mkdirSync(chunksRootDir, { recursive: true });
}

function getEscritorioId(req) {
  return Number(req.escritorio && req.escritorio.id);
}

function sanitizeUploadId(value) {
  const normalized = String(value || '').trim();
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(normalized)) return '';
  return normalized;
}

function parsePositiveInt(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseChunkIndex(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function getChunkDir(uploadId) {
  return path.join(chunksRootDir, uploadId);
}

function getChunkMetaPath(chunkDir) {
  return path.join(chunkDir, 'meta.json');
}

function writeChunkMeta(chunkDir, meta) {
  fs.writeFileSync(getChunkMetaPath(chunkDir), JSON.stringify(meta));
}

function readChunkMeta(chunkDir) {
  const metaPath = getChunkMetaPath(chunkDir);
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function extIsDocx(filename) {
  return path.extname(String(filename || '')).toLowerCase() === '.docx';
}

function buildStoredFilename(originalName) {
  const ext = extIsDocx(originalName) ? '.docx' : '.docx';
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return `${unique}${ext}`;
}

async function ensureModelosTable() {
  await db.query(
    `CREATE TABLE IF NOT EXISTS documentos_modelos (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(120) NOT NULL,
      nome_original VARCHAR(255) NOT NULL,
      caminho VARCHAR(255) NOT NULL,
      tamanho INTEGER NOT NULL,
      mime_type VARCHAR(120) NOT NULL,
      escritorio_id INTEGER REFERENCES escritorios(id) ON DELETE CASCADE,
      uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`
  );
  await db.query(
    'ALTER TABLE documentos_modelos ADD COLUMN IF NOT EXISTS escritorio_id INTEGER REFERENCES escritorios(id) ON DELETE CASCADE'
  );
  await db.query('CREATE INDEX IF NOT EXISTS idx_documentos_modelos_nome ON documentos_modelos(nome)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_documentos_modelos_escritorio_id ON documentos_modelos(escritorio_id)');
}

async function listar(req, res) {
  try {
    await ensureModelosTable();
    const escritorioId = getEscritorioId(req);
    const result = await db.query(
      `SELECT id, nome, nome_original, caminho, tamanho, mime_type, uploaded_at
       FROM documentos_modelos
       WHERE escritorio_id = $1
       ORDER BY uploaded_at DESC`,
      [escritorioId]
    );
    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao listar modelos.' });
  }
}

async function criar(req, res) {
  const { nome } = req.body;
  if (!nome) {
    return res.status(400).json({ erro: 'Informe o nome do modelo.' });
  }
  if (!req.file) {
    return res.status(400).json({ erro: 'Arquivo não enviado.' });
  }

  try {
    await ensureModelosTable();
    const escritorioId = getEscritorioId(req);
    const result = await db.query(
      `INSERT INTO documentos_modelos (nome, nome_original, caminho, tamanho, mime_type, escritorio_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [nome.trim(), req.file.originalname, req.file.filename, req.file.size, req.file.mimetype, escritorioId]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao salvar modelo:', err);
    if (req.file) {
      fs.unlink(path.join(templateUploadDir, req.file.filename), () => {});
    }
    return res.status(500).json({
      erro: 'Erro ao salvar modelo.',
      detalhe: err.message || 'Erro desconhecido.',
      codigo: err.code || null,
    });
  }
}

async function uploadChunk(req, res) {
  const uploadId = sanitizeUploadId(req.body && req.body.upload_id);
  const totalChunks = parsePositiveInt(req.body && req.body.total_chunks);
  const chunkIndex = parseChunkIndex(req.body && req.body.chunk_index);
  const originalName = String((req.body && req.body.original_name) || '').trim();

  if (!uploadId) {
    return res.status(400).json({ erro: 'upload_id inválido.' });
  }
  if (!totalChunks || totalChunks > 1000) {
    return res.status(400).json({ erro: 'total_chunks inválido.' });
  }
  if (chunkIndex === null || chunkIndex >= totalChunks) {
    return res.status(400).json({ erro: 'chunk_index inválido.' });
  }
  if (!extIsDocx(originalName)) {
    return res.status(400).json({ erro: 'Envie um arquivo .docx.' });
  }
  if (!req.file || !Buffer.isBuffer(req.file.buffer)) {
    return res.status(400).json({ erro: 'Chunk não enviado.' });
  }

  const chunkDir = getChunkDir(uploadId);
  try {
    fs.mkdirSync(chunkDir, { recursive: true });
    const currentMeta = readChunkMeta(chunkDir);
    if (currentMeta) {
      if (
        Number(currentMeta.total_chunks) !== totalChunks ||
        String(currentMeta.original_name || '') !== originalName
      ) {
        return res.status(400).json({ erro: 'Metadados do upload não conferem.' });
      }
    } else {
      writeChunkMeta(chunkDir, {
        total_chunks: totalChunks,
        original_name: originalName,
        created_at: new Date().toISOString(),
      });
    }

    const chunkPath = path.join(chunkDir, `${chunkIndex}.part`);
    fs.writeFileSync(chunkPath, req.file.buffer);
    return res.json({
      mensagem: 'Chunk recebido.',
      chunk_index: chunkIndex,
      total_chunks: totalChunks,
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao receber parte do arquivo.' });
  }
}

async function finalizeChunkUpload(req, res) {
  const { nome } = req.body || {};
  const uploadId = sanitizeUploadId(req.body && req.body.upload_id);
  if (!nome) {
    return res.status(400).json({ erro: 'Informe o nome do modelo.' });
  }
  if (!uploadId) {
    return res.status(400).json({ erro: 'upload_id inválido.' });
  }

  const chunkDir = getChunkDir(uploadId);
  if (!fs.existsSync(chunkDir)) {
    return res.status(404).json({ erro: 'Upload em partes não encontrado.' });
  }

  const meta = readChunkMeta(chunkDir);
  if (!meta) {
    return res.status(400).json({ erro: 'Metadados do upload inválidos.' });
  }

  const totalChunks = parsePositiveInt(meta.total_chunks);
  const originalName = String(meta.original_name || '').trim();
  if (!totalChunks || !extIsDocx(originalName)) {
    return res.status(400).json({ erro: 'Metadados do upload inválidos.' });
  }

  const missingChunks = [];
  let totalSize = 0;
  for (let i = 0; i < totalChunks; i += 1) {
    const partPath = path.join(chunkDir, `${i}.part`);
    if (!fs.existsSync(partPath)) {
      missingChunks.push(i);
      continue;
    }
    totalSize += fs.statSync(partPath).size;
  }
  if (missingChunks.length) {
    return res.status(400).json({
      erro: 'Upload incompleto.',
      detalhe: `Partes ausentes: ${missingChunks.slice(0, 20).join(', ')}`,
    });
  }
  if (totalSize > maxTemplateSizeBytes) {
    return res.status(400).json({ erro: 'Arquivo maior que 10MB.' });
  }

  const storedFilename = buildStoredFilename(originalName);
  const finalPath = path.join(templateUploadDir, storedFilename);

  try {
    fs.writeFileSync(finalPath, Buffer.alloc(0));
    for (let i = 0; i < totalChunks; i += 1) {
      const partPath = path.join(chunkDir, `${i}.part`);
      const buffer = fs.readFileSync(partPath);
      fs.appendFileSync(finalPath, buffer);
    }

    await ensureModelosTable();
    const escritorioId = getEscritorioId(req);
    const result = await db.query(
      `INSERT INTO documentos_modelos (nome, nome_original, caminho, tamanho, mime_type, escritorio_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        String(nome).trim(),
        originalName,
        storedFilename,
        totalSize,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        escritorioId,
      ]
    );

    fs.rm(chunkDir, { recursive: true, force: true }, () => {});
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (fs.existsSync(finalPath)) {
      fs.unlink(finalPath, () => {});
    }
    return res.status(500).json({
      erro: 'Erro ao finalizar upload do modelo.',
      detalhe: err.message || 'Erro desconhecido.',
      codigo: err.code || null,
    });
  }
}

async function remover(req, res) {
  try {
    await ensureModelosTable();
    const escritorioId = getEscritorioId(req);
    const result = await db.query(
      `DELETE FROM documentos_modelos
       WHERE id = $1
         AND escritorio_id = $2
       RETURNING caminho`,
      [req.params.id, escritorioId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ erro: 'Modelo não encontrado.' });
    }

    const filePath = path.join(templateUploadDir, result.rows[0].caminho);
    fs.unlink(filePath, () => {});
    return res.json({ mensagem: 'Modelo removido.' });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao remover modelo.' });
  }
}

async function preview(req, res) {
  const { cliente_id } = req.body;
  if (!cliente_id) {
    return res.status(400).json({ erro: 'Informe cliente_id.' });
  }

  try {
    await ensureModelosTable();
    const escritorioId = getEscritorioId(req);
    const [modeloResp, clienteResp] = await Promise.all([
      db.query(
        `SELECT id, nome, nome_original, caminho
         FROM documentos_modelos
         WHERE id = $1
           AND escritorio_id = $2`,
        [req.params.id, escritorioId]
      ),
      db.query('SELECT * FROM clientes WHERE id = $1 AND escritorio_id = $2', [cliente_id, escritorioId]),
    ]);

    if (!modeloResp.rows.length) {
      return res.status(404).json({ erro: 'Modelo não encontrado.' });
    }
    if (!clienteResp.rows.length) {
      return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }

    const modelo = modeloResp.rows[0];
    const cliente = clienteResp.rows[0];
    const templatePath = path.join(templateUploadDir, modelo.caminho);
    const data = formatMergeData(cliente);
    const docxBuffer = renderDocxBuffer(templatePath, data);
    const html = await convertDocxToHtml(docxBuffer);
    return res.json({
      html,
      nome_modelo: modelo.nome,
      nome_cliente: cliente.nome || '',
    });
  } catch (err) {
    console.error('Erro ao gerar pré-visualização:', err);
    return res.status(500).json({
      erro: 'Erro ao gerar pré-visualização.',
      detalhe: err.message || 'Erro desconhecido.',
    });
  }
}

async function baixarPdf(req, res) {
  const { cliente_id } = req.query;
  if (!cliente_id) {
    return res.status(400).json({ erro: 'Informe cliente_id.' });
  }

  try {
    await ensureModelosTable();
    const escritorioId = getEscritorioId(req);
    const [modeloResp, clienteResp] = await Promise.all([
      db.query(
        `SELECT id, nome, nome_original, caminho
         FROM documentos_modelos
         WHERE id = $1
           AND escritorio_id = $2`,
        [req.params.id, escritorioId]
      ),
      db.query('SELECT * FROM clientes WHERE id = $1 AND escritorio_id = $2', [cliente_id, escritorioId]),
    ]);

    if (!modeloResp.rows.length) {
      return res.status(404).json({ erro: 'Modelo não encontrado.' });
    }
    if (!clienteResp.rows.length) {
      return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }

    const modelo = modeloResp.rows[0];
    const cliente = clienteResp.rows[0];
    const templatePath = path.join(templateUploadDir, modelo.caminho);
    const data = formatMergeData(cliente);
    const docxBuffer = renderDocxBuffer(templatePath, data);
    const pdfBuffer = await convertDocxToPdf(docxBuffer);

    const safe = (text) =>
      String(text || '')
        .replace(/[^\w\d _-]+/g, '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 60);
    const filename = `${safe(modelo.nome || 'documento')}-${safe(cliente.nome || 'cliente')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'documento.pdf'}"`);
    return res.send(pdfBuffer);
  } catch (err) {
    return res.status(500).json({
      erro:
        'Erro ao gerar PDF. Verifique se o LibreOffice está instalado no servidor (soffice).',
    });
  }
}

async function baixarDocx(req, res) {
  const { cliente_id } = req.query;
  if (!cliente_id) {
    return res.status(400).json({ erro: 'Informe cliente_id.' });
  }

  try {
    await ensureModelosTable();
    const escritorioId = getEscritorioId(req);
    const [modeloResp, clienteResp] = await Promise.all([
      db.query(
        `SELECT id, nome, nome_original, caminho
         FROM documentos_modelos
         WHERE id = $1
           AND escritorio_id = $2`,
        [req.params.id, escritorioId]
      ),
      db.query('SELECT * FROM clientes WHERE id = $1 AND escritorio_id = $2', [cliente_id, escritorioId]),
    ]);

    if (!modeloResp.rows.length) {
      return res.status(404).json({ erro: 'Modelo não encontrado.' });
    }
    if (!clienteResp.rows.length) {
      return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }

    const modelo = modeloResp.rows[0];
    const cliente = clienteResp.rows[0];
    const templatePath = path.join(templateUploadDir, modelo.caminho);
    const data = formatMergeData(cliente);
    const docxBuffer = renderDocxBuffer(templatePath, data);

    const safe = (text) =>
      String(text || '')
        .replace(/[^\w\d _-]+/g, '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 60);
    const filename = `${safe(modelo.nome || 'documento')}-${safe(cliente.nome || 'cliente')}.docx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'documento.docx'}"`);
    return res.send(docxBuffer);
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao gerar DOCX.' });
  }
}

module.exports = {
  listar,
  criar,
  uploadChunk,
  finalizeChunkUpload,
  remover,
  preview,
  baixarPdf,
  baixarDocx,
};
