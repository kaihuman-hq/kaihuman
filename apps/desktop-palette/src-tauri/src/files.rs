//! Searching this computer's files — the palette's `>o`, desktop only — and opening what it found.
//!
//! Everything is searched under the home directory with the tools a Linux desktop already has:
//! - **names**: `fd` when installed (Fedora: `fd-find`), else `find`;
//! - **contents**: `rg` when installed (`ripgrep`), else `grep -r`.
//!
//! Hidden files and directories (`~/.cache`, `~/.local`…) and `node_modules` are left out, as `fd`
//! and `rg` leave them out by default. The tool's output is read as it comes and the tool is stopped
//! once enough has been found or `TIME_LIMIT` has passed, so a search never keeps the palette
//! waiting for a full walk of a large home directory.

use std::ffi::OsStr;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

/// Hits listed per kind of search; names and contents each get this many.
const LIMIT: usize = 25;

/// A search stops here and answers with what it has.
pub const TIME_LIMIT: Duration = Duration::from_secs(10);

/// A matched line is shown after the file's folder, so only its start.
const LINE_LENGTH: usize = 120;

#[derive(Debug, PartialEq, Serialize)]
pub struct Hit {
    pub path: String,
    pub folder: bool,
    /// For a match in the contents: the first matching line, `12:text`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum OpenWith {
    /// The file with its default application, or a folder in the file manager.
    App,
    /// The folder the file is in, in the file manager.
    FileManager,
    /// A ghostty window in the folder the file is in.
    Terminal,
}

pub fn home() -> PathBuf {
    PathBuf::from(std::env::var_os("HOME").unwrap_or_default())
}

fn on_path(program: &str) -> bool {
    std::env::var_os("PATH")
        .is_some_and(|path| std::env::split_paths(&path).any(|dir| dir.join(program).is_file()))
}

/// `find -iname` reads `*`, `?`, `[` and `\` as a pattern; escaped, the query is matched as typed.
fn glob_escape(text: &str) -> String {
    text.chars()
        .flat_map(|c| match c {
            '*' | '?' | '[' | ']' | '\\' => vec!['\\', c],
            _ => vec![c],
        })
        .collect()
}

fn name_search(query: &str, root: &Path) -> Command {
    if on_path("fd") {
        let mut command = Command::new("fd");
        command
            .args(["--ignore-case", "--fixed-strings", "--absolute-path"])
            .args(["--color", "never", "--exclude", "node_modules", "--"])
            .arg(query)
            .arg(root);
        command
    } else {
        let mut command = Command::new("find");
        command
            .arg(root)
            .args([
                "-mindepth",
                "1",
                "(",
                "-name",
                ".*",
                "-o",
                "-name",
                "node_modules",
                ")",
            ])
            .args(["-prune", "-o", "-iname"])
            .arg(format!("*{}*", glob_escape(query)))
            .arg("-print");
        command
    }
}

/// Both tools print `path`, a NUL, then `line:text` — one line per file.
fn contents_search(query: &str, root: &Path) -> Command {
    if on_path("rg") {
        let mut command = Command::new("rg");
        command
            .args(["--ignore-case", "--fixed-strings", "--max-count", "1"])
            .args([
                "--line-number",
                "--null",
                "--no-heading",
                "--color",
                "never",
            ])
            .args([
                "--no-messages",
                "--max-filesize",
                "10M",
                "--glob",
                "!node_modules",
                "--",
            ])
            .arg(query)
            .arg(root);
        command
    } else {
        let mut command = Command::new("grep");
        command
            .args(["-r", "-I", "-i", "-F", "-m", "1", "-n", "-Z", "-s"])
            .args(["--exclude-dir=.*", "--exclude-dir=node_modules", "--"])
            .arg(query)
            .arg(root);
        command
    }
}

fn name_hit(line: &str) -> Option<Hit> {
    let path = line.trim_end_matches('/');
    (!path.is_empty()).then(|| Hit {
        path: path.to_string(),
        folder: Path::new(path).is_dir(),
        line: None,
    })
}

fn contents_hit(line: &str) -> Option<Hit> {
    let (path, matched) = line.split_once('\0')?;
    let matched = matched.trim();
    let shown: String = matched.chars().take(LINE_LENGTH).collect();
    Some(Hit {
        path: path.to_string(),
        folder: false,
        line: Some(if shown.len() < matched.len() {
            format!("{shown}…")
        } else {
            shown
        }),
    })
}

