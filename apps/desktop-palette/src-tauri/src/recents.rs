//! What the palette last did, so it can be repeated from the top of the list.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::config::{mode_recents_file, read_json, recents_file, write_json};

/// How many entries are kept, as in the extension.
const LIMIT: usize = 10;

/// `RecentEntry` in packages/palette/src/command-palette.ts.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
pub struct RecentEntry {
    pub id: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subtitle: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

pub fn load() -> Vec<RecentEntry> {
    read_json(&recents_file()).unwrap_or_default()
}

/// Newest first, one entry per id, capped — so repeating something moves it back to the top.
pub fn with_entry(recents: Vec<RecentEntry>, entry: RecentEntry) -> Vec<RecentEntry> {
    if entry.id.is_empty() || entry.title.is_empty() {
        return recents;
    }
    let rest: Vec<_> = recents
        .into_iter()
        .filter(|candidate| candidate.id != entry.id)
        .collect();
    std::iter::once(entry).chain(rest).take(LIMIT).collect()
}

pub fn remember(entry: RecentEntry) -> Result<Vec<RecentEntry>, String> {
    let recents = with_entry(load(), entry);
    write_json(&recents_file(), &recents)?;
    Ok(recents)
}

/// Each prefix mode's recently chosen ids, newest first — `withModeRecent` in
/// packages/palette/src/command-palette.ts, which keeps as many.
pub fn with_mode_recent(ids: Vec<String>, id: &str) -> Vec<String> {
    if id.is_empty() {
        return ids;
    }
    std::iter::once(id.to_string())
        .chain(ids.into_iter().filter(|known| known != id))
        .take(LIMIT)
        .collect()
}

fn load_all_modes() -> BTreeMap<String, Vec<String>> {
    read_json(&mode_recents_file()).unwrap_or_default()
}

pub fn load_mode(prefix: &str) -> Vec<String> {
    load_all_modes().remove(prefix).unwrap_or_default()
}

pub fn remember_mode(prefix: &str, id: &str) -> Result<Vec<String>, String> {
    if prefix.is_empty() || id.is_empty() {
        return Err("A mode recent needs a prefix and an id".into());
    }
    let mut all = load_all_modes();
    let ids = with_mode_recent(all.remove(prefix).unwrap_or_default(), id);
    all.insert(prefix.to_string(), ids.clone());
    write_json(&mode_recents_file(), &all)?;
    Ok(ids)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(id: &str) -> RecentEntry {
        RecentEntry {
            id: id.into(),
            title: id.into(),
            subtitle: None,
            url: None,
        }
    }

    #[test]
    fn moves_a_repeat_to_the_top_and_keeps_ten() {
        let recents: Vec<_> = (0..10).map(|i| entry(&i.to_string())).collect();
        let next = with_entry(recents, entry("5"));
        assert_eq!(next.len(), 10);
        assert_eq!(next[0].id, "5");
        assert_eq!(next.iter().filter(|e| e.id == "5").count(), 1);

        let next = with_entry(next, entry("new"));
        assert_eq!(next[0].id, "new");
        assert_eq!(next.len(), 10);
        assert!(!next.iter().any(|e| e.id == "9"));
    }

    #[test]
    fn ignores_entries_without_an_id_or_title() {
        let recents = vec![entry("a")];
        assert_eq!(with_entry(recents.clone(), entry("")), recents);
    }

    #[test]
    fn keeps_each_modes_ten_newest_first() {
        let ids: Vec<String> = (0..10).map(|i| i.to_string()).collect();
        let next = with_mode_recent(ids, "5");
        assert_eq!(next.len(), 10);
        assert_eq!(next[0], "5");
        assert_eq!(next.iter().filter(|id| *id == "5").count(), 1);
        let next = with_mode_recent(next, "new");
        assert_eq!(next[0], "new");
        assert!(!next.contains(&"9".to_string()));
        assert_eq!(with_mode_recent(next.clone(), ""), next);
    }
}
