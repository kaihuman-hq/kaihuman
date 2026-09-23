use anyhow::{Context, Result};
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::oneshot;
use warp::Filter;
use warp::http::StatusCode;

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

        // Ties the callback to this login: without it, any page open in the browser could post its
        // own token to the waiting CLI and log it in to someone else's account.
        let state = random_state()?;
        let expected_state = state.clone();

        // 1. Setup local server to receive callback
        let callback = callback_route(expected_state, tx);

        // We need the port to tell the console where to redirect.
        let (addr, server) = warp::serve(callback).bind_ephemeral(([127, 0, 0, 1], 0));
        let port = addr.port();

        // 2. Open Browser
        let url = format!("{}?port={}&state={}", CONSOLE_URL, port, state);
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

/// Hands the grant — the token and the console's repository — from the callback route to `login`,
/// once.
type GrantSender = Arc<std::sync::Mutex<Option<oneshot::Sender<(String, Option<String>)>>>>;

/// Takes the first callback carrying `expected_state` as the grant and sends it down `tx`; every
/// other request is answered and leaves the CLI waiting.
fn callback_route(
    expected_state: String,
    tx: GrantSender,
) -> impl Filter<Extract = (impl warp::Reply,), Error = warp::Rejection> + Clone {
    callback_params().map(move |params: HashMap<String, String>| {
        match grant_from(&params, &expected_state) {
            Ok((token, repo)) => {
                if let Some(tx) = tx.lock().unwrap().take() {
                    // We send both token and repo over the channel
                    let _ = tx.send((token, repo));
                }
                warp::reply::with_status(
                    warp::reply::html("<h1>Login successful!</h1><p>You can close this tab and return to the terminal.</p><script>window.close()</script>"),
                    StatusCode::OK,
                )
            }
            // Answered but not taken: the CLI keeps waiting for its own console login.
            Err(Refusal::WrongState) => warp::reply::with_status(
                warp::reply::html("<h1>Login refused</h1><p>This login is not the one the CLI started.</p>"),
                StatusCode::BAD_REQUEST,
            ),
            Err(Refusal::NoToken) => warp::reply::with_status(
                warp::reply::html("<h1>Login failed</h1><p>No token received.</p>"),
                StatusCode::BAD_REQUEST,
            ),
        }
    })
}

/// The console's `/auth/cli` page posts the parameters to `/callback` as a form, so the token never
/// sits in a URL and the browser's history. The query form of older
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

/// 128 random bits, hex: the `state` the console hands back with the token.
fn random_state() -> Result<String> {
    let mut bytes = [0u8; 16];
    getrandom::getrandom(&mut bytes).context("Failed to generate a login state")?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

/// Why a callback was not taken as this login's grant.
#[derive(Debug, PartialEq)]
enum Refusal {
    /// Missing or not the one this login sent.
    WrongState,
    NoToken,
}

/// The token, and the repository selected in the console if it sent one — only from a callback
/// carrying the `state` this login put in the console URL.
fn grant_from(
    params: &HashMap<String, String>,
    expected_state: &str,
) -> std::result::Result<(String, Option<String>), Refusal> {
    if params.get("state").map(String::as_str) != Some(expected_state) {
        return Err(Refusal::WrongState);
    }
    let token = params
        .get("token")
        .filter(|token| !token.is_empty())
        .ok_or(Refusal::NoToken)?;
    let repo = params.get("repo").filter(|repo| !repo.is_empty()).cloned();
    Ok((token.clone(), repo))
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
            .body("token=gho_secret&state=s1&repo=o%2Fr")
            .filter(&callback_params())
            .await
            .unwrap();
        assert_eq!(
            grant_from(&params, "s1"),
            Ok(("gho_secret".to_string(), Some("o/r".to_string())))
        );
    }

    #[tokio::test]
    async fn still_reads_the_query_of_older_consoles() {
        let params = warp::test::request()
            .path("/callback?token=t&state=s1&repo=")
            .filter(&callback_params())
            .await
            .unwrap();
        assert_eq!(grant_from(&params, "s1"), Ok(("t".to_string(), None)));
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
            .path("/callback?token=&state=s1")
            .filter(&callback_params())
            .await
            .unwrap();
        assert_eq!(grant_from(&params, "s1"), Err(Refusal::NoToken));
    }

    fn params(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect()
    }

    #[test]
    fn refuses_a_token_posted_without_this_logins_state() {
        let forged = params(&[("token", "attacker"), ("state", "guess")]);
        assert_eq!(grant_from(&forged, "s1"), Err(Refusal::WrongState));
        // What older consoles send when they were not given a state, and what a forger would try.
        let empty = params(&[("token", "attacker"), ("state", "")]);
        assert_eq!(grant_from(&empty, "s1"), Err(Refusal::WrongState));
        let missing = params(&[("token", "attacker")]);
        assert_eq!(grant_from(&missing, "s1"), Err(Refusal::WrongState));
    }

    #[tokio::test]
    async fn keeps_waiting_through_a_forged_post_and_takes_the_real_one() {
        let (tx, mut rx) = oneshot::channel();
        let route = callback_route("s1".into(), Arc::new(std::sync::Mutex::new(Some(tx))));
        let post = |body: &'static str| {
            warp::test::request()
                .method("POST")
                .path("/callback")
                .header("content-type", "application/x-www-form-urlencoded")
                .body(body)
        };

        let forged = post("token=attacker&state=guess").reply(&route).await;
        assert_eq!(forged.status(), StatusCode::BAD_REQUEST);
        assert!(
            rx.try_recv().is_err(),
            "a forged post must not end the login"
        );

        let real = post("token=mine&state=s1&repo=o%2Fr").reply(&route).await;
        assert_eq!(real.status(), StatusCode::OK);
        assert_eq!(
            rx.try_recv().unwrap(),
            ("mine".to_string(), Some("o/r".to_string()))
        );
    }

    #[test]
    fn states_are_random_and_long() {
        let (a, b) = (random_state().unwrap(), random_state().unwrap());
        assert_eq!(a.len(), 32);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b);
    }
}
