-- Estrutura financeira separada
CREATE TABLE IF NOT EXISTS financeiro_lancamentos (
  id SERIAL PRIMARY KEY,
  processo_id INTEGER REFERENCES processos(id) ON DELETE SET NULL,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  descricao TEXT,
  valor_base TEXT,
  percentual TEXT,
  honorarios_calculados TEXT,
  repasse_calculado TEXT,
  previsao_pagamento_mes TEXT,
  pago TEXT,
  repassado TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS financeiro_divisoes (
  id SERIAL PRIMARY KEY,
  lancamento_id INTEGER NOT NULL REFERENCES financeiro_lancamentos(id) ON DELETE CASCADE,
  parte TEXT NOT NULL,
  percentual TEXT,
  valor TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financeiro_lancamentos_processo_id ON financeiro_lancamentos(processo_id);
CREATE INDEX IF NOT EXISTS idx_financeiro_lancamentos_cliente_id ON financeiro_lancamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_financeiro_divisoes_lancamento_id ON financeiro_divisoes(lancamento_id);

ALTER TABLE financeiro_lancamentos ADD COLUMN IF NOT EXISTS cliente_id INTEGER;
ALTER TABLE financeiro_lancamentos DROP CONSTRAINT IF EXISTS financeiro_lancamentos_processo_id_fkey;
ALTER TABLE financeiro_lancamentos ALTER COLUMN processo_id DROP NOT NULL;
ALTER TABLE financeiro_lancamentos
  ADD CONSTRAINT financeiro_lancamentos_processo_id_fkey
  FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE SET NULL;
UPDATE financeiro_lancamentos l
SET cliente_id = p.cliente_id
FROM processos p
WHERE l.cliente_id IS NULL AND l.processo_id = p.id;

-- Migração inicial (executar uma vez)
INSERT INTO financeiro_lancamentos (
  processo_id,
  cliente_id,
  tipo,
  descricao,
  valor_base,
  percentual,
  honorarios_calculados,
  repasse_calculado,
  previsao_pagamento_mes,
  pago,
  repassado
)
SELECT
  id AS processo_id,
  cliente_id AS cliente_id,
  'proveito_economico' AS tipo,
  'Migrado do processo' AS descricao,
  proveito_economico AS valor_base,
  percentual,
  honorarios AS honorarios_calculados,
  repasse AS repasse_calculado,
  previsao AS previsao_pagamento_mes,
  proveito_pago AS pago,
  repassado
FROM processos
WHERE proveito_economico IS NOT NULL
   OR honorarios IS NOT NULL
   OR repasse IS NOT NULL;
