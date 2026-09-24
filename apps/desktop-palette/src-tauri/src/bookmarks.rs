//! Bookmarks from the repo file the console and the browser extension share.
//!
//! The desktop only reads the file. It keeps GitHub's copy in a cache for an hour, like the
//! extension, so opening the palette never waits on the network.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// The repo file the extension mirrors; the desktop reads the same one.
pub const BOOKMARKS_PATH: &str = ".kh/browser.bookmarks.json";

/// How long a cached copy is served before it is refreshed in the background.
pub const CACHE_TTL_MS: u64 = 60 * 60 * 1000;

/// The shape `@lifosy/palette` expects (`Bookmark` in packages/palette/src/bookmarks.ts).
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bookmark {
    pub id: String,
    pub title: String,
    pub url: String,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub use_count: u64,
    pub last_used_at: String,
    pub pinned: bool,
}

/// What `bookmarks.json` in the cache directory holds: GitHub's state as last fetched.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Cache {
    pub repo: String,
    pub bookmarks: Vec<Bookmark>,
    /// Replayed as `If-None-Match`, so an unchanged file costs a 304 that GitHub does not bill.
    pub etag: Option<String>,
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

/// Only `http(s)` URLs are ever opened; the file is remote input.
pub fn is_openable_url(value: &str) -> bool {
    url::Url::parse(value).is_ok_and(|parsed| matches!(parsed.scheme(), "http" | "https"))
}

fn text(entry: &Value, key: &str) -> String {
    entry
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

/// Mirrors the extension's `parseBookmarks`: lenient about each field, strict about the shape, and
/// dropping any entry without an openable URL.
pub fn parse(content: &str) -> Result<Vec<Bookmark>, String> {
    if content.trim().is_empty() {
        return Ok(Vec::new());
    }
    let root: Value =
        serde_json::from_str(content).map_err(|_| format!("{BOOKMARKS_PATH} is not valid JSON"))?;
    let entries = root
        .get("bookmarks")
        .and_then(Value::as_array)
        .ok_or_else(|| format!("{BOOKMARKS_PATH} is missing a \"bookmarks\" array"))?;
    Ok(entries
        .iter()
        .filter(|entry| is_openable_url(&text(entry, "url")))
        .enumerate()
        .map(|(index, entry)| {
            let url = text(entry, "url");
            let id = text(entry, "id");
            let title = text(entry, "title");
            Bookmark {
                id: if id.is_empty() {
                    format!("bookmark-{index}")
                } else {
                    id
                },
                title: if title.is_empty() { url.clone() } else { title },
                tags: entry
                    .get("tags")
                    .and_then(Value::as_array)
                    .map(|tags| {
                        tags.iter()
                            .filter_map(Value::as_str)
                            .map(str::to_string)
                            .collect()
                    })
                    .unwrap_or_default(),
                created_at: text(entry, "createdAt"),
                updated_at: text(entry, "updatedAt"),
                use_count: entry
                    .get("useCount")
                    .and_then(Value::as_f64)
                    .filter(|count| count.is_finite() && *count > 0.0)
                    .map_or(0, |count| count.floor() as u64),
                last_used_at: text(entry, "lastUsedAt"),
                pinned: entry.get("pinned") == Some(&Value::Bool(true)),
                url,
            }
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_every_field_and_fills_the_gaps_like_the_extension() {
        let parsed = parse(
            r#"{"bookmarks":[
                {"id":"b1","title":"Example","url":"https://example.com/","tags":["dev",3],
                 "createdAt":"c","updatedAt":"u","useCount":2.7,"lastUsedAt":"l","pinned":true},
                {"url":"http://untitled.example/","useCount":-1,"pinned":"yes"}
            ]}"#,
        )
        .unwrap();
        assert_eq!(
            parsed[0],
            Bookmark {
                id: "b1".into(),
                title: "Example".into(),
                url: "https://example.com/".into(),
                tags: vec!["dev".into()],
                created_at: "c".into(),
                updated_at: "u".into(),
                use_count: 2,
                last_used_at: "l".into(),
                pinned: true,
            }
        );
        assert_eq!(parsed[1].id, "bookmark-1");
        assert_eq!(parsed[1].title, "http://untitled.example/");
        assert_eq!(parsed[1].use_count, 0);
        assert!(!parsed[1].pinned);
    }

    #[test]
    fn drops_entries_that_could_not_be_opened_safely() {
        let parsed = parse(
            r#"{"bookmarks":[{"url":"javascript:alert(1)"},{"url":"file:///etc/passwd"},{"title":"no url"}]}"#,
        )
        .unwrap();
        assert!(parsed.is_empty());
    }

    #[test]
    fn treats_an_empty_file_as_no_bookmarks_and_a_broken_one_as_an_error() {
        assert_eq!(parse("  \n").unwrap(), Vec::new());
        assert!(parse("{").unwrap_err().contains("not valid JSON"));
        assert!(parse("{}").unwrap_err().contains("missing"));
    }

    #[test]
    fn a_cache_serves_its_own_repo_for_an_hour() {
        let cache = Cache {
            repo: "o/r".into(),
            bookmarks: Vec::new(),
            etag: None,
            fetched_at: 1_000,
        };
        assert!(cache.is_for("o/r"));
        assert!(!cache.is_for("o/other"));
        assert!(!cache.is_stale(1_000 + CACHE_TTL_MS));
        assert!(cache.is_stale(1_001 + CACHE_TTL_MS));
    }
}
