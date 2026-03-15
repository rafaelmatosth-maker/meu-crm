const db = require('./db');

async function ensureEscritorios() {
  await db.query(
    `CREATE TABLE IF NOT EXISTS escritorios (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      slug TEXT UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );`
  );

  await db.query(
    `CREATE TABLE IF NOT EXISTS membros_escritorio (
      id SERIAL PRIMARY KEY,
      escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      papel TEXT NOT NULL CHECK (papel IN ('owner', 'admin', 'colaborador')),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (escritorio_id, usuario_id)
    );`
  );
  await db.query('ALTER TABLE membros_escritorio DROP CONSTRAINT IF EXISTS membros_escritorio_papel_check;');
  await db.query(
    `ALTER TABLE membros_escritorio
     ADD CONSTRAINT membros_escritorio_papel_check
     CHECK (papel IN ('owner', 'admin', 'colaborador', 'administrador', 'advogado', 'estagiario'));`
  );

  await db.query(
    `ALTER TABLE clientes
      ADD COLUMN IF NOT EXISTS escritorio_id INTEGER REFERENCES escritorios(id) ON DELETE CASCADE;`
  );
  await db.query(
    `ALTER TABLE processos
      ADD COLUMN IF NOT EXISTS escritorio_id INTEGER REFERENCES escritorios(id) ON DELETE CASCADE;`
  );
  await db.query(
    `ALTER TABLE atividades
      ADD COLUMN IF NOT EXISTS escritorio_id INTEGER REFERENCES escritorios(id) ON DELETE CASCADE;`
  );
  await db.query(
    `ALTER TABLE financeiro_lancamentos
      ADD COLUMN IF NOT EXISTS escritorio_id INTEGER REFERENCES escritorios(id) ON DELETE CASCADE;`
  );
  await db.query('ALTER TABLE processos DROP CONSTRAINT IF EXISTS processos_numero_processo_key;');
  await db.query('DROP INDEX IF EXISTS processes_numero_processo_key;');
  await db.query('DROP INDEX IF EXISTS idx_processos_numero_processo_unique;');

  await db.query('CREATE INDEX IF NOT EXISTS idx_membros_escritorio_usuario_id ON membros_escritorio(usuario_id);');
  await db.query('CREATE INDEX IF NOT EXISTS idx_clientes_escritorio_id ON clientes(escritorio_id);');
  await db.query('CREATE INDEX IF NOT EXISTS idx_processos_escritorio_id ON processos(escritorio_id);');
  await db.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_processos_escritorio_numero_unique ON processos(escritorio_id, numero_processo);'
  );
  await db.query('CREATE INDEX IF NOT EXISTS idx_atividades_escritorio_id ON atividades(escritorio_id);');
  await db.query(
    'CREATE INDEX IF NOT EXISTS idx_financeiro_lancamentos_escritorio_id ON financeiro_lancamentos(escritorio_id);'
  );

  await db.query(
    `INSERT INTO escritorios (nome, slug)
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
     );`
  );

  await db.query(
    `INSERT INTO membros_escritorio (escritorio_id, usuario_id, papel)
     SELECT e.id, u.id, 'owner'
     FROM usuarios u
     JOIN escritorios e ON e.slug = lower(regexp_replace(COALESCE(NULLIF(trim(u.nome), ''), 'escritorio-principal') || '-' || u.id::text, '[^a-z0-9]+', '-', 'g'))
     WHERE NOT EXISTS (
       SELECT 1
       FROM membros_escritorio me
       WHERE me.usuario_id = u.id
     );`
  );

  const defaultOffice = await db.query('SELECT id FROM escritorios ORDER BY id LIMIT 1');
  if (!defaultOffice.rows.length) {
    return;
  }
  const defaultEscritorioId = defaultOffice.rows[0].id;

  await db.query(
    `INSERT INTO membros_escritorio (escritorio_id, usuario_id, papel)
     SELECT $1, u.id, 'owner'
     FROM usuarios u
     WHERE NOT EXISTS (
       SELECT 1
       FROM membros_escritorio me
       WHERE me.usuario_id = u.id
     );`,
    [defaultEscritorioId]
  );

  await db.query('UPDATE clientes SET escritorio_id = $1 WHERE escritorio_id IS NULL', [defaultEscritorioId]);
  await db.query(
    `UPDATE processos p
     SET escritorio_id = COALESCE(c.escritorio_id, $1)
     FROM clientes c
     WHERE p.escritorio_id IS NULL
       AND p.cliente_id = c.id`,
    [defaultEscritorioId]
  );
  await db.query('UPDATE processos SET escritorio_id = $1 WHERE escritorio_id IS NULL', [defaultEscritorioId]);
  await db.query(
    `UPDATE atividades a
     SET escritorio_id = COALESCE(p.escritorio_id, $1)
     FROM processos p
     WHERE a.escritorio_id IS NULL
       AND a.processo_id = p.id`,
    [defaultEscritorioId]
  );
  await db.query('UPDATE atividades SET escritorio_id = $1 WHERE escritorio_id IS NULL', [defaultEscritorioId]);
  await db.query(
    `UPDATE financeiro_lancamentos l
     SET escritorio_id = COALESCE(p.escritorio_id, c.escritorio_id, $1)
     FROM processos p
     LEFT JOIN clientes c ON c.id = p.cliente_id
     WHERE l.escritorio_id IS NULL
       AND l.processo_id = p.id`,
    [defaultEscritorioId]
  );
  await db.query(
    `UPDATE financeiro_lancamentos l
     SET escritorio_id = COALESCE(c.escritorio_id, $1)
     FROM clientes c
     WHERE l.escritorio_id IS NULL
       AND l.cliente_id = c.id`,
    [defaultEscritorioId]
  );
  await db.query('UPDATE financeiro_lancamentos SET escritorio_id = $1 WHERE escritorio_id IS NULL', [defaultEscritorioId]);
}

