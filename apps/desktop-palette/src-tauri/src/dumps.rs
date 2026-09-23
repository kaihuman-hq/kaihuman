//! Dumps: scratch texts for the palette's `d:` editor, one plain file each, the last 25 kept.
//!
//! They live on this machine only — `$XDG_DATA_HOME/lifosy/dumps/<id>.txt` — and never go to
//! GitHub. The id is the creation time in milliseconds, which also names the file.

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;

/// How many dumps are kept; saving one more removes the least recently edited.
pub const LIMIT: usize = 25;

/// `{ id, text, updatedAt }`, as `LIST_DUMPS` in packages/palette/src/protocol.ts.
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Dump {
    pub id: String,
    pub text: String,
    pub updated_at: u64,
}

/// Digits only, so an id from the webview can never name a file outside the directory.
pub fn is_dump_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 20 && id.bytes().all(|byte| byte.is_ascii_digit())
}

fn file(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.txt"))
}

fn modified_ms(path: &Path) -> u64 {
    std::fs::metadata(path)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |since| since.as_millis() as u64)
}

/// Every dump, most recently edited first.
pub fn list(dir: &Path) -> Vec<Dump> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut dumps: Vec<Dump> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let id = path
                .file_name()?
                .to_str()?
                .strip_suffix(".txt")?
                .to_string();
            if !is_dump_id(&id) {
                return None;
            }
            let text = std::fs::read_to_string(&path).ok()?;
            Some(Dump {
                id,
                text,
                updated_at: modified_ms(&path),
            })
        })
        .collect();
    dumps.sort_by(|a, b| {
        b.updated_at
            .cmp(&a.updated_at)
            .then_with(|| b.id.cmp(&a.id))
    });
    dumps
}

/// Writes a dump — a new one when `id` is `None` — and answers its id. Empty text deletes the dump
/// instead and answers `None`. Past `LIMIT`, the least recently edited ones are removed.
pub fn save(
    dir: &Path,
    id: Option<&str>,
    text: &str,
    now_ms: u64,
) -> Result<Option<String>, String> {
    if let Some(id) = id
        && !is_dump_id(id)
    {
        return Err(format!("{id} is not a dump"));
    }
    if text.is_empty() {
        if let Some(id) = id {
            match std::fs::remove_file(file(dir, id)) {
                Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
                    return Err(format!("could not delete the dump: {error}"));
                }
                _ => {}
            }
        }
        return Ok(None);
    }
    std::fs::create_dir_all(dir)
        .map_err(|error| format!("could not create {}: {error}", dir.display()))?;
    let id = match id {
        Some(id) => id.to_string(),
        // Two dumps started in the same millisecond still get a file each.
        None => (now_ms..)
            .map(|candidate| candidate.to_string())
            .find(|candidate| !file(dir, candidate).exists())
            .unwrap_or_default(),
    };
    std::fs::write(file(dir, &id), text)
        .map_err(|error| format!("could not save the dump: {error}"))?;
    for old in list(dir).into_iter().skip(LIMIT) {
        let _ = std::fs::remove_file(file(dir, &old.id));
    }
    Ok(Some(id))
}

/// Writes a dump's text to a file the user named: `~/` is the home directory, anything else must
/// be absolute, missing directories are created, and an existing file is never overwritten.
pub fn export(path: &str, text: &str, home: &Path) -> Result<PathBuf, String> {
    let target = match path.strip_prefix("~/") {
        Some(rest) => home.join(rest),
        None => PathBuf::from(path),
    };
    if !target.is_absolute() || path.ends_with('/') || target.file_name().is_none() {
        return Err(format!("{path} is not a file path — start it with / or ~/"));
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("could not create {}: {error}", parent.display()))?;
    }
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)
        .map_err(|error| match error.kind() {
            std::io::ErrorKind::AlreadyExists => {
                format!("{} already exists — pick another name", target.display())
            }
            _ => format!("could not write {}: {error}", target.display()),
        })?;
    std::io::Write::write_all(&mut file, text.as_bytes())
        .map_err(|error| format!("could not write {}: {error}", target.display()))?;
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, SystemTime};

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("lifosy-dumps-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    fn touch(dir: &Path, id: &str, seconds: u64) {
        std::fs::File::options()
            .write(true)
            .open(file(dir, id))
            .unwrap()
            .set_modified(SystemTime::UNIX_EPOCH + Duration::from_secs(seconds))
            .unwrap();
    }

    #[test]
    fn creates_updates_and_lists_the_most_recently_edited_first() {
        let dir = temp_dir("list");
        let first = save(&dir, None, "one", 1_000).unwrap().unwrap();
        let second = save(&dir, None, "two", 1_000).unwrap().unwrap();
        assert_eq!((first.as_str(), second.as_str()), ("1000", "1001"));
        touch(&dir, "1000", 10);
        touch(&dir, "1001", 20);
        assert_eq!(list(&dir)[0].text, "two");

        assert_eq!(
            save(&dir, Some("1000"), "one, edited", 0).unwrap(),
            Some("1000".into())
        );
        let dumps = list(&dir);
        assert_eq!(dumps[0].id, "1000");
        assert_eq!(dumps[0].text, "one, edited");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn deletes_a_dump_saved_empty_and_creates_none() {
        let dir = temp_dir("empty");
        assert_eq!(save(&dir, None, "", 1).unwrap(), None);
        assert!(!dir.exists());
        save(&dir, None, "x", 1).unwrap();
        assert_eq!(save(&dir, Some("1"), "", 2).unwrap(), None);
        assert!(list(&dir).is_empty());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn keeps_the_last_twenty_five() {
        let dir = temp_dir("limit");
        for id in 0..LIMIT as u64 {
            save(&dir, None, "x", id).unwrap();
            touch(&dir, &id.to_string(), id + 1);
        }
        save(&dir, None, "newest", 1_000).unwrap();
        let ids: Vec<String> = list(&dir).into_iter().map(|dump| dump.id).collect();
        assert_eq!(ids.len(), LIMIT);
        assert_eq!(ids[0], "1000");
        assert!(!ids.contains(&"0".to_string()));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn refuses_ids_that_are_not_its_own() {
        let dir = temp_dir("ids");
        for bad in ["../x", "a", "", "1/2", "123456789012345678901"] {
            assert!(
                save(&dir, Some(bad), "x", 0).is_err(),
                "{bad} should be refused"
            );
        }
        assert!(is_dump_id("1695465015123"));
    }

    #[test]
    fn exports_under_home_without_overwriting() {
        let home = temp_dir("export");
        let written = export("~/Documents/new/d.txt", "text", &home).unwrap();
        assert_eq!(written, home.join("Documents/new/d.txt"));
        assert_eq!(std::fs::read_to_string(&written).unwrap(), "text");

        let again = export(written.to_str().unwrap(), "other", &home).unwrap_err();
        assert!(again.ends_with("already exists — pick another name"));
        assert_eq!(std::fs::read_to_string(&written).unwrap(), "text");

        for bad in ["relative.txt", "~/", "~/Documents/", ""] {
            let error = export(bad, "x", &home).unwrap_err();
            assert!(error.contains("is not a file path"), "{bad:?}: {error}");
        }
        std::fs::remove_dir_all(home).unwrap();
    }
}
