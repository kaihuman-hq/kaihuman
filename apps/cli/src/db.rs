use anyhow::Result;
use rusqlite::{params, Connection};
use std::path::Path;

pub struct Cache {
    conn: Connection,
}

impl Cache {
    pub fn open(config_dir: &Path) -> Result<Self> {
        let conn = Connection::open(config_dir.join("cache.db"))?;
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             CREATE TABLE IF NOT EXISTS files (
                 owner  TEXT NOT NULL,
                 repo   TEXT NOT NULL,
                 path   TEXT NOT NULL,
                 is_dir INTEGER NOT NULL DEFAULT 0,
                 PRIMARY KEY (owner, repo, path)
             );
             CREATE TABLE IF NOT EXISTS meta (
                 owner     TEXT NOT NULL,
                 repo      TEXT NOT NULL,
                 last_sync INTEGER NOT NULL DEFAULT 0,
                 PRIMARY KEY (owner, repo)
             );",
        )?;
        Ok(Self { conn })
    }

    pub fn has_cache(&self, owner: &str, repo: &str) -> bool {
        self.conn
            .query_row(
                "SELECT COUNT(*) FROM files WHERE owner=?1 AND repo=?2",
                params![owner, repo],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0)
            > 0
    }

    pub fn get_files(&self, owner: &str, repo: &str) -> Vec<(String, bool)> {
        let Ok(mut stmt) = self.conn.prepare(
            "SELECT path, is_dir FROM files WHERE owner=?1 AND repo=?2 ORDER BY path",
        ) else {
            return vec![];
        };
        stmt.query_map(params![owner, repo], |row| {
            let path: String = row.get(0)?;
            let is_dir: i64 = row.get(1)?;
            Ok((path, is_dir != 0))
        })
        .map(|rows| rows.flatten().collect())
        .unwrap_or_default()
    }

    /// Replace the cached file tree for a repo atomically.
    pub fn set_files(&mut self, owner: &str, repo: &str, files: &[(String, bool)]) -> Result<()> {
        let tx = self.conn.transaction()?;
        tx.execute(
            "DELETE FROM files WHERE owner=?1 AND repo=?2",
            params![owner, repo],
        )?;
        for (path, is_dir) in files {
            tx.execute(
                "INSERT OR REPLACE INTO files (owner, repo, path, is_dir) VALUES (?1,?2,?3,?4)",
                params![owner, repo, path, *is_dir as i64],
            )?;
        }
        tx.execute(
            "INSERT OR REPLACE INTO meta (owner, repo, last_sync) \
             VALUES (?1, ?2, strftime('%s','now'))",
            params![owner, repo],
        )?;
        tx.commit()?;
        Ok(())
    }
}
