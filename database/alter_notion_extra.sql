-- Ajustes adicionais para importar dados do Notion

ALTER TABLE clientes
  ALTER COLUMN nome TYPE TEXT,
  ALTER COLUMN cpf TYPE TEXT,
  ALTER COLUMN telefone TYPE TEXT;

ALTER TABLE processos
  ALTER COLUMN numero_processo TYPE TEXT,
  ALTER COLUMN area TYPE TEXT,
  ALTER COLUMN fase TYPE TEXT,
  ALTER COLUMN status TYPE TEXT,
  ALTER COLUMN orgao TYPE TEXT;
