const crypto = require('crypto');

function toBase64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fromBase64Url(input) {
  const normalized = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  const padded = padding ? normalized + '='.repeat(4 - padding) : normalized;
  return Buffer.from(padded, 'base64');
}

function parseExpiresIn(expiresIn) {
  if (expiresIn === undefined || expiresIn === null || expiresIn === '') return null;
  if (typeof expiresIn === 'number' && Number.isFinite(expiresIn)) {
    return Math.max(0, Math.floor(expiresIn));
  }

  const raw = String(expiresIn).trim().toLowerCase();
  const match = raw.match(/^(\d+)\s*([smhd]?)$/i);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = (match[2] || 's').toLowerCase();
  if (!Number.isFinite(value)) return null;

  if (unit === 's') return value;
  if (unit === 'm') return value * 60;
  if (unit === 'h') return value * 60 * 60;
  if (unit === 'd') return value * 60 * 60 * 24;
  return null;
}

function sign(payload, secret, options = {}) {
  if (!secret) {
    throw new Error('JWT secret ausente.');
  }

  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload };
  if (!Number.isFinite(Number(body.iat))) {
    body.iat = now;
  }

  const expiresInSeconds = parseExpiresIn(options.expiresIn);
  if (expiresInSeconds !== null) {
    body.exp = now + expiresInSeconds;
  }

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(body));
  const content = `${encodedHeader}.${encodedPayload}`;
  const signature = toBase64Url(crypto.createHmac('sha256', secret).update(content).digest());
  return `${content}.${signature}`;
}

function verify(token, secret) {
  if (!secret) {
    throw new Error('JWT secret ausente.');
  }

  const parts = String(token || '').split('.');
  if (parts.length !== 3) {
    throw new Error('Token malformado.');
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  const content = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = toBase64Url(crypto.createHmac('sha256', secret).update(content).digest());
  const providedBuffer = Buffer.from(encodedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (providedBuffer.length !== expectedBuffer.length) {
    throw new Error('Assinatura inválida.');
  }
  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new Error('Assinatura inválida.');
  }

  const payloadRaw = fromBase64Url(encodedPayload).toString('utf8');
  let payload;
  try {
    payload = JSON.parse(payloadRaw);
  } catch (_) {
    throw new Error('Payload inválido.');
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp !== undefined && Number(payload.exp) <= now) {
    throw new Error('Token expirado.');
  }

  return payload;
}

module.exports = {
  sign,
  verify,
};
