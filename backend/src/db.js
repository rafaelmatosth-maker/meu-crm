const { Pool } = require('pg');

const connectionTimeoutMillis = Number(process.env.DB_CONNECT_TIMEOUT_MS || 8000);

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis,
    })
  : new Pool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectionTimeoutMillis,
    });

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
