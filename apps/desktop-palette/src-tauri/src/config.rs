//! Where the palette keeps things, which repository it works on, and the GitHub token.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

const KEYRING_SERVICE: &str = "kaihuman-palette";
/// The code name before October 2026: the keyring service and XDG directories it named are moved
/// over the first time they are missed.
const OLD_KEYRING_SERVICE: &str = "lifosy-palette";
const OLD_DIR_NAME: &str = "lifosy";
const KEYRING_USER: &str = "github-token";
const KEYRING_DEEPL_USER: &str = "deepl-api-key";

/// `$XDG_<kind>_HOME`, falling back to the spec's default under `$HOME`.
fn xdg_base(variable: &str, fallback: &str) -> PathBuf {
    std::env::var_os(variable)
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .unwrap_or_else(|| {
            PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(fallback)
        })
}

/// `$XDG_CONFIG_HOME`, where the browsers keep their profiles and native messaging hosts.
pub fn config_home() -> PathBuf {
    xdg_base("XDG_CONFIG_HOME", ".config")
}

/// `$XDG_<kind>_HOME/kaihuman`, taking over `$XDG_<kind>_HOME/lifosy` when only that exists.
fn xdg_dir(variable: &str, fallback: &str) -> PathBuf {
    let base = xdg_base(variable, fallback);
    let dir = base.join("kaihuman");
    if let Err(error) = adopt_old_dir(&base.join(OLD_DIR_NAME), &dir) {
        eprintln!(
            "could not move {OLD_DIR_NAME} files to {}: {error}",
            dir.display()
        );
    }
    dir
}

/// Renames `old` to `new` when `old` exists and `new` does not; a `new` already there is kept as
/// it is, so nothing is ever merged or overwritten.
fn adopt_old_dir(old: &Path, new: &Path) -> std::io::Result<()> {
    if !old.is_dir() || new.exists() {
        return Ok(());
    }
    match std::fs::rename(old, new) {
        // Another process moved it first.
        Err(_) if new.exists() => Ok(()),
        other => other,
    }
}

/// Where the omarchy dotfiles keep one shell env file per secret, sourced by the scripts that need
/// it (and edited with `ee`).
pub fn deepl_env_file() -> PathBuf {
    xdg_base("XDG_CONFIG_HOME", ".config").join("envvars/deepl.env")
}

/// The DeepL key variables an env file may set, in order of preference.
const DEEPL_KEY_NAMES: [&str; 2] = ["DEEPL_AUTH_KEY", "DEEPL_API_KEY"];

/// What a shell would get from sourcing `text` for the first of `names` it sets: `NAME=value`
/// lines, `export` optional, the value optionally quoted. A later assignment wins, as in a shell.
pub fn env_file_value(text: &str, names: &[&str]) -> Option<String> {
    let assignments: Vec<(&str, &str)> = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.starts_with('#'))
        .map(|line| line.strip_prefix("export ").unwrap_or(line))
        .filter_map(|line| line.split_once('='))
        .map(|(name, value)| (name.trim(), value.trim()))
        .collect();
    names.iter().find_map(|wanted| {
        let (_, raw) = assignments.iter().rev().find(|(name, _)| name == wanted)?;
        let value = match raw.chars().next() {
            Some(quote @ ('"' | '\'')) => raw[1..].split(quote).next().unwrap_or_default(),
            // Unquoted, a ` #` starts a comment.
            _ => raw.split(" #").next().unwrap_or_default().trim(),
        };
        (!value.is_empty()).then(|| value.to_string())
    })
}

pub fn config_file() -> PathBuf {
    xdg_dir("XDG_CONFIG_HOME", ".config").join("palette.json")
}

pub fn bookmarks_cache_file() -> PathBuf {
    xdg_dir("XDG_CACHE_HOME", ".cache").join("bookmarks.json")
}

pub fn dumps_dir() -> PathBuf {
    xdg_dir("XDG_DATA_HOME", ".local/share").join("dumps")
}

