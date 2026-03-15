ALTER TABLE escritorio_config
ADD COLUMN IF NOT EXISTS tema TEXT;

ALTER TABLE escritorio_config
ALTER COLUMN tema SET DEFAULT 'classic';

UPDATE escritorio_config
SET tema = 'classic'
WHERE tema IS NULL OR tema = '';

ALTER TABLE escritorio_config
ALTER COLUMN tema SET NOT NULL;
