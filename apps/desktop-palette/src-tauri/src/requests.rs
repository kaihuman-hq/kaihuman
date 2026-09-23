//! The desktop's answers to `PaletteProtocol` (packages/palette/src/protocol.ts).
//!
//! Each request arrives as the JSON the palette sent; the answer is the JSON it reads back, or an
//! error message the palette shows as it is.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::bookmarks::{self, BOOKMARKS_PATH, Cache};
use crate::config::{self, Settings, bookmarks_cache_file, is_repo_name, read_json, write_json};
use crate::github::{Client, Read};
use crate::recents::{self, RecentEntry};

/// Mirrors `PaletteProtocol`'s request names and fields.
#[derive(Debug, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Request {
    GetBookmarks,
    SearchRepo {
        query: String,
    },
    GetRecents,
    AddRecent {
        entry: RecentEntry,
    },
    RecordBookmarkUse {
        #[serde(rename = "bookmarkId")]
        _bookmark_id: String,
    },
    FetchQuickNotes,
    DumpNote {
        path: String,
        note: String,
    },
    AddActionLog {
        path: String,
        description: String,
        tags: Vec<String>,
    },
    GetRepos,
    SetRepo {
        repo: String,
    },
    SyncNow {
        #[serde(default)]
        force: bool,
    },
    OpenUrl {
        url: String,
    },
    /// Pinned tab groups and importing the browser's bookmarks: only the extension can do these.
    #[serde(other)]
    BrowserOnly,
}

/// Notes are written inside the repo, never to a path that climbs out of it.
fn is_note_path(path: &str) -> bool {
    !path.starts_with('/') && path.split('/').all(|part| !part.is_empty() && part != "..")
}

/// `- YYYY-MM-DD HH:MM:SS description #tag #tag`, as the extension writes an action log.
pub fn action_log_line(timestamp: &str, description: &str, tags: &[String]) -> String {
    let mut line = format!("- {timestamp} {}", description.trim());
    for tag in tags
        .iter()
        .map(|tag| tag.trim())
        .filter(|tag| !tag.is_empty())
    {
        line.push_str(&format!(" #{tag}"));
    }
    line
}

fn client() -> Result<Client, String> {
    Ok(Client::new(config::token()?, Settings::load().repo()))
}

fn now_ms() -> u64 {
    desktop_palette::now_ms()
}

/// Fetches the bookmarks file and writes the cache; a 304 only restamps what the cache holds.
async fn refresh_bookmarks(client: &Client, known: Option<Cache>) -> Result<Cache, String> {
    let etag = known.as_ref().and_then(|cache| cache.etag.clone());
    let next = match client.read(BOOKMARKS_PATH, etag.as_deref()).await? {
        Read::NotModified => match known {
            Some(cache) => Cache {
                fetched_at: now_ms(),
                ..cache
            },
            None => return Err("GitHub answered 304 without a cached copy".into()),
        },
        // A repo without the file yet has no bookmarks rather than an error.
        Read::Missing => Cache {
            repo: client.repo().to_string(),
            bookmarks: Vec::new(),
            etag: None,
            fetched_at: now_ms(),
        },
        Read::Found { content, etag, .. } => Cache {
            repo: client.repo().to_string(),
            bookmarks: bookmarks::parse(&content)?,
            etag,
            fetched_at: now_ms(),
        },
    };
    write_json(&bookmarks_cache_file(), &next)?;
    Ok(next)
}

/// Cache first: a usable cache answers at once and a stale one is refreshed behind it, so opening
/// the palette never waits on GitHub. Only a missing or other-repo cache blocks.
async fn get_bookmarks() -> Result<Value, String> {
    let client = client()?;
    let cache =
        read_json::<Cache>(&bookmarks_cache_file()).filter(|cache| cache.is_for(client.repo()));
    let bookmarks = match cache {
        Some(cache) => {
            if cache.is_stale(now_ms()) {
                let known = cache.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = refresh_bookmarks(&client, Some(known)).await {
                        eprintln!("bookmark refresh failed: {error}");
                    }
                });
            }
            cache.bookmarks
        }
        None => refresh_bookmarks(&client, None).await?.bookmarks,
    };
    Ok(json!({ "bookmarks": bookmarks }))
}

/// The quick-note files the console's dashboard config lists; none when there is no config.
async fn fetch_quick_notes() -> Result<Value, String> {
    let quick_notes = match client()?.read(".lifeos/.dashboard.config.json", None).await {
        Ok(Read::Found { content, .. }) => serde_json::from_str::<Value>(&content)
            .ok()
            .and_then(|config| config.pointer("/files/quickNotes").cloned())
            .and_then(|notes| serde_json::from_value::<Vec<String>>(notes).ok())
            .unwrap_or_default(),
        // Like the extension: no config, or no access to it, means no extra targets.
        _ => Vec::new(),
    };
    Ok(json!({ "quickNotes": quick_notes }))
}

/// Hands an http(s) URL to the default browser.
pub fn open_in_browser(url: &str) -> Result<(), String> {
    if !bookmarks::is_openable_url(url) {
        return Err("Refusing to open that URL".into());
    }
    let mut child = std::process::Command::new("xdg-open")
        .arg(url)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .spawn()
        .map_err(|error| format!("Could not run xdg-open: {error}"))?;
    // Reaped in the background so the palette can close at once.
    std::thread::spawn(move || child.wait());
    Ok(())
}

fn open_url(url: &str) -> Result<Value, String> {
    open_in_browser(url)?;
    Ok(json!({}))
}

