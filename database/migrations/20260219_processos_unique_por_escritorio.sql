-- Permite o mesmo numero de processo em escritorios diferentes.
-- Antes: unico global em processos.numero_processo.
-- Agora: unico por (escritorio_id, numero_processo).

ALTER TABLE processos
  DROP CONSTRAINT IF EXISTS processos_numero_processo_key;

DROP INDEX IF EXISTS processes_numero_processo_key;
DROP INDEX IF EXISTS idx_processos_numero_processo_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_processos_escritorio_numero_unique
  ON processos(escritorio_id, numero_processo);
