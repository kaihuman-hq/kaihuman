//! Claude, for the palette's `>c` and `>u` modes — ports of omarchy's `omarchy-claude-code` and
//! `omarchy-claude-usage`.
//!
//! `>c` lists repositories from the history omarchy's `eee` keeps; the palette builds the
//! claude.ai link itself. `>u` reads each account's Claude Code credentials, refreshes an expired
//! token the way Claude Code does (writing the new one back, so `claude` keeps working), and
//! fetches the usage endpoint. The palette formats what comes back.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::config::is_repo_name;

const CLIENT_ID: &str = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const TOKEN_URL: &str = "https://platform.claude.com/v1/oauth/token";
const USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";
const OAUTH_BETA: &str = "oauth-2025-04-20";
const USER_AGENT: &str = "lifosy-palette";
/// A token this close to expiring is refreshed first, as omarchy's script does.
const REFRESH_MARGIN_MS: u64 = 60_000;

fn home() -> PathBuf {
    PathBuf::from(std::env::var_os("HOME").unwrap_or_default())
}

fn expand_home(path: &str) -> PathBuf {
    match path.strip_prefix("~/") {
        Some(rest) => home().join(rest),
        None if path == "~" => home(),
        None => PathBuf::from(path),
    }
}

/// `$EEE_HISTORY_FILE`, else `~/.config/eee/history` — where `omarchy-claude-code` reads it.
pub fn history_file() -> PathBuf {
    std::env::var_os("EEE_HISTORY_FILE")
        .map(PathBuf::from)
        .unwrap_or_else(|| home().join(".config/eee/history"))
}

/// One `owner/name` per line, most recent first; repeats and anything else are dropped.
pub fn parse_history(text: &str) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    text.lines()
        .map(str::trim)
        .filter(|line| is_repo_name(line) && seen.insert(line.to_string()))
        .map(str::to_string)
        .collect()
}

pub fn code_repos() -> Result<Vec<String>, String> {
    let file = history_file();
    let text = std::fs::read_to_string(&file).map_err(|error| {
        format!(
            "Could not read the repo history {}: {error}",
            file.display()
        )
    })?;
    Ok(parse_history(&text))
}

/// `$OMARCHY_CLAUDE_USAGE_CONF`, else `~/.config/omarchy/claude-usage.conf`: the accounts file
/// omarchy's usage script uses.
pub fn accounts_file() -> PathBuf {
    std::env::var_os("OMARCHY_CLAUDE_USAGE_CONF")
        .map(PathBuf::from)
        .unwrap_or_else(|| home().join(".config/omarchy/claude-usage.conf"))
}

/// `name = /path/to/.claude` per line, `#` comments, `~` for home. With none, `default = ~/.claude`.
pub fn parse_accounts(text: &str) -> Vec<(String, String)> {
    let accounts: Vec<(String, String)> = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.starts_with('#'))
        .filter_map(|line| line.split_once('='))
        .map(|(name, path)| (name.trim().to_string(), path.trim().to_string()))
        .filter(|(name, path)| !name.is_empty() && !path.is_empty())
        .collect();
    if accounts.is_empty() {
        vec![("default".into(), "~/.claude".into())]
    } else {
        accounts
    }
}

pub fn needs_refresh(expires_at_ms: u64, now_ms: u64) -> bool {
    now_ms + REFRESH_MARGIN_MS >= expires_at_ms
}

/// The credentials document with a refreshed token in it; the refresh token rotates only when
/// the answer carries a new one.
pub fn with_refreshed_token(mut doc: Value, answer: &Value, now_ms: u64) -> Result<Value, String> {
    let access = answer
        .get("access_token")
        .and_then(Value::as_str)
        .ok_or("the token refresh sent no access token")?;
    let expires_in = answer
        .get("expires_in")
        .and_then(Value::as_u64)
        .unwrap_or(3600);
    let oauth = doc
        .get_mut("claudeAiOauth")
        .and_then(Value::as_object_mut)
        .ok_or("the credentials hold no claudeAiOauth")?;
    oauth.insert("accessToken".into(), json!(access));
    if let Some(refresh) = answer.get("refresh_token").and_then(Value::as_str) {
        oauth.insert("refreshToken".into(), json!(refresh));
    }
    oauth.insert("expiresAt".into(), json!(now_ms + expires_in * 1000));
    Ok(doc)
}

/// Written beside the original and renamed over it, readable by the user alone.
fn write_credentials(path: &Path, doc: &Value) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let temporary = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(doc).map_err(|error| error.to_string())?;
    std::fs::write(&temporary, text)
        .and_then(|()| std::fs::set_permissions(&temporary, std::fs::Permissions::from_mode(0o600)))
        .and_then(|()| std::fs::rename(&temporary, path))
        .map_err(|error| format!("could not update {}: {error}", path.display()))
}