/// Braindumps kept on this machine, one directory per `owner/name` below it.
pub fn braindumps_dir() -> PathBuf {
    xdg_dir("XDG_DATA_HOME", ".local/share").join("braindumps")
}

pub fn commands_cache_file() -> PathBuf {
    xdg_dir("XDG_CACHE_HOME", ".cache").join("commands.json")
}

pub fn palette_settings_cache_file() -> PathBuf {
    xdg_dir("XDG_CACHE_HOME", ".cache").join("palette-settings.json")
}

pub fn ideas_cache_file() -> PathBuf {
    xdg_dir("XDG_CACHE_HOME", ".cache").join("ideas.json")
}

pub fn prompts_cache_file() -> PathBuf {
    xdg_dir("XDG_CACHE_HOME", ".cache").join("prompts.json")
}

pub fn recents_file() -> PathBuf {
    xdg_dir("XDG_STATE_HOME", ".local/state").join("recents.json")
}

pub fn mode_recents_file() -> PathBuf {
    xdg_dir("XDG_STATE_HOME", ".local/state").join("mode-recents.json")
}

pub fn claude_usage_cache_file() -> PathBuf {
    xdg_dir("XDG_CACHE_HOME", ".cache").join("claude-usage.json")
}

pub fn translation_history_file() -> PathBuf {
    xdg_dir("XDG_STATE_HOME", ".local/state").join("translations.json")
}

/// Reads a JSON file written by `write_json`; a missing or unreadable file is `None`.
pub fn read_json<T: for<'de> Deserialize<'de>>(path: &PathBuf) -> Option<T> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

pub fn write_json<T: Serialize>(path: &PathBuf, value: &T) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)
            .map_err(|error| format!("could not create {}: {error}", dir.display()))?;
    }
    let text = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    // Write then rename, so a crash never leaves half a file for the next read.
    let temporary = path.with_extension("json.tmp");
    std::fs::write(&temporary, text)
        .and_then(|()| std::fs::rename(&temporary, path))
        .map_err(|error| format!("could not write {}: {error}", path.display()))
}

/// `palette.json`: the repository in use and the ones offered by "Switch repository…".
#[derive(Clone, Debug, Default, PartialEq, Deserialize, Serialize)]
pub struct Settings {
    #[serde(default)]
    pub repo: Option<String>,
    #[serde(default)]
    pub repos: Vec<String>,
    /// When the repository in use last changed (ms), so the browser extension and the palette
    /// agree on the newer choice (`native_host.rs`). `None` until it first changes here.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub repo_changed_at: Option<u64>,
}

impl Settings {
    pub fn load() -> Self {
        read_json(&config_file()).unwrap_or_default()
    }

    pub fn save(&self) -> Result<(), String> {
        write_json(&config_file(), self)
    }

    /// None until a login, the switcher or the extension picks one; there is no repository to
    /// fall back to.
    pub fn repo(&self) -> Option<String> {
        self.repo.clone()
    }

    /// Makes `repo` current and remembers it for the switcher; `changed_at` is when it was
    /// chosen, recorded only when it differs from the repository in use.
    pub fn use_repo(&mut self, repo: &str, changed_at: u64) {
        if !self.repos.iter().any(|known| known == repo) {
            self.repos.push(repo.to_string());
        }
        if self.repo.as_deref() != Some(repo) {
            self.repo_changed_at = Some(changed_at);
        }
        self.repo = Some(repo.to_string());
    }

    /// Everything the switcher lists, current one included.
    pub fn known_repos(&self) -> Vec<String> {
        let mut repos = self.repos.clone();
        if let Some(current) = self.repo().filter(|current| !repos.contains(current)) {
            repos.insert(0, current);
        }
        repos
    }
}

/// `owner/name`, each part non-empty and free of anything that would change the API path.
pub fn is_repo_name(value: &str) -> bool {
    let valid = |part: &str| {
        !part.is_empty()
            && part
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
            && part != "."
            && part != ".."
    };
    matches!(value.split_once('/'), Some((owner, name)) if valid(owner) && valid(name))
}

/// Shown wherever the palette needs a repository and none has been picked yet.
pub const NO_REPO: &str = "No repository selected — log in with the kaihuman console, or run \
                           `kaihuman-palette login --repo owner/name`";