async function ensureAjustes() {
  await db.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS usuario VARCHAR(80);`);
  await db.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(20);`);
  await db.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS oauth_sub VARCHAR(255);`);
  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_usuario_unique
     ON usuarios (LOWER(usuario))
     WHERE usuario IS NOT NULL;`
  );
  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_oauth_unique
     ON usuarios (oauth_provider, oauth_sub)
     WHERE oauth_provider IS NOT NULL AND oauth_sub IS NOT NULL;`
  );

  await db.query(
    `CREATE TABLE IF NOT EXISTS escritorio_areas_atuacao (
      id SERIAL PRIMARY KEY,
      escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
      nome TEXT NOT NULL,
      ordem INTEGER NOT NULL DEFAULT 0,
      ativo BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );`
  );
  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_escritorio_areas_nome_unique
     ON escritorio_areas_atuacao (escritorio_id, LOWER(nome));`
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_escritorio_areas_ordem
     ON escritorio_areas_atuacao (escritorio_id, ordem, nome);`
  );

  await db.query(
    `CREATE TABLE IF NOT EXISTS escritorio_oabs_djen (
      id SERIAL PRIMARY KEY,
      escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
      numero VARCHAR(20) NOT NULL,
      uf CHAR(2) NOT NULL,
      etiqueta TEXT,
      ativo BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );`
  );
  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_escritorio_oabs_unique
     ON escritorio_oabs_djen (escritorio_id, numero, uf);`
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_escritorio_oabs_ativo
     ON escritorio_oabs_djen (escritorio_id, ativo, created_at DESC);`
  );

  await db.query(
    `CREATE TABLE IF NOT EXISTS escritorio_procedimentos (
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
    );`
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_escritorio_procedimentos_ordem
     ON escritorio_procedimentos (escritorio_id, ordem, created_at DESC);`
  );

  await db.query(
    `CREATE TABLE IF NOT EXISTS escritorio_config (
      escritorio_id INTEGER PRIMARY KEY REFERENCES escritorios(id) ON DELETE CASCADE,
      nome_exibicao TEXT,
      djen_uf_padrao CHAR(2) DEFAULT 'BA',
      tema TEXT NOT NULL DEFAULT 'classic',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );`
  );
  await db.query(
    `ALTER TABLE escritorio_config
     ADD COLUMN IF NOT EXISTS tema TEXT;`
  );
  await db.query(
    `ALTER TABLE escritorio_config
     ALTER COLUMN tema SET DEFAULT 'classic';`
  );
  await db.query(
    `UPDATE escritorio_config
     SET tema = 'classic'
     WHERE tema IS NULL OR tema = '';`
  );
  await db.query(
    `ALTER TABLE escritorio_config
     ALTER COLUMN tema SET NOT NULL;`
  );

  await db.query(
    `INSERT INTO escritorio_areas_atuacao (escritorio_id, nome, ordem, ativo)
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
     );`
  );

  await db.query(
    `INSERT INTO escritorio_config (escritorio_id, nome_exibicao, djen_uf_padrao)
     SELECT e.id, e.nome, 'BA'
     FROM escritorios e
     WHERE NOT EXISTS (
       SELECT 1 FROM escritorio_config c WHERE c.escritorio_id = e.id
     );`
  );
}

