CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  name          VARCHAR(255),
  avatar_url    TEXT,
  role          VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login    TIMESTAMPTZ,
  invited_by    VARCHAR(255)
);

-- Seed admin
INSERT INTO users (email, name, role, active)
VALUES ('daniel.salvat@gmail.com', 'Daniel Salvat', 'admin', true)
ON CONFLICT (email) DO NOTHING;

-- Index for fast email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