fn keyring_entry(user: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, user)
        .map_err(|error| format!("the keyring is unavailable: {error}"))
}

/// The secret kept for `user`, moved from the old service name the first time it is missing.
fn stored_secret(user: &str) -> keyring::Result<String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, user)?;
    match entry.get_password() {
        Err(keyring::Error::NoEntry) => {
            let old = keyring::Entry::new(OLD_KEYRING_SERVICE, user)?;
            let secret = old.get_password()?;
            entry.set_password(&secret)?;
            // Stored under the new name, so a stale copy left behind is harmless.
            let _ = old.delete_credential();
            Ok(secret)
        }
        other => other,
    }
}

/// The token from `KAIHUMAN_GITHUB_TOKEN` if set, else from the Secret Service.
///
/// The variable is for development and tests; `kaihuman-palette login` is the normal way in, and
/// nothing ever writes the token to a file.
pub fn token() -> Result<String, String> {
    if let Some(token) = std::env::var("KAIHUMAN_GITHUB_TOKEN")
        .ok()
        .filter(|token| !token.is_empty())
    {
        return Ok(token);
    }
    match stored_secret(KEYRING_USER) {
        Ok(token) => Ok(token),
        Err(keyring::Error::NoEntry) => Err(
            "Not logged in — run “Log in with the kaihuman console” or `kaihuman-palette login`"
                .into(),
        ),
        Err(error) => Err(format!(
            "Could not read the token from the keyring ({error}). Is a Secret Service \
             (gnome-keyring, KeePassXC) running?"
        )),
    }
}

pub fn store_token(token: &str) -> Result<(), String> {
    keyring_entry(KEYRING_USER)?
        .set_password(token)
        .map_err(|error| {
            format!(
                "Could not store the token in the keyring ({error}). Is a Secret Service \
                 (gnome-keyring, KeePassXC) running?"
            )
        })
}

pub fn forget_token() -> Result<(), String> {
    // The old service's copy too, or the next lookup would move it back.
    for service in [KEYRING_SERVICE, OLD_KEYRING_SERVICE] {
        let entry = keyring::Entry::new(service, KEYRING_USER)
            .map_err(|error| format!("the keyring is unavailable: {error}"))?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(error) => return Err(format!("could not remove the token: {error}")),
        }
    }
    Ok(())
}

/// The DeepL key, looked up on every translation so an edited file needs no daemon restart:
/// `DEEPL_AUTH_KEY` in the environment, else `~/.config/envvars/deepl.env`, else the Secret
/// Service, where “Set the DeepL API key…” puts it.
pub fn deepl_key() -> Result<String, String> {
    if let Some(key) = std::env::var("DEEPL_AUTH_KEY")
        .ok()
        .filter(|key| !key.is_empty())
    {
        return Ok(key);
    }
    let env_file = deepl_env_file();
    if let Some(key) = std::fs::read_to_string(&env_file)
        .ok()
        .and_then(|text| env_file_value(&text, &DEEPL_KEY_NAMES))
    {
        return Ok(key);
    }
    match stored_secret(KEYRING_DEEPL_USER) {
        Ok(key) => Ok(key),
        Err(keyring::Error::NoEntry) => Err(format!(
            "No DeepL API key yet — put DEEPL_AUTH_KEY=… in {}, or run “Set the DeepL API key…”",
            env_file.display()
        )),
        Err(error) => Err(format!(
            "Could not read the DeepL key from the keyring ({error}). Is a Secret Service running?"
        )),
    }
}

