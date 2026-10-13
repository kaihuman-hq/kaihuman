//! The repository's ideas (`.kh/ideas/<slug>.md`, doc/ideas.md), for the palette's `>id` mode
//! and the braindump window's "Promote to idea".
//!
//! The palette parses and edits them itself (packages/palette/src/ideas.ts); the desktop lists,
//! fetches and writes them. Files are kept by blob sha, so listing them costs one folder request
//! plus a read for each file that changed since the last listing.

use serde::{Deserialize, Serialize};

use crate::github::{Client, FolderEntry, Put, Read, encode_path};

pub const FOLDER: &str = ".kh/ideas";

/// Mirrors `ideaSlugOf` in packages/formats/src/ideas.ts: a file directly in the folder, whose
/// name is a slug of 2–40 lowercase letters, digits and `-`, not starting with `-`.
pub fn is_idea_path(path: &str) -> bool {
    path.strip_prefix(".kh/ideas/")
        .and_then(|name| name.strip_suffix(".md"))
        .is_some_and(|slug| {
            (2..=40).contains(&slug.len())
                && slug.starts_with(|c: char| c.is_ascii_lowercase() || c.is_ascii_digit())
                && slug
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        })
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
pub struct IdeaFile {
    pub path: String,
    pub sha: String,
    pub text: String,
}

/// What `ideas.json` in the cache directory holds: the files of the last listing.
#[derive(Debug, Default, Deserialize, Serialize)]
pub struct Cache {
    pub repo: String,
    pub files: Vec<IdeaFile>,
}

/// The ideas a folder listing names, as `(path, sha)`; subfolders and other files are left out.
pub fn listed(entries: &[FolderEntry]) -> Vec<(String, String)> {
    entries
        .iter()
        .filter(|entry| entry.kind == "file")
        .map(|entry| (format!("{FOLDER}/{}", entry.name), entry.sha.clone()))
        .filter(|(path, _)| is_idea_path(path))
        .collect()
}

/// Every idea, the unchanged ones from `known` and the rest read from GitHub.
pub async fn fetch(client: &Client, known: &[IdeaFile]) -> Result<Vec<IdeaFile>, String> {
    let mut files = Vec::new();
    for (path, sha) in listed(&client.folder(FOLDER).await?) {
        if let Some(file) = known.iter().find(|f| f.path == path && f.sha == sha) {
            files.push(file.clone());
        } else if let Read::Found { content, sha, .. } =
            client.read(&encode_path(&path), None).await?
        {
            files.push(IdeaFile {
                path,
                sha,
                text: content,
            });
        }
    }
    Ok(files)
}

/// Writes an idea: without `sha` only as a new file, with it only over that version. The caller
/// has checked `path` with `is_idea_path`.
pub async fn save(
    client: &Client,
    path: &str,
    content: &str,
    sha: Option<&str>,
) -> Result<(), String> {
    let slug = path
        .trim_start_matches(".kh/ideas/")
        .trim_end_matches(".md");
    let message = match sha {
        Some(_) => format!("kaihuman: idea {slug} — update via the desktop palette"),
        None => format!("kaihuman: idea {slug} — new via the desktop palette"),
    };
    match client.put(path, content, sha, &message).await? {
        Put::Written { .. } => Ok(()),
        Put::Rejected => Err(rejected(slug, sha.is_some())),
    }
}

/// Why GitHub refused the write: the version changed, or the slug is taken.
fn rejected(slug: &str, update: bool) -> String {
    if update {
        format!("The idea {slug} changed since it was listed — open it again and retry")
    } else {
        format!("There is an idea {slug} already")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mirrors_idea_slug_of() {
        for good in [
            ".kh/ideas/palette-sync.md",
            ".kh/ideas/a1.md",
            ".kh/ideas/0-start.md",
            ".kh/ideas/abcdefghijklmnopqrstuvwxyz0123456789abcd.md",
        ] {
            assert!(is_idea_path(good), "{good} should be allowed");
        }
        for bad in [
            ".kh/ideas/a.md",
            ".kh/ideas/-a.md",
            ".kh/ideas/Palette.md",
            ".kh/ideas/a_b.md",
            ".kh/ideas/sub/ab.md",
            ".kh/ideas/../ab.md",
            ".kh/ideas/ab.txt",
            ".kh/ideas/.md",
            "/.kh/ideas/ab.md",
            ".kh/raw/ab.md",
            ".kh/ideas/abcdefghijklmnopqrstuvwxyz0123456789abcde.md",
        ] {
            assert!(!is_idea_path(bad), "{bad} should be refused");
        }
    }

    #[test]
    fn lists_only_the_idea_files_of_a_folder() {
        let entries: Vec<FolderEntry> = serde_json::from_value(serde_json::json!([
            { "name": "palette-sync.md", "sha": "a", "type": "file" },
            { "name": "README.txt", "sha": "b", "type": "file" },
            { "name": "old", "sha": "c", "type": "dir" },
            { "name": "x.md", "sha": "d", "type": "file" }
        ]))
        .unwrap();
        assert_eq!(
            listed(&entries),
            [(".kh/ideas/palette-sync.md".to_string(), "a".to_string())]
        );
    }

    #[test]
    fn says_why_a_write_was_refused() {
        assert_eq!(rejected("ab", false), "There is an idea ab already");
        assert!(rejected("ab", true).starts_with("The idea ab changed since it was listed"));
    }
}