async fn access_token(http: &reqwest::Client, config_dir: &Path) -> Result<String, String> {
    let path = config_dir.join(".credentials.json");
    let text = std::fs::read_to_string(&path)
        .map_err(|_| format!("No Claude credentials in {}", config_dir.display()))?;
    let doc: Value = serde_json::from_str(&text)
        .map_err(|error| format!("{} is unreadable: {error}", path.display()))?;
    let oauth = doc.get("claudeAiOauth").cloned().unwrap_or_default();
    let token = oauth.get("accessToken").and_then(Value::as_str);
    let Some(token) = token else {
        return Err("No OAuth token — run `claude` to sign in".into());
    };
    let expires_at = oauth.get("expiresAt").and_then(Value::as_u64).unwrap_or(0);
    let now = desktop_palette::now_ms();
    if !needs_refresh(expires_at, now) {
        return Ok(token.to_string());
    }
    let refresh = oauth
        .get("refreshToken")
        .and_then(Value::as_str)
        .ok_or("The token expired and there is no refresh token — run `claude` to sign in")?;
    let response = http
        .post(TOKEN_URL)
        .header("anthropic-beta", OAUTH_BETA)
        .header("User-Agent", USER_AGENT)
        .json(&json!({
            "grant_type": "refresh_token",
            "refresh_token": refresh,
            "client_id": CLIENT_ID,
        }))
        .send()
        .await
        .map_err(|error| format!("Could not reach Claude: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Refreshing the token failed ({}) — open Claude Code to sign in again",
            response.status()
        ));
    }
    let answer: Value = response
        .json()
        .await
        .map_err(|error| format!("Could not reach Claude: {error}"))?;
    let doc = with_refreshed_token(doc, &answer, now)?;
    write_credentials(&path, &doc)?;
    Ok(doc["claudeAiOauth"]["accessToken"]
        .as_str()
        .unwrap_or_default()
        .to_string())
}

async fn account_usage(http: &reqwest::Client, config_dir: &Path) -> Result<Value, String> {
    let token = access_token(http, config_dir).await?;
    let response = http
        .get(USAGE_URL)
        .bearer_auth(token)
        .header("anthropic-beta", OAUTH_BETA)
        .header("anthropic-version", "2023-06-01")
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|error| format!("Could not reach Claude: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Claude answered {} — open Claude Code to sign in again",
            response.status()
        ));
    }
    response
        .json()
        .await
        .map_err(|error| format!("Could not read the usage: {error}"))
}

/// Every account's usage, or why there is none — one account failing never hides the others.
pub async fn usage() -> Value {
    let text = std::fs::read_to_string(accounts_file()).unwrap_or_default();
    let http = reqwest::Client::new();
    let mut accounts = Vec::new();
    for (name, dir) in parse_accounts(&text) {
        accounts.push(match account_usage(&http, &expand_home(&dir)).await {
            Ok(usage) => json!({ "name": name, "usage": usage }),
            Err(error) => json!({ "name": name, "error": error }),
        });
    }
    json!({ "accounts": accounts })
}

/// The last usage fetched with any usage in it, which `>u` shows before it syncs.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageCache {
    pub accounts: Value,
    pub fetched_at: u64,
}

/// Whether a fetch is worth caching: one where every account failed would only hide the last good
/// numbers.
pub fn has_usage(answer: &Value) -> bool {
    answer["accounts"].as_array().is_some_and(|accounts| {
        accounts
            .iter()
            .any(|account| account.get("usage").is_some())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_history_most_recent_first_once_each() {
        let text = "o/b\n\no/a\no/b\nnot a repo\n  o/c  \n";
        assert_eq!(parse_history(text), vec!["o/b", "o/a", "o/c"]);
    }

    #[test]
    fn reads_accounts_like_omarchy() {
        let text = "# accounts\ndefault = ~/.claude\nwork= ~/.config/claude-work \nbroken\n = x\n";
        assert_eq!(
            parse_accounts(text),
            vec![
                ("default".to_string(), "~/.claude".to_string()),
                ("work".to_string(), "~/.config/claude-work".to_string()),
            ]
        );
        assert_eq!(
            parse_accounts("# nothing\n"),
            vec![("default".to_string(), "~/.claude".to_string())]
        );
    }

    #[test]
    fn refreshes_a_minute_before_expiry() {
        assert!(!needs_refresh(1_000_000, 1_000_000 - REFRESH_MARGIN_MS - 1));
        assert!(needs_refresh(1_000_000, 1_000_000 - REFRESH_MARGIN_MS));
        assert!(needs_refresh(0, 5));
    }

    #[test]
    fn writes_the_refreshed_token_into_the_credentials_and_keeps_the_rest() {
        let doc = json!({
            "claudeAiOauth": { "accessToken": "old", "refreshToken": "r1", "expiresAt": 1, "scopes": ["x"] },
            "other": true,
        });
        let rotated = with_refreshed_token(
            doc.clone(),
            &json!({ "access_token": "new", "refresh_token": "r2", "expires_in": 60 }),
            1_000,
        )
        .unwrap();
        assert_eq!(
            rotated,
            json!({
                "claudeAiOauth": { "accessToken": "new", "refreshToken": "r2", "expiresAt": 61_000, "scopes": ["x"] },
                "other": true,
            })
        );
        let kept = with_refreshed_token(doc, &json!({ "access_token": "new" }), 0).unwrap();
        assert_eq!(kept["claudeAiOauth"]["refreshToken"], "r1");
        assert_eq!(kept["claudeAiOauth"]["expiresAt"], 3_600_000);
        assert!(with_refreshed_token(json!({}), &json!({ "access_token": "x" }), 0).is_err());
    }

    #[test]
    fn writes_credentials_readable_by_the_user_alone() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("lifosy-claude-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(".credentials.json");
        write_credentials(&path, &json!({ "a": 1 })).unwrap();
        let mode = std::fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
        assert_eq!(
            serde_json::from_str::<Value>(&std::fs::read_to_string(&path).unwrap()).unwrap(),
            json!({ "a": 1 })
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn expands_the_home_directory() {
        assert_eq!(expand_home("~/.claude"), home().join(".claude"));
        assert_eq!(expand_home("/abs"), PathBuf::from("/abs"));
    }

    #[test]
    fn caches_only_an_answer_with_usage_in_it() {
        assert!(has_usage(
            &json!({ "accounts": [{ "name": "a", "error": "x" }, { "name": "b", "usage": {} }] })
        ));
        assert!(!has_usage(
            &json!({ "accounts": [{ "name": "a", "error": "x" }] })
        ));
        assert!(!has_usage(&json!({ "accounts": [] })));
    }
}
