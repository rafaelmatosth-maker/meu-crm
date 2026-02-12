-- Cadastro com verificação de e-mail (OTP)

CREATE TABLE IF NOT EXISTS cadastro_verificacoes (
  id SERIAL PRIMARY KEY,
  email VARCHAR(120) NOT NULL,
  codigo_hash VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  tentativas INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cadastro_verificacoes_email_created
  ON cadastro_verificacoes(LOWER(email), created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cadastro_verificacoes_expires_at
  ON cadastro_verificacoes(expires_at);
