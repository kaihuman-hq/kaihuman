use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use tokio::process::Command;

/// Clone or pull the active repo into the CLI config directory.
/// Returns the path to the local clone.
pub async fn sync_repo(config_dir: &Path, owner: &str, repo: &str, token: &str) -> Result<PathBuf> {
    let repo_dir = config_dir.join("repos").join(owner).join(repo);
    // Embed token in HTTPS URL for auth (standard git credential approach)
    let url = format!("https://oauth2:{}@github.com/{}/{}.git", token, owner, repo);

    if repo_dir.join(".git").exists() {
        // Repo already cloned — pull latest
        let output = Command::new("git")
            .args(["-C", repo_dir.to_str().unwrap_or(""), "pull", "--ff-only", "--quiet"])
            .output()
            .await
            .context("Failed to run git pull")?;

        if !output.status.success() {
            // Non-fatal: repo may have diverged or have local changes; use what we have
        }
    } else {
        std::fs::create_dir_all(&repo_dir)?;

        let output = Command::new("git")
            .args([
                "clone",
                "--depth=1",
                "--quiet",
                &url,
                repo_dir.to_str().unwrap_or(""),
            ])
            .output()
            .await
            .context("Failed to run git clone")?;

        if !output.status.success() {
            anyhow::bail!(
                "git clone failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
    }

    Ok(repo_dir)
}
