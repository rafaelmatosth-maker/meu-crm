CREATE TABLE IF NOT EXISTS chat_conversas (
  id SERIAL PRIMARY KEY,
  escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('direta', 'grupo')),
  titulo TEXT,
  criada_por_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_participantes (
  id SERIAL PRIMARY KEY,
  conversa_id INTEGER NOT NULL REFERENCES chat_conversas(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  ultimo_lido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversa_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS chat_mensagens (
  id SERIAL PRIMARY KEY,
  conversa_id INTEGER NOT NULL REFERENCES chat_conversas(id) ON DELETE CASCADE,
  autor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  texto TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS chat_anexos (
  id SERIAL PRIMARY KEY,
  mensagem_id INTEGER NOT NULL REFERENCES chat_mensagens(id) ON DELETE CASCADE,
  nome_original VARCHAR(255) NOT NULL,
  caminho VARCHAR(255) NOT NULL,
  tamanho INTEGER NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_conversa_geral_por_escritorio
ON chat_conversas(escritorio_id)
WHERE tipo = 'grupo' AND titulo = 'Geral';

CREATE INDEX IF NOT EXISTS idx_chat_conversas_escritorio_updated
ON chat_conversas(escritorio_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_participantes_usuario
ON chat_participantes(usuario_id, conversa_id);

CREATE INDEX IF NOT EXISTS idx_chat_mensagens_conversa_created
ON chat_mensagens(conversa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_anexos_mensagem
ON chat_anexos(mensagem_id);

INSERT INTO chat_conversas (escritorio_id, tipo, titulo)
SELECT e.id, 'grupo', 'Geral'
FROM escritorios e
ON CONFLICT DO NOTHING;

INSERT INTO chat_participantes (conversa_id, usuario_id)
SELECT c.id, me.usuario_id
FROM chat_conversas c
JOIN membros_escritorio me ON me.escritorio_id = c.escritorio_id
WHERE c.tipo = 'grupo' AND c.titulo = 'Geral'
ON CONFLICT (conversa_id, usuario_id) DO NOTHING;
