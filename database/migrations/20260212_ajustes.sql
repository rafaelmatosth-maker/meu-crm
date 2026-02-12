ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS usuario VARCHAR(80);
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_usuario_unique
ON usuarios (LOWER(usuario))
WHERE usuario IS NOT NULL;

CREATE TABLE IF NOT EXISTS escritorio_areas_atuacao (
  id SERIAL PRIMARY KEY,
  escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_escritorio_areas_nome_unique
ON escritorio_areas_atuacao (escritorio_id, LOWER(nome));

CREATE INDEX IF NOT EXISTS idx_escritorio_areas_ordem
ON escritorio_areas_atuacao (escritorio_id, ordem, nome);

CREATE TABLE IF NOT EXISTS escritorio_oabs_djen (
  id SERIAL PRIMARY KEY,
  escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  numero VARCHAR(20) NOT NULL,
  uf CHAR(2) NOT NULL,
  etiqueta TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_escritorio_oabs_unique
ON escritorio_oabs_djen (escritorio_id, numero, uf);

CREATE INDEX IF NOT EXISTS idx_escritorio_oabs_ativo
ON escritorio_oabs_djen (escritorio_id, ativo, created_at DESC);

CREATE TABLE IF NOT EXISTS escritorio_procedimentos (
  id SERIAL PRIMARY KEY,
  escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descricao TEXT,
  anexo_nome_original TEXT,
  anexo_caminho TEXT,
  anexo_mime_type TEXT,
  anexo_tamanho INTEGER,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_escritorio_procedimentos_ordem
ON escritorio_procedimentos (escritorio_id, ordem, created_at DESC);

CREATE TABLE IF NOT EXISTS escritorio_config (
  escritorio_id INTEGER PRIMARY KEY REFERENCES escritorios(id) ON DELETE CASCADE,
  nome_exibicao TEXT,
  djen_uf_padrao CHAR(2) DEFAULT 'BA',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO escritorio_areas_atuacao (escritorio_id, nome, ordem, ativo)
SELECT e.id, v.nome, v.ordem, true
FROM escritorios e
CROSS JOIN (
  VALUES
    ('Cível', 1),
    ('Previdenciário', 2),
    ('Trabalhista', 3),
    ('Consumidor', 4),
    ('Família', 5),
    ('Criminal', 6)
) AS v(nome, ordem)
WHERE NOT EXISTS (
  SELECT 1
  FROM escritorio_areas_atuacao a
  WHERE a.escritorio_id = e.id
);

INSERT INTO escritorio_config (escritorio_id, nome_exibicao, djen_uf_padrao)
SELECT e.id, e.nome, 'BA'
FROM escritorios e
WHERE NOT EXISTS (
  SELECT 1
  FROM escritorio_config c
  WHERE c.escritorio_id = e.id
);
