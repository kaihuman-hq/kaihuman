//! The desktop's answers to `PaletteProtocol` (packages/palette/src/protocol.ts).
//!
//! Each request arrives as the JSON the palette sent; the answer is the JSON it reads back, or an
//! error message the palette shows as it is.

use std::path::PathBuf;

use serde::Deserialize;
use serde_json::{Value, json};

use crate::bookmarks::{self, BOOKMARKS_PATH, Cache};
use crate::config::{
    self, Settings, bookmarks_cache_file, claude_usage_cache_file, commands_cache_file,
    ideas_cache_file, is_repo_name, palette_settings_cache_file, prompts_cache_file, read_json,
    write_json,
};
use crate::github::{Client, Read, WorkFilter, console_file_url, encode_path};
use crate::recents::{self, RecentEntry};
use crate::{
    braindumps, business, claude, commands, dumps, entries, files, ideas, palette_settings,
    prompts, repos, translate, wifi,
};

/// Mirrors `PaletteProtocol`'s request names and fields.
#[derive(Debug, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Request {
    GetBookmarks,
    SearchRepo {
        query: String,
    },
    GetRecents,
    GetModeRecents {
        prefix: String,
    },
    AddModeRecent {
        prefix: String,
        id: String,
    },
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
    ListPromptFiles,
    ListCommandFiles,
    RunCommand {
        command: String,
        #[serde(rename = "where")]
        place: commands::Where,
    },
    Translate {
        text: String,
        targets: Vec<String>,
    },
    GetTranslationHistory,
    AddTranslationHistory {
        text: String,
    },
    SetTranslationKey {
        key: String,
    },
    ListEntryFiles,
    ReadEntryFile {
        path: String,
    },
    WriteEntryFile {
        path: String,
        content: String,
        #[serde(default)]
        sha: Option<String>,
    },
    ReadBusinessContext,
    ReadBusinessFile {
        path: String,
    },
    WriteBusinessFile {
        path: String,
        content: String,
        message: String,
        #[serde(default)]
        sha: Option<String>,
    },
    CaptureKnowledge {
        path: String,
        content: String,
    },
    ListIdeas,
    SaveIdea {
        path: String,
        content: String,
        #[serde(default)]
        sha: Option<String>,
    },
    ListGithubRepos,
    ListGithubWork {
        filter: WorkFilter,
    },
    GetPaletteSettings,
    ListClaudeCodeRepos,
    SearchLocalFiles {
        query: String,
        #[serde(default)]
        contents: bool,
        #[serde(default)]
        everywhere: bool,
    },
    OpenLocalFile {
        path: String,
        with: files::OpenWith,
    },
    GetClaudeUsage {
        #[serde(default)]
        cached: bool,
    },
    ListDumps,
    SaveDump {
        #[serde(default)]
        id: Option<String>,
        text: String,
    },
    ExportDump {
        path: String,
        text: String,
    },
    ListBraindumps,
    SaveBraindump {
        #[serde(default)]
        id: Option<String>,
        text: String,
    },
    SyncBraindumps,
    ListWifi {
        #[serde(default)]
        rescan: bool,
    },
    SetWifi {
        enabled: bool,
    },
    ConnectWifi {
        ssid: String,
        #[serde(default)]
        password: Option<String>,
    },
    /// Pinned tab groups and importing the browser's bookmarks: only the extension can do these.
    #[serde(other)]
    BrowserOnly,
}

/// Notes are written inside the repo, never to a path that climbs out of it.
fn is_note_path(path: &str) -> bool {
    !path.starts_with('/') && path.split('/').all(|part| !part.is_empty() && part != "..")
}

/// Mirrors `isKnowledgePath`: a capture's own file, directly in the knowledge base's inbox.
fn is_knowledge_path(path: &str) -> bool {
    path.strip_prefix(".kh/raw/")
        .and_then(|name| name.strip_suffix(".md"))
        .is_some_and(|name| {
            name.starts_with(|c: char| c.is_ascii_lowercase() || c.is_ascii_digit())
                && name
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        })
}

/// No `sha`, so GitHub refuses to write over a file that is already there.
async fn capture_knowledge(path: &str, content: &str) -> Result<Value, String> {
    if !is_knowledge_path(path) {
        return Err(format!("Refusing to write {path}"));
    }
    let client = client()?;
    client
        .write(
            path,
            content,
            None,
            "Capture knowledge via the desktop palette",
        )
        .await?;
    Ok(json!({ "url": console_file_url(path, client.repo()) }))
}

