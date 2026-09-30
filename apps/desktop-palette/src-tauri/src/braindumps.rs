//! Braindumps (doc/braindump.md): texts typed in the braindump window, one markdown file each in
//! the repo's `.kh/braindumps/`, with a copy on this machine so typing never waits for GitHub.
//!
//! Each repository has its own directory, `$XDG_DATA_HOME/lifosy/braindumps/<owner>/<name>/`, so
//! switching repositories never moves a braindump. There, `<id>.md` is the text and `<id>.json`
//! is what GitHub last had (`Synced`). Together they say what a sync has to do:
//!
//! | `<id>.md` | `<id>.json`       | state                                 |
//! | --------- | ----------------- | ------------------------------------- |
//! | yes       | no                | new here: create it on GitHub         |
//! | yes       | other text        | edited here: update it on GitHub      |
//! | yes       | the same text     | synced                                |
//! | no        | yes               | deleted here: delete it on GitHub     |

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::config::is_repo_name;
use crate::dumps::is_dump_id;
use crate::github::{Client, Delete, Put, Read};

/// Mirrors `BRAINDUMP_FOLDER` in packages/formats/src/braindumps.ts.
pub const FOLDER: &str = ".kh/braindumps";

/// The id rule is the dumps' one: digits only, the creation time in ms.
pub fn is_braindump_id(id: &str) -> bool {
    is_dump_id(id)
}

pub fn repo_path(id: &str) -> String {
    format!("{FOLDER}/{id}.md")
}

/// Mirrors `braindumpTitle`: the first non-empty line without heading marks, at most 60 characters.
pub fn title(text: &str) -> String {
    let line = text
        .lines()
        .map(|line| line.trim().trim_start_matches('#').trim())
        .find(|line| !line.is_empty())
        .unwrap_or("");
    if line.is_empty() {
        return "(blank)".into();
    }
    if line.chars().count() > 60 {
        format!("{}…", line.chars().take(59).collect::<String>())
    } else {
        line.to_string()
    }
}

/// `{ id, text, updatedAt, synced }`, as `Braindump` in packages/palette/src/protocol.ts.
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Braindump {
    pub id: String,
    pub text: String,
    pub updated_at: u64,
    pub synced: bool,
}

/// The version GitHub last had and its text.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct Synced {
    pub sha: String,
    pub text: String,
}

/// Held for every look at the files that is followed by a write, so a save from the window and a
/// sync never interleave there. Never held across a GitHub call.
static FILES: Mutex<()> = Mutex::new(());

fn files() -> std::sync::MutexGuard<'static, ()> {
    FILES
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// One repository's braindumps on this machine.
pub struct Store {
    dir: PathBuf,
}

impl Store {
    pub fn new(root: &Path, repo: &str) -> Result<Self, String> {
        if !is_repo_name(repo) {
            return Err(format!("{repo} is not an owner/name repository"));
        }
        Ok(Self {
            dir: root.join(repo),
        })
    }

    fn text_file(&self, id: &str) -> PathBuf {
        self.dir.join(format!("{id}.md"))
    }

    fn synced_file(&self, id: &str) -> PathBuf {
        self.dir.join(format!("{id}.json"))
    }

    fn text(&self, id: &str) -> Option<String> {
        std::fs::read_to_string(self.text_file(id)).ok()
    }

    fn synced(&self, id: &str) -> Option<Synced> {
        crate::config::read_json(&self.synced_file(id))
    }

    fn write_text(&self, id: &str, text: &str) -> Result<(), String> {
        std::fs::create_dir_all(&self.dir)
            .map_err(|error| format!("could not create {}: {error}", self.dir.display()))?;
        std::fs::write(self.text_file(id), text)
            .map_err(|error| format!("could not save the braindump: {error}"))
    }

    fn write_synced(&self, id: &str, synced: &Synced) -> Result<(), String> {
        crate::config::write_json(&self.synced_file(id), synced)
    }

