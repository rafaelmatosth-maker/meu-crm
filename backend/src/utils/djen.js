const https = require('https');

const API_BASE = process.env.DJEN_API_BASE || 'https://comunicaapi.pje.jus.br/api/v1';
const REQUEST_TIMEOUT_MS = Number(process.env.DJEN_TIMEOUT_MS || 15000);

function sanitizeParams(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, String(value));
    }
  });
  return query.toString();
}

function getJson(path, params = {}) {
  const query = sanitizeParams(params);
  const target = `${API_BASE.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}${query ? `?${query}` : ''}`;

  return new Promise((resolve, reject) => {
    const req = https.get(target, { timeout: REQUEST_TIMEOUT_MS }, (res) => {
      let raw = '';
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        let parsed = {};
        if (raw) {
          try {
            parsed = JSON.parse(raw);
          } catch (_) {
            parsed = {};
          }
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const error = new Error(parsed?.message || 'Erro ao consultar DJEN.');
          error.status = res.statusCode;
          error.data = parsed;
          return reject(error);
        }
        return resolve(parsed);
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('Tempo limite excedido ao consultar DJEN.'));
    });
    req.on('error', reject);
  });
}

async function buscarComunicacoesDjen(params = {}) {
  return getJson('/comunicacao', params);
}

module.exports = {
  buscarComunicacoesDjen,
};
