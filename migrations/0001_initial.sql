CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  alias TEXT NOT NULL UNIQUE,
  pin_salt TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  removed_at INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  pin TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  ended_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sessions_pin_status ON sessions (pin, status);

CREATE TABLE IF NOT EXISTS session_participants (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'patient',
  device_id TEXT,
  joined_at INTEGER NOT NULL,
  left_at INTEGER,
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_session_participants_session ON session_participants (session_id);
CREATE INDEX IF NOT EXISTS idx_session_participants_account ON session_participants (account_id);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  scenario_id TEXT,
  app TEXT,
  pushed_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_account_mode ON assignments (account_id, mode, pushed_at);

CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  session_id TEXT,
  mode TEXT NOT NULL,
  scenario_id TEXT,
  started_at INTEGER,
  completed_at INTEGER NOT NULL,
  functional_json TEXT NOT NULL DEFAULT '{}',
  cognitive_json TEXT NOT NULL DEFAULT '{}',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_records_account_completed ON records (account_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_mode_scenario ON records (mode, scenario_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  account_id TEXT,
  actor TEXT,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_session_created ON audit_log (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_account_created ON audit_log (account_id, created_at DESC);
