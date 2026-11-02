CREATE TABLE files (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, label TEXT NOT NULL, business TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('pdf','xml')), size INTEGER NOT NULL, created_at TEXT NOT NULL, expires_at TEXT, revoked_at TEXT);
CREATE INDEX files_user ON files(user_id, created_at);
CREATE TABLE events (id TEXT PRIMARY KEY, token TEXT NOT NULL, user_id INTEGER NOT NULL, at TEXT NOT NULL, client TEXT NOT NULL CHECK (client IN ('browser','bot','other')));
CREATE INDEX events_user ON events(user_id, at);
