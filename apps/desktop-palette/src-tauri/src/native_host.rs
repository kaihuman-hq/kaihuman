//! Chrome native messaging, so the browser extension and the palette work on the same repository.
//!
//! Chrome starts `lifosy-palette chrome-extension://<id>/` when the extension sends a message, and
//! each message is 4 bytes of length (native byte order) and that much JSON, both ways. Only
//! `SYNC_REPO` is understood: each side sends the repository it uses and when that last changed,
//! the newer choice wins, and the answer is the winner, for the extension to take.
//!
//! `lifosy-palette native-host install <extension id>` registers this binary with the browsers
//! found under `$XDG_CONFIG_HOME`.

use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::config::{Settings, is_repo_name};

pub const HOST_NAME: &str = "com.lifosy.palette";

/// The user-level profile directories of Chrome and the browsers built on it.
const BROWSERS: [&str; 7] = [
    "google-chrome",
    "google-chrome-beta",
    "google-chrome-unstable",
    "chromium",
    "BraveSoftware/Brave-Browser",
    "microsoft-edge",
    "vivaldi",
];

/// Far above any real message; Chrome itself caps what a host may send at 1 MB.
const MAX_MESSAGE: u32 = 1024 * 1024;

#[derive(Debug, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
enum Message {
    SyncRepo {
        repo: String,
        /// 0 when the extension never recorded a change.
        #[serde(rename = "changedAt", default)]
        changed_at: u64,
    },
}

/// A repository and when it became the one in use.
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoChoice {
    pub repo: String,
    pub changed_at: u64,
}

/// Takes the extension's choice when it is newer — or when neither side ever recorded a change,
/// since the extension is where a repository is usually picked. Answers the choice both should
/// use and whether `settings` changed.
pub fn reconcile(settings: &mut Settings, repo: &str, changed_at: u64) -> (RepoChoice, bool) {
    let mine = settings.repo_changed_at.unwrap_or(0);
    let theirs_wins = is_repo_name(repo)
        && settings.repo() != repo
        && (changed_at > mine || (changed_at == 0 && mine == 0));
    if theirs_wins {
        settings.use_repo(repo, changed_at);
    }
    let choice = RepoChoice {
        repo: settings.repo(),
        changed_at: settings.repo_changed_at.unwrap_or(0),
    };
    (choice, theirs_wins)
}

fn answer(message: &[u8]) -> Value {
    let message: Message = match serde_json::from_slice(message) {
        Ok(message) => message,
        Err(error) => return json!({ "error": format!("Malformed message: {error}") }),
    };
    match message {
        Message::SyncRepo { repo, changed_at } => {
            let mut settings = Settings::load();
            let (choice, changed) = reconcile(&mut settings, &repo, changed_at);
            if changed && let Err(error) = settings.save() {
                return json!({ "error": error });
            }
            json!(choice)
        }
    }
}

fn read_message(input: &mut impl Read) -> std::io::Result<Option<Vec<u8>>> {
    let mut length = [0; 4];
    match input.read_exact(&mut length) {
        Err(error) if error.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
        other => other?,
    }
    let length = u32::from_ne_bytes(length);
    if length > MAX_MESSAGE {
        return Err(std::io::Error::other(format!(
            "a {length}-byte message is too long"
        )));
    }
    let mut message = vec![0; length as usize];
    input.read_exact(&mut message)?;
    Ok(Some(message))
}

fn write_message(output: &mut impl Write, value: &Value) -> std::io::Result<()> {
    let body = serde_json::to_vec(value)?;
    output.write_all(&(body.len() as u32).to_ne_bytes())?;
    output.write_all(&body)?;
    output.flush()
}

/// Answers messages until Chrome closes the pipe. Anything but messages on `output` would break
/// the protocol, so problems go to stderr, which Chrome logs.
pub fn serve(input: &mut impl Read, output: &mut impl Write) -> std::io::Result<()> {
    while let Some(message) = read_message(input)? {
        write_message(output, &answer(&message))?;
    }
    Ok(())
}

/// Chrome's id for an extension: 32 letters from a to p.
fn is_extension_id(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|byte| (b'a'..=b'p').contains(&byte))
}

fn manifest(binary: &Path, extension_id: &str) -> Value {
    json!({
        "name": HOST_NAME,
        "description": "Keeps the Lifosy extension and desktop palette on the same repository",
        "path": binary,
        "type": "stdio",
        "allowed_origins": [format!("chrome-extension://{extension_id}/")],
    })
}

