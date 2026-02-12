const https = require('https');
const { URL } = require('url');
const { tribunalAliasFromCnj, formatCnjNumber, formatCnjDigits } = require('./cnj');

const API_BASE = 'https://api-publica.datajud.cnj.jus.br';

function getApiKey() {
  return process.env.DATAJUD_API_KEY;
}

function buildEndpoint(alias) {
  return `${API_BASE}/api_publica_${alias}/_search`;
}

function buildMovementsQuery(numeroProcesso) {
  return {
    size: 1,
    query: {
      term: {
        numeroProcesso,
      },
    },
    _source: ['numeroProcesso', 'dataAjuizamento', 'dataUltimaMovimentacao', 'classe', 'area', 'movimentos'],
  };
}

function postJson(url, headers, payload) {
  const body = JSON.stringify(payload);
  const target = new URL(url);

  const options = {
    method: 'POST',
    hostname: target.hostname,
    path: `${target.pathname}${target.search}`,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        let data = {};
        if (raw) {
          try {
            data = JSON.parse(raw);
          } catch (err) {
            data = {};
          }
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          let message = data?.error || data?.message || 'Erro ao consultar DataJud.';
          if (typeof message !== 'string') {
            try {
              message = JSON.stringify(message);
            } catch (_) {
              message = 'Erro ao consultar DataJud.';
            }
          }
          const error = new Error(message);
          error.status = res.statusCode;
          error.data = data;
          return reject(error);
        }
        return resolve(data);
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function fetchProcessoMovimentos(cnjParts) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('DATAJUD_API_KEY não configurada.');
  }

  const alias = tribunalAliasFromCnj(cnjParts);
  if (!alias) {
    throw new Error('Tribunal não suportado pelo DataJud.');
  }

  const numeroProcesso = formatCnjDigits(cnjParts);
  if (!numeroProcesso) {
    throw new Error('Número CNJ inválido.');
  }

  const data = await postJson(
    buildEndpoint(alias),
    { Authorization: `ApiKey ${apiKey}` },
    buildMovementsQuery(numeroProcesso)
  );

  const hit = data?.hits?.hits?.[0]?._source || null;
  return { alias, numeroProcesso, hit };
}

module.exports = {
  fetchProcessoMovimentos,
};