/// Every idea, with its console link. The folder is listed each time — an idea is written over
/// the version listed, so that must be current — and only changed files are read again.
async fn list_ideas() -> Result<Value, String> {
    let client = client()?;
    let file = ideas_cache_file();
    let known = read_json::<ideas::Cache>(&file)
        .filter(|cache| cache.repo == client.repo())
        .map(|cache| cache.files)
        .unwrap_or_default();
    let files = ideas::fetch(&client, &known).await?;
    let listed: Vec<Value> = files
        .iter()
        .map(|idea| {
            let url = console_file_url(&idea.path, client.repo());
            json!({ "path": idea.path, "sha": idea.sha, "text": idea.text, "url": url })
        })
        .collect();
    let cache = ideas::Cache {
        repo: client.repo().to_string(),
        files,
    };
    if let Err(error) = write_json(&file, &cache) {
        eprintln!("could not cache the ideas: {error}");
    }
    Ok(json!({ "ideas": listed }))
}

async fn save_idea(path: &str, content: &str, sha: Option<&str>) -> Result<Value, String> {
    if !ideas::is_idea_path(path) {
        return Err(format!("Refusing to write {path}"));
    }
    let client = client()?;
    ideas::save(&client, path, content, sha).await?;
    Ok(json!({ "url": console_file_url(path, client.repo()) }))
}

fn client() -> Result<Client, String> {
    let token = config::token()?;
    let repo = Settings::load().repo().ok_or(config::NO_REPO)?;
    Ok(Client::new(token, repo))
}

/// The braindumps of the repository the palette works on.
fn braindump_store() -> Result<braindumps::Store, String> {
    let repo = Settings::load().repo().ok_or(config::NO_REPO)?;
    braindumps::Store::new(&config::braindumps_dir(), &repo)
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

async fn refresh_repo_files(
    client: &Client,
    suffix: &str,
    cache_file: &PathBuf,
) -> Result<prompts::Cache, String> {
    let cache = prompts::Cache {
        repo: client.repo().to_string(),
        files: prompts::fetch(client, suffix).await?,
        fetched_at: now_ms(),
    };
    write_json(cache_file, &cache)?;
    Ok(cache)
}

/// The repository's `.prompts.md` (`>p`) or `.commands.md` (`>x`) files. Cache first, like the
/// bookmarks: a stale cache still answers and is refreshed behind it.
async fn list_repo_files(suffix: &'static str, cache_file: PathBuf) -> Result<Value, String> {
    let client = client()?;
    let cache =
        read_json::<prompts::Cache>(&cache_file).filter(|cache| cache.is_for(client.repo()));
    let files = match cache {
        Some(cache) => {
            if cache.is_stale(now_ms()) {
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = refresh_repo_files(&client, suffix, &cache_file).await {
                        eprintln!("{suffix} refresh failed: {error}");
                    }
                });
            }
            cache.files
        }
        None => {
            refresh_repo_files(&client, suffix, &cache_file)
                .await?
                .files
        }
    };
    Ok(json!({ "files": files }))
}

async fn refresh_palette_settings(client: &Client) -> Result<palette_settings::Cache, String> {
    let content = match client
        .read(palette_settings::PALETTE_SETTINGS_PATH, None)
        .await?
    {
        Read::Found { content, .. } => Some(content),
        Read::Missing | Read::NotModified => None,
    };
    let cache = palette_settings::Cache {
        repo: client.repo().to_string(),
        content,
        fetched_at: now_ms(),
    };
    write_json(&palette_settings_cache_file(), &cache)?;
    Ok(cache)
}

/// Asked every time the palette opens, so cache first like the prompts: a stale cache still
/// answers and is refreshed behind it.
async fn get_palette_settings() -> Result<Value, String> {
    let client = client()?;
    let cache = read_json::<palette_settings::Cache>(&palette_settings_cache_file())
        .filter(|cache| cache.is_for(client.repo()));
    let content = match cache {
        Some(cache) => {
            if cache.is_stale(now_ms()) {
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = refresh_palette_settings(&client).await {
                        eprintln!("palette settings refresh failed: {error}");
                    }
                });
            }
            cache.content
        }
        None => refresh_palette_settings(&client).await?.content,
    };
    Ok(json!({ "content": content }))
}

