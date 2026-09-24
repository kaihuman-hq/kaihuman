//! The repository's palette settings (`.kh/command-palette.settings.json`): its search engines and
//! link tools.
//!
//! The palette parses the file itself (packages/formats/src/palette-settings.ts); the desktop only
//! fetches it and keeps it in a cache, the way the extension's service worker does.

use serde::{Deserialize, Serialize};

use crate::prompts::CACHE_TTL_MS;

/// Mirrors `PALETTE_SETTINGS_PATH` in packages/formats/src/palette-settings.ts.
pub const PALETTE_SETTINGS_PATH: &str = ".kh/command-palette.settings.json";

/// What `palette-settings.json` in the cache directory holds.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Cache {
    pub repo: String,
    /// The file as read; `None` when the repository has none, which means the defaults.
    pub content: Option<String>,
    pub fetched_at: u64,
}

impl Cache {
    pub fn is_for(&self, repo: &str) -> bool {
        self.repo == repo
    }

    /// Asked on every open, so the prompts' lifetime: a change in the console shows on a later open.
    pub fn is_stale(&self, now_ms: u64) -> bool {
        now_ms.saturating_sub(self.fetched_at) > CACHE_TTL_MS
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_stale_once_older_than_the_prompts_cache() {
        let cache = Cache {
            repo: "o/r".into(),
            content: None,
            fetched_at: 1_000,
        };
        assert!(cache.is_for("o/r"));
        assert!(!cache.is_for("o/other"));
        assert!(!cache.is_stale(1_000 + CACHE_TTL_MS));
        assert!(cache.is_stale(1_001 + CACHE_TTL_MS));
    }

    #[test]
    fn keeps_a_missing_file_apart_from_an_empty_one() {
        let text = r#"{"repo":"o/r","content":null,"fetchedAt":5}"#;
        let cache: Cache = serde_json::from_str(text).unwrap();
        assert_eq!(cache.content, None);
        assert_eq!(serde_json::to_string(&cache).unwrap(), text);
    }
}
