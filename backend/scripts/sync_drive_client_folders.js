#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');
const readline = require('readline');
const { execFile } = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function getGoogleApis() {
  try {
    // Lazy load so local mode (--local-root) works without this dependency.
    // (Still recommended to keep it installed for API mode.)
    return require('googleapis');
  } catch (err) {
    console.error('Dependência ausente: googleapis');
    console.error('Instale com: cd backend && npm install');
    process.exit(1);
  }
}
const db = require('../src/db');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) {
      args._.push(item);
      continue;
    }
    const key = item.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
      continue;
    }
    args[key] = true;
  }
  return args;
}

function printHelp() {
  console.log(`
Sync Google Drive (pastas de clientes) -> Postgres (clientes.link_pasta)

Uso:
  node scripts/sync_drive_client_folders.js --parent "<URL_ou_ID_da_pasta_raiz>" [opcoes]
  node scripts/sync_drive_client_folders.js --local-root "<PASTA_LOCAL_DO_DRIVE>" [opcoes]

Opcoes:
  --local-root <path>   Usa Google Drive for Desktop (pasta local) e extrai o ID pelo xattr (macOS).
  --apply               Aplica updates no banco (sem isso, roda em dry-run).
  --overwrite           Sobrescreve link_pasta mesmo se ja estiver preenchido.
  --escritorio-id <id>  Filtra clientes por escritorio_id.
  --recursive           Busca pastas recursivamente (default: somente filhos diretos).
  --max-depth <n>       Profundidade maxima no modo --recursive (default: 5).
  --credentials <path>  Caminho do JSON de credenciais OAuth (default: backend/drive.credentials.json).
  --token <path>        Caminho do token OAuth salvo (default: backend/drive.token.json).
  --report <path>       Caminho do CSV de relatorio (default: meu-crm/reports/drive-client-folders-sync-<timestamp>.csv).
  --help                Mostra esta ajuda.

Requisitos (Google Drive API):
  - Crie um OAuth Client do tipo "Desktop app" no Google Cloud Console.
  - Baixe o JSON e salve em: backend/drive.credentials.json (ou use --credentials).
  - Na primeira execucao, o script vai abrir/mostrar um link para autorizar e salvar o token.

Modo local (Google Drive for Desktop no macOS):
  - Aponte --local-root para a pasta que contem as pastas dos clientes.
  - O script le o atributo com.google.drivefs.item-id#S (xattr) para obter o ID e montar o link.
`);
}

function normalizeForMatch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function extractDriveFolderId(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  const folderMatch = raw.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];

  const idMatch = raw.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];

  if (/^[a-zA-Z0-9_-]{10,}$/.test(raw)) return raw;
  return null;
}

function buildDriveFolderUrl(folderId) {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

async function readJsonSafe(filePath) {
  try {
    const data = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return null;
  }
}

async function writeJsonSafe(filePath, payload) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify(payload, null, 2));
}

function promptEnter(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
}

