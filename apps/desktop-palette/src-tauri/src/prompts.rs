//! The repository's `.prompts.md` files, for the palette's `p:` mode.
//!
//! The palette parses them itself (packages/palette/src/prompts.ts); the desktop only finds and
//! fetches them, the way the extension's service worker does, and keeps them in a cache.

use serde::{Deserialize, Serialize};

use crate::github::{Client, Read, TreeEntry, encode_path};

/// Prompts change far less often than they are searched: a cache younger than this answers on its
/// own, an older one still answers and is refreshed behind it. The extension uses the same.
pub const CACHE_TTL_MS: u64 = 5 * 60 * 1000;

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
pub struct PromptFile {
    pub path: String,
    pub content: String,
}

/// What `prompts.json` in the cache directory holds.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Cache {
    pub repo: String,
    pub files: Vec<PromptFile>,
    pub fetched_at: u64,
}

impl Cache {
    pub fn is_for(&self, repo: &str) -> bool {
        self.repo == repo
    }

    pub fn is_stale(&self, now_ms: u64) -> bool {
        now_ms.saturating_sub(self.fetched_at) > CACHE_TTL_MS
    }
}

/// Every `.prompts.md` blob in a tree listing.
pub fn prompt_file_paths(tree: &[TreeEntry]) -> Vec<String> {
    tree.iter()
        .filter(|entry| entry.kind == "blob" && entry.path.to_lowercase().ends_with(".prompts.md"))
        .map(|entry| entry.path.clone())
        .collect()
}

/// One tree listing to find the files, then one read per file.
pub async fn fetch(client: &Client) -> Result<Vec<PromptFile>, String> {
    let mut files = Vec::new();
    for path in prompt_file_paths(&client.tree().await?) {
        if let Read::Found { content, .. } = client.read(&encode_path(&path), None).await? {
            files.push(PromptFile { path, content });
        }
    }
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(path: &str, kind: &str) -> TreeEntry {
        TreeEntry {
            path: path.into(),
            kind: kind.into(),
        }
    }

    #[test]
    fn keeps_only_prompts_blobs() {
        let tree = [
            entry("ai/useful.prompts.md", "blob"),
            entry("ai/Other.PROMPTS.md", "blob"),
            entry("notes.md", "blob"),
            entry("dir.prompts.md", "tree"),
        ];
        assert_eq!(
            prompt_file_paths(&tree),
            vec!["ai/useful.prompts.md", "ai/Other.PROMPTS.md"]
        );
    }

    #[test]
    fn serves_a_cache_for_its_repo_until_it_is_stale() {
        let cache = Cache {
            repo: "o/r".into(),
            files: Vec::new(),
            fetched_at: 1_000,
        };
        assert!(cache.is_for("o/r") && !cache.is_for("o/x"));
        assert!(!cache.is_stale(1_000 + CACHE_TTL_MS));
        assert!(cache.is_stale(1_001 + CACHE_TTL_MS));
    }
}
