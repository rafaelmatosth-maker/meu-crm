-- OAuth Google/Apple (iCloud)

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(20);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS oauth_sub VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_oauth_unique
  ON usuarios (oauth_provider, oauth_sub)
  WHERE oauth_provider IS NOT NULL AND oauth_sub IS NOT NULL;
