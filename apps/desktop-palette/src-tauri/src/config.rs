//! Where the palette keeps things, which repository it works on, and the GitHub token.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// The same default as the browser extension, so both start out on the same repository.
pub const DEFAULT_REPO: &str = "lifosy/monorepo";

const KEYRING_SERVICE: &str = "lifosy-palette";
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

/// `$XDG_<kind>_HOME/lifosy`.
fn xdg_dir(variable: &str, fallback: &str) -> PathBuf {
    xdg_base(variable, fallback).join("lifosy")
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

pub fn commands_cache_file() -> PathBuf {
    xdg_dir("XDG_CACHE_HOME", ".cache").join("commands.json")
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
}

impl Settings {
    pub fn load() -> Self {
        read_json(&config_file()).unwrap_or_default()
    }

    pub fn save(&self) -> Result<(), String> {
        write_json(&config_file(), self)
    }

    pub fn repo(&self) -> String {
        self.repo
            .clone()
            .unwrap_or_else(|| DEFAULT_REPO.to_string())
    }

    /// Makes `repo` current and remembers it for the switcher.
    pub fn use_repo(&mut self, repo: &str) {
        if !self.repos.iter().any(|known| known == repo) {
            self.repos.push(repo.to_string());
        }
        self.repo = Some(repo.to_string());
    }

    /// Everything the switcher lists, current one included.
    pub fn known_repos(&self) -> Vec<String> {
        let current = self.repo();
        let mut repos = self.repos.clone();
        if !repos.contains(&current) {
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

fn keyring_entry(user: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, user)
        .map_err(|error| format!("the keyring is unavailable: {error}"))
}

/// The token from `LIFOSY_GITHUB_TOKEN` if set, else from the Secret Service.
///
/// The variable is for development and tests; `lifosy-palette login` is the normal way in, and
/// nothing ever writes the token to a file.
pub fn token() -> Result<String, String> {
    if let Some(token) = std::env::var("LIFOSY_GITHUB_TOKEN")
        .ok()
        .filter(|token| !token.is_empty())
    {
        return Ok(token);
    }
    match keyring_entry(KEYRING_USER)?.get_password() {
        Ok(token) => Ok(token),
        Err(keyring::Error::NoEntry) => Err(
            "Not logged in — run “Log in with the Lifosy console” or `lifosy-palette login`".into(),
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
    match keyring_entry(KEYRING_USER)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("could not remove the token: {error}")),
    }
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
    match keyring_entry(KEYRING_DEEPL_USER)?.get_password() {
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
        assert!(is_repo_name("lifosy/monorepo"));
        assert!(is_repo_name("a-b/c_d.e"));
        for bad in ["lifosy", "a/b/c", "/b", "a/", "a/..", "a b/c", "a/b?x=1"] {
            assert!(!is_repo_name(bad), "{bad} should be rejected");
        }
    }

    #[test]
    fn switching_remembers_repos_once_and_lists_the_current_one() {
        let mut settings = Settings::default();
        assert_eq!(settings.repo(), DEFAULT_REPO);
        assert_eq!(settings.known_repos(), vec![DEFAULT_REPO.to_string()]);

        settings.use_repo("o/a");
        settings.use_repo("o/b");
        settings.use_repo("o/a");
        assert_eq!(settings.repo(), "o/a");
        assert_eq!(
            settings.known_repos(),
            vec!["o/a".to_string(), "o/b".to_string()]
        );
    }

    #[test]
    fn json_files_round_trip_and_create_their_directory() {
        let dir = std::env::temp_dir().join(format!("lifosy-palette-test-{}", std::process::id()));
        let path = dir.join("nested").join("palette.json");
        let settings = Settings {
            repo: Some("o/r".into()),
            repos: vec!["o/r".into()],
        };
        write_json(&path, &settings).unwrap();
        assert_eq!(read_json::<Settings>(&path), Some(settings));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