/// Hits from the tool's output until `LIMIT` of them, the end of its output, or `deadline`; the
/// tool is stopped then. Paths that are not UTF-8 cannot be handed back, so they are skipped.
fn collect(
    mut command: Command,
    parse: fn(&str) -> Option<Hit>,
    deadline: Instant,
) -> Result<(Vec<Hit>, bool), String> {
    let program = command.get_program().to_string_lossy().into_owned();
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Could not run {program}: {error}"))?;
    let stdout = child.stdout.take().expect("stdout is piped");
    let (lines, received) = mpsc::channel();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut line = Vec::new();
        while reader.read_until(b'\n', &mut line).unwrap_or(0) > 0 {
            if let Ok(text) = std::str::from_utf8(&line)
                && lines.send(text.trim_end_matches('\n').to_string()).is_err()
            {
                break;
            }
            line.clear();
        }
    });
    let mut hits = Vec::new();
    let mut timed_out = false;
    while hits.len() < LIMIT {
        let left = deadline.saturating_duration_since(Instant::now());
        match received.recv_timeout(left) {
            Ok(line) => hits.extend(parse(&line)),
            Err(mpsc::RecvTimeoutError::Timeout) => {
                timed_out = true;
                break;
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
    let _ = child.kill();
    let _ = child.wait();
    Ok((hits, timed_out))
}

/// Files and folders under `root` whose name holds `query`, ignoring case; with `contents`, also
/// files whose text does — those after the names, each file once.
pub fn search_in(root: &Path, query: &str, contents: bool) -> Result<Vec<Hit>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Err("Type part of a file name to search for".into());
    }
    let deadline = Instant::now() + TIME_LIMIT;
    let (names, by_contents) = std::thread::scope(|scope| {
        let by_contents = contents
            .then(|| scope.spawn(|| collect(contents_search(query, root), contents_hit, deadline)));
        let names = collect(name_search(query, root), name_hit, deadline);
        (
            names,
            by_contents.map(|search| search.join().expect("the contents search does not panic")),
        )
    });
    let (mut hits, mut timed_out) = names?;
    if let Some(found) = by_contents {
        let (found, stopped) = found?;
        timed_out |= stopped;
        let named: Vec<String> = hits.iter().map(|hit| hit.path.clone()).collect();
        hits.extend(found.into_iter().filter(|hit| !named.contains(&hit.path)));
    }
    if hits.is_empty() && timed_out {
        return Err(format!(
            "Nothing found in {} s, when the search stops — try a longer part of the name",
            TIME_LIMIT.as_secs()
        ));
    }
    Ok(hits)
}

pub fn search(query: &str, contents: bool) -> Result<Vec<Hit>, String> {
    search_in(&home(), query, contents)
}

fn spawn_detached(program: &str, args: &[&OsStr], dir: Option<&Path>) -> Result<(), String> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    if let Some(dir) = dir {
        command.current_dir(dir);
    }
    let mut child = command
        .spawn()
        .map_err(|error| format!("Could not run {program} ({error}) — is it installed?"))?;
    // Reaped in the background, so the palette can close at once.
    std::thread::spawn(move || child.wait());
    Ok(())
}

/// The folder `path` names, or the one its file is in.
fn folder_of(path: &Path) -> &Path {
    if path.is_dir() {
        path
    } else {
        path.parent().unwrap_or(path)
    }
}

