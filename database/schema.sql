-- Schema do Meu CRM

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  email VARCHAR(120) UNIQUE NOT NULL,
  usuario VARCHAR(80),
  oauth_provider VARCHAR(20),
  oauth_sub VARCHAR(255),
  senha_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS clientes (
  id SERIAL PRIMARY KEY,
  escritorio_id INTEGER REFERENCES escritorios(id) ON DELETE CASCADE,
  nome VARCHAR(120) NOT NULL,
  cpf TEXT,
  telefone TEXT,
  email VARCHAR(120),
  acesso_gov TEXT,
  cep TEXT,
  cpf_responsavel TEXT,
  cidade TEXT,
  dados_bancarios TEXT,
  data_chegada TEXT,
  data_nascimento TEXT,
  endereco TEXT,
  numero_casa TEXT,
  estado TEXT,
  estado_civil TEXT,
  filiacao TEXT,
  idade TEXT,
  link_pasta TEXT,
  nacionalidade TEXT,
  agencia TEXT,
  conta TEXT,
  banco TEXT,
  tipo_conta TEXT,
  parceiro TEXT,
  processos_notion TEXT,
  profissao TEXT,
  qualificacao TEXT,
  rg TEXT,
  responsavel TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'lead' CHECK (status IN ('lead', 'ativo', 'inativo')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS processos (
  id SERIAL PRIMARY KEY,
  escritorio_id INTEGER REFERENCES escritorios(id) ON DELETE CASCADE,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  numero_processo TEXT UNIQUE NOT NULL,
  cnj_ano INTEGER,
  cnj_tribunal INTEGER,
  cnj_sequencial INTEGER,
  ultima_movimentacao_em TIMESTAMPTZ,
  ultima_sincronizacao_em TIMESTAMPTZ,
  tem_novo_andamento BOOLEAN NOT NULL DEFAULT false,
  area TEXT,
  fase TEXT,
  status TEXT,
  orgao TEXT,
  percentual TEXT,
  abrir_conta TEXT,
  aceitar_acordo TEXT,
  ano TEXT,
  atividades_notion TEXT,
  audiencia TEXT,
  cidade TEXT,
  classe TEXT,
  comissao TEXT,
  conta_aberta TEXT,
  distribuicao TEXT,
  embargos_declaracao TEXT,
  estado TEXT,
  grau TEXT,
  honorario_adm TEXT,
  honorarios TEXT,
  honorarios_liquidos TEXT,
  informar_cliente TEXT,
  juizo TEXT,
  manifestar_ciencia TEXT,
  mes TEXT,
  parceiro TEXT,
  parte_contraria TEXT,
  pericia TEXT,
  place TEXT,
  prazo TEXT,
  previsao TEXT,
  proveito_economico TEXT,
  proveito_pago TEXT,
  recurso_inominado TEXT,
  repassado TEXT,
  repasse TEXT,
  responder_cliente TEXT,
  resultado TEXT,
  replica TEXT,
  sistema TEXT,
  situacao TEXT,
  status_pagamento TEXT,
  vara TEXT,
  ultima_edicao TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS atividades (
  id SERIAL PRIMARY KEY,
  escritorio_id INTEGER REFERENCES escritorios(id) ON DELETE CASCADE,
  processo_id INTEGER REFERENCES processos(id) ON DELETE SET NULL,
  responsavel_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  titulo VARCHAR(200) NOT NULL,
  descricao TEXT,
  cliente_nome TEXT,
  processo_numero TEXT,
  categoria TEXT,
  orientacoes TEXT,
  responsavel_nome TEXT,
  prioridade_notion TEXT,
  data_notion TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'a_fazer' CHECK (status IN ('a_fazer', 'fazendo', 'feito', 'cancelado')),
  prioridade VARCHAR(10) NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa', 'media', 'alta')),
  prazo DATE,
  prazo_hora TEXT,
  concluida_em TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documentos (
  id SERIAL PRIMARY KEY,
  processo_id INTEGER NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  nome_original VARCHAR(255) NOT NULL,
  caminho VARCHAR(255) NOT NULL,
  tamanho INTEGER NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documentos_modelos (
  id SERIAL PRIMARY KEY,
  escritorio_id INTEGER REFERENCES escritorios(id) ON DELETE CASCADE,
  nome VARCHAR(120) NOT NULL,
  nome_original VARCHAR(255) NOT NULL,
  caminho VARCHAR(255) NOT NULL,
  tamanho INTEGER NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS escritorio_areas_atuacao (
  id SERIAL PRIMARY KEY,
  escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS escritorio_oabs_djen (
  id SERIAL PRIMARY KEY,
  escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  numero VARCHAR(20) NOT NULL,
  uf CHAR(2) NOT NULL,
  etiqueta TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS escritorio_config (
  escritorio_id INTEGER PRIMARY KEY REFERENCES escritorios(id) ON DELETE CASCADE,
  nome_exibicao TEXT,
  djen_uf_padrao CHAR(2) DEFAULT 'BA',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS processo_andamentos (
  id SERIAL PRIMARY KEY,
  processo_id INTEGER NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  fonte TEXT NOT NULL DEFAULT 'datajud',
  numero_processo TEXT,
  tribunal_alias TEXT,
  data_ultima_movimentacao TIMESTAMPTZ,
  payload JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS processo_andamentos_logs (
  id SERIAL PRIMARY KEY,
  processo_id INTEGER REFERENCES processos(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  mensagem TEXT,
  numero_processo TEXT,
  tribunal_alias TEXT,
  payload JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS financeiro_lancamentos (
  id SERIAL PRIMARY KEY,
  escritorio_id INTEGER REFERENCES escritorios(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_processos_cliente_id ON processos(cliente_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_usuario_unique ON usuarios(LOWER(usuario)) WHERE usuario IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_oauth_unique ON usuarios(oauth_provider, oauth_sub) WHERE oauth_provider IS NOT NULL AND oauth_sub IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_membros_escritorio_usuario_id ON membros_escritorio(usuario_id);
CREATE INDEX IF NOT EXISTS idx_cadastro_verificacoes_email_created ON cadastro_verificacoes(LOWER(email), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cadastro_verificacoes_expires_at ON cadastro_verificacoes(expires_at);
CREATE INDEX IF NOT EXISTS idx_clientes_escritorio_id ON clientes(escritorio_id);
CREATE INDEX IF NOT EXISTS idx_processos_escritorio_id ON processos(escritorio_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_escritorio_areas_nome_unique ON escritorio_areas_atuacao(escritorio_id, LOWER(nome));
CREATE INDEX IF NOT EXISTS idx_escritorio_areas_ordem ON escritorio_areas_atuacao(escritorio_id, ordem, nome);
CREATE UNIQUE INDEX IF NOT EXISTS idx_escritorio_oabs_unique ON escritorio_oabs_djen(escritorio_id, numero, uf);
CREATE INDEX IF NOT EXISTS idx_escritorio_oabs_ativo ON escritorio_oabs_djen(escritorio_id, ativo, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_escritorio_procedimentos_ordem ON escritorio_procedimentos(escritorio_id, ordem, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_atividades_processo_id ON atividades(processo_id);
CREATE INDEX IF NOT EXISTS idx_atividades_escritorio_id ON atividades(escritorio_id);
CREATE INDEX IF NOT EXISTS idx_atividades_prazo ON atividades(prazo);
CREATE INDEX IF NOT EXISTS idx_atividades_status ON atividades(status);
CREATE INDEX IF NOT EXISTS idx_documentos_processo_id ON documentos(processo_id);
CREATE INDEX IF NOT EXISTS idx_documentos_modelos_nome ON documentos_modelos(nome);
CREATE INDEX IF NOT EXISTS idx_documentos_modelos_escritorio_id ON documentos_modelos(escritorio_id);
CREATE INDEX IF NOT EXISTS idx_processo_andamentos_processo_id ON processo_andamentos(processo_id);
CREATE INDEX IF NOT EXISTS idx_processo_andamentos_data_ultima ON processo_andamentos(data_ultima_movimentacao);
CREATE INDEX IF NOT EXISTS idx_processo_andamentos_logs_processo_id ON processo_andamentos_logs(processo_id);
CREATE INDEX IF NOT EXISTS idx_financeiro_lancamentos_processo_id ON financeiro_lancamentos(processo_id);
CREATE INDEX IF NOT EXISTS idx_financeiro_lancamentos_cliente_id ON financeiro_lancamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_financeiro_lancamentos_escritorio_id ON financeiro_lancamentos(escritorio_id);
CREATE INDEX IF NOT EXISTS idx_financeiro_divisoes_lancamento_id ON financeiro_divisoes(lancamento_id);