/// The files `>f` lists, each with its console link, as a repo search lists its hits.
async fn list_entry_files() -> Result<Value, String> {
    let client = client()?;
    let files: Vec<Value> = entries::entry_file_paths(&client.tree().await?)
        .into_iter()
        .map(|path| {
            let name = path.rsplit('/').next().unwrap_or(&path).to_string();
            let url = console_file_url(&path, client.repo());
            json!({ "path": path, "name": name, "url": url })
        })
        .collect();
    Ok(json!({ "files": files }))
}

/// A file not there yet reads as empty, with no version to write over.
async fn read_entry_file(path: &str) -> Result<Value, String> {
    if !entries::is_entry_path(path) {
        return Err(format!("Refusing to read {path}"));
    }
    match client()?.read(&encode_path(path), None).await? {
        Read::Found { content, sha, .. } => Ok(json!({ "content": content, "sha": sha })),
        Read::Missing | Read::NotModified => Ok(json!({ "content": "" })),
    }
}

async fn write_entry_file(path: &str, content: &str, sha: Option<&str>) -> Result<Value, String> {
    if !entries::is_entry_path(path) {
        return Err(format!("Refusing to write {path}"));
    }
    let message = format!("Add to {path} via the desktop palette");
    client()?
        .write(&encode_path(path), content, sha, &message)
        .await?;
    Ok(json!({}))
}

/// Nothing is read when the repository has no business profile: business is not set up there.
async fn read_business_context() -> Result<Value, String> {
    let client = client()?;
    let paths = business::context_file_paths(&client.tree().await?);
    if !paths.iter().any(|path| path == business::PROFILE_PATH) {
        return Ok(json!({ "files": [] }));
    }
    let mut files = Vec::new();
    for path in paths {
        if let Read::Found { content, .. } = client.read(&encode_path(&path), None).await? {
            files.push(json!({ "path": path, "content": content }));
        }
    }
    Ok(json!({ "files": files }))
}

/// A file not there reads as null, so a capture knows to create it rather than write over a version.
async fn read_business_file(path: &str) -> Result<Value, String> {
    if !business::is_capture_write_path(path) {
        return Err(format!("Refusing to read {path}"));
    }
    match client()?.read(&encode_path(path), None).await? {
        Read::Found { content, sha, .. } => Ok(json!({ "content": content, "sha": sha })),
        Read::Missing | Read::NotModified => Ok(json!({ "content": null })),
    }
}

async fn write_business_file(
    path: &str,
    content: &str,
    message: &str,
    sha: Option<&str>,
) -> Result<Value, String> {
    if !business::is_capture_write_path(path) {
        return Err(format!("Refusing to write {path}"));
    }
    client()?
        .write(&encode_path(path), content, sha, message)
        .await?;
    Ok(json!({}))
}

/// `cached` answers from the last fetch alone; otherwise the endpoint is asked and an answer with
/// usage in it replaces the cache. Failing to write the cache never hides the usage.
async fn claude_usage(cached: bool) -> Result<Value, String> {
    let file = claude_usage_cache_file();
    if cached {
        return Ok(match read_json::<claude::UsageCache>(&file) {
            Some(cache) => json!({ "accounts": cache.accounts, "fetchedAt": cache.fetched_at }),
            None => json!({ "accounts": [] }),
        });
    }
    let answer = claude::usage().await;
    let fetched_at = now_ms();
    if claude::has_usage(&answer) {
        let cache = claude::UsageCache {
            accounts: answer["accounts"].clone(),
            fetched_at,
        };
        if let Err(error) = write_json(&file, &cache) {
            eprintln!("could not cache the Claude usage: {error}");
        }
    }
    Ok(json!({ "accounts": answer["accounts"], "fetchedAt": fetched_at }))
}

/// The counts file ranks what it knows; GitHub adds the rest. Either alone is enough, so the
/// counted repositories still show when not logged in or offline.
async fn list_github_repos() -> Result<Value, String> {
    let counts = std::fs::read_to_string(repos::counts_file())
        .map(|text| repos::parse_counts(&text))
        .unwrap_or_default();
    let github = match client() {
        Ok(client) => client.user_repos().await,
        Err(error) => Err(error),
    };
    let github = match github {
        Ok(github) => github,
        Err(_) if !counts.is_empty() => Vec::new(),
        Err(error) => return Err(error),
    };
    Ok(json!({ "repos": repos::ranked(counts, github) }))
}

