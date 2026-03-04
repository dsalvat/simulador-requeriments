-- Migration 001: Organizations + Formations
-- Run after init.sql

-- Organitzacions
CREATE TABLE IF NOT EXISTS organizations (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  INTEGER REFERENCES users(id)
);

-- Membres d'organització
CREATE TABLE IF NOT EXISTS organization_members (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            VARCHAR(20) NOT NULL DEFAULT 'alumne'
                  CHECK (role IN ('admin', 'professor', 'alumne')),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- Formacions (metadades; el contingut viu als fitxers JS)
CREATE TABLE IF NOT EXISTS formations (
  id          SERIAL PRIMARY KEY,
  slug        VARCHAR(100) UNIQUE NOT NULL,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Quines formacions pot usar cada organització
CREATE TABLE IF NOT EXISTS organization_formations (
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  formation_id    INTEGER NOT NULL REFERENCES formations(id) ON DELETE CASCADE,
  PRIMARY KEY (organization_id, formation_id)
);

-- Sessions: afegir org + formació
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS formation_slug VARCHAR(100);

-- Seed: formació actual
INSERT INTO formations (slug, name, description)
VALUES ('requeriments', 'Presa de Requeriments', 'Role play de presa de requeriments amb perfils d''usuari variats')
ON CONFLICT (slug) DO NOTHING;

-- Índexos
CREATE INDEX IF NOT EXISTS idx_orgmembers_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_orgmembers_org ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_sessions_org ON sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_sessions_formation ON sessions(formation_slug);
