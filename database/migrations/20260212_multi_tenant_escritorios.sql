-- Multi-tenant: escritorios + membros + segregacao por escritorio

CREATE TABLE IF NOT EXISTS escritorios (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  slug TEXT UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS membros_escritorio (
  id SERIAL PRIMARY KEY,
  escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  papel TEXT NOT NULL CHECK (papel IN ('owner', 'admin', 'colaborador')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (escritorio_id, usuario_id)
);

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS escritorio_id INTEGER REFERENCES escritorios(id) ON DELETE CASCADE;
ALTER TABLE processos ADD COLUMN IF NOT EXISTS escritorio_id INTEGER REFERENCES escritorios(id) ON DELETE CASCADE;
ALTER TABLE atividades ADD COLUMN IF NOT EXISTS escritorio_id INTEGER REFERENCES escritorios(id) ON DELETE CASCADE;
ALTER TABLE financeiro_lancamentos ADD COLUMN IF NOT EXISTS escritorio_id INTEGER REFERENCES escritorios(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_membros_escritorio_usuario_id ON membros_escritorio(usuario_id);
CREATE INDEX IF NOT EXISTS idx_clientes_escritorio_id ON clientes(escritorio_id);
CREATE INDEX IF NOT EXISTS idx_processos_escritorio_id ON processos(escritorio_id);
CREATE INDEX IF NOT EXISTS idx_atividades_escritorio_id ON atividades(escritorio_id);
CREATE INDEX IF NOT EXISTS idx_financeiro_lancamentos_escritorio_id ON financeiro_lancamentos(escritorio_id);

-- Cria escritorio para usuarios sem associacao
INSERT INTO escritorios (nome, slug)
SELECT
  CASE
    WHEN NULLIF(trim(u.nome), '') IS NULL THEN 'Escritorio principal'
    ELSE 'Escritorio de ' || trim(u.nome)
  END,
  lower(regexp_replace(COALESCE(NULLIF(trim(u.nome), ''), 'escritorio-principal') || '-' || u.id::text, '[^a-z0-9]+', '-', 'g'))
FROM usuarios u
WHERE NOT EXISTS (
  SELECT 1
  FROM membros_escritorio me
  WHERE me.usuario_id = u.id
);

INSERT INTO membros_escritorio (escritorio_id, usuario_id, papel)
SELECT e.id, u.id, 'owner'
FROM usuarios u
JOIN escritorios e ON e.slug = lower(regexp_replace(COALESCE(NULLIF(trim(u.nome), ''), 'escritorio-principal') || '-' || u.id::text, '[^a-z0-9]+', '-', 'g'))
WHERE NOT EXISTS (
  SELECT 1
  FROM membros_escritorio me
  WHERE me.usuario_id = u.id
);

-- Backfill legado para primeiro escritorio disponivel
WITH default_escritorio AS (
  SELECT id FROM escritorios ORDER BY id LIMIT 1
)
UPDATE clientes c
SET escritorio_id = d.id
FROM default_escritorio d
WHERE c.escritorio_id IS NULL;

UPDATE processos p
SET escritorio_id = COALESCE(c.escritorio_id, p.escritorio_id)
FROM clientes c
WHERE p.cliente_id = c.id
  AND p.escritorio_id IS NULL;

WITH default_escritorio AS (
  SELECT id FROM escritorios ORDER BY id LIMIT 1
)
UPDATE processos p
SET escritorio_id = d.id
FROM default_escritorio d
WHERE p.escritorio_id IS NULL;

UPDATE atividades a
SET escritorio_id = p.escritorio_id
FROM processos p
WHERE a.processo_id = p.id
  AND a.escritorio_id IS NULL;

WITH default_escritorio AS (
  SELECT id FROM escritorios ORDER BY id LIMIT 1
)
UPDATE atividades a
SET escritorio_id = d.id
FROM default_escritorio d
WHERE a.escritorio_id IS NULL;

UPDATE financeiro_lancamentos l
SET escritorio_id = COALESCE(p.escritorio_id, c.escritorio_id, l.escritorio_id)
FROM processos p
LEFT JOIN clientes c ON c.id = p.cliente_id
WHERE l.processo_id = p.id
  AND l.escritorio_id IS NULL;

UPDATE financeiro_lancamentos l
SET escritorio_id = COALESCE(c.escritorio_id, l.escritorio_id)
FROM clientes c
WHERE l.cliente_id = c.id
  AND l.escritorio_id IS NULL;

WITH default_escritorio AS (
  SELECT id FROM escritorios ORDER BY id LIMIT 1
)
UPDATE financeiro_lancamentos l
SET escritorio_id = d.id
FROM default_escritorio d
WHERE l.escritorio_id IS NULL;
