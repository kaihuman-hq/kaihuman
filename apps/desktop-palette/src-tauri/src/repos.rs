//! GitHub repositories for the palette's `r:` mode.
//!
//! Like the extension, the desktop lists the repositories the token can see. It also reads the
//! counts file omarchy's `eee` keeps of the repositories you open most, and lists those first —
//! the extension has no such file to read.

use std::collections::HashMap;
use std::path::PathBuf;

use serde_json::{Value, json};

use crate::config::is_repo_name;
use crate::github::UserRepo;

/// `$EEE_COUNTS_FILE`, else `~/.config/eee/counts` — where `omarchy-show-repos` reads it.
pub fn counts_file() -> PathBuf {
    std::env::var_os("EEE_COUNTS_FILE")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".config/eee/counts")
        })
}

/// `owner/repo  count` per line; the count is the last field, as `omarchy-show-repos` reads it.
pub fn parse_counts(text: &str) -> Vec<(String, u64)> {
    text.lines()
        .filter_map(|line| {
            let fields: Vec<&str> = line.split_whitespace().collect();
            let (name, count) = (fields.first()?, fields.last()?.parse().ok()?);
            (fields.len() >= 2 && is_repo_name(name)).then(|| (name.to_string(), count))
        })
        .collect()
}

/// Most-opened first (then by name), then everything else in GitHub's order, each repo once.
pub fn ranked(mut counts: Vec<(String, u64)>, github: Vec<UserRepo>) -> Vec<Value> {
    counts.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    let descriptions: HashMap<String, Option<String>> = github
        .iter()
        .map(|repo| (repo.full_name.clone(), repo.description.clone()))
        .collect();
    let mut listed = std::collections::HashSet::new();
    counts
        .into_iter()
        .map(|(name, _)| name)
        .chain(github.into_iter().map(|repo| repo.full_name))
        .filter(|name| listed.insert(name.clone()))
        .map(|name| match descriptions.get(&name).cloned().flatten() {
            Some(description) => json!({ "fullName": name, "description": description }),
            None => json!({ "fullName": name }),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repo(name: &str, description: Option<&str>) -> UserRepo {
        UserRepo {
            full_name: name.into(),
            description: description.map(str::to_string),
        }
    }

    #[test]
    fn reads_counts_like_omarchy_and_skips_what_is_no_repo() {
        let text = "urbanisierung/e-invoice 11\no/r   3\nbroken\n../x 4\no/nocount x\n";
        assert_eq!(
            parse_counts(text),
            vec![
                ("urbanisierung/e-invoice".to_string(), 11),
                ("o/r".to_string(), 3)
            ]
        );
    }

    #[test]
    fn lists_the_most_opened_first_then_github_order_once_each() {
        let counts = vec![
            ("o/b".to_string(), 2),
            ("o/a".to_string(), 2),
            ("o/c".to_string(), 9),
        ];
        let github = vec![
            repo("o/z", None),
            repo("o/a", Some("A")),
            repo("o/y", Some("Y")),
        ];
        assert_eq!(
            ranked(counts, github),
            vec![
                json!({ "fullName": "o/c" }),
                json!({ "fullName": "o/a", "description": "A" }),
                json!({ "fullName": "o/b" }),
                json!({ "fullName": "o/z" }),
                json!({ "fullName": "o/y", "description": "Y" }),
            ]
        );
    }
}
