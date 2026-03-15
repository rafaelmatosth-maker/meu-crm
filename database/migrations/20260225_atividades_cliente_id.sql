ALTER TABLE atividades
  ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL;

UPDATE atividades a
SET cliente_id = p.cliente_id
FROM processos p
WHERE a.cliente_id IS NULL
  AND a.processo_id = p.id;

CREATE INDEX IF NOT EXISTS idx_atividades_cliente_id ON atividades(cliente_id);