pub async fn handle(request: Value) -> Result<Value, String> {
    let kind = request
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("(no type)")
        .to_string();
    let request: Request = serde_json::from_value(request)
        .map_err(|error| format!("Malformed {kind} request: {error}"))?;
    match request {
        Request::GetBookmarks => get_bookmarks().await,
        Request::SearchRepo { query } => {
            let query = query.trim();
            if query.is_empty() {
                return Ok(json!({ "results": [] }));
            }
            let hits = client()?.search(query).await?;
            let results: Vec<Value> = hits
                .into_iter()
                .map(|hit| json!({ "path": hit.path, "name": hit.name, "url": hit.url }))
                .collect();
            Ok(json!({ "results": results }))
        }
        Request::GetRecents => Ok(json!({ "recents": recents::load() })),
        Request::AddRecent { entry } => Ok(json!({ "recents": recents::remember(entry)? })),
        // Use counts are pushed back to the repo by the extension only; the desktop does not
        // count yet, so a use is acknowledged and dropped.
        Request::RecordBookmarkUse { .. } => Ok(json!({})),
        Request::FetchQuickNotes => fetch_quick_notes().await,
        Request::DumpNote { path, note } => {
            if !is_note_path(&path) {
                return Err(format!("Refusing to write to {path}"));
            }
            client()?
                .add_lines(&path, &format!("- {}", note.trim()), true)
                .await?;
            Ok(json!({}))
        }
        Request::AddActionLog {
            path,
            description,
            tags,
        } => {
            if !is_note_path(&path) {
                return Err(format!("Refusing to write to {path}"));
            }
            let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
            let line = action_log_line(&timestamp, &description, &tags);
            client()?.add_lines(&path, &line, false).await?;
            Ok(json!({}))
        }
        Request::GetRepos => {
            let settings = Settings::load();
            let repos: Vec<Value> = settings
                .known_repos()
                .into_iter()
                .map(|name| json!({ "full_name": name }))
                .collect();
            Ok(json!({ "repo": settings.repo(), "repos": repos }))
        }
        Request::SetRepo { repo } => {
            if !is_repo_name(&repo) {
                return Err(format!("{repo} is not an owner/name repository"));
            }
            let mut settings = Settings::load();
            settings.use_repo(&repo);
            // The bookmark cache names its repo, so it invalidates itself on the next read.
            settings.save()?;
            Ok(json!({}))
        }
        Request::SyncNow { .. } => {
            let client = match client() {
                Ok(client) => client,
                Err(_) => return Ok(json!({ "synced": false })),
            };
            let known = read_json::<Cache>(&bookmarks_cache_file())
                .filter(|cache| cache.is_for(client.repo()));
            let cache = refresh_bookmarks(&client, known).await?;
            Ok(json!({ "synced": true, "bookmarks": cache.bookmarks.len() }))
        }
        Request::OpenUrl { url } => open_url(&url),
        Request::BrowserOnly => Err(format!(
            "{kind} needs the browser extension — the desktop palette cannot do that yet"
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(value: Value) -> Request {
        serde_json::from_value(value).unwrap()
    }

    #[test]
    fn reads_requests_the_way_the_palette_sends_them() {
        assert_eq!(
            parse(json!({ "type": "GET_BOOKMARKS" })),
            Request::GetBookmarks
        );
        assert_eq!(
            parse(json!({ "type": "RECORD_BOOKMARK_USE", "bookmarkId": "b1" })),
            Request::RecordBookmarkUse {
                _bookmark_id: "b1".into()
            }
        );
        assert_eq!(
            parse(
                json!({ "type": "ADD_ACTION_LOG", "path": "a.actionlog.md", "description": "d", "tags": ["t"] })
            ),
            Request::AddActionLog {
                path: "a.actionlog.md".into(),
                description: "d".into(),
                tags: vec!["t".into()],
            }
        );
        assert_eq!(
            parse(json!({ "type": "OPEN_URL", "url": "https://x.example/", "reuse": true })),
            Request::OpenUrl {
                url: "https://x.example/".into()
            }
        );
    }

    #[test]
    fn marks_browser_only_requests_rather_than_failing_to_parse_them() {
        for kind in [
            "LIST_PINNED_TAB_GROUPS",
            "LOAD_PINNED_TAB_GROUP",
            "IMPORT_CHROME_BOOKMARKS",
        ] {
            assert_eq!(
                parse(json!({ "type": kind, "groupId": "g" })),
                Request::BrowserOnly
            );
        }
    }

    #[tokio::test]
    async fn says_which_request_needs_the_extension() {
        let error = handle(json!({ "type": "LIST_PINNED_TAB_GROUPS" }))
            .await
            .unwrap_err();
        assert!(error.starts_with("LIST_PINNED_TAB_GROUPS needs the browser extension"));
        let error = handle(json!({ "type": "DUMP_NOTE", "path": 3 }))
            .await
            .unwrap_err();
        assert!(error.starts_with("Malformed DUMP_NOTE request"));
    }

    #[test]
    fn refuses_to_open_anything_but_the_web() {
        for url in ["javascript:alert(1)", "file:///etc/passwd", "not a url"] {
            assert_eq!(open_url(url).unwrap_err(), "Refusing to open that URL");
        }
    }

    #[test]
    fn writes_notes_only_inside_the_repo() {
        assert!(is_note_path(".lifeos/dump.md"));
        assert!(is_note_path("log.actionlog.md"));
        for bad in ["/etc/x.md", "../x.md", "a/../../x.md", "a//b.md", ""] {
            assert!(!is_note_path(bad), "{bad} should be refused");
        }
    }

    #[test]
    fn formats_an_action_log_line_like_the_extension() {
        let tags = vec!["work".to_string(), " ".to_string(), "deep".to_string()];
        assert_eq!(
            action_log_line("2026-09-23 10:00:00", " Shipped it ", &tags),
            "- 2026-09-23 10:00:00 Shipped it #work #deep"
        );
    }
}