/// `nmcli` blocks for as long as a scan or a connection takes, so it runs off the async workers.
async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| error.to_string())?
}

/// Networks only while the radio is on: a scan with it off fails rather than finding none.
async fn list_wifi(rescan: bool) -> Result<Value, String> {
    blocking(move || {
        let enabled = wifi::enabled()?;
        let networks = if enabled {
            wifi::networks(rescan)?
        } else {
            Vec::new()
        };
        Ok(json!({ "enabled": enabled, "networks": networks }))
    })
    .await
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
        Request::GetModeRecents { prefix } => Ok(json!({ "ids": recents::load_mode(&prefix) })),
        Request::AddModeRecent { prefix, id } => {
            Ok(json!({ "ids": recents::remember_mode(&prefix, &id)? }))
        }
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
        Request::GetRepos => {
            let settings = Settings::load();
            let repos: Vec<Value> = settings
                .known_repos()
                .into_iter()
                .map(|name| json!({ "full_name": name }))
                .collect();
            Ok(json!({ "repo": settings.repo().unwrap_or_default(), "repos": repos }))
        }
        Request::SetRepo { repo } => {
            if !is_repo_name(&repo) {
                return Err(format!("{repo} is not an owner/name repository"));
            }
            let mut settings = Settings::load();
            settings.use_repo(&repo, now_ms());
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
        Request::ListPromptFiles => list_repo_files(".prompts.md", prompts_cache_file()).await,
        Request::ListCommandFiles => list_repo_files(".commands.md", commands_cache_file()).await,
        Request::RunCommand { command, place } => {
            commands::run(&command, place)?;
            Ok(json!({}))
        }
        Request::Translate { text, targets } => {
            let key = config::deepl_key()?;
            let translations = translate::translate(&key, text.trim(), &targets).await?;
            Ok(json!({ "translations": translations }))
        }
        Request::GetTranslationHistory => Ok(json!({ "texts": translate::history() })),
        Request::AddTranslationHistory { text } => {
            Ok(json!({ "texts": translate::remember(&text)? }))
        }
        Request::SetTranslationKey { key } => {
            config::store_deepl_key(key.trim())?;
            Ok(json!({}))
        }
        Request::ListEntryFiles => list_entry_files().await,
        Request::ReadEntryFile { path } => read_entry_file(&path).await,
        Request::WriteEntryFile { path, content, sha } => {
            write_entry_file(&path, &content, sha.as_deref()).await
        }
        Request::ReadBusinessContext => read_business_context().await,
        Request::ReadBusinessFile { path } => read_business_file(&path).await,
        Request::WriteBusinessFile {
            path,
            content,
            message,
            sha,
        } => write_business_file(&path, &content, &message, sha.as_deref()).await,
        Request::CaptureKnowledge { path, content } => capture_knowledge(&path, &content).await,
        Request::ListIdeas => list_ideas().await,
        Request::SaveIdea { path, content, sha } => {
            save_idea(&path, &content, sha.as_deref()).await
        }
        Request::ListGithubRepos => list_github_repos().await,
        Request::ListGithubWork { filter } => Ok(json!({ "items": client()?.work(filter).await? })),
        Request::GetPaletteSettings => get_palette_settings().await,
        Request::ListClaudeCodeRepos => Ok(json!({ "repos": claude::code_repos()? })),
        Request::SearchLocalFiles {
            query,
            contents,
            everywhere,
        } => {
            // Walking the disk blocks for up to `files::EVERYWHERE_TIME_LIMIT`.
            let hits = tauri::async_runtime::spawn_blocking(move || {
                files::search(&query, contents, everywhere)
            })
            .await
            .map_err(|error| format!("The file search stopped: {error}"))??;
            Ok(json!({ "home": files::home(), "hits": hits }))
        }
        Request::OpenLocalFile { path, with } => {
            files::open(&path, with)?;
            Ok(json!({}))
        }
        Request::GetClaudeUsage { cached } => claude_usage(cached).await,
        Request::ListDumps => Ok(json!({ "dumps": dumps::list(&config::dumps_dir()) })),
        Request::SaveDump { id, text } => {
            match dumps::save(&config::dumps_dir(), id.as_deref(), &text, now_ms())? {
                Some(id) => Ok(json!({ "id": id })),
                None => Ok(json!({})),
            }
        }
        Request::ExportDump { path, text } => {
            let home = PathBuf::from(std::env::var_os("HOME").unwrap_or_default());
            let written = dumps::export(path.trim(), &text, &home)?;
            Ok(json!({ "path": written.display().to_string() }))
        }
        Request::ListBraindumps => Ok(json!({ "braindumps": braindump_store()?.list() })),
        Request::SaveBraindump { id, text } => {
            match braindump_store()?.save(id.as_deref(), &text, now_ms())? {
                Some(id) => Ok(json!({ "id": id })),
                None => Ok(json!({})),
            }
        }
        Request::SyncBraindumps => {
            let store = braindump_store()?;
            braindumps::sync(&store, &client()?, now_ms()).await?;
            Ok(json!({ "braindumps": store.list() }))
        }
        Request::ListWifi { rescan } => list_wifi(rescan).await,
        Request::SetWifi { enabled } => {
            blocking(move || wifi::set_enabled(enabled)).await?;
            Ok(json!({}))
        }
        Request::ConnectWifi { ssid, password } => {
            blocking(move || wifi::connect(&ssid, password.as_deref())).await?;
            Ok(json!({}))
        }
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
            parse(json!({ "type": "OPEN_URL", "url": "https://x.example/", "reuse": true })),
            Request::OpenUrl {
                url: "https://x.example/".into()
            }
        );
        assert_eq!(
            parse(json!({ "type": "LIST_PROMPT_FILES" })),
            Request::ListPromptFiles
        );
        assert_eq!(
            parse(json!({ "type": "TRANSLATE", "text": "Hallo", "targets": ["EN-US", "DE"] })),
            Request::Translate {
                text: "Hallo".into(),
                targets: vec!["EN-US".into(), "DE".into()],
            }
        );
        assert_eq!(
            parse(json!({ "type": "GET_TRANSLATION_HISTORY" })),
            Request::GetTranslationHistory
        );
        assert_eq!(
            parse(json!({ "type": "ADD_TRANSLATION_HISTORY", "text": "fr: hi" })),
            Request::AddTranslationHistory {
                text: "fr: hi".into()
            }
        );
        assert_eq!(
            parse(json!({ "type": "SET_TRANSLATION_KEY", "key": "k:fx" })),
            Request::SetTranslationKey { key: "k:fx".into() }
        );
        assert_eq!(
            parse(json!({ "type": "LIST_GITHUB_REPOS" })),
            Request::ListGithubRepos
        );
        assert_eq!(
            parse(json!({ "type": "LIST_GITHUB_WORK", "filter": "review-requested" })),
            Request::ListGithubWork {
                filter: WorkFilter::ReviewRequested
            }
        );
        assert!(
            serde_json::from_value::<Request>(
                json!({ "type": "LIST_GITHUB_WORK", "filter": "is:open repo:secret" })
            )
            .is_err()
        );
        assert_eq!(
            parse(json!({ "type": "GET_PALETTE_SETTINGS" })),
            Request::GetPaletteSettings
        );
        assert_eq!(
            parse(json!({ "type": "LIST_COMMAND_FILES" })),
            Request::ListCommandFiles
        );
        assert_eq!(
            parse(json!({ "type": "RUN_COMMAND", "command": "ls /tmp", "where": "terminal" })),
            Request::RunCommand {
                command: "ls /tmp".into(),
                place: commands::Where::Terminal
            }
        );
        assert!(
            serde_json::from_value::<Request>(
                json!({ "type": "RUN_COMMAND", "command": "ls", "where": "anywhere" })
            )
            .is_err()
        );
        assert_eq!(
            parse(json!({ "type": "LIST_CLAUDE_CODE_REPOS" })),
            Request::ListClaudeCodeRepos
        );
        assert_eq!(
            parse(json!({ "type": "SEARCH_LOCAL_FILES", "query": "tax", "contents": true })),
            Request::SearchLocalFiles {
                query: "tax".into(),
                contents: true,
                everywhere: false
            }
        );
        assert_eq!(
            parse(json!({
                "type": "SEARCH_LOCAL_FILES",
                "query": "nginx",
                "contents": false,
                "everywhere": true
            })),
            Request::SearchLocalFiles {
                query: "nginx".into(),
                contents: false,
                everywhere: true
            }
        );
        assert_eq!(
            parse(json!({ "type": "OPEN_LOCAL_FILE", "path": "/a/b", "with": "file-manager" })),
            Request::OpenLocalFile {
                path: "/a/b".into(),
                with: files::OpenWith::FileManager
            }
        );
        assert_eq!(
            parse(json!({ "type": "GET_CLAUDE_USAGE" })),
            Request::GetClaudeUsage { cached: false }
        );
        assert_eq!(
            parse(json!({ "type": "GET_CLAUDE_USAGE", "cached": true })),
            Request::GetClaudeUsage { cached: true }
        );
        assert_eq!(
            parse(json!({ "type": "ADD_MODE_RECENT", "prefix": "p", "id": "x" })),
            Request::AddModeRecent {
                prefix: "p".into(),
                id: "x".into()
            }
        );
        assert_eq!(
            parse(json!({ "type": "SAVE_DUMP", "text": "x" })),
            Request::SaveDump {
                id: None,
                text: "x".into()
            }
        );
        assert_eq!(
            parse(json!({ "type": "SAVE_DUMP", "id": "12", "text": "" })),
            Request::SaveDump {
                id: Some("12".into()),
                text: String::new()
            }
        );
        assert_eq!(
            parse(json!({ "type": "EXPORT_DUMP", "path": "~/a.txt", "text": "x" })),
            Request::ExportDump {
                path: "~/a.txt".into(),
                text: "x".into()
            }
        );
        assert_eq!(
            parse(json!({ "type": "SAVE_BRAINDUMP", "id": "12", "text": "x" })),
            Request::SaveBraindump {
                id: Some("12".into()),
                text: "x".into()
            }
        );
        assert_eq!(
            parse(json!({ "type": "SYNC_BRAINDUMPS" })),
            Request::SyncBraindumps
        );
    }

    #[test]
    fn reads_widget_entry_requests() {
        assert_eq!(
            parse(json!({ "type": "LIST_ENTRY_FILES" })),
            Request::ListEntryFiles
        );
        assert_eq!(
            parse(json!({ "type": "READ_ENTRY_FILE", "path": "a.todos.md" })),
            Request::ReadEntryFile {
                path: "a.todos.md".into()
            }
        );
        assert_eq!(
            parse(json!({ "type": "WRITE_ENTRY_FILE", "path": "a.todos.md", "content": "x" })),
            Request::WriteEntryFile {
                path: "a.todos.md".into(),
                content: "x".into(),
                sha: None
            }
        );
        assert_eq!(
            parse(
                json!({ "type": "WRITE_ENTRY_FILE", "path": "a.todos.md", "content": "x", "sha": "v1" })
            ),
            Request::WriteEntryFile {
                path: "a.todos.md".into(),
                content: "x".into(),
                sha: Some("v1".into())
            }
        );
    }

    #[tokio::test]
    async fn refuses_entry_files_the_palette_does_not_add_to() {
        let error = handle(json!({ "type": "READ_ENTRY_FILE", "path": "../secret.todos.md" }))
            .await
            .unwrap_err();
        assert_eq!(error, "Refusing to read ../secret.todos.md");
        let error = handle(json!({ "type": "WRITE_ENTRY_FILE", "path": "a.md", "content": "x" }))
            .await
            .unwrap_err();
        assert_eq!(error, "Refusing to write a.md");
    }

    #[test]
    fn reads_business_requests() {
        assert_eq!(
            parse(json!({ "type": "READ_BUSINESS_CONTEXT" })),
            Request::ReadBusinessContext
        );
        assert_eq!(
            parse(json!({ "type": "READ_BUSINESS_FILE", "path": "p" })),
            Request::ReadBusinessFile { path: "p".into() }
        );
        assert_eq!(
            parse(
                json!({ "type": "WRITE_BUSINESS_FILE", "path": "p", "content": "x", "message": "m" })
            ),
            Request::WriteBusinessFile {
                path: "p".into(),
                content: "x".into(),
                message: "m".into(),
                sha: None
            }
        );
        assert_eq!(
            parse(
                json!({ "type": "WRITE_BUSINESS_FILE", "path": "p", "content": "x", "message": "m", "sha": "v1" })
            ),
            Request::WriteBusinessFile {
                path: "p".into(),
                content: "x".into(),
                message: "m".into(),
                sha: Some("v1".into())
            }
        );
    }

    #[tokio::test]
    async fn refuses_business_files_a_capture_does_not_write() {
        let error =
            handle(json!({ "type": "READ_BUSINESS_FILE", "path": ".kh/business/business.yaml" }))
                .await
                .unwrap_err();
        assert_eq!(error, "Refusing to read .kh/business/business.yaml");
        let error = handle(json!({
            "type": "WRITE_BUSINESS_FILE",
            "path": ".kh/business/clients/acme/notes.md",
            "content": "x",
            "message": "m"
        }))
        .await
        .unwrap_err();
        assert_eq!(
            error,
            "Refusing to write .kh/business/clients/acme/notes.md"
        );
    }

    #[test]
    fn reads_wifi_requests() {
        assert_eq!(
            parse(json!({ "type": "LIST_WIFI" })),
            Request::ListWifi { rescan: false }
        );
        assert_eq!(
            parse(json!({ "type": "LIST_WIFI", "rescan": true })),
            Request::ListWifi { rescan: true }
        );
        assert_eq!(
            parse(json!({ "type": "SET_WIFI", "enabled": false })),
            Request::SetWifi { enabled: false }
        );
        assert_eq!(
            parse(json!({ "type": "CONNECT_WIFI", "ssid": "Home" })),
            Request::ConnectWifi {
                ssid: "Home".into(),
                password: None
            }
        );
        assert_eq!(
            parse(json!({ "type": "CONNECT_WIFI", "ssid": "Cafe", "password": "pw" })),
            Request::ConnectWifi {
                ssid: "Cafe".into(),
                password: Some("pw".into())
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
    fn captures_knowledge_only_into_the_inbox() {
        assert_eq!(
            parse(json!({ "type": "CAPTURE_KNOWLEDGE", "path": ".kh/raw/1-a.md", "content": "x" })),
            Request::CaptureKnowledge {
                path: ".kh/raw/1-a.md".into(),
                content: "x".into()
            }
        );
        assert!(is_knowledge_path(".kh/raw/1758700000000-a-thought.md"));
        for bad in [
            ".kh/raw/processed/1-a.md",
            ".kh/raw/../x.md",
            ".kh/wiki/1-a.md",
            ".kh/raw/1-a.txt",
            "/.kh/raw/1-a.md",
            ".kh/raw/.md",
            ".kh/raw/-a.md",
        ] {
            assert!(!is_knowledge_path(bad), "{bad} should be refused");
        }
    }

    #[tokio::test]
    async fn refuses_a_capture_outside_the_inbox() {
        let error =
            handle(json!({ "type": "CAPTURE_KNOWLEDGE", "path": "README.md", "content": "x" }))
                .await
                .unwrap_err();
        assert_eq!(error, "Refusing to write README.md");
    }

    #[test]
    fn reads_idea_requests() {
        assert_eq!(parse(json!({ "type": "LIST_IDEAS" })), Request::ListIdeas);
        assert_eq!(
            parse(json!({ "type": "SAVE_IDEA", "path": ".kh/ideas/ab.md", "content": "x" })),
            Request::SaveIdea {
                path: ".kh/ideas/ab.md".into(),
                content: "x".into(),
                sha: None
            }
        );
        assert_eq!(
            parse(
                json!({ "type": "SAVE_IDEA", "path": ".kh/ideas/ab.md", "content": "x", "sha": "v1" })
            ),
            Request::SaveIdea {
                path: ".kh/ideas/ab.md".into(),
                content: "x".into(),
                sha: Some("v1".into())
            }
        );
    }

    #[tokio::test]
    async fn refuses_an_idea_outside_the_ideas_folder() {
        for path in ["README.md", ".kh/ideas/../x.md", ".kh/ideas/sub/ab.md"] {
            let error = handle(json!({ "type": "SAVE_IDEA", "path": path, "content": "x" }))
                .await
                .unwrap_err();
            assert_eq!(error, format!("Refusing to write {path}"));
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
}