async function getOAuthClient({ credentialsPath, tokenPath }) {
  const { google } = getGoogleApis();
  const credentials = await readJsonSafe(credentialsPath);
  if (!credentials) {
    throw new Error(
      `Credenciais nao encontradas em ${credentialsPath}. Baixe o JSON OAuth (Desktop app) e salve nesse caminho.`
    );
  }

  const cfg = credentials.installed || credentials.web;
  if (!cfg || !cfg.client_id || !cfg.client_secret) {
    throw new Error(`Arquivo de credenciais invalido: ${credentialsPath}`);
  }

  const oauth2Client = new google.auth.OAuth2(cfg.client_id, cfg.client_secret);

  const savedToken = await readJsonSafe(tokenPath);
  if (savedToken) {
    oauth2Client.setCredentials(savedToken);
    return oauth2Client;
  }

  // First-time auth: run a loopback server to capture the OAuth code.
  const server = http.createServer();

  const port = await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, () => {
      const address = server.address();
      resolve(address && typeof address === 'object' ? address.port : null);
    });
  });

  if (!port) {
    server.close();
    throw new Error('Nao foi possivel iniciar servidor local para OAuth.');
  }

  const redirectUri = `http://localhost:${port}/oauth2callback`;
  oauth2Client.redirectUri = redirectUri;

  const scopes = ['https://www.googleapis.com/auth/drive.metadata.readonly'];
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
  });

  console.log('\nAutorize o acesso ao Google Drive (somente metadados):');
  console.log(authUrl);
  console.log('\nSe o navegador nao abrir automaticamente, copie e cole o link acima.\n');

  // Wait for callback with code.
  const code = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout aguardando autorizacao OAuth.'));
    }, 5 * 60 * 1000);

    server.on('request', (req, res) => {
      try {
        const requestUrl = new URL(req.url || '/', redirectUri);
        if (requestUrl.pathname !== '/oauth2callback') {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        const codeParam = requestUrl.searchParams.get('code');
        const errorParam = requestUrl.searchParams.get('error');
        if (errorParam) {
          clearTimeout(timeout);
          res.statusCode = 400;
          res.end('Autorizacao negada. Voce pode fechar esta aba.');
          reject(new Error(`Autorizacao negada: ${errorParam}`));
          return;
        }
        if (!codeParam) {
          res.statusCode = 400;
          res.end('Codigo ausente. Voce pode fechar esta aba.');
          return;
        }

        clearTimeout(timeout);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Autorizacao recebida. Voce pode fechar esta aba e voltar ao terminal.');
        resolve(codeParam);
      } catch (err) {
        reject(err);
      }
    });
  }).finally(() => {
    server.close();
  });

  const tokenResp = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokenResp.tokens);
  await writeJsonSafe(tokenPath, tokenResp.tokens);

  console.log(`Token salvo em: ${tokenPath}`);
  await promptEnter('Pressione Enter para continuar... ');

  return oauth2Client;
}