/// Stores the DeepL key; an empty one forgets it.
pub fn store_deepl_key(key: &str) -> Result<(), String> {
    let entry = keyring_entry(KEYRING_DEEPL_USER)?;
    let outcome = if key.is_empty() {
        match entry.delete_credential() {
            Err(keyring::Error::NoEntry) => Ok(()),
            other => other,
        }
    } else {
        entry.set_password(key)
    };
    outcome.map_err(|error| {
        format!(
            "Could not store the DeepL key in the keyring ({error}). Is a Secret Service running?"
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_an_env_file_like_a_shell_would() {
        let names = ["DEEPL_AUTH_KEY", "DEEPL_API_KEY"];
        assert_eq!(
            env_file_value("DEEPL_AUTH_KEY=abc:fx\n", &names).as_deref(),
            Some("abc:fx")
        );
        assert_eq!(
            env_file_value("# key\nexport DEEPL_AUTH_KEY=\"a b:fx\"  # note\n", &names).as_deref(),
            Some("a b:fx")
        );
        assert_eq!(
            env_file_value(
                "DEEPL_API_KEY='x' \nDEEPL_AUTH_KEY=old\nDEEPL_AUTH_KEY=new # c",
                &names
            )
            .as_deref(),
            Some("new")
        );
        assert_eq!(
            env_file_value("DEEPL_API_KEY=only", &names).as_deref(),
            Some("only")
        );
        for none in [
            "",
            "# DEEPL_AUTH_KEY=x",
            "DEEPL_AUTH_KEY=",
            "OTHER=x",
            "DEEPL_AUTH_KEYS=x",
        ] {
            assert_eq!(env_file_value(none, &names), None, "{none:?}");
        }
    }

    #[test]
    fn accepts_owner_slash_name_only() {
        assert!(is_repo_name("kaihuman-hq/kaihuman"));
        assert!(is_repo_name("a-b/c_d.e"));
        for bad in ["kaihuman", "a/b/c", "/b", "a/", "a/..", "a b/c", "a/b?x=1"] {
            assert!(!is_repo_name(bad), "{bad} should be rejected");
        }
    }

    #[test]
    fn switching_remembers_repos_once_and_lists_the_current_one() {
        let mut settings = Settings::default();
        assert_eq!(settings.repo(), None);
        assert!(settings.known_repos().is_empty());

        settings.use_repo("o/a", 1);
        settings.use_repo("o/b", 2);
        settings.use_repo("o/a", 3);
        assert_eq!(settings.repo().as_deref(), Some("o/a"));
        assert_eq!(settings.repo_changed_at, Some(3));
        // Choosing the repository in use again is no change.
        settings.use_repo("o/a", 4);
        assert_eq!(settings.repo_changed_at, Some(3));
        assert_eq!(
            settings.known_repos(),
            vec!["o/a".to_string(), "o/b".to_string()]
        );
    }

    #[test]
    fn json_files_round_trip_and_create_their_directory() {
        let dir =
            std::env::temp_dir().join(format!("kaihuman-palette-test-{}", std::process::id()));
        let path = dir.join("nested").join("palette.json");
        let settings = Settings {
            repo: Some("o/r".into()),
            repos: vec!["o/r".into()],
            repo_changed_at: Some(7),
        };
        write_json(&path, &settings).unwrap();
        assert_eq!(read_json::<Settings>(&path), Some(settings));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn an_old_directory_is_taken_over_only_when_the_new_one_is_missing() {
        let base = std::env::temp_dir().join(format!("kaihuman-adopt-test-{}", std::process::id()));
        let (old, new) = (base.join("lifosy"), base.join("kaihuman"));
        std::fs::create_dir_all(old.join("dumps")).unwrap();
        std::fs::write(old.join("dumps/1.txt"), "kept").unwrap();

        adopt_old_dir(&old, &new).unwrap();
        assert!(!old.exists());
        assert_eq!(
            std::fs::read_to_string(new.join("dumps/1.txt")).unwrap(),
            "kept"
        );

        // Both there: neither is touched.
        std::fs::create_dir_all(&old).unwrap();
        std::fs::write(old.join("palette.json"), "old").unwrap();
        adopt_old_dir(&old, &new).unwrap();
        assert!(old.join("palette.json").exists());
        assert!(!new.join("palette.json").exists());

        // Nothing old: nothing happens.
        adopt_old_dir(&base.join("missing"), &base.join("other")).unwrap();
        assert!(!base.join("other").exists());
        std::fs::remove_dir_all(base).unwrap();
    }
}
