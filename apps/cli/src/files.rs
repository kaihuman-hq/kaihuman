use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

const MAX_RECENT: usize = 20;

// ── Recent files ─────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Default)]
pub struct RecentFiles {
    pub files: Vec<String>,
}

pub fn load_recent_files(config_dir: &Path) -> RecentFiles {
    let path = config_dir.join("recent_files.json");
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn add_recent_file(config_dir: &Path, rel_path: &str) {
    let mut recent = load_recent_files(config_dir);
    recent.files.retain(|f| f != rel_path);
    recent.files.insert(0, rel_path.to_string());
    recent.files.truncate(MAX_RECENT);
    let path = config_dir.join("recent_files.json");
    if let Ok(json) = serde_json::to_string_pretty(&recent) {
        let _ = fs::write(path, json);
    }
}

// ── Dashboard config ──────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Default, Clone)]
pub struct DashboardConfig {
    pub version: Option<String>,
    pub dashboards: Option<Vec<DashboardWorkspace>>,
    pub entries: Option<Vec<DashboardEntry>>,
    pub theme: Option<String>,
    pub files: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DashboardWorkspace {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DashboardEntry {
    pub path: String,
    pub dashboard: String,
    #[serde(rename = "skipOnMobile")]
    pub skip_on_mobile: Option<bool>,
}

pub fn load_dashboard_config(repo_dir: &Path) -> Option<DashboardConfig> {
    let content = fs::read_to_string(repo_dir.join("dashboard.config.json")).ok()?;
    serde_json::from_str(&content).ok()
}

// ── File browser items ────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct FileItem {
    pub path: String, // relative to repo root
    pub is_dir: bool,
    pub is_recent: bool,
}

/// Returns files from `dashboard.config.json` (primary `files` + entry `path`s),
/// with recently-used files marked.
pub fn list_dashboard_files(
    repo_dir: &Path,
    config: &Option<DashboardConfig>,
    recent_files: &[String],
) -> Vec<FileItem> {
    let mut seen = std::collections::HashSet::new();
    let mut items = Vec::new();

    let add = |items: &mut Vec<FileItem>, seen: &mut std::collections::HashSet<String>, path: String| {
        if seen.insert(path.clone()) && repo_dir.join(&path).exists() {
            let is_recent = recent_files.iter().any(|r| r == &path);
            items.push(FileItem { path, is_dir: false, is_recent });
        }
    };

    if let Some(cfg) = config {
        // Primary files first
        if let Some(ref primary) = cfg.files {
            for p in primary {
                add(&mut items, &mut seen, p.clone());
            }
        }
        // Then dashboard entry paths
        if let Some(ref entries) = cfg.entries {
            for e in entries {
                add(&mut items, &mut seen, e.path.clone());
            }
        }
    }

    items
}

/// Returns a flat list of repo files: recent files first, then all non-hidden
/// files up to `max_depth` directory levels deep.
pub fn list_repo_files(repo_dir: &Path, recent_files: &[String]) -> Vec<FileItem> {
    let mut items: Vec<FileItem> = recent_files
        .iter()
        .filter(|p| repo_dir.join(p).exists())
        .map(|p| FileItem { path: p.clone(), is_dir: false, is_recent: true })
        .collect();

    collect_files(repo_dir, repo_dir, 0, 3, recent_files, &mut items);
    items
}

fn collect_files(
    base: &Path,
    dir: &Path,
    depth: usize,
    max_depth: usize,
    recent: &[String],
    items: &mut Vec<FileItem>,
) {
    if depth > max_depth {
        return;
    }
    let Ok(read) = fs::read_dir(dir) else { return };
    let mut entries: Vec<_> = read.flatten().collect();
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        let path = entry.path();
        let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let rel = path.strip_prefix(base).unwrap_or(&path).to_string_lossy().to_string();
        let is_dir = path.is_dir();

        // Skip files that are already in the recent list
        if !is_dir && recent.iter().any(|r| r == &rel) {
            continue;
        }

        items.push(FileItem { path: rel, is_dir, is_recent: false });

        if is_dir {
            collect_files(base, &path, depth + 1, max_depth, recent, items);
        }
    }
}
