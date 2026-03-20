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

/// `#[serde(default)]` makes every missing field use its Default value instead
/// of failing — prevents one bad entry from rejecting the whole document.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
pub struct DashboardWorkspace {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
pub struct DashboardEntry {
    pub path: String,
    pub dashboard: String,
    #[serde(rename = "skipOnMobile")]
    pub skip_on_mobile: Option<bool>,
}

/// Leniently build a `DashboardConfig` from a raw JSON value.
/// Fields with unexpected types are silently skipped rather than failing the parse.
fn dashboard_config_from_value(val: &serde_json::Value) -> DashboardConfig {
    let str_field = |key: &str| val.get(key).and_then(|v| v.as_str()).map(|s| s.to_string());

    let dashboards = val.get("dashboards").and_then(|v| v.as_array()).map(|arr| {
        arr.iter()
            .filter_map(|obj| {
                Some(DashboardWorkspace {
                    id: obj.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    name: obj.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                })
            })
            .collect()
    });

    let entries = val.get("entries").and_then(|v| v.as_array()).map(|arr| {
        arr.iter()
            .filter_map(|obj| {
                let path = obj.get("path").and_then(|v| v.as_str())?.to_string();
                Some(DashboardEntry {
                    path,
                    dashboard: obj
                        .get("dashboard")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    skip_on_mobile: obj.get("skipOnMobile").and_then(|v| v.as_bool()),
                })
            })
            .collect()
    });

    let files = val.get("files").and_then(|v| v.as_array()).map(|arr| {
        arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()
    });

    DashboardConfig {
        version: str_field("version"),
        theme: str_field("theme"),
        dashboards,
        entries,
        files,
    }
}

/// Try fixed candidates first, then do a recursive scan.
/// Returns `(config, relative_path_found)`.
pub fn load_dashboard_config(repo_dir: &Path) -> (Option<DashboardConfig>, String) {
    let candidates = [
        ".dashboard.config.json",
        ".kh/.dashboard.config.json",
        ".lifeos/.dashboard.config.json",
        "dashboard.config.json",
        ".kh/dashboard.config.json",
    ];

    for &candidate in &candidates {
        let full = repo_dir.join(candidate);
        if let Ok(content) = fs::read_to_string(&full) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                return (Some(dashboard_config_from_value(&val)), candidate.to_string());
            }
        }
    }

    // Recursive fallback: scan the repo for any file ending in "dashboard.config.json"
    if let Some((cfg, rel)) = scan_for_dashboard_config(repo_dir) {
        return (Some(cfg), rel);
    }

    (None, String::new())
}

/// Recursively walks repo_dir (including hidden directories) looking for any
/// file whose name ends with `dashboard.config.json`.
fn scan_for_dashboard_config(repo_dir: &Path) -> Option<(DashboardConfig, String)> {
    scan_dir(repo_dir, repo_dir, 0)
}

fn scan_dir(base: &Path, dir: &Path, depth: usize) -> Option<(DashboardConfig, String)> {
    if depth > 4 {
        return None;
    }
    let Ok(read) = fs::read_dir(dir) else {
        return None;
    };
    let mut subdirs = Vec::new();
    for entry in read.flatten() {
        let path = entry.path();
        let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();

        if path.is_file() && name.ends_with("dashboard.config.json") {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    let rel = path
                        .strip_prefix(base)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .to_string();
                    return Some((dashboard_config_from_value(&val), rel));
                }
            }
        } else if path.is_dir() {
            subdirs.push(path);
        }
    }
    // Recurse into subdirs after checking files (BFS-ish: shallow matches first)
    for subdir in subdirs {
        if let Some(found) = scan_dir(base, &subdir, depth + 1) {
            return Some(found);
        }
    }
    None
}

// ── FileItem ──────────────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct FileItem {
    pub path: String, // relative to repo root
    pub is_dir: bool,
    pub is_recent: bool,
}

// ── Raw file walking ──────────────────────────────────────────────────────────

/// Blocking filesystem walk — call from `spawn_blocking` in async context.
pub fn walk_raw_files(repo_dir: &Path) -> Vec<(String, bool)> {
    let mut items = Vec::new();
    collect_raw(repo_dir, repo_dir, 0, 3, &mut items);
    items
}

fn collect_raw(
    base: &Path,
    dir: &Path,
    depth: usize,
    max_depth: usize,
    out: &mut Vec<(String, bool)>,
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
        out.push((rel, is_dir));
        if is_dir {
            collect_raw(base, &path, depth + 1, max_depth, out);
        }
    }
}

// ── FileItem construction ─────────────────────────────────────────────────────

/// Build FileItems from raw (path, is_dir) pairs, putting recent files first.
pub fn files_from_raw(raw: &[(String, bool)], recent_files: &[String]) -> Vec<FileItem> {
    let mut items: Vec<FileItem> = recent_files
        .iter()
        .filter(|r| raw.iter().any(|(p, _)| p == *r))
        .map(|r| FileItem { path: r.clone(), is_dir: false, is_recent: true })
        .collect();

    for (path, is_dir) in raw {
        if !recent_files.iter().any(|r| r == path) {
            items.push(FileItem { path: path.clone(), is_dir: *is_dir, is_recent: false });
        }
    }
    items
}

/// Build FileItems specifically for the Dashboard view (primary `files` + entry paths).
/// Paths are taken directly from the config; the raw cache is not used to filter them
/// because config files often live in hidden directories (e.g. `.kh/`) that the raw
/// walk intentionally skips.
pub fn dashboard_items_from_raw(
    _raw: &[(String, bool)],
    config: &Option<DashboardConfig>,
    recent_files: &[String],
) -> Vec<FileItem> {
    let mut seen = std::collections::HashSet::new();
    let mut items = Vec::new();

    let mut add = |path: String| {
        // Normalise paths that start with "./" so they match recent_files entries.
        let path = path.strip_prefix("./").map(|s| s.to_string()).unwrap_or(path);
        if seen.insert(path.clone()) {
            let is_recent = recent_files.iter().any(|r| r == &path);
            items.push(FileItem { path, is_dir: false, is_recent });
        }
    };

    if let Some(cfg) = config {
        if let Some(ref primary) = cfg.files {
            for p in primary {
                add(p.clone());
            }
        }
        if let Some(ref entries) = cfg.entries {
            for e in entries {
                if !e.path.is_empty() {
                    add(e.path.clone());
                }
            }
        }
    }
    items
}