    fn remove(path: &Path) -> Result<(), String> {
        match std::fs::remove_file(path) {
            Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
                Err(format!("could not delete {}: {error}", path.display()))
            }
            _ => Ok(()),
        }
    }

    /// Every id with a text or a sync record, in no particular order.
    fn ids(&self) -> Vec<String> {
        let Ok(entries) = std::fs::read_dir(&self.dir) else {
            return Vec::new();
        };
        let mut ids: Vec<String> = entries
            .flatten()
            .filter_map(|entry| {
                let name = entry.file_name().into_string().ok()?;
                let id = name
                    .strip_suffix(".md")
                    .or_else(|| name.strip_suffix(".json"))?;
                is_braindump_id(id).then(|| id.to_string())
            })
            .collect();
        ids.sort();
        ids.dedup();
        ids
    }

    /// The braindumps with a text here, most recently edited first.
    pub fn list(&self) -> Vec<Braindump> {
        let _files = files();
        let mut list: Vec<Braindump> = self
            .ids()
            .into_iter()
            .filter_map(|id| {
                let text = self.text(&id)?;
                let synced = self.synced(&id).is_some_and(|synced| synced.text == text);
                Some(Braindump {
                    updated_at: modified_ms(&self.text_file(&id)),
                    id,
                    text,
                    synced,
                })
            })
            .collect();
        list.sort_by(|a, b| {
            b.updated_at
                .cmp(&a.updated_at)
                .then_with(|| b.id.cmp(&a.id))
        });
        list
    }

    /// Saves here only — GitHub follows on the next sync. A new braindump (no `id`) is created
    /// only once it has text; empty text deletes it and answers `None`.
    pub fn save(
        &self,
        id: Option<&str>,
        text: &str,
        now_ms: u64,
    ) -> Result<Option<String>, String> {
        if let Some(id) = id
            && !is_braindump_id(id)
        {
            return Err(format!("{id} is not a braindump"));
        }
        let _files = files();
        if text.is_empty() {
            if let Some(id) = id {
                Self::remove(&self.text_file(id))?;
            }
            return Ok(None);
        }
        let id = match id {
            Some(id) => id.to_string(),
            None => self.free_id(now_ms),
        };
        self.write_text(&id, text)?;
        Ok(Some(id))
    }

    /// The first id from `now_ms` on that names nothing here, not even a delete still to be synced.
    fn free_id(&self, now_ms: u64) -> String {
        (now_ms..)
            .map(|candidate| candidate.to_string())
            .find(|candidate| {
                !self.text_file(candidate).exists() && !self.synced_file(candidate).exists()
            })
            .unwrap_or_default()
    }

    fn snapshot(&self, id: &str) -> (Option<String>, Option<Synced>) {
        let _files = files();
        (self.text(id), self.synced(id))
    }

    fn record(&self, id: &str, synced: &Synced) -> Result<(), String> {
        let _files = files();
        self.write_synced(id, synced)
    }

    fn forget(&self, id: &str) -> Result<(), String> {
        let _files = files();
        Self::remove(&self.synced_file(id))
    }

    /// Takes GitHub's version, unless the text here changed since `expected` was read.
    fn take(&self, id: &str, expected: Option<&str>, synced: Synced) -> Result<(), String> {
        let _files = files();
        if self.text(id).as_deref() != expected {
            return Ok(());
        }
        self.write_text(id, &synced.text)?;
        self.write_synced(id, &synced)
    }

    /// Drops a synced braindump that GitHub no longer has, unless it was edited meanwhile.
    fn drop_if_unchanged(&self, id: &str, synced: &Synced) -> Result<(), String> {
        let _files = files();
        match self.text(id) {
            Some(text) if text != synced.text => Ok(()),
            _ => {
                Self::remove(&self.text_file(id))?;
                Self::remove(&self.synced_file(id))
            }
        }
    }
}

fn modified_ms(path: &Path) -> u64 {
    std::fs::metadata(path)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map_or(0, |since| since.as_millis() as u64)
}

/// The GitHub calls a sync makes, so the rules can be tested without GitHub.
pub trait Remote {
    /// The file's text and version, or `None` when it does not exist.
    async fn read(&self, path: &str) -> Result<Option<Synced>, String>;
    async fn put(
        &self,
        path: &str,
        text: &str,
        sha: Option<&str>,
        message: &str,
    ) -> Result<Put, String>;
    async fn delete(&self, path: &str, sha: &str, message: &str) -> Result<Delete, String>;
    /// `(id, sha)` of each braindump in the repo.
    async fn list(&self) -> Result<Vec<(String, String)>, String>;
}

impl Remote for Client {
    async fn read(&self, path: &str) -> Result<Option<Synced>, String> {
        Ok(match Client::read(self, path, None).await? {
            Read::Found { content, sha, .. } => Some(Synced { sha, text: content }),
            Read::Missing | Read::NotModified => None,
        })
    }

    async fn put(
        &self,
        path: &str,
        text: &str,
        sha: Option<&str>,
        message: &str,
    ) -> Result<Put, String> {
        Client::put(self, path, text, sha, message).await
    }

