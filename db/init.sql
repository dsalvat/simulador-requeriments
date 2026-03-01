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

-- Game sessions
CREATE TABLE IF NOT EXISTS sessions (
  id            SERIAL PRIMARY KEY,
  created_by    INTEGER NOT NULL REFERENCES users(id),
  status        VARCHAR(20) NOT NULL DEFAULT 'created'
                CHECK (status IN ('created', 'active', 'finished')),
  duration_min  INTEGER NOT NULL DEFAULT 15,
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions (status);

-- Session participants and scores
CREATE TABLE IF NOT EXISTS session_participants (
  id              SERIAL PRIMARY KEY,
  session_id      INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  persona_id      VARCHAR(50) NOT NULL,
  score           INTEGER NOT NULL DEFAULT 0,
  completed_items TEXT[] DEFAULT '{}',
  evaluation      TEXT,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  UNIQUE(session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_sp_session ON session_participants (session_id);
CREATE INDEX IF NOT EXISTS idx_sp_score ON session_participants (session_id, score DESC);
