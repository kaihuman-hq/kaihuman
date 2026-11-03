//! The business files the palette's capture reads and writes (`.kh/business/...`).
//!
//! The palette decides what a capture does (packages/formats/src/business/actions/capture.ts);
//! the desktop only reads the context files and writes the one file a capture changes.

use crate::github::TreeEntry;

const ROOT: &str = ".kh/business";

/// The profile, whose presence means business is set up.
pub const PROFILE_PATH: &str = ".kh/business/business.yaml";

/// Mirrors `asSlug` in packages/formats/src/business/ids.ts: `^[a-z0-9][a-z0-9-]{1,39}$`.
fn is_slug(s: &str) -> bool {
    let bytes = s.as_bytes();
    (2..=40).contains(&bytes.len())
        && (bytes[0].is_ascii_lowercase() || bytes[0].is_ascii_digit())
        && bytes[1..]
            .iter()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || *b == b'-')
}

/// The path split below `.kh/business/`, or none outside it.
fn parts(path: &str) -> Option<Vec<&str>> {
    Some(
        path.strip_prefix(ROOT)?
            .strip_prefix('/')?
            .split('/')
            .collect(),
    )
}

fn is_timer(parts: &[&str]) -> bool {
    parts == ["time", "running.yaml"]
}

/// Mirrors `isCaptureContextPath` (via `classifyBusinessPath`) in
/// packages/formats/src/business/actions/capture.ts; keep the two in step.
pub fn is_capture_context_path(path: &str) -> bool {
    let Some(parts) = parts(path) else {
        return false;
    };
    match parts.as_slice() {
        ["business.yaml"] => true,
        ["clients", client, "client.yaml"] => is_slug(client),
        ["clients", client, "projects", file] => {
            is_slug(client) && file.strip_suffix(".yaml").is_some_and(is_slug)
        }
        rest => is_timer(rest),
    }
}

/// Mirrors `isCaptureWritePath` in packages/formats/src/business/actions/capture.ts; keep the two
/// in step.
pub fn is_capture_write_path(path: &str) -> bool {
    let Some(parts) = parts(path) else {
        return false;
    };
    match parts.as_slice() {
        ["clients", client, "todos.todos.md" | "log.actionlog.md"] => is_slug(client),
        rest => is_timer(rest),
    }
}

/// Every context file in a tree listing, sorted by path.
pub fn context_file_paths(tree: &[TreeEntry]) -> Vec<String> {
    let mut paths: Vec<String> = tree
        .iter()
        .filter(|entry| entry.kind == "blob" && is_capture_context_path(&entry.path))
        .map(|entry| entry.path.clone())
        .collect();
    paths.sort();
    paths
}

#[cfg(test)]
mod tests {
    use super::*;

    fn blob(path: &str) -> TreeEntry {
        TreeEntry {
            path: path.into(),
            kind: "blob".into(),
        }
    }

    #[test]
    fn accepts_the_context_files() {
        for path in [
            ".kh/business/business.yaml",
            ".kh/business/clients/acme/client.yaml",
            ".kh/business/clients/acme-gmbh-2/projects/website.yaml",
            ".kh/business/time/running.yaml",
        ] {
            assert!(is_capture_context_path(path), "{path}");
        }
    }

    #[test]
    fn refuses_other_context_paths() {
        for path in [
            "business.yaml",
            ".kh/business/clients/acme/notes.md",
            ".kh/business/clients/acme/todos.todos.md",
            ".kh/business/clients/Acme/client.yaml",
            ".kh/business/clients/a/client.yaml",
            ".kh/business/clients/-acme/client.yaml",
            ".kh/business/clients/../client.yaml",
            ".kh/business/clients/acme/projects/Site.yaml",
            ".kh/business/clients/acme/projects/site.md",
            ".kh/business/clients/acme/projects/a/b.yaml",
            ".kh/business/clients/acme/contracts/01ARZ3NDEKTSV4RRFFQ69G5FAV.yaml",
            ".kh/business/time/2026-11.jsonl",
            ".kh/business/time/running.yaml/x",
            ".kh/business/../business.yaml",
            ".kh/business/events.jsonl",
            ".kh/businessx/business.yaml",
        ] {
            assert!(!is_capture_context_path(path), "{path}");
        }
    }

    #[test]
    fn accepts_the_write_files() {
        for path in [
            ".kh/business/clients/acme/todos.todos.md",
            ".kh/business/clients/acme/log.actionlog.md",
            ".kh/business/time/running.yaml",
        ] {
            assert!(is_capture_write_path(path), "{path}");
        }
    }

    #[test]
    fn refuses_other_write_paths() {
        for path in [
            "todos.todos.md",
            "a/todos.todos.md",
            ".kh/business/business.yaml",
            ".kh/business/clients/acme/client.yaml",
            ".kh/business/clients/acme/notes.md",
            ".kh/business/clients/Acme/todos.todos.md",
            ".kh/business/clients/../todos.todos.md",
            ".kh/business/clients/acme/../log.actionlog.md",
            ".kh/business/clients/acme/projects/site.yaml",
            ".kh/business/time/2026-11.jsonl",
            ".kh/business/events.jsonl",
        ] {
            assert!(!is_capture_write_path(path), "{path}");
        }
    }

    #[test]
    fn slugs_are_two_to_forty_kebab_characters() {
        assert!(is_slug("ab"));
        assert!(is_slug(&"a".repeat(40)));
        assert!(!is_slug(&"a".repeat(41)));
        assert!(!is_slug("a"));
        assert!(!is_slug("a_b"));
        assert!(!is_slug("äb"));
    }

    #[test]
    fn lists_only_context_blobs_sorted() {
        let mut tree = vec![
            blob(".kh/business/time/running.yaml"),
            blob(".kh/business/clients/acme/notes.md"),
            blob(".kh/business/business.yaml"),
        ];
        tree.push(TreeEntry {
            path: ".kh/business/clients/acme/client.yaml".into(),
            kind: "tree".into(),
        });
        assert_eq!(
            context_file_paths(&tree),
            [
                ".kh/business/business.yaml",
                ".kh/business/time/running.yaml"
            ]
        );
    }
}