    async fn delete(&self, path: &str, sha: &str, message: &str) -> Result<Delete, String> {
        Client::delete(self, path, sha, message).await
    }

    async fn list(&self) -> Result<Vec<(String, String)>, String> {
        Ok(self
            .folder(FOLDER)
            .await?
            .into_iter()
            .filter(|entry| entry.kind == "file")
            .filter_map(|entry| {
                let id = entry.name.strip_suffix(".md")?;
                is_braindump_id(id).then(|| (id.to_string(), entry.sha))
            })
            .collect())
    }
}

/// Only one sync at a time: the window may ask again (on hide, on a timer) while one is running.
static SYNCING: tauri::async_runtime::Mutex<()> = tauri::async_runtime::Mutex::const_new(());

/// Sends what changed here to GitHub, then takes what changed there. Every braindump is tried;
/// the answer is the first failure, and whatever failed is tried again on the next sync.
pub async fn sync(store: &Store, remote: &impl Remote, now_ms: u64) -> Result<(), String> {
    let _syncing = SYNCING.lock().await;
    let mut first_error = None;
    for id in store.ids() {
        if let Err(error) = push(store, remote, &id, now_ms).await {
            first_error.get_or_insert(error);
        }
    }
    if let Err(error) = pull(store, remote).await {
        first_error.get_or_insert(error);
    }
    first_error.map_or(Ok(()), Err)
}

async fn push(store: &Store, remote: &impl Remote, id: &str, now_ms: u64) -> Result<(), String> {
    let path = repo_path(id);
    match store.snapshot(id) {
        (None, None) => Ok(()),
        (Some(text), Some(synced)) if text == synced.text => Ok(()),
        (None, Some(synced)) => delete(store, remote, id, &path, &synced).await,
        (Some(text), synced) => {
            let message = format!("braindump: {}", title(&text));
            let sha = synced.as_ref().map(|synced| synced.sha.as_str());
            if let Put::Written { sha } = remote.put(&path, &text, sha, &message).await? {
                return store.record(id, &Synced { sha, text });
            }
            resolve(store, remote, id, &path, text, synced, &message, now_ms).await
        }
    }
}

/// GitHub refused the write: the file is not the version this machine last saw.
#[allow(clippy::too_many_arguments)]
async fn resolve(
    store: &Store,
    remote: &impl Remote,
    id: &str,
    path: &str,
    text: String,
    synced: Option<Synced>,
    message: &str,
    now_ms: u64,
) -> Result<(), String> {
    let theirs = match remote.read(path).await? {
        // Deleted elsewhere after it was typed in here: what was typed wins, as a new file.
        None => {
            return match remote.put(path, &text, None, message).await? {
                Put::Written { sha } => store.record(id, &Synced { sha, text }),
                Put::Rejected => Err(format!("{path} changed while syncing — will retry")),
            };
        }
        Some(theirs) => theirs,
    };
    if theirs.text == text {
        return store.record(id, &theirs);
    }
    let seen_before = synced.is_some_and(|synced| synced.text == theirs.text);
    if !seen_before {
        // Edited elsewhere too. Their version becomes a braindump of its own, and this one is
        // based on theirs from now on, so a failure below never makes a second copy.
        let copy = store.save(None, &theirs.text, now_ms)?;
        store.record(id, &theirs)?;
        if let Some(copy) = copy {
            let message = format!("braindump: {} (other version)", title(&theirs.text));
            if let Put::Written { sha } = remote
                .put(&repo_path(&copy), &theirs.text, None, &message)
                .await?
            {
                store.record(
                    &copy,
                    &Synced {
                        sha,
                        text: theirs.text,
                    },
                )?;
            }
        }
    }
    match remote.put(path, &text, Some(&theirs.sha), message).await? {
        Put::Written { sha } => store.record(id, &Synced { sha, text }),
        Put::Rejected => Err(format!("{path} changed while syncing — will retry")),
    }
}

async fn delete(
    store: &Store,
    remote: &impl Remote,
    id: &str,
    path: &str,
    synced: &Synced,
) -> Result<(), String> {
    let message = format!("braindump: delete {}", title(&synced.text));
    match remote.delete(path, &synced.sha, &message).await? {
        Delete::Deleted | Delete::Missing => return store.forget(id),
        Delete::Rejected => {}
    }
    match remote.read(path).await? {
        None => store.forget(id),
        // Only the version was stale; the text is still the one deleted here.
        Some(theirs) if theirs.text == synced.text => {
            match remote.delete(path, &theirs.sha, &message).await? {
                Delete::Deleted | Delete::Missing => store.forget(id),
                Delete::Rejected => Err(format!("{path} changed while syncing — will retry")),
            }
        }
        // Edited elsewhere after it was last seen here: a delete never throws that away.
        Some(theirs) => store.take(id, None, theirs),
    }
}