async function ensureCadastroVerificacoes() {
  await db.query(
    `CREATE TABLE IF NOT EXISTS cadastro_verificacoes (
      id SERIAL PRIMARY KEY,
      email VARCHAR(120) NOT NULL,
      codigo_hash VARCHAR(255) NOT NULL,
      payload JSONB NOT NULL,
      tentativas INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );`
  );
  await db.query(
    'CREATE INDEX IF NOT EXISTS idx_cadastro_verificacoes_email_created ON cadastro_verificacoes (LOWER(email), created_at DESC);'
  );
  await db.query(
    'CREATE INDEX IF NOT EXISTS idx_cadastro_verificacoes_expires_at ON cadastro_verificacoes (expires_at);'
  );
}

async function ensureChat() {
  await db.query(
    `CREATE TABLE IF NOT EXISTS chat_conversas (
      id SERIAL PRIMARY KEY,
      escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL CHECK (tipo IN ('direta', 'grupo')),
      titulo TEXT,
      criada_por_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`
  );

  await db.query(
    `CREATE TABLE IF NOT EXISTS chat_participantes (
      id SERIAL PRIMARY KEY,
      conversa_id INTEGER NOT NULL REFERENCES chat_conversas(id) ON DELETE CASCADE,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      ultimo_lido_em TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (conversa_id, usuario_id)
    );`
  );

  await db.query(
    `CREATE TABLE IF NOT EXISTS chat_mensagens (
      id SERIAL PRIMARY KEY,
      conversa_id INTEGER NOT NULL REFERENCES chat_conversas(id) ON DELETE CASCADE,
      autor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      texto TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );`
  );

  await db.query(
    `CREATE TABLE IF NOT EXISTS chat_anexos (
      id SERIAL PRIMARY KEY,
      mensagem_id INTEGER NOT NULL REFERENCES chat_mensagens(id) ON DELETE CASCADE,
      nome_original VARCHAR(255) NOT NULL,
      caminho VARCHAR(255) NOT NULL,
      tamanho INTEGER NOT NULL,
      mime_type VARCHAR(120) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`
  );

  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_conversa_geral_por_escritorio
     ON chat_conversas (escritorio_id)
     WHERE tipo = 'grupo' AND titulo = 'Geral';`
  );
  await db.query(
    'CREATE INDEX IF NOT EXISTS idx_chat_conversas_escritorio_updated ON chat_conversas(escritorio_id, updated_at DESC);'
  );
  await db.query(
    'CREATE INDEX IF NOT EXISTS idx_chat_participantes_usuario ON chat_participantes(usuario_id, conversa_id);'
  );
  await db.query(
    'CREATE INDEX IF NOT EXISTS idx_chat_mensagens_conversa_created ON chat_mensagens(conversa_id, created_at DESC);'
  );
  await db.query(
    'CREATE INDEX IF NOT EXISTS idx_chat_anexos_mensagem ON chat_anexos(mensagem_id);'
  );

  await db.query(
    `INSERT INTO chat_conversas (escritorio_id, tipo, titulo)
     SELECT e.id, 'grupo', 'Geral'
     FROM escritorios e
     ON CONFLICT DO NOTHING;`
  );

  await db.query(
    `INSERT INTO chat_participantes (conversa_id, usuario_id)
     SELECT c.id, me.usuario_id
     FROM chat_conversas c
     JOIN membros_escritorio me ON me.escritorio_id = c.escritorio_id
     WHERE c.tipo = 'grupo' AND c.titulo = 'Geral'
     ON CONFLICT (conversa_id, usuario_id) DO NOTHING;`
  );
}

async function ensureSequences() {
  const serialTables = [
    ['usuarios', 'id'],
    ['escritorios', 'id'],
    ['membros_escritorio', 'id'],
    ['clientes', 'id'],
    ['processos', 'id'],
    ['atividades', 'id'],
    ['documentos', 'id'],
    ['documentos_modelos', 'id'],
    ['processo_andamentos', 'id'],
    ['processo_andamentos_logs', 'id'],
    ['financeiro_lancamentos', 'id'],
    ['financeiro_divisoes', 'id'],
    ['escritorio_areas_atuacao', 'id'],
    ['escritorio_oabs_djen', 'id'],
    ['escritorio_procedimentos', 'id'],
    ['cadastro_verificacoes', 'id'],
    ['chat_conversas', 'id'],
    ['chat_participantes', 'id'],
    ['chat_mensagens', 'id'],
    ['chat_anexos', 'id'],
  ];

  for (const [table, column] of serialTables) {
    await db.query(
      `SELECT setval(
        pg_get_serial_sequence($1, $2),
        COALESCE((SELECT MAX(${column}) FROM ${table}), 1),
        true
      )`,
      [table, column]
    );
  }
}

async function initDatabase() {
  await ensureEscritorios();
  await ensureAjustes();
  await ensureCadastroVerificacoes();
  await ensureChat();

  await db.query(
    `UPDATE clientes
     SET qualificacao = trim(
       regexp_replace(
         concat_ws(
           ', ',
           concat_ws(
             ', ',
             nullif(trim(nome), ''),
             nullif(trim(nacionalidade), ''),
             nullif(trim(estado_civil), ''),
             nullif(trim(profissao), '')
           ),
           CASE
             WHEN data_nascimento IS NOT NULL THEN 'nascido(a) em ' || to_char(data_nascimento, 'DD/MM/YYYY')
           END,
           CASE
             WHEN nullif(trim(filiacao), '') IS NOT NULL THEN 'filho(a) de ' || trim(filiacao)
           END,
           CASE
             WHEN nullif(trim(rg), '') IS NOT NULL THEN 'portador(a) do RG ' || trim(rg)
           END,
           CASE
             WHEN nullif(trim(cpf), '') IS NOT NULL THEN 'CPF ' || trim(cpf)
           END,
           CASE
             WHEN (
               nullif(trim(endereco), '') IS NOT NULL
               OR nullif(trim(numero_casa), '') IS NOT NULL
               OR nullif(trim(cidade), '') IS NOT NULL
               OR nullif(trim(estado), '') IS NOT NULL
               OR nullif(trim(cep), '') IS NOT NULL
             ) THEN
               'residente e domiciliado(a) em '
               || concat_ws(
                 ', ',
                 concat_ws(', ', nullif(trim(endereco), ''), nullif(trim(numero_casa), '')),
                 concat_ws(' - ', nullif(trim(cidade), ''), nullif(trim(estado), '')),
                 CASE WHEN nullif(trim(cep), '') IS NOT NULL THEN 'CEP ' || trim(cep) END
               )
           END
         ),
         '\\s+,',
         ',',
         'g'
       )
     )
     WHERE (
       qualificacao IS NULL
       OR trim(qualificacao) = ''
       OR qualificacao ~* '(^|,)\\s*,'
       OR qualificacao ~* 'nascido\\s*\\(a\\)\\s*em\\s*,'
       OR qualificacao ~* 'filho\\s*\\(a\\)\\s*de\\s*,'
       OR qualificacao ~* 'sob o n[ºo]\\s*,'
       OR qualificacao ~* 'cpf\\s*,'
       OR qualificacao ~* 'residente e domiciliado\\s*\\(a\\)\\s*em\\s*,\\s*,'
     )
       AND coalesce(trim(nome), '') <> '';`
  );

  await db.query('ALTER TABLE atividades ALTER COLUMN processo_id DROP NOT NULL;');
  await db.query(
    `ALTER TABLE atividades
      ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL;`
  );
  await db.query(
    `UPDATE atividades a
     SET cliente_id = p.cliente_id
     FROM processos p
     WHERE a.cliente_id IS NULL
       AND a.processo_id = p.id
       AND p.escritorio_id = a.escritorio_id;`
  );
  await db.query('CREATE INDEX IF NOT EXISTS idx_atividades_cliente_id ON atividades(cliente_id);');
  await db.query(
    `ALTER TABLE processos
      ADD COLUMN IF NOT EXISTS ultima_movimentacao_em TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS ultima_sincronizacao_em TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS tem_novo_andamento BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS proveito_pago TEXT,
      ADD COLUMN IF NOT EXISTS recurso_inominado TEXT;`
  );

  await db.query(
    `CREATE TABLE IF NOT EXISTS processo_andamentos (
      id SERIAL PRIMARY KEY,
      processo_id INTEGER NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
      fonte TEXT NOT NULL DEFAULT 'datajud',
      numero_processo TEXT,
      tribunal_alias TEXT,
      data_ultima_movimentacao TIMESTAMPTZ,
      payload JSONB NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );`
  );

  await db.query(
    `CREATE TABLE IF NOT EXISTS processo_andamentos_logs (
      id SERIAL PRIMARY KEY,
      processo_id INTEGER REFERENCES processos(id) ON DELETE SET NULL,
      status TEXT NOT NULL,
      mensagem TEXT,
      numero_processo TEXT,
      tribunal_alias TEXT,
      payload JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );`
  );

  await db.query('CREATE INDEX IF NOT EXISTS idx_processo_andamentos_processo_id ON processo_andamentos(processo_id);');
  await db.query(
    'CREATE INDEX IF NOT EXISTS idx_processo_andamentos_data_ultima ON processo_andamentos(data_ultima_movimentacao);'
  );
  await db.query(
    'CREATE INDEX IF NOT EXISTS idx_processo_andamentos_logs_processo_id ON processo_andamentos_logs(processo_id);'
  );

  await db.query(
    `CREATE TABLE IF NOT EXISTS financeiro_lancamentos (
      id SERIAL PRIMARY KEY,
      processo_id INTEGER REFERENCES processos(id) ON DELETE SET NULL,
      cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
      escritorio_id INTEGER REFERENCES escritorios(id) ON DELETE CASCADE,
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
    );`
  );

  await db.query(
    `ALTER TABLE financeiro_lancamentos
      ADD COLUMN IF NOT EXISTS cliente_id INTEGER;`
  );
  await db.query(
    `ALTER TABLE financeiro_lancamentos
      ADD COLUMN IF NOT EXISTS escritorio_id INTEGER REFERENCES escritorios(id) ON DELETE CASCADE;`
  );
  await db.query(
    'ALTER TABLE financeiro_lancamentos ALTER COLUMN processo_id DROP NOT NULL;'
  );
  await db.query(
    `UPDATE financeiro_lancamentos l
     SET cliente_id = p.cliente_id
     FROM processos p
     WHERE l.cliente_id IS NULL AND l.processo_id = p.id;`
  );

  await db.query(
    `CREATE TABLE IF NOT EXISTS financeiro_divisoes (
      id SERIAL PRIMARY KEY,
      lancamento_id INTEGER NOT NULL REFERENCES financeiro_lancamentos(id) ON DELETE CASCADE,
      parte TEXT NOT NULL,
      percentual TEXT,
      valor TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );`
  );

  await db.query(
    'CREATE INDEX IF NOT EXISTS idx_financeiro_lancamentos_processo_id ON financeiro_lancamentos(processo_id);'
  );
  await db.query(
    'CREATE INDEX IF NOT EXISTS idx_financeiro_lancamentos_cliente_id ON financeiro_lancamentos(cliente_id);'
  );
  await db.query(
    'CREATE INDEX IF NOT EXISTS idx_financeiro_divisoes_lancamento_id ON financeiro_divisoes(lancamento_id);'
  );

  await ensureSequences();

  const finCount = await db.query('SELECT COUNT(*) FROM financeiro_lancamentos');
  const totalFin = Number(finCount.rows[0].count);
  if (totalFin === 0) {
    await db.query(
      `INSERT INTO financeiro_lancamentos (
        processo_id,
        cliente_id,
        escritorio_id,
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
        p.id AS processo_id,
        p.cliente_id AS cliente_id,
        p.escritorio_id AS escritorio_id,
        'proveito_economico' AS tipo,
        'Migrado do processo' AS descricao,
        p.proveito_economico AS valor_base,
        p.percentual,
        p.honorarios AS honorarios_calculados,
        p.repasse AS repasse_calculado,
        p.previsao AS previsao_pagamento_mes,
        p.proveito_pago AS pago,
        p.repassado
      FROM processos p
      WHERE p.proveito_economico IS NOT NULL
         OR p.honorarios IS NOT NULL
         OR p.repasse IS NOT NULL;`
    );
  }
}

module.exports = {
  initDatabase,
};