/// Opens a path a search found. Only absolute paths that exist are opened.
pub fn open(path: &str, with: OpenWith) -> Result<(), String> {
    let path = Path::new(path);
    if !path.is_absolute() || !path.exists() {
        return Err(format!("{} is not there any more", path.display()));
    }
    match with {
        OpenWith::App => spawn_detached("xdg-open", &[path.as_os_str()], None),
        OpenWith::FileManager => spawn_detached("xdg-open", &[folder_of(path).as_os_str()], None),
        OpenWith::Terminal => spawn_detached("ghostty", &[], Some(folder_of(path))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A home directory of its own per test, removed afterwards.
    struct Tree(PathBuf);

    impl Tree {
        fn new(name: &str, files: &[(&str, &str)]) -> Self {
            let root =
                std::env::temp_dir().join(format!("lifosy-files-{name}-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&root);
            for (path, content) in files {
                let file = root.join(path);
                std::fs::create_dir_all(file.parent().unwrap()).unwrap();
                std::fs::write(file, content).unwrap();
            }
            Self(root)
        }

        fn path(&self, relative: &str) -> String {
            self.0.join(relative).to_string_lossy().into_owned()
        }
    }

    impl Drop for Tree {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn paths(hits: &[Hit]) -> Vec<String> {
        let mut paths: Vec<String> = hits.iter().map(|hit| hit.path.clone()).collect();
        paths.sort();
        paths
    }

    #[test]
    fn finds_files_and_folders_by_name_ignoring_case() {
        let tree = Tree::new(
            "names",
            &[
                ("Documents/Tax-Report.pdf", ""),
                ("reports/q3.txt", ""),
                ("notes.md", "the tax report is due"),
            ],
        );
        let hits = search_in(&tree.0, "report", false).unwrap();
        assert_eq!(
            paths(&hits),
            [tree.path("Documents/Tax-Report.pdf"), tree.path("reports")]
        );
        assert!(
            hits.iter()
                .any(|hit| hit.folder && hit.path.ends_with("reports"))
        );
        assert!(hits.iter().all(|hit| hit.line.is_none()));
    }

    #[test]
    fn leaves_out_hidden_files_and_node_modules() {
        let tree = Tree::new(
            "hidden",
            &[
                (".cache/report.txt", "report"),
                ("node_modules/report/index.js", "report"),
                ("work/report.txt", "report"),
            ],
        );
        assert_eq!(
            paths(&search_in(&tree.0, "report", true).unwrap()),
            [tree.path("work/report.txt")]
        );
    }

    #[test]
    fn matches_names_as_typed_not_as_patterns() {
        let tree = Tree::new("literal", &[("a*b.txt", ""), ("axb.txt", "")]);
        assert_eq!(
            paths(&search_in(&tree.0, "a*b", false).unwrap()),
            [tree.path("a*b.txt")]
        );
    }

    #[test]
    fn also_searches_contents_when_asked_listing_names_first() {
        let tree = Tree::new(
            "contents",
            &[
                ("budget.txt", "nothing here"),
                ("notes.md", "intro\nThe BUDGET for 2026\nmore budget"),
            ],
        );
        assert_eq!(
            paths(&search_in(&tree.0, "budget", false).unwrap()),
            [tree.path("budget.txt")]
        );
        assert_eq!(
            search_in(&tree.0, "budget", true).unwrap(),
            [
                Hit {
                    path: tree.path("budget.txt"),
                    folder: false,
                    line: None,
                },
                Hit {
                    path: tree.path("notes.md"),
                    folder: false,
                    line: Some("2:The BUDGET for 2026".into()),
                },
            ]
        );
    }

    #[test]
    fn lists_a_file_once_when_both_its_name_and_text_match() {
        let tree = Tree::new("once", &[("budget.txt", "budget")]);
        assert_eq!(search_in(&tree.0, "budget", true).unwrap().len(), 1);
    }

    #[test]
    fn refuses_an_empty_query() {
        assert_eq!(
            search_in(Path::new("/"), "  ", false).unwrap_err(),
            "Type part of a file name to search for"
        );
    }

    #[test]
    fn shortens_a_long_matching_line() {
        let hit = contents_hit(&format!("/a\0{}:{}", 1, "x".repeat(200))).unwrap();
        assert_eq!(hit.line.unwrap().chars().count(), LINE_LENGTH + 1);
    }

    #[test]
    fn opens_only_absolute_paths_that_exist() {
        assert!(open("relative/file", OpenWith::App).is_err());
        assert!(open("/no/such/lifosy/file", OpenWith::Terminal).is_err());
    }

    #[test]
    fn opens_the_folder_a_file_is_in() {
        let tree = Tree::new("folder", &[("dir/file.txt", "")]);
        assert_eq!(folder_of(&tree.0.join("dir/file.txt")), tree.0.join("dir"));
        assert_eq!(folder_of(&tree.0.join("dir")), tree.0.join("dir"));
    }
}