/// Takes new and changed braindumps from GitHub and drops the ones deleted there — but only
/// where nothing here is waiting to be sent.
async fn pull(store: &Store, remote: &impl Remote) -> Result<(), String> {
    let theirs = remote.list().await?;
    for (id, sha) in &theirs {
        let (text, synced) = store.snapshot(id);
        let expected = match (&text, &synced) {
            (_, Some(synced)) if &synced.sha == sha => continue,
            (None, None) => None,
            (Some(text), Some(synced)) if *text == synced.text => Some(text.as_str()),
            // Edited, created or deleted here: the next push settles it.
            _ => continue,
        };
        if let Some(file) = remote.read(&repo_path(id)).await? {
            store.take(id, expected, file)?;
        }
    }
    for id in store.ids() {
        if theirs.iter().any(|(known, _)| *known == id) {
            continue;
        }
        if let (_, Some(synced)) = store.snapshot(&id) {
            store.drop_if_unchanged(&id, &synced)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::BTreeMap;

    /// GitHub in memory: path → (sha, text), a counter for new versions, and a switch to go offline.
    #[derive(Default)]
    struct Fake {
        files: RefCell<BTreeMap<String, Synced>>,
        next: RefCell<u32>,
        offline: RefCell<bool>,
        /// When set, writes fail as if offline once this many have been made.
        puts_left: RefCell<Option<u32>>,
        messages: RefCell<Vec<String>>,
    }

    impl Fake {
        fn online(&self) -> Result<(), String> {
            if *self.offline.borrow() {
                return Err("Could not reach GitHub: offline".into());
            }
            Ok(())
        }

        fn version(&self) -> String {
            *self.next.borrow_mut() += 1;
            format!("v{}", self.next.borrow())
        }

        /// A change made elsewhere — the new tab, another machine.
        fn edit(&self, id: &str, text: &str) {
            let sha = self.version();
            self.files.borrow_mut().insert(
                repo_path(id),
                Synced {
                    sha,
                    text: text.into(),
                },
            );
        }

        fn text(&self, id: &str) -> Option<String> {
            self.files
                .borrow()
                .get(&repo_path(id))
                .map(|file| file.text.clone())
        }

        fn texts(&self) -> Vec<String> {
            self.files
                .borrow()
                .values()
                .map(|file| file.text.clone())
                .collect()
        }
    }

    impl Remote for Fake {
        async fn read(&self, path: &str) -> Result<Option<Synced>, String> {
            self.online()?;
            Ok(self.files.borrow().get(path).cloned())
        }

        async fn put(
            &self,
            path: &str,
            text: &str,
            sha: Option<&str>,
            message: &str,
        ) -> Result<Put, String> {
            self.online()?;
            if let Some(left) = self.puts_left.borrow_mut().as_mut() {
                if *left == 0 {
                    return Err("Could not reach GitHub: offline".into());
                }
                *left -= 1;
            }
            let current = self.files.borrow().get(path).map(|file| file.sha.clone());
            if current.as_deref() != sha {
                return Ok(Put::Rejected);
            }
            let sha = self.version();
            self.files.borrow_mut().insert(
                path.into(),
                Synced {
                    sha: sha.clone(),
                    text: text.into(),
                },
            );
            self.messages.borrow_mut().push(message.into());
            Ok(Put::Written { sha })
        }

        async fn delete(&self, path: &str, sha: &str, message: &str) -> Result<Delete, String> {
            self.online()?;
            let mut files = self.files.borrow_mut();
            match files.get(path) {
                None => Ok(Delete::Missing),
                Some(file) if file.sha != sha => Ok(Delete::Rejected),
                Some(_) => {
                    files.remove(path);
                    self.messages.borrow_mut().push(message.into());
                    Ok(Delete::Deleted)
                }
            }
        }

        async fn list(&self) -> Result<Vec<(String, String)>, String> {
            self.online()?;
            Ok(self
                .files
                .borrow()
                .iter()
                .filter_map(|(path, file)| {
                    let id = path.strip_prefix(".kh/braindumps/")?.strip_suffix(".md")?;
                    Some((id.to_string(), file.sha.clone()))
                })
                .collect())
        }
    }

    fn store(name: &str) -> Store {
        let root =
            std::env::temp_dir().join(format!("lifosy-braindumps-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        Store::new(&root, "o/r").unwrap()
    }

    fn texts(store: &Store) -> Vec<(String, bool)> {
        let mut texts: Vec<(String, bool)> = store
            .list()
            .into_iter()
            .map(|dump| (dump.text, dump.synced))
            .collect();
        texts.sort();
        texts
    }

    fn cleanup(store: Store) {
        std::fs::remove_dir_all(store.dir.parent().unwrap().parent().unwrap()).unwrap();
    }

    async fn sync_ok(store: &Store, fake: &Fake) {
        sync(store, fake, 5_000).await.unwrap();
    }

    #[tokio::test]
    async fn creates_then_updates_with_the_version_it_got_back() {
        let store = store("create");
        let fake = Fake::default();
        let id = store.save(None, "# Plan\n- a", 1_000).unwrap().unwrap();
        assert_eq!(texts(&store), [("# Plan\n- a".into(), false)]);

        sync_ok(&store, &fake).await;
        assert_eq!(fake.text(&id).as_deref(), Some("# Plan\n- a"));
        assert_eq!(texts(&store), [("# Plan\n- a".into(), true)]);

        store.save(Some(&id), "# Plan\n- a\n- b", 0).unwrap();
        sync_ok(&store, &fake).await;
        assert_eq!(fake.text(&id).as_deref(), Some("# Plan\n- a\n- b"));
        assert_eq!(
            *fake.messages.borrow(),
            ["braindump: Plan", "braindump: Plan"]
        );

        // Nothing changed: nothing is written.
        sync_ok(&store, &fake).await;
        assert_eq!(fake.messages.borrow().len(), 2);
        cleanup(store);
    }

    #[tokio::test]
    async fn never_creates_an_empty_one_and_deletes_a_cleared_one() {
        let store = store("delete");
        let fake = Fake::default();
        assert_eq!(store.save(None, "", 1).unwrap(), None);
        let id = store.save(None, "x", 1).unwrap().unwrap();
        sync_ok(&store, &fake).await;

        assert_eq!(store.save(Some(&id), "", 2).unwrap(), None);
        assert!(store.list().is_empty());
        sync_ok(&store, &fake).await;
        assert!(fake.texts().is_empty());
        assert!(store.ids().is_empty(), "the sync record goes too");
        cleanup(store);
    }

    #[tokio::test]
    async fn keeps_everything_while_offline_and_sends_it_later() {
        let store = store("offline");
        let fake = Fake::default();
        *fake.offline.borrow_mut() = true;
        let id = store.save(None, "typed on the train", 1).unwrap().unwrap();
        let error = sync(&store, &fake, 5).await.unwrap_err();
        assert!(error.contains("offline"), "{error}");
        assert_eq!(texts(&store), [("typed on the train".into(), false)]);

        *fake.offline.borrow_mut() = false;
        sync_ok(&store, &fake).await;
        assert_eq!(fake.text(&id).as_deref(), Some("typed on the train"));
        cleanup(store);
    }

    #[tokio::test]
    async fn retries_with_the_new_version_when_only_the_version_is_stale() {
        let store = store("stale");
        let fake = Fake::default();
        let id = store.save(None, "one", 1).unwrap().unwrap();
        sync_ok(&store, &fake).await;
        // Same text, new version — say a write whose answer never arrived.
        fake.edit(&id, "one");

        store.save(Some(&id), "one, two", 0).unwrap();
        sync_ok(&store, &fake).await;
        assert_eq!(fake.texts(), ["one, two"]);
        assert_eq!(texts(&store), [("one, two".into(), true)]);
        cleanup(store);
    }

    #[tokio::test]
    async fn keeps_both_versions_when_edited_in_two_places() {
        let store = store("conflict");
        let fake = Fake::default();
        let id = store.save(None, "base", 1).unwrap().unwrap();
        sync_ok(&store, &fake).await;
        fake.edit(&id, "theirs");

        store.save(Some(&id), "mine", 0).unwrap();
        sync_ok(&store, &fake).await;
        assert_eq!(fake.text(&id).as_deref(), Some("mine"));
        let mut remote = fake.texts();
        remote.sort();
        assert_eq!(remote, ["mine", "theirs"]);
        assert_eq!(
            texts(&store),
            [("mine".into(), true), ("theirs".into(), true)]
        );
        cleanup(store);
    }

    #[tokio::test]
    async fn makes_only_one_copy_when_the_conflict_takes_two_syncs() {
        let store = store("conflict-offline");
        let fake = Fake::default();
        let id = store.save(None, "base", 1).unwrap().unwrap();
        sync_ok(&store, &fake).await;
        fake.edit(&id, "theirs");
        store.save(Some(&id), "mine", 0).unwrap();

        // The first write is refused, their copy is sent, then GitHub goes away.
        *fake.puts_left.borrow_mut() = Some(2);
        assert!(sync(&store, &fake, 5_000).await.is_err());
        assert_eq!(fake.text(&id).as_deref(), Some("theirs"));

        *fake.puts_left.borrow_mut() = None;
        sync_ok(&store, &fake).await;
        let mut remote = fake.texts();
        remote.sort();
        assert_eq!(remote, ["mine", "theirs"]);
        assert_eq!(
            texts(&store),
            [("mine".into(), true), ("theirs".into(), true)]
        );
        cleanup(store);
    }

    #[tokio::test]
    async fn sends_again_what_was_typed_after_a_delete_elsewhere() {
        let store = store("deleted-edited");
        let fake = Fake::default();
        let id = store.save(None, "draft", 1).unwrap().unwrap();
        sync_ok(&store, &fake).await;
        fake.files.borrow_mut().clear();

        store.save(Some(&id), "draft, more", 0).unwrap();
        sync_ok(&store, &fake).await;
        assert_eq!(fake.text(&id).as_deref(), Some("draft, more"));
        cleanup(store);
    }

    #[tokio::test]
    async fn drops_what_was_deleted_elsewhere_and_not_touched_here() {
        let store = store("deleted-clean");
        let fake = Fake::default();
        store.save(None, "done with this", 1).unwrap();
        sync_ok(&store, &fake).await;
        fake.files.borrow_mut().clear();

        sync_ok(&store, &fake).await;
        assert!(store.list().is_empty());
        assert!(store.ids().is_empty());
        cleanup(store);
    }

    #[tokio::test]
    async fn takes_new_and_changed_braindumps_from_github() {
        let store = store("pull");
        let fake = Fake::default();
        let id = store.save(None, "mine", 1).unwrap().unwrap();
        sync_ok(&store, &fake).await;
        fake.edit(&id, "mine, edited elsewhere");
        fake.edit("42", "from the other laptop");

        sync_ok(&store, &fake).await;
        assert_eq!(
            texts(&store),
            [
                ("from the other laptop".into(), true),
                ("mine, edited elsewhere".into(), true)
            ]
        );
        cleanup(store);
    }

    #[tokio::test]
    async fn a_delete_here_never_throws_away_an_edit_made_elsewhere() {
        let store = store("delete-conflict");
        let fake = Fake::default();
        let id = store.save(None, "old", 1).unwrap().unwrap();
        sync_ok(&store, &fake).await;
        fake.edit(&id, "new, from elsewhere");

        store.save(Some(&id), "", 0).unwrap();
        sync_ok(&store, &fake).await;
        assert_eq!(fake.text(&id).as_deref(), Some("new, from elsewhere"));
        assert_eq!(texts(&store), [("new, from elsewhere".into(), true)]);
        cleanup(store);
    }

    #[test]
    fn keeps_a_new_id_clear_of_a_delete_still_to_be_sent() {
        let store = store("ids");
        store
            .record(
                "5",
                &Synced {
                    sha: "v1".into(),
                    text: "x".into(),
                },
            )
            .unwrap();
        assert_eq!(store.save(None, "y", 5).unwrap().as_deref(), Some("6"));
        for bad in ["../x", "a", "", "1/2"] {
            assert!(store.save(Some(bad), "x", 0).is_err(), "{bad}");
        }
        assert!(Store::new(Path::new("/tmp"), "../etc").is_err());
        cleanup(store);
    }

    #[test]
    fn titles_like_the_start_page() {
        assert_eq!(title("\n  ## Release plan \n- one"), "Release plan");
        assert_eq!(title("#\n# Real"), "Real");
        assert_eq!(title(" \n"), "(blank)");
        let long = title(&"ä".repeat(100));
        assert_eq!(long.chars().count(), 60);
        assert!(long.ends_with('…'));
    }

    #[test]
    fn names_files_in_the_braindump_folder() {
        assert_eq!(
            repo_path("1790000000000"),
            ".kh/braindumps/1790000000000.md"
        );
        assert!(is_braindump_id("1790000000000"));
        assert!(!is_braindump_id("123456789012345678901"));
    }
}