async function listChildFolders(drive, parentId) {
  const folders = [];
  let pageToken = null;

  do {
    const resp = await drive.files.list({
      q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'nextPageToken, files(id, name)',
      pageSize: 1000,
      pageToken: pageToken || undefined,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    const files = resp.data.files || [];
    folders.push(...files);
    pageToken = resp.data.nextPageToken || null;
  } while (pageToken);

  return folders;
}

async function listFoldersRecursive(drive, parentId, maxDepth) {
  const out = [];
  const queue = [{ id: parentId, depth: 0 }];
  const seen = new Set();

  while (queue.length) {
    const current = queue.shift();
    if (!current || !current.id) continue;
    if (seen.has(current.id)) continue;
    seen.add(current.id);

    if (current.depth >= maxDepth) continue;
    const children = await listChildFolders(drive, current.id);
    for (const folder of children) {
      out.push(folder);
      queue.push({ id: folder.id, depth: current.depth + 1 });
    }
  }

  return out;
}

function execFileAsync(file, args, options) {
  return new Promise((resolve, reject) => {
    execFile(file, args, options || {}, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stderr;
        reject(err);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function readXattrString(targetPath, attrName) {
  try {
    const { stdout } = await execFileAsync('xattr', ['-p', attrName, targetPath], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
    const value = String(stdout || '').trim();
    return value || null;
  } catch (err) {
    return null;
  }
}

async function getDriveFsItemIdFromLocalPath(targetPath) {
  // Google Drive for Desktop on macOS uses drivefs and stores the item id as an xattr.
  // Prefer the string-typed attribute (#S), but try a couple variants for safety.
  const candidates = ['com.google.drivefs.item-id#S', 'com.google.drivefs.item-id'];
  for (const attr of candidates) {
    const value = await readXattrString(targetPath, attr);
    if (value) return value;
  }
  return null;
}

async function listLocalFolders({ localRoot, recursive, maxDepth }) {
  const out = [];

  const queue = [{ dir: localRoot, depth: 0 }];
  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;

    const entries = await fs.promises.readdir(current.dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === '.Trash') continue;
      if (entry.name === '.tmp') continue;
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(current.dir, entry.name);
      out.push({ fullPath, name: entry.name });

      if (recursive && current.depth + 1 < maxDepth) {
        queue.push({ dir: fullPath, depth: current.depth + 1 });
      }
    }

    if (!recursive) break;
  }

  // Resolve drive item ids with concurrency to keep it reasonably fast for many folders.
  const concurrency = 20;
  const results = new Array(out.length);
  let idx = 0;

  const workers = Array.from({ length: Math.min(concurrency, out.length) }, () =>
    (async () => {
      while (true) {
        const i = idx;
        idx += 1;
        if (i >= out.length) break;
        const item = out[i];
        const id = await getDriveFsItemIdFromLocalPath(item.fullPath);
        results[i] = { id, name: item.name, fullPath: item.fullPath };
      }
    })()
  );

  await Promise.all(workers);
  return results.filter(Boolean);
}

function pickUniqueByCpf(folders, cpfDigits) {
  if (!cpfDigits || cpfDigits.length !== 11) return { folder: null, matchType: null };
  const hits = folders.filter((f) => (f.digits || '').includes(cpfDigits));
  if (hits.length === 1) return { folder: hits[0], matchType: 'cpf' };
  if (hits.length > 1) return { folder: null, matchType: 'ambiguous_cpf' };
  return { folder: null, matchType: null };
}

function selectDriveFolderForClient({ clientNorm, candidateFolders }) {
  const exact = candidateFolders.filter((f) => f.norm === clientNorm);
  if (exact.length === 1) return { folder: exact[0], matchType: 'exact' };
  if (exact.length > 1) return { folder: null, matchType: 'ambiguous_exact' };

  const prefix = candidateFolders.filter((f) => f.norm.startsWith(`${clientNorm} `) || f.norm === clientNorm);
  if (prefix.length === 1) return { folder: prefix[0], matchType: 'prefix' };
  if (prefix.length > 1) return { folder: null, matchType: 'ambiguous_prefix' };

  const contains = candidateFolders.filter((f) => f.norm.includes(` ${clientNorm} `) || f.norm.endsWith(` ${clientNorm}`));
  if (contains.length === 1) return { folder: contains[0], matchType: 'contains' };
  if (contains.length > 1) return { folder: null, matchType: 'ambiguous_contains' };

  return { folder: null, matchType: 'no_match' };
}

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[,"\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function writeReportCsv(filePath, rows) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const header = [
    'status',
    'cliente_id',
    'cliente_escritorio_id',
    'cliente_nome',
    'cliente_link_pasta_old',
    'drive_folder_id',
    'drive_folder_name',
    'drive_folder_url',
    'match_type',
    'message',
  ];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.status,
        row.cliente_id,
        row.cliente_escritorio_id,
        row.cliente_nome,
        row.cliente_link_pasta_old,
        row.drive_folder_id,
        row.drive_folder_name,
        row.drive_folder_url,
        row.match_type,
        row.message,
      ]
        .map(csvEscape)
        .join(',')
    );
  }
  await fs.promises.writeFile(filePath, lines.join('\n') + '\n', 'utf8');
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const localRootRaw = args['local-root'] ? String(args['local-root']).trim() : '';
  const useLocal = Boolean(localRootRaw);

  const shouldApply = Boolean(args.apply);
  const overwrite = Boolean(args.overwrite);
  const escritorioId = args['escritorio-id'] ? Number(args['escritorio-id']) : null;
  const recursive = Boolean(args.recursive);
  const maxDepth = args['max-depth'] ? Math.max(1, Number(args['max-depth'])) : 5;

  const credentialsPath = path.resolve(args.credentials || path.join(__dirname, '..', 'drive.credentials.json'));
  const tokenPath = path.resolve(args.token || path.join(__dirname, '..', 'drive.token.json'));

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultReport = path.join(__dirname, '..', '..', 'reports', `drive-client-folders-sync-${timestamp}.csv`);
  const reportPath = path.resolve(args.report || defaultReport);

  console.log('Configuracao:');
  if (useLocal) {
    console.log(`- Local root: ${localRootRaw}`);
  } else {
    const parentRaw = args.parent;
    const parentId = extractDriveFolderId(parentRaw);
    if (!parentId) {
      console.error('Parametro obrigatorio: --parent "<URL_ou_ID_da_pasta_raiz>" OU --local-root "<PASTA_LOCAL_DO_DRIVE>"');
      process.exit(1);
    }
    console.log(`- Parent folder: ${parentId}`);
  }
  console.log(`- Recursive: ${recursive ? 'sim' : 'nao'}${recursive ? ` (maxDepth=${maxDepth})` : ''}`);
  console.log(`- Escritorio: ${escritorioId ? escritorioId : 'todos'}`);
  console.log(`- Apply: ${shouldApply ? 'sim' : 'nao (dry-run)'}`);
  console.log(`- Overwrite: ${overwrite ? 'sim' : 'nao'}`);
  if (!useLocal) {
    console.log(`- Credentials: ${credentialsPath}`);
    console.log(`- Token: ${tokenPath}`);
  }
  console.log(`- Report: ${reportPath}`);

  console.log(useLocal ? '\nLendo pastas (Drive local)...' : '\nLendo pastas no Google Drive (API)...');

  let normalizedFolders;
  if (useLocal) {
    const localRoot = path.resolve(localRootRaw);
    const stats = await fs.promises.stat(localRoot).catch(() => null);
    if (!stats || !stats.isDirectory()) {
      throw new Error(`--local-root nao existe ou nao e uma pasta: ${localRoot}`);
    }
    const localFolders = await listLocalFolders({ localRoot, recursive, maxDepth });
    normalizedFolders = localFolders.map((f) => ({
      id: f.id,
      name: f.name,
      norm: normalizeForMatch(f.name),
      digits: digitsOnly(f.name),
      local_path: f.fullPath,
    }));
  } else {
    const { google } = getGoogleApis();
    const parentRaw = args.parent;
    const parentId = extractDriveFolderId(parentRaw);
    if (!parentId) {
      throw new Error('Parametro obrigatorio: --parent "<URL_ou_ID_da_pasta_raiz>"');
    }
    const auth = await getOAuthClient({ credentialsPath, tokenPath });
    const drive = google.drive({ version: 'v3', auth });
    const driveFolders = recursive
      ? await listFoldersRecursive(drive, parentId, maxDepth)
      : await listChildFolders(drive, parentId);
    normalizedFolders = driveFolders.map((f) => ({
      id: f.id,
      name: f.name,
      norm: normalizeForMatch(f.name),
      digits: digitsOnly(f.name),
    }));
  }

  console.log(`Pastas encontradas: ${normalizedFolders.length}`);

  console.log('\nCarregando clientes do banco...');
  const params = [];
  const where = [];

  if (escritorioId) {
    params.push(escritorioId);
    where.push(`escritorio_id = $${params.length}`);
  }

  if (!overwrite) {
    where.push(`(link_pasta IS NULL OR btrim(link_pasta) = '')`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const clientesResp = await db.query(
    `SELECT id, escritorio_id, nome, cpf, link_pasta
     FROM clientes
     ${whereSql}
     ORDER BY id ASC`,
    params
  );

  const clientes = clientesResp.rows || [];
  console.log(`Clientes para processar: ${clientes.length}`);

  const folderIndex = new Map();
  for (const folder of normalizedFolders) {
    if (!folder.norm) continue;
    const list = folderIndex.get(folder.norm) || [];
    list.push(folder);
    folderIndex.set(folder.norm, list);
  }

  const candidateFolders = normalizedFolders.filter((f) => f.norm);

  const reportRows = [];
  const updates = [];

  for (const cliente of clientes) {
    const clienteId = Number(cliente.id);
    const clienteNome = String(cliente.nome || '').trim();
    const clienteNorm = normalizeForMatch(clienteNome);
    const cpfDigits = digitsOnly(cliente.cpf);
    const oldLink = cliente.link_pasta;

    if (!clienteNorm) {
      reportRows.push({
        status: 'skip',
        cliente_id: clienteId,
        cliente_escritorio_id: cliente.escritorio_id,
        cliente_nome: clienteNome,
        cliente_link_pasta_old: oldLink,
        drive_folder_id: '',
        drive_folder_name: '',
        drive_folder_url: '',
        match_type: 'invalid_client_name',
        message: 'Nome do cliente vazio/invalidado na normalizacao.',
      });
      continue;
    }

    // Fast path: exact normalized lookup.
    const exactCandidates = folderIndex.get(clienteNorm) || [];
    let chosen = null;
    let matchType = null;

    if (exactCandidates.length === 1) {
      chosen = exactCandidates[0];
      matchType = 'exact';
    } else if (exactCandidates.length > 1) {
      const cpfPick = pickUniqueByCpf(exactCandidates, cpfDigits);
      if (cpfPick.folder) {
        chosen = cpfPick.folder;
        matchType = 'exact+cpf';
      } else {
        matchType = cpfPick.matchType || 'ambiguous_exact';
      }
    } else {
      const cpfPick = pickUniqueByCpf(candidateFolders, cpfDigits);
      if (cpfPick.folder) {
        chosen = cpfPick.folder;
        matchType = cpfPick.matchType;
      } else {
        const selection = selectDriveFolderForClient({ clientNorm: clienteNorm, candidateFolders });
        chosen = selection.folder;
        matchType = selection.matchType;
      }
    }

    if (!chosen) {
      reportRows.push({
        status: 'unmatched',
        cliente_id: clienteId,
        cliente_escritorio_id: cliente.escritorio_id,
        cliente_nome: clienteNome,
        cliente_link_pasta_old: oldLink,
        drive_folder_id: '',
        drive_folder_name: '',
        drive_folder_url: '',
        match_type: matchType,
        message: 'Nao foi possivel definir uma pasta unica para este cliente.',
      });
      continue;
    }

    const url = buildDriveFolderUrl(chosen.id);

    // If not overwriting, this script already filtered link_pasta missing.
    // If overwriting, keep the DB update even if it's the same URL (harmless, but skip to reduce noise).
    if (overwrite && oldLink && String(oldLink).trim() === url) {
      reportRows.push({
        status: 'noop',
        cliente_id: clienteId,
        cliente_escritorio_id: cliente.escritorio_id,
        cliente_nome: clienteNome,
        cliente_link_pasta_old: oldLink,
        drive_folder_id: chosen.id,
        drive_folder_name: chosen.name,
        drive_folder_url: url,
        match_type: matchType,
        message: 'Link ja estava igual.',
      });
      continue;
    }

    updates.push({ clienteId, url });
    reportRows.push({
      status: shouldApply ? 'update' : 'dry_run_update',
      cliente_id: clienteId,
      cliente_escritorio_id: cliente.escritorio_id,
      cliente_nome: clienteNome,
      cliente_link_pasta_old: oldLink,
      drive_folder_id: chosen.id,
      drive_folder_name: chosen.name,
      drive_folder_url: url,
      match_type: matchType,
      message: shouldApply ? 'Atualizado no banco.' : 'Simulacao (nao aplicou).',
    });
  }

  console.log('\nResumo:');
  console.log(`- Possiveis updates: ${updates.length}`);
  console.log(`- Relatorio: ${reportPath}`);

  if (shouldApply && updates.length) {
    console.log('\nAplicando updates no banco...');
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      for (const item of updates) {
        await client.query('UPDATE clientes SET link_pasta = $1 WHERE id = $2', [item.url, item.clienteId]);
      }
      await client.query('COMMIT');
      console.log('Updates aplicados com sucesso.');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Falha aplicando updates:', err.message);
      throw err;
    } finally {
      client.release();
    }
  }

  await writeReportCsv(reportPath, reportRows);
  console.log('OK.');
}

main()
  .catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  })
  .finally(async () => {
    // Ensure pool is closed to end the process cleanly.
    try {
      await db.pool.end();
    } catch (err) {
      // ignore
    }
  });
