use anyhow::{Context, Result};
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::oneshot;
use warp::Filter;

// In real app this would be configurable or come from env
const CONSOLE_URL: &str = "https://app.kaihuman.com/auth/cli";

#[derive(Serialize, Deserialize, Debug)]
pub struct AuthConfig {
    pub token: String,
    pub active_repo: Option<String>,
}

pub struct AuthManager {
    config_path: PathBuf,
}

#[allow(dead_code)]
impl AuthManager {
    pub fn new() -> Result<Self> {
        let proj_dirs = ProjectDirs::from("com", "lifosy", "cli")
            .context("Failed to determine config directory")?;
        let config_dir = proj_dirs.config_dir();
        fs::create_dir_all(config_dir)?;

        Ok(Self {
            config_path: config_dir.join("auth.json"),
        })
    }

    pub fn get_token(&self) -> Result<String> {
        if !self.config_path.exists() {
            anyhow::bail!("Not authenticated. Please run 'cli login'");
        }

        let content = fs::read_to_string(&self.config_path)?;
        let config: AuthConfig = serde_json::from_str(&content)?;
        Ok(config.token)
    }

    pub fn get_active_repo(&self) -> Result<Option<String>> {
        if !self.config_path.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(&self.config_path)?;
        let config: AuthConfig = serde_json::from_str(&content)?;
        Ok(config.active_repo)
    }

    pub fn is_authenticated(&self) -> bool {
        self.config_path.exists()
    }

    pub fn set_active_repo(&self, repo: Option<String>) -> Result<()> {
        let mut config: AuthConfig = if self.config_path.exists() {
            let content = fs::read_to_string(&self.config_path)?;
            serde_json::from_str(&content)?
        } else {
            anyhow::bail!("Not authenticated");
        };
        config.active_repo = repo;
        fs::write(&self.config_path, serde_json::to_string_pretty(&config)?)?;
        Ok(())
    }

    pub fn config_dir(&self) -> &std::path::Path {
        self.config_path.parent().expect("config_path has a parent")
    }

    pub fn logout(&self) -> Result<()> {
        if self.config_path.exists() {
            fs::remove_file(&self.config_path)?;
        }
        Ok(())
    }

    pub async fn login(&self) -> Result<()> {
        let (tx, rx) = oneshot::channel::<(String, Option<String>)>();
        let tx = Arc::new(std::sync::Mutex::new(Some(tx)));

        // 1. Setup local server to receive callback
        let callback = callback_params().map(move |params: HashMap<String, String>| {
            match grant_from(&params) {
                Some((token, repo)) => {
                    if let Some(tx) = tx.lock().unwrap().take() {
                        // We send both token and repo over the channel
                        let _ = tx.send((token, repo));
                    }
                    warp::reply::html("<h1>Login successful!</h1><p>You can close this tab and return to the terminal.</p><script>window.close()</script>")
                }
                None => warp::reply::html("<h1>Login failed</h1><p>No token received.</p>"),
            }
        });

        // We need the port to tell the console where to redirect.
        let (addr, server) = warp::serve(callback).bind_ephemeral(([127, 0, 0, 1], 0));
        let port = addr.port();

        // 2. Open Browser
        let url = format!("{}?port={}", CONSOLE_URL, port);
        webbrowser::open(&url).context("Failed to open browser")?;

        // 3. Wait for token (race with server)
        tokio::select! {
            _ = server => {
                anyhow::bail!("Server stopped unexpectedly");
            }
            res = rx => {
                let (token, active_repo) = res.context("Failed to receive token")?;

                // 4. Save token
                let config = AuthConfig { token, active_repo };
                fs::write(&self.config_path, serde_json::to_string_pretty(&config)?)?;
                Ok(())
            }
        }
    }
}

/// The console's `/auth/cli` page answers `GET /callback` with the parameters in the body of a
/// form POST, so the token never sits in a URL and the browser's history. The query form of older
/// console builds is still read, so the CLI and the console can be updated in either order.
fn callback_params()
-> impl Filter<Extract = (HashMap<String, String>,), Error = warp::Rejection> + Clone {
    let posted = warp::post()
        .and(warp::body::content_length_limit(16 * 1024))
        .and(warp::body::form());
    let queried = warp::get().and(warp::query::<HashMap<String, String>>());
    warp::path("callback")
        .and(warp::path::end())
        .and(posted.or(queried).unify())
}

/// The token, and the repository selected in the console if it sent one.
fn grant_from(params: &HashMap<String, String>) -> Option<(String, Option<String>)> {
    let token = params.get("token").filter(|token| !token.is_empty())?;
    let repo = params.get("repo").filter(|repo| !repo.is_empty()).cloned();
    Some((token.clone(), repo))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn reads_the_token_from_a_posted_form() {
        let params = warp::test::request()
            .method("POST")
            .path("/callback")
            .header("content-type", "application/x-www-form-urlencoded")
            .body("token=gho_secret&state=&repo=o%2Fr")
            .filter(&callback_params())
            .await
            .unwrap();
        assert_eq!(
            grant_from(&params),
            Some(("gho_secret".to_string(), Some("o/r".to_string())))
        );
    }

    #[tokio::test]
    async fn still_reads_the_query_of_older_consoles() {
        let params = warp::test::request()
            .path("/callback?token=t&state=&repo=")
            .filter(&callback_params())
            .await
            .unwrap();
        assert_eq!(grant_from(&params), Some(("t".to_string(), None)));
    }

    #[tokio::test]
    async fn ignores_other_paths_and_empty_tokens() {
        assert!(
            warp::test::request()
                .path("/callback/extra?token=t")
                .filter(&callback_params())
                .await
                .is_err()
        );
        let params = warp::test::request()
            .path("/callback?token=")
            .filter(&callback_params())
            .await
            .unwrap();
        assert_eq!(grant_from(&params), None);
    }
}
