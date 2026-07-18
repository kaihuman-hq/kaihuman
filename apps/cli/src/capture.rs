//! Headless knowledge capture: `cli capture`.
//!
//! Designed for a desktop quick-capture overlay (e.g. a Hyprland keybind that
//! pipes a line into `cli capture`). The capture is written to a local spool
//! **first** so a thought is never lost if the network is down, then the whole
//! spool — this note plus any earlier offline captures — is flushed to
//! `.kh/raw/` on GitHub with retry.

use anyhow::{Context, Result};
use std::fs;
use std::io::{IsTerminal, Read};
use std::path::Path;
use std::time::Duration;

use crate::auth::AuthManager;
use crate::github::{self, GithubClient};

/// Entry point for the `capture` subcommand. `inline` is the note text passed as
/// CLI arguments; when `None`, text comes from piped stdin or `$EDITOR`.
pub async fn run(inline: Option<String>) -> Result<()> {
    let text = resolve_text(inline)?;
    let text = text.trim().to_string();
    if text.is_empty() {
        println!("Nothing captured.");
        return Ok(());
    }

    let auth = AuthManager::new()?;
    let spool_dir = auth.config_dir().join("spool");
    fs::create_dir_all(&spool_dir)?;

    // 1. Spool first — the capture is now durable even if the push fails.
    let (filename, content) = github::build_kb_note(&text);
    let spool_path = spool_dir.join(&filename);
    fs::write(&spool_path, &content).context("Failed to write spool file")?;

    // 2. Flush the spool (this note + any earlier offline captures).
    match (auth.get_token(), auth.get_active_repo()?) {
        (Ok(token), Some(repo)) => {
            let client = GithubClient::new(token)?;
            let (pushed, pending) = flush_spool(&client, &repo, &spool_dir).await;
            if pending == 0 {
                println!("Captured → {} ({} pushed)", repo, pushed);
            } else {
                println!(
                    "Captured locally · {} pushed, {} pending (will retry on next capture)",
                    pushed, pending
                );
            }
        }
        (Err(_), _) => {
            println!("Saved locally — not authenticated. Run `cli` to log in; it flushes on the next capture.");
        }
        (_, None) => {
            println!("Saved locally — no active repo. Run `cli`, press `s` to select one, then capture again.");
        }
    }

    Ok(())
}

/// Resolve the capture text: CLI args → piped stdin → `$EDITOR`.
fn resolve_text(inline: Option<String>) -> Result<String> {
    if let Some(t) = inline {
        return Ok(t);
    }

    let stdin = std::io::stdin();
    if !stdin.is_terminal() {
        let mut buf = String::new();
        stdin.lock().read_to_string(&mut buf)?;
        return Ok(buf);
    }

    edit_in_editor()
}

/// Open `$EDITOR` (fallback `nano`) on a temp file and return its contents.
fn edit_in_editor() -> Result<String> {
    let editor = std::env::var("EDITOR").unwrap_or_else(|_| "nano".to_string());
    let path = std::env::temp_dir().join(format!("kh-capture-{}.md", std::process::id()));
    fs::write(&path, "")?;

    let status = std::process::Command::new(&editor)
        .arg(&path)
        .status()
        .with_context(|| format!("Failed to launch editor `{}`", editor))?;

    let content = if status.success() {
        fs::read_to_string(&path).unwrap_or_default()
    } else {
        String::new()
    };
    let _ = fs::remove_file(&path);
    Ok(content)
}

/// Push every spooled capture to `.kh/raw/`, oldest first. Returns
/// `(pushed, still_pending)`. A file is removed from the spool only once its
/// push succeeds, so a failed push simply leaves it for the next run.
async fn flush_spool(client: &GithubClient, repo: &str, spool_dir: &Path) -> (usize, usize) {
    let mut parts = repo.split('/');
    let owner = parts.next().unwrap_or("");
    let name = parts.next().unwrap_or("");

    let Ok(entries) = fs::read_dir(spool_dir) else {
        return (0, 0);
    };

    // Spool filenames are millisecond-timestamp-prefixed, so sorting pushes
    // captures in the order they were taken.
    let mut files: Vec<_> = entries
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|x| x == "md"))
        .collect();
    files.sort();

    let mut pushed = 0usize;
    let mut pending = 0usize;

    for path in files {
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let Some(filename) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        let remote = format!(".kh/raw/{}", filename);

        if push_with_retry(client, owner, name, &remote, &content).await.is_ok() {
            let _ = fs::remove_file(&path);
            pushed += 1;
        } else {
            pending += 1;
        }
    }

    (pushed, pending)
}

/// Push a single file with up to 3 attempts and exponential backoff (0.5s, 1s).
async fn push_with_retry(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    path: &str,
    content: &str,
) -> Result<()> {
    let mut delay = Duration::from_millis(500);
    let mut last_err = None;

    for attempt in 0..3 {
        match client.put_file(owner, repo, path, content, "note: add knowledge capture via CLI").await
        {
            Ok(()) => return Ok(()),
            Err(e) => {
                last_err = Some(e);
                if attempt < 2 {
                    tokio::time::sleep(delay).await;
                    delay *= 2;
                }
            }
        }
    }

    Err(last_err.unwrap_or_else(|| anyhow::anyhow!("push failed")))
}
