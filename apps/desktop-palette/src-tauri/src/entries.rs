//! The files the palette's `>f` mode adds entries to — todo lists, action logs and the like.
//!
//! The palette builds each entry itself (packages/palette/src/entries.ts); the desktop only lists,
//! reads and writes the files, and nothing but them.

use crate::github::TreeEntry;
use crate::prompts::prompt_file_paths;

/// Mirrors `ENTRY_SUFFIXES` in packages/palette/src/entries.ts; keep the two in step.
pub const ENTRY_SUFFIXES: [&str; 5] = [
    ".todos.md",
    ".actionlog.md",
    ".events.csv",
    ".prompts.md",
    ".commands.md",
];

/// A file of a kind the palette adds to, inside the repository — the only paths read or written.
pub fn is_entry_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    ENTRY_SUFFIXES.iter().any(|suffix| lower.ends_with(suffix))
        && !path.starts_with('/')
        && path
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != "..")
}

/// Every such file in a tree listing, sorted by path.
pub fn entry_file_paths(tree: &[TreeEntry]) -> Vec<String> {
    let mut paths: Vec<String> = ENTRY_SUFFIXES
        .iter()
        .flat_map(|suffix| prompt_file_paths(tree, suffix))
        .collect();
    paths.sort();
    paths
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
    fn lists_only_files_the_palette_adds_to() {
        let tree = [
            entry("work/Inbox.TODOS.md", "blob"),
            entry("a.events.csv", "blob"),
            entry("notes.md", "blob"),
            entry("folder.todos.md", "tree"),
        ];
        assert_eq!(
            entry_file_paths(&tree),
            vec![
                "a.events.csv".to_string(),
                "work/Inbox.TODOS.md".to_string()
            ]
        );
    }

    #[test]
    fn refuses_other_files_and_paths_out_of_the_repository() {
        assert!(is_entry_path(".kh/inbox.todos.md"));
        assert!(is_entry_path("x.commands.md"));
        for path in [
            "secret.md",
            "../x.todos.md",
            "/x.todos.md",
            "a//x.todos.md",
            "./x.todos.md",
        ] {
            assert!(!is_entry_path(path), "{path}");
        }
    }
}
