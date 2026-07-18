CREATE TABLE IF NOT EXISTS session_snapshots (
  session_pin TEXT PRIMARY KEY,
  session_id TEXT,
  snapshot_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