/// Writes the host manifest for every browser that has a profile under `config_home`, and
/// answers where.
pub fn install(
    config_home: &Path,
    binary: &Path,
    extension_id: &str,
) -> Result<Vec<PathBuf>, String> {
    if !is_extension_id(extension_id) {
        return Err(format!(
            "{extension_id} is not an extension id — copy it from chrome://extensions"
        ));
    }
    let manifest = serde_json::to_string_pretty(&manifest(binary, extension_id))
        .map_err(|error| error.to_string())?;
    let mut written = Vec::new();
    for browser in BROWSERS {
        let profile = config_home.join(browser);
        if !profile.is_dir() {
            continue;
        }
        let dir = profile.join("NativeMessagingHosts");
        let file = dir.join(format!("{HOST_NAME}.json"));
        std::fs::create_dir_all(&dir)
            .and_then(|()| std::fs::write(&file, &manifest))
            .map_err(|error| format!("could not write {}: {error}", file.display()))?;
        written.push(file);
    }
    if written.is_empty() {
        return Err(format!(
            "found no Chrome, Chromium, Brave, Edge or Vivaldi profile in {}",
            config_home.display()
        ));
    }
    Ok(written)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings(repo: &str, changed_at: Option<u64>) -> Settings {
        Settings {
            repo: Some(repo.into()),
            repos: vec![repo.into()],
            repo_changed_at: changed_at,
        }
    }

    #[test]
    fn the_newer_choice_wins() {
        let mut mine = settings("o/desktop", Some(10));
        let (choice, changed) = reconcile(&mut mine, "o/browser", 20);
        assert!(changed);
        assert_eq!(
            choice,
            RepoChoice {
                repo: "o/browser".into(),
                changed_at: 20
            }
        );
        assert_eq!(mine.repo_changed_at, Some(20));
        assert!(mine.known_repos().contains(&"o/desktop".to_string()));

        let mut mine = settings("o/desktop", Some(30));
        let (choice, changed) = reconcile(&mut mine, "o/browser", 20);
        assert!(!changed);
        assert_eq!(choice.repo, "o/desktop");
        assert_eq!(choice.changed_at, 30);
    }

    #[test]
    fn the_extension_wins_while_neither_side_recorded_a_change() {
        let mut mine = Settings::default();
        let (choice, changed) = reconcile(&mut mine, "o/browser", 0);
        assert!(changed);
        assert_eq!(choice.repo, "o/browser");
    }

    #[test]
    fn keeps_its_own_choice_against_a_repository_name_that_is_not_one() {
        let mut mine = settings("o/desktop", Some(1));
        let (choice, changed) = reconcile(&mut mine, "../x", 99);
        assert!(!changed);
        assert_eq!(choice.repo, "o/desktop");
    }

    #[test]
    fn frames_messages_as_chrome_does() {
        let mut input = Vec::new();
        for body in [br#"{"type":"NOPE"}"#.as_slice(), b"not json"] {
            input.extend((body.len() as u32).to_ne_bytes());
            input.extend(body);
        }
        let mut output = Vec::new();
        serve(&mut input.as_slice(), &mut output).unwrap();

        let mut answers = output.as_slice();
        let first = read_message(&mut answers).unwrap().unwrap();
        let first: Value = serde_json::from_slice(&first).unwrap();
        assert!(first["error"].as_str().unwrap().starts_with("Malformed"));
        assert!(read_message(&mut answers).unwrap().is_some());
        assert!(read_message(&mut answers).unwrap().is_none());
    }

    #[test]
    fn refuses_a_message_longer_than_chrome_would_send() {
        let input = (MAX_MESSAGE + 1).to_ne_bytes();
        let error = serve(&mut input.as_slice(), &mut Vec::new()).unwrap_err();
        assert!(error.to_string().contains("too long"));
    }

    #[test]
    fn reads_a_sync_request() {
        let message: Message = serde_json::from_value(json!({
            "type": "SYNC_REPO", "repo": "o/r", "changedAt": 5
        }))
        .unwrap();
        assert_eq!(
            message,
            Message::SyncRepo {
                repo: "o/r".into(),
                changed_at: 5
            }
        );
    }

    #[test]
    fn installs_for_the_browsers_it_finds_and_only_for_that_extension() {
        let home = std::env::temp_dir().join(format!("lifosy-native-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        std::fs::create_dir_all(home.join("chromium")).unwrap();
        let id = "abcdefghijklmnopabcdefghijklmnop";

        let written = install(&home, Path::new("/usr/bin/lifosy-palette"), id).unwrap();
        assert_eq!(
            written,
            [home.join("chromium/NativeMessagingHosts/com.lifosy.palette.json")]
        );
        let manifest: Value =
            serde_json::from_str(&std::fs::read_to_string(&written[0]).unwrap()).unwrap();
        assert_eq!(manifest["path"], "/usr/bin/lifosy-palette");
        assert_eq!(
            manifest["allowed_origins"],
            json!([format!("chrome-extension://{id}/")])
        );

        assert!(install(&home, Path::new("/x"), "not-an-id").is_err());
        std::fs::remove_dir_all(home.join("chromium")).unwrap();
        assert!(
            install(&home, Path::new("/x"), id)
                .unwrap_err()
                .contains("found no")
        );
        std::fs::remove_dir_all(home).unwrap();
    }
}
