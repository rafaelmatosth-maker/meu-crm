-- Enable unaccent extension for accent-insensitive search.
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
