use anyhow::{Context, Result};
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::oneshot;
use warp::Filter;

// In real app this would be configurable or come from env
const CONSOLE_URL: &str = "https://app.lifosy.com/auth/cli";

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
        let callback = warp::path("callback")
            .and(warp::query::<std::collections::HashMap<String, String>>())
            .map(move |params: std::collections::HashMap<String, String>| {
                if let Some(token) = params.get("token") {
                    let repo = params.get("repo").cloned();
                    if let Some(tx) = tx.lock().unwrap().take() {
                        // We send both token and repo over the channel
                        let _ = tx.send((token.clone(), repo));
                    }
                    warp::reply::html("<h1>Login successful!</h1><p>You can close this tab and return to the terminal.</p><script>window.close()</script>")
                } else {
                    warp::reply::html("<h1>Login failed</h1><p>No token received.</p>")
                }
            });

        // We need the port to tell the console where to redirect.
        let (addr, server) = warp::serve(callback).bind_ephemeral(([127, 0, 0, 1], 0));
        let port = addr.port();
        
        println!("Listening on http://127.0.0.1:{}", port);

        // 2. Open Browser
        let url = format!("{}?port={}", CONSOLE_URL, port);
        println!("Opening browser to authenticate: {}", url);
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
                
                println!("Successfully authenticated!");
                Ok(())
            }
        }
    }
}
