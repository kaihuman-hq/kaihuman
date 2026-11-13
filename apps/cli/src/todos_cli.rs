//! `kaihuman todo …` (docs/superpowers/specs/2026-11-12-todo-cli-design.md).
//!
//! Reads come from GitHub, not the local clone, so agents see the latest state. A change to one
//! file is a contents-API PUT with the sha read, re-read and retried once on a conflict; a change
//! to several files (`move`, `assign-ids`) is one commit through the git data API, retried the
//! same way. Every write also gives the todos of the files it touches an id. The format itself
//! is `todos.rs`; `add_todos` is the entry point `todo import` reuses.

use anyhow::{Context, Result};
use chrono::Duration;
use clap::{Args, Subcommand, ValueEnum};
use futures_util::future::try_join_all;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::fmt;
use std::io::Read;

use crate::auth::AuthManager;
use crate::github::{GithubClient, PutOutcome};
use crate::todos::{
    Now, Priority, Repeat, Status, Todo, TodoFile, TodoId, parse_due, parse_repeat,
};

/// The agent skill, installed by `kaihuman skills install`.
pub const KH_TODOS_SKILL: &str = include_str!("../../../packages/formats/skills/kh-todos/SKILL.md");

const SUFFIX: &str = ".todos.md";

// --- errors --------------------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Code {
    Error,
    Usage,
    NotFound,
    Conflict,
}

impl Code {
    pub fn exit(self) -> i32 {
        match self {
            Code::Error => 1,
            Code::Usage => 2,
            Code::NotFound => 3,
            Code::Conflict => 4,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Code::Error => "error",
            Code::Usage => "usage",
            Code::NotFound => "not_found",
            Code::Conflict => "conflict",
        }
    }
}

/// An error with the exit code the spec gives it.
#[derive(Debug)]
pub struct CliError {
    pub code: Code,
    pub message: String,
}

impl fmt::Display for CliError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for CliError {}

fn fail(code: Code, message: impl Into<String>) -> anyhow::Error {
    CliError {
        code,
        message: message.into(),
    }
    .into()
}

fn usage(message: impl Into<String>) -> anyhow::Error {
    fail(Code::Usage, message)
}

fn not_found(id: &str) -> anyhow::Error {
    fail(Code::NotFound, format!("No todo has the id {id}."))
}

fn code_of(error: &anyhow::Error) -> Code {
    error
        .downcast_ref::<CliError>()
        .map_or(Code::Error, |e| e.code)
}

/// Prints an error the way the spec asks: JSON on stderr with `--json`. Returns the exit code.
pub fn report_error(error: &anyhow::Error, json: bool) -> i32 {
    let code = code_of(error);
    if json {
        let body =
            serde_json::json!({"error": {"code": code.as_str(), "message": format!("{error:#}")}});
        eprintln!("{body}");
    } else {
        eprintln!("todo error: {error:#}");
    }
    code.exit()
}

/// A clap parse error as a `--json` usage error.
pub fn report_usage_json(message: &str) -> i32 {
    let first = message.lines().next().unwrap_or(message);
    let first = first.strip_prefix("error: ").unwrap_or(first);
    report_error(&usage(first.to_string()), true)
}

// --- command line --------------------------------------------------------------------------------

#[derive(Args)]
pub struct TodoArgs {
    #[command(subcommand)]
    pub command: TodoCommand,
    /// Print JSON (the contract for agents); errors go to stderr as {"error":{"code","message"}}
    #[arg(long, global = true)]
    pub json: bool,
}

#[derive(Clone, Copy, ValueEnum)]
pub enum StatusFilter {
    /// Open or in progress (the default)
    Active,
    Open,
    InProgress,
    Done,
    Rejected,
    Any,
}

#[derive(Subcommand)]
pub enum TodoCommand {
    /// Every *.todos.md in the repo, with counts
    Lists,
    /// Todos, filtered
    List {
        /// inbox, a list name (<app folder>/<name>.todos.md), a repo path, or all
        #[arg(long, default_value = "all")]
        list: String,
        #[arg(long, value_enum, default_value = "active")]
        status: StatusFilter,
        /// overdue, today, week (due within 7 days, overdue included) or YYYY-MM-DD
        #[arg(long)]
        due: Option<String>,
        #[arg(long)]
        tag: Option<String>,
        #[arg(long)]
        limit: Option<usize>,
    },
    /// One todo
    Show { id: String },
    /// Add a todo (or many with --stdin: NDJSON, one object per todo)
    Add(AddArgs),
    /// Change a todo
    Update(UpdateArgs),
    /// Complete a todo; a recurring one moves to its next due date
    Done { id: String },
    /// Move a todo to another list
    Move {
        id: String,
        #[arg(long)]
        to: String,
    },
    /// Delete a todo
    Rm { id: String },
    /// Give every todo without an id one, in one commit
    AssignIds,
    /// Import todos from another app (a dry run that prints the plan, unless --apply)
    Import(ImportArgs),
}

#[derive(Clone, Copy, ValueEnum)]
pub enum ImportSource {
    Ticktick,
}

#[derive(Args)]
pub struct ImportArgs {
    pub source: ImportSource,
    /// The TickTick backup CSV
    pub file: std::path::PathBuf,
    /// Write the todos, one commit per file; without it only the plan is printed
    #[arg(long)]
    pub apply: bool,
    /// Also import completed and won't-do todos
    #[arg(long)]
    pub include_done: bool,
}

#[derive(Args)]
pub struct AddArgs {
    #[arg(required_unless_present = "stdin", conflicts_with = "stdin")]
    pub text: Vec<String>,
    /// Read NDJSON from stdin: {"text", "list", "due", "tags", "priority", "repeat", "note",
    /// "id", "status", "created", "updated"}; one commit per file
    #[arg(long)]
    pub stdin: bool,
    /// inbox (default), a list name or a repo path; a new list is created
    #[arg(long)]
    pub list: Option<String>,
    /// YYYY-MM-DD or YYYY-MM-DDTHH:MM
    #[arg(long)]
    pub due: Option<String>,
    #[arg(long = "tag")]
    pub tags: Vec<String>,
    /// high, super-high or ultra-high
    #[arg(long)]
    pub priority: Option<String>,
    /// daily, weekdays, weekly:mon,thu, monthly:15, monthly:last, yearly:02-29, every 2 weeks:fri, …
    #[arg(long)]
    pub repeat: Option<String>,
    #[arg(long)]
    pub note: Option<String>,
}

#[derive(Args)]
pub struct UpdateArgs {
    pub id: String,
    #[arg(long)]
    pub text: Option<String>,
    #[arg(long, conflicts_with = "no_due")]
    pub due: Option<String>,
    #[arg(long)]
    pub no_due: bool,
    #[arg(long, conflicts_with = "no_priority")]
    pub priority: Option<String>,
    #[arg(long)]
    pub no_priority: bool,
    #[arg(long = "add-tag")]
    pub add_tags: Vec<String>,
    #[arg(long = "rm-tag")]
    pub rm_tags: Vec<String>,
    /// open, in-progress, done or rejected
    #[arg(long)]
    pub status: Option<String>,
}

// --- remote --------------------------------------------------------------------------------------

/// The repo at one commit: its todo files and the app folder.
pub struct Snapshot {
    pub branch: String,
    pub commit: String,
    /// See [`app_folder_for`].
    pub app_folder: String,
    /// (path, content) of every `*.todos.md`, sorted by path.
    pub files: Vec<(String, String)>,
}

impl Snapshot {
    fn inbox(&self) -> String {
        format!("{}/inbox{SUFFIX}", self.app_folder)
    }

    fn parsed(&self) -> impl Iterator<Item = (&str, TodoFile)> {
        self.files
            .iter()
            .map(|(p, c)| (p.as_str(), TodoFile::parse(c)))
    }

    pub(crate) fn ids(&self) -> HashSet<TodoId> {
        self.parsed()
            .flat_map(|(_, f)| f.todos().filter_map(|t| t.id.clone()).collect::<Vec<_>>())
            .collect()
    }

    fn locate(&self, id: &TodoId) -> Option<(String, Todo)> {
        self.parsed()
            .find_map(|(p, f)| f.find(id).map(|t| (p.to_string(), t.clone())))
    }

    fn content(&self, path: &str) -> Option<&str> {
        self.files
            .iter()
            .find(|(p, _)| p == path)
            .map(|(_, c)| c.as_str())
    }
}

/// GitHub, or a fake in the tests.
pub(crate) trait Remote {
    async fn snapshot(&self) -> Result<Snapshot>;
    async fn get(&self, path: &str) -> Result<Option<(String, String)>>;
    async fn put(
        &self,
        path: &str,
        content: &str,
        message: &str,
        sha: Option<&str>,
    ) -> Result<PutOutcome>;
    async fn commit(
        &self,
        branch: &str,
        parent: &str,
        files: &[(String, String)],
        message: &str,
    ) -> Result<PutOutcome>;
}

pub struct GithubRemote {
    client: GithubClient,
    owner: String,
    repo: String,
}

impl GithubRemote {
    /// From the CLI's saved login and active repo.
    pub fn load() -> Result<Self> {
        let auth = AuthManager::new()?;
        let token = auth
            .get_token()
            .context("Not logged in. Run `kaihuman` and press `l` to log in.")?;
        let repo = auth.get_active_repo()?.context(
            "No active repo. Run `kaihuman`, log in with `l` and select your data repo with `s`.",
        )?;
        let (owner, repo) = repo
            .split_once('/')
            .context("The active repo is not owner/name")?;
        Ok(Self {
            client: GithubClient::new(token)?,
            owner: owner.to_string(),
            repo: repo.to_string(),
        })
    }
}

impl Remote for GithubRemote {
    async fn snapshot(&self) -> Result<Snapshot> {
        let (owner, repo) = (&self.owner, &self.repo);
        let (branch, commit) = self.client.head(owner, repo).await?;
        let tree = self.client.tree(owner, repo, &commit).await?;
        let app_folder = app_folder_for(tree.iter().map(|(p, _)| p.as_str()));
        let todo_files: Vec<_> = tree.iter().filter(|(p, _)| p.ends_with(SUFFIX)).collect();
        let contents = try_join_all(
            todo_files
                .iter()
                .map(|(_, sha)| self.client.blob(owner, repo, sha)),
        )
        .await?;
        let mut files: Vec<_> = todo_files
            .iter()
            .map(|(p, _)| p.clone())
            .zip(contents)
            .collect();
        files.sort();
        Ok(Snapshot {
            branch,
            commit,
            app_folder: app_folder.to_string(),
            files,
        })
    }

    async fn get(&self, path: &str) -> Result<Option<(String, String)>> {
        self.client.get_file(&self.owner, &self.repo, path).await
    }

    async fn put(
        &self,
        path: &str,
        content: &str,
        message: &str,
        sha: Option<&str>,
    ) -> Result<PutOutcome> {
        self.client
            .write_file(&self.owner, &self.repo, path, content, message, sha)
            .await
    }

    async fn commit(
        &self,
        branch: &str,
        parent: &str,
        files: &[(String, String)],
        message: &str,
    ) -> Result<PutOutcome> {
        self.client
            .commit_files(&self.owner, &self.repo, branch, parent, files, message)
            .await
    }
}

/// `.kh`; the legacy `.lifeos` only while a repo still has it and no `.kh/`. A new repo gets
/// `.kh`: writing `.lifeos` there made the console run its `.lifeos` → `.kh` migration.
pub(crate) fn app_folder_for<'a>(mut paths: impl Iterator<Item = &'a str>) -> &'static str {
    let mut lifeos = false;
    for p in paths.by_ref() {
        if p.starts_with(".kh/") {
            return ".kh";
        }
        lifeos |= p.starts_with(".lifeos/");
    }
    if lifeos { ".lifeos" } else { ".kh" }
}

fn conflict(what: &str) -> anyhow::Error {
    fail(
        Code::Conflict,
        format!(
            "{what} changed on GitHub twice while it was being written. Run the command again."
        ),
    )
}

/// Reads `path`, lets `edit` change it (`None`: nothing to write) and PUTs it with the sha read,
/// re-reading once on a conflict.
async fn write_file(
    remote: &impl Remote,
    path: &str,
    message: &str,
    mut edit: impl FnMut(Option<&str>) -> Result<Option<String>>,
) -> Result<()> {
    for _ in 0..2 {
        let existing = remote.get(path).await?;
        let Some(content) = edit(existing.as_ref().map(|(c, _)| c.as_str()))? else {
            return Ok(());
        };
        let sha = existing.as_ref().map(|(_, s)| s.as_str());
        if remote.put(path, &content, message, sha).await? == PutOutcome::Written {
            return Ok(());
        }
    }
    Err(conflict(path))
}

/// Parses a file for writing; the old `# Group` format is left to the console to migrate.
fn editable(path: &str, content: Option<&str>) -> Result<TodoFile> {
    let file = TodoFile::parse(content.unwrap_or(""));
    if file.legacy {
        return Err(fail(
            Code::Error,
            format!(
                "{path} uses the old `# Group` format. Open it once in the kaihuman console to migrate it."
            ),
        ));
    }
    Ok(file)
}

// --- values --------------------------------------------------------------------------------------

/// A list name as the spec takes it: `inbox`, a repo path ending in `.todos.md`, or a name.
pub fn resolve_list(name: &str, app_folder: &str) -> Result<String> {
    let name = name.trim().trim_start_matches("./");
    let path = match name {
        "inbox" => format!("{app_folder}/inbox{SUFFIX}"),
        n if n.ends_with(SUFFIX) => n.to_string(),
        n => format!("{app_folder}/{n}{SUFFIX}"),
    };
    let bad = path
        .split('/')
        .any(|s| s.is_empty() || s == "." || s == "..")
        || path.chars().any(|c| c.is_control() || c == '\\');
    if name.is_empty() || name == "all" || bad {
        return Err(usage(format!("\"{name}\" is not a list.")));
    }
    Ok(path)
}

fn parse_tag(tag: &str) -> Result<String> {
    let tag = tag.trim().trim_start_matches('#');
    if tag.is_empty()
        || !tag
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err(usage(format!(
            "\"{tag}\" is not a tag: use letters, digits, _ and -."
        )));
    }
    Ok(tag.to_string())
}

fn parse_id(id: &str) -> Result<TodoId> {
    TodoId::parse(id).ok_or_else(|| usage(format!("\"{id}\" is not an id (8 of 0-9, a-z).")))
}

fn parse_text(text: &str) -> Result<String> {
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if text.is_empty() {
        return Err(usage("The todo text is empty."));
    }
    Ok(text)
}

fn value<T>(kind: &str, raw: &str, parsed: Option<T>) -> Result<T> {
    parsed.ok_or_else(|| usage(format!("\"{raw}\" is not a valid {kind}.")))
}

fn due_value(raw: &str) -> Result<crate::todos::Due> {
    value("due (YYYY-MM-DD or YYYY-MM-DDTHH:MM)", raw, parse_due(raw))
}

fn priority_value(raw: &str) -> Result<Priority> {
    value(
        "priority (high, super-high, ultra-high)",
        raw,
        Priority::parse(raw),
    )
}

fn repeat_value(raw: &str) -> Result<Repeat> {
    value("repeat rule", raw, parse_repeat(raw))
}

fn status_value(raw: &str) -> Result<Status> {
    value(
        "status (open, in-progress, done, rejected)",
        raw,
        Status::parse(raw),
    )
}

/// One todo to add: a `todo add` call or one NDJSON line. `id`, `status`, `created` and `updated`
/// let an importer keep what the source had; `id` makes a re-run skip what is already there.
#[derive(Debug, Clone, Default, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct NewTodo {
    pub text: String,
    pub list: Option<String>,
    pub due: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub priority: Option<String>,
    pub repeat: Option<String>,
    pub note: Option<String>,
    pub id: Option<String>,
    pub status: Option<String>,
    pub created: Option<String>,
    pub updated: Option<i64>,
}

impl NewTodo {
    /// The todo (normalized as the file will read back) and its list's path.
    pub(crate) fn build(&self, app_folder: &str, now: &Now) -> Result<(String, Todo)> {
        let path = resolve_list(self.list.as_deref().unwrap_or("inbox"), app_folder)?;
        let mut todo = Todo::new(&parse_text(&self.text)?, now);
        todo.id = self.id.as_deref().map(parse_id).transpose()?;
        todo.tags = self
            .tags
            .iter()
            .map(|t| parse_tag(t))
            .collect::<Result<_>>()?;
        todo.due = self.due.as_deref().map(due_value).transpose()?;
        todo.priority = self.priority.as_deref().map(priority_value).transpose()?;
        todo.repeat = self.repeat.as_deref().map(repeat_value).transpose()?;
        if let Some(s) = &self.status {
            todo.status = status_value(s)?;
        }
        if let Some(c) = &self.created {
            if c.is_empty() || c.contains(char::is_whitespace) || c.contains("::") {
                return Err(usage(format!("\"{c}\" is not a valid created time.")));
            }
            todo.created = Some(c.clone());
        }
        if let Some(u) = self.updated {
            todo.updated = Some(u);
        }
        todo.note = self
            .note
            .iter()
            .flat_map(|n| n.lines())
            .map(str::trim)
            .filter(|l| !l.is_empty())
            .map(String::from)
            .collect();
        Ok((path, normalized(todo)))
    }
}

/// The todo as the file will read it back (`#tags` typed into the text become tags, and so on).
fn normalized(todo: Todo) -> Todo {
    let id = todo.id.clone();
    let mut back = TodoFile::parse(&todo.serialize())
        .todos()
        .next()
        .cloned()
        .expect("a serialized todo parses");
    back.id = id;
    back
}

// --- output --------------------------------------------------------------------------------------

/// The JSON todo of the spec.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct TodoJson {
    pub id: Option<String>,
    pub list: String,
    pub status: &'static str,
    pub text: String,
    pub tags: Vec<String>,
    pub priority: Option<&'static str>,
    pub due: Option<String>,
    pub repeat: Option<String>,
    pub created: Option<String>,
    pub updated: Option<i64>,
    pub note: Option<String>,
}

impl TodoJson {
    pub fn new(list: &str, todo: &Todo) -> Self {
        Self {
            id: todo.id.as_ref().map(|i| i.to_string()),
            list: list.to_string(),
            status: todo.status.as_str(),
            text: todo.text.clone(),
            tags: todo.tags.clone(),
            priority: todo.priority.map(Priority::as_str),
            due: todo.due.as_ref().map(|d| d.to_string()),
            repeat: todo.repeat.as_ref().map(|r| r.to_string()),
            created: todo.created.clone(),
            updated: todo.updated,
            note: (!todo.note.is_empty()).then(|| todo.note.join("\n")),
        }
    }

    fn line(&self) -> String {
        let marker = match self.status {
            "in-progress" => "[>]",
            "done" => "[x]",
            "rejected" => "[-]",
            _ => "[ ]",
        };
        let mut line = format!(
            "{} {marker} {}",
            self.id.as_deref().unwrap_or("--------"),
            self.text
        );
        for tag in &self.tags {
            line.push_str(&format!(" #{tag}"));
        }
        if let Some(p) = self.priority {
            line.push_str(&format!(" ^{p}"));
        }
        if let Some(d) = &self.due {
            line.push_str(&format!("  due {d}"));
        }
        if let Some(r) = &self.repeat {
            line.push_str(&format!(" ({r})"));
        }
        line.push_str(&format!("  [{}]", self.list));
        line
    }
}

#[derive(Debug, Serialize, PartialEq)]
pub struct ListJson {
    pub path: String,
    pub inbox: bool,
    pub open: usize,
    #[serde(rename = "in-progress")]
    pub in_progress: usize,
    pub done: usize,
    pub rejected: usize,
    pub total: usize,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct Skipped {
    pub id: String,
    pub reason: String,
}

#[derive(Debug, Default, Serialize, PartialEq)]
pub struct AddReport {
    pub added: Vec<TodoJson>,
    pub skipped: Vec<Skipped>,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct Assigned {
    pub path: String,
    pub assigned: usize,
}

/// What a command prints: JSON as is, text through `text()`.
#[derive(Debug, Serialize, PartialEq)]
#[serde(untagged)]
pub enum Output {
    Lists(Vec<ListJson>),
    Todos(Vec<TodoJson>),
    Todo(TodoJson),
    Added(AddReport),
    Removed { removed: TodoJson },
    Assigned { files: Vec<Assigned>, total: usize },
    Import(ImportPlan),
}

/// One target file of an import: what it gets and what an earlier import already put there.
#[derive(Debug, Serialize, PartialEq)]
pub struct ImportFile {
    pub path: String,
    pub new: usize,
    pub existing: usize,
    pub todos: Vec<TodoJson>,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct ImportPlan {
    pub applied: bool,
    pub files: Vec<ImportFile>,
    pub new: usize,
    pub existing: usize,
    /// Completed todos left out; pass --include-done to import them.
    pub excluded_done: usize,
}

impl Output {
    pub fn text(&self) -> String {
        match self {
            Output::Lists(lists) => lists
                .iter()
                .map(|l| {
                    format!(
                        "{}{}  {} open, {} in progress, {} done, {} rejected",
                        l.path,
                        if l.inbox { " (inbox)" } else { "" },
                        l.open,
                        l.in_progress,
                        l.done,
                        l.rejected
                    )
                })
                .collect::<Vec<_>>()
                .join("\n"),
            Output::Todos(todos) if todos.is_empty() => "No todos.".to_string(),
            Output::Todos(todos) => todos
                .iter()
                .map(TodoJson::line)
                .collect::<Vec<_>>()
                .join("\n"),
            Output::Todo(t) => {
                let mut out = t.line();
                if let Some(note) = &t.note {
                    out.push_str(&format!("\n  > {}", note.replace('\n', "\n  > ")));
                }
                out
            }
            Output::Added(report) => {
                let mut lines: Vec<_> = report
                    .added
                    .iter()
                    .map(|t| format!("added {}", t.line()))
                    .collect();
                lines.extend(
                    report
                        .skipped
                        .iter()
                        .map(|s| format!("skipped {} ({})", s.id, s.reason)),
                );
                lines.join("\n")
            }
            Output::Import(plan) => {
                let mut lines: Vec<_> = plan
                    .files
                    .iter()
                    .map(|f| format!("{}: {} new, {} already there", f.path, f.new, f.existing))
                    .collect();
                lines.push(format!(
                    "{} new, {} already there, {} completed left out",
                    plan.new, plan.existing, plan.excluded_done
                ));
                if !plan.applied {
                    lines.push("Dry run: nothing written. Add --apply to write.".into());
                }
                lines.join("\n")
            }
            Output::Removed { removed } => format!("removed {}", removed.line()),
            Output::Assigned { files, total } => {
                let mut lines: Vec<_> = files
                    .iter()
                    .map(|f| format!("{}: {} ids", f.path, f.assigned))
                    .collect();
                lines.push(format!("{total} ids assigned"));
                lines.join("\n")
            }
        }
    }
}

// --- commands ------------------------------------------------------------------------------------

fn lists(snap: &Snapshot) -> Output {
    let inbox = snap.inbox();
    Output::Lists(
        snap.parsed()
            .map(|(path, file)| {
                let count = |s| file.todos().filter(|t| t.status == s).count();
                ListJson {
                    path: path.to_string(),
                    inbox: path == inbox,
                    open: count(Status::Open),
                    in_progress: count(Status::InProgress),
                    done: count(Status::Done),
                    rejected: count(Status::Rejected),
                    total: file.todos().count(),
                }
            })
            .collect(),
    )
}

pub struct ListFilter {
    pub list: String,
    pub status: StatusFilter,
    pub due: Option<String>,
    pub tag: Option<String>,
    pub limit: Option<usize>,
}

fn list(snap: &Snapshot, filter: &ListFilter, now: &Now) -> Result<Output> {
    let path = match filter.list.as_str() {
        "all" => None,
        name => Some(resolve_list(name, &snap.app_folder)?),
    };
    let due_date = match filter.due.as_deref() {
        None | Some("overdue" | "today" | "week") => None,
        Some(raw) => Some(due_value(raw)?.date),
    };
    let tag = filter.tag.as_deref().map(parse_tag).transpose()?;
    let week_end = now.today + Duration::days(6);
    let keep = |t: &Todo| {
        let status = match filter.status {
            StatusFilter::Active => matches!(t.status, Status::Open | Status::InProgress),
            StatusFilter::Open => t.status == Status::Open,
            StatusFilter::InProgress => t.status == Status::InProgress,
            StatusFilter::Done => t.status == Status::Done,
            StatusFilter::Rejected => t.status == Status::Rejected,
            StatusFilter::Any => true,
        };
        let date = t.due.as_ref().map(|d| d.date);
        let due = match filter.due.as_deref() {
            None => true,
            Some("overdue") => t.due_status(now) == Some("overdue"),
            Some("today") => date == Some(now.today),
            Some("week") => date.is_some_and(|d| d <= week_end),
            Some(_) => date == due_date,
        };
        status && due && tag.as_ref().is_none_or(|tag| t.tags.contains(tag))
    };
    let todos = snap
        .parsed()
        .filter(|(p, _)| path.as_deref().is_none_or(|want| want == *p))
        .flat_map(|(p, f)| {
            f.todos()
                .filter(|t| keep(t))
                .map(|t| TodoJson::new(p, t))
                .collect::<Vec<_>>()
        })
        .take(filter.limit.unwrap_or(usize::MAX))
        .collect();
    Ok(Output::Todos(todos))
}

fn show(snap: &Snapshot, id: &str) -> Result<Output> {
    let (path, todo) = snap.locate(&parse_id(id)?).ok_or_else(|| not_found(id))?;
    Ok(Output::Todo(TodoJson::new(&path, &todo)))
}

/// Adds todos, one commit per file, in input order. A todo whose explicit id is already in the
/// repo (or earlier in the batch) is skipped, so importing the same todos again adds nothing.
pub(crate) async fn add_todos(
    remote: &impl Remote,
    snap: &Snapshot,
    items: &[NewTodo],
    now: &Now,
) -> Result<AddReport> {
    let mut taken = snap.ids();
    let mut report = AddReport::default();
    let mut by_file: BTreeMap<String, Vec<Todo>> = BTreeMap::new();
    let mut order: Vec<String> = Vec::new();
    let mut built = Vec::new();
    for (n, item) in items.iter().enumerate() {
        let (path, todo) = item
            .build(&snap.app_folder, now)
            .map_err(|e| usage(format!("todo {}: {e}", n + 1)))?;
        built.push((path, todo));
    }
    for (path, mut todo) in built {
        match &todo.id {
            Some(id) if !taken.insert(id.clone()) => {
                report.skipped.push(Skipped {
                    id: id.to_string(),
                    reason: "an existing todo has this id".into(),
                });
                continue;
            }
            Some(_) => {}
            None => todo.id = Some(TodoId::fresh(&mut taken)),
        }
        if !by_file.contains_key(&path) {
            order.push(path.clone());
        }
        by_file.entry(path).or_default().push(todo);
    }
    for path in order {
        let todos = &by_file[&path];
        let message = match todos.as_slice() {
            [one] => format!("kaihuman: todo add {}", one.id.as_ref().expect("an id")),
            many => format!("kaihuman: todo add {} todos", many.len()),
        };
        write_file(remote, &path, &message, |content| {
            let mut file = editable(&path, content)?;
            file.assign_ids(&mut taken.clone());
            for todo in todos {
                file.push(todo.clone());
            }
            Ok(Some(file.render()))
        })
        .await?;
        report
            .added
            .extend(todos.iter().map(|t| TodoJson::new(&path, t)));
    }
    Ok(report)
}

fn read_ndjson(input: &str) -> Result<Vec<NewTodo>> {
    input
        .lines()
        .enumerate()
        .filter(|(_, l)| !l.trim().is_empty())
        .map(|(n, l)| {
            serde_json::from_str(l).map_err(|e| usage(format!("stdin line {}: {e}", n + 1)))
        })
        .collect()
}

/// Changes one todo in place: `change` gets it and returns false to leave the file as it is.
async fn edit_todo(
    remote: &impl Remote,
    snap: &Snapshot,
    raw_id: &str,
    verb: &str,
    change: impl Fn(&mut Todo) -> Result<()>,
) -> Result<Output> {
    let id = parse_id(raw_id)?;
    let (path, _) = snap.locate(&id).ok_or_else(|| not_found(raw_id))?;
    let taken = snap.ids();
    let mut result = None;
    write_file(
        remote,
        &path,
        &format!("kaihuman: todo {verb} {id}"),
        |content| {
            let mut file = editable(&path, content)?;
            let todo = file.find_mut(&id).ok_or_else(|| not_found(raw_id))?;
            change(todo)?;
            result = Some(TodoJson::new(&path, todo));
            file.assign_ids(&mut taken.clone());
            Ok(Some(file.render()))
        },
    )
    .await?;
    Ok(Output::Todo(result.expect("the edit ran")))
}

async fn update(
    remote: &impl Remote,
    snap: &Snapshot,
    args: &UpdateArgs,
    now: &Now,
) -> Result<Output> {
    let text = args.text.as_deref().map(parse_text).transpose()?;
    let due = args.due.as_deref().map(due_value).transpose()?;
    let priority = args.priority.as_deref().map(priority_value).transpose()?;
    let status = args.status.as_deref().map(status_value).transpose()?;
    let add: Vec<_> = args
        .add_tags
        .iter()
        .map(|t| parse_tag(t))
        .collect::<Result<_>>()?;
    let rm: Vec<_> = args
        .rm_tags
        .iter()
        .map(|t| parse_tag(t))
        .collect::<Result<_>>()?;
    edit_todo(remote, snap, &args.id, "update", |todo| {
        if let Some(text) = &text {
            // Typed `#tags` in the new text become tags, like on add.
            let mut parsed = normalized(Todo::new(text, now));
            todo.text = std::mem::take(&mut parsed.text);
            for tag in parsed.tags {
                if !todo.tags.contains(&tag) {
                    todo.tags.push(tag);
                }
            }
        }
        if due.is_some() || args.no_due {
            todo.due = due.clone();
        }
        if priority.is_some() || args.no_priority {
            todo.priority = priority;
        }
        todo.tags.retain(|t| !rm.contains(t));
        for tag in &add {
            if !todo.tags.contains(tag) {
                todo.tags.push(tag.clone());
            }
        }
        todo.touch(now);
        if let Some(status) = status {
            todo.set_status(status, now);
        }
        Ok(())
    })
    .await
}

/// Writes several files in one commit on top of the snapshot, re-reading once on a conflict.
async fn commit_snapshot(
    remote: &impl Remote,
    first: Snapshot,
    message: &str,
    mut change: impl FnMut(&Snapshot) -> Result<Vec<(String, String)>>,
) -> Result<()> {
    let mut snap = first;
    for attempt in 0..2 {
        if attempt > 0 {
            snap = remote.snapshot().await?;
        }
        let files = change(&snap)?;
        if files.is_empty() {
            return Ok(());
        }
        if remote
            .commit(&snap.branch, &snap.commit, &files, message)
            .await?
            == PutOutcome::Written
        {
            return Ok(());
        }
    }
    Err(conflict("The repo"))
}

async fn move_todo(
    remote: &impl Remote,
    snap: Snapshot,
    raw_id: &str,
    to: &str,
    now: &Now,
) -> Result<Output> {
    let id = parse_id(raw_id)?;
    let target = resolve_list(to, &snap.app_folder)?;
    let mut result = None;
    commit_snapshot(
        remote,
        snap,
        &format!("kaihuman: todo move {id} to {target}"),
        |snap| {
            let (source, _) = snap.locate(&id).ok_or_else(|| not_found(raw_id))?;
            if source == target {
                return Err(usage(format!("{raw_id} is already in {target}.")));
            }
            let mut taken = snap.ids();
            let mut from = editable(&source, snap.content(&source))?;
            let mut into = editable(&target, snap.content(&target))?;
            let mut todo = from.remove(&id).expect("located");
            todo.touch(now);
            result = Some(TodoJson::new(&target, &todo));
            into.push(todo);
            from.assign_ids(&mut taken);
            into.assign_ids(&mut taken);
            Ok(vec![
                (source, from.render()),
                (target.clone(), into.render()),
            ])
        },
    )
    .await?;
    Ok(Output::Todo(result.expect("the move ran")))
}

async fn remove(remote: &impl Remote, snap: &Snapshot, raw_id: &str) -> Result<Output> {
    let id = parse_id(raw_id)?;
    let (path, _) = snap.locate(&id).ok_or_else(|| not_found(raw_id))?;
    let taken = snap.ids();
    let mut removed = None;
    write_file(
        remote,
        &path,
        &format!("kaihuman: todo rm {id}"),
        |content| {
            let mut file = editable(&path, content)?;
            let todo = file.remove(&id).ok_or_else(|| not_found(raw_id))?;
            removed = Some(TodoJson::new(&path, &todo));
            file.assign_ids(&mut taken.clone());
            Ok(Some(file.render()))
        },
    )
    .await?;
    Ok(Output::Removed {
        removed: removed.expect("the edit ran"),
    })
}

async fn assign_ids(remote: &impl Remote, snap: Snapshot) -> Result<Output> {
    let mut assigned = Vec::new();
    commit_snapshot(remote, snap, "kaihuman: todo assign-ids", |snap| {
        let mut taken = snap.ids();
        assigned.clear();
        let mut files = Vec::new();
        for (path, mut file) in snap.parsed() {
            if file.legacy {
                continue;
            }
            let n = file.assign_ids(&mut taken);
            if n > 0 {
                assigned.push(Assigned {
                    path: path.to_string(),
                    assigned: n,
                });
                files.push((path.to_string(), file.render()));
            }
        }
        Ok(files)
    })
    .await?;
    let total = assigned.iter().map(|a| a.assigned).sum();
    Ok(Output::Assigned {
        files: assigned,
        total,
    })
}

/// Plans the import of a TickTick CSV and, with `--apply`, writes it (one commit per file). Todos
/// whose id is in the repo already count as `existing`, so a second run adds nothing.
async fn import(
    remote: &impl Remote,
    snap: &Snapshot,
    args: &ImportArgs,
    csv: &str,
    now: &Now,
) -> Result<Output> {
    let parsed = match args.source {
        ImportSource::Ticktick => {
            crate::todos_ticktick::parse(csv, args.include_done, &chrono::Local)
        }
    }
    .map_err(|e| usage(e.to_string()))?;
    let mut taken = snap.ids();
    let mut files: BTreeMap<String, ImportFile> = BTreeMap::new();
    let mut fresh = Vec::new();
    for (n, item) in parsed.todos.iter().enumerate() {
        let (path, todo) = item
            .build(&snap.app_folder, now)
            .map_err(|e| usage(format!("todo {}: {e}", n + 1)))?;
        let file = files.entry(path.clone()).or_insert_with(|| ImportFile {
            path: path.clone(),
            new: 0,
            existing: 0,
            todos: Vec::new(),
        });
        if todo.id.as_ref().is_some_and(|id| !taken.insert(id.clone())) {
            file.existing += 1;
        } else {
            file.new += 1;
            file.todos.push(TodoJson::new(&path, &todo));
            fresh.push(item.clone());
        }
    }
    if args.apply && !fresh.is_empty() {
        add_todos(remote, snap, &fresh, now).await?;
    }
    let files: Vec<_> = files.into_values().collect();
    Ok(Output::Import(ImportPlan {
        applied: args.apply,
        new: files.iter().map(|f| f.new).sum(),
        existing: files.iter().map(|f| f.existing).sum(),
        files,
        excluded_done: parsed.excluded_done,
    }))
}

/// Runs one command against `remote`; `stdin` is read only by `add --stdin`.
pub(crate) async fn execute(
    remote: &impl Remote,
    command: &TodoCommand,
    stdin: impl FnOnce() -> Result<String>,
    now: &Now,
) -> Result<Output> {
    let snap = remote.snapshot().await?;
    match command {
        TodoCommand::Lists => Ok(lists(&snap)),
        TodoCommand::List {
            list: l,
            status,
            due,
            tag,
            limit,
        } => list(
            &snap,
            &ListFilter {
                list: l.clone(),
                status: *status,
                due: due.clone(),
                tag: tag.clone(),
                limit: *limit,
            },
            now,
        ),
        TodoCommand::Show { id } => show(&snap, id),
        TodoCommand::Add(args) if args.stdin => {
            let items = read_ndjson(&stdin()?)?;
            Ok(Output::Added(add_todos(remote, &snap, &items, now).await?))
        }
        TodoCommand::Add(args) => {
            let item = NewTodo {
                text: args.text.join(" "),
                list: args.list.clone(),
                due: args.due.clone(),
                tags: args.tags.clone(),
                priority: args.priority.clone(),
                repeat: args.repeat.clone(),
                note: args.note.clone(),
                ..NewTodo::default()
            };
            let mut report = add_todos(remote, &snap, &[item], now).await?;
            Ok(Output::Todo(report.added.remove(0)))
        }
        TodoCommand::Update(args) => update(remote, &snap, args, now).await,
        TodoCommand::Done { id } => {
            edit_todo(remote, &snap, id, "done", |todo| {
                todo.complete(now);
                Ok(())
            })
            .await
        }
        TodoCommand::Move { id, to } => move_todo(remote, snap, id, to, now).await,
        TodoCommand::Rm { id } => remove(remote, &snap, id).await,
        TodoCommand::AssignIds => assign_ids(remote, snap).await,
        TodoCommand::Import(args) => {
            let csv = std::fs::read_to_string(&args.file)
                .map_err(|e| usage(format!("cannot read {}: {e}", args.file.display())))?;
            import(remote, &snap, args, &csv, now).await
        }
    }
}

/// `kaihuman todo …`; returns the exit code.
pub async fn run(args: TodoArgs) -> i32 {
    let result = async {
        let remote = GithubRemote::load()?;
        let stdin = || {
            let mut input = String::new();
            std::io::stdin().read_to_string(&mut input)?;
            Ok(input)
        };
        execute(&remote, &args.command, stdin, &Now::local()).await
    }
    .await;
    match result {
        Ok(output) if args.json => {
            println!(
                "{}",
                serde_json::to_string(&output).expect("output serializes")
            );
            0
        }
        Ok(output) => {
            println!("{}", output.text());
            0
        }
        Err(error) => report_error(&error, args.json),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::HashMap;

    const INBOX: &str = ".kh/inbox.todos.md";
    const WORK: &str = ".kh/work.todos.md";

    fn now() -> Now {
        Now {
            ms: 1_800_000_000_000,
            today: chrono::NaiveDate::from_ymd_opt(2026, 11, 12).unwrap(),
            time: "12:00".into(),
        }
    }

    /// An in-memory repo: path → (content, sha), at commit `c<n>`. `races` makes the next writes
    /// find the file changed behind their back.
    #[derive(Default)]
    struct Fake {
        files: RefCell<HashMap<String, (String, String)>>,
        version: RefCell<usize>,
        races: RefCell<usize>,
        messages: RefCell<Vec<String>>,
    }

    impl Fake {
        fn with(files: &[(&str, &str)]) -> Self {
            let fake = Fake::default();
            for (p, c) in files {
                fake.files
                    .borrow_mut()
                    .insert(p.to_string(), (c.to_string(), "sha0".into()));
            }
            fake.files
                .borrow_mut()
                .insert(".kh/README.md".into(), ("x".into(), "sha0".into()));
            fake
        }

        fn content(&self, path: &str) -> String {
            self.files.borrow()[path].0.clone()
        }

        fn race(&self) -> bool {
            let mut races = self.races.borrow_mut();
            if *races == 0 {
                return false;
            }
            *races -= 1;
            *self.version.borrow_mut() += 1;
            for entry in self.files.borrow_mut().values_mut() {
                entry.1 = format!("{}-race", entry.1);
            }
            true
        }

        fn write(&self, path: &str, content: &str, message: &str) {
            *self.version.borrow_mut() += 1;
            let sha = format!("sha{}", self.version.borrow());
            self.files
                .borrow_mut()
                .insert(path.into(), (content.into(), sha));
            self.messages.borrow_mut().push(message.into());
        }
    }

    impl Remote for Fake {
        async fn snapshot(&self) -> Result<Snapshot> {
            let files = self.files.borrow();
            let mut todo_files: Vec<_> = files
                .iter()
                .filter(|(p, _)| p.ends_with(SUFFIX))
                .map(|(p, (c, _))| (p.clone(), c.clone()))
                .collect();
            todo_files.sort();
            Ok(Snapshot {
                branch: "main".into(),
                commit: format!("c{}", self.version.borrow()),
                app_folder: app_folder_for(files.keys().map(String::as_str)).into(),
                files: todo_files,
            })
        }

        async fn get(&self, path: &str) -> Result<Option<(String, String)>> {
            Ok(self.files.borrow().get(path).cloned())
        }

        async fn put(
            &self,
            path: &str,
            content: &str,
            message: &str,
            sha: Option<&str>,
        ) -> Result<PutOutcome> {
            if self.race() {
                return Ok(PutOutcome::Conflict);
            }
            let current = self.files.borrow().get(path).map(|(_, s)| s.clone());
            if current.as_deref() != sha {
                return Ok(PutOutcome::Conflict);
            }
            self.write(path, content, message);
            Ok(PutOutcome::Written)
        }

        async fn commit(
            &self,
            _branch: &str,
            parent: &str,
            files: &[(String, String)],
            message: &str,
        ) -> Result<PutOutcome> {
            if self.race() || parent != format!("c{}", self.version.borrow()) {
                return Ok(PutOutcome::Conflict);
            }
            for (path, content) in files {
                self.write(path, content, message);
            }
            *self.version.borrow_mut() -= files.len() - 1;
            Ok(PutOutcome::Written)
        }
    }

    const SEED: &str = "- [ ] Buy milk #home\n::updated:: 1 ::id:: aaaaaaaa\n- [ ] No id yet\n";

    async fn exec(fake: &Fake, args: &[&str]) -> Result<Output> {
        exec_stdin(fake, args, "").await
    }

    async fn exec_stdin(fake: &Fake, args: &[&str], input: &str) -> Result<Output> {
        use clap::Parser;
        #[derive(Parser)]
        struct Cli {
            #[command(flatten)]
            todo: TodoArgs,
        }
        let cli = Cli::try_parse_from(std::iter::once("todo").chain(args.iter().copied()))
            .map_err(|e| usage(e.to_string()))?;
        let input = input.to_string();
        execute(fake, &cli.todo.command, || Ok(input), &now()).await
    }

    fn code(result: Result<Output>) -> Code {
        code_of(&result.unwrap_err())
    }

    fn todo(output: Output) -> TodoJson {
        match output {
            Output::Todo(t) => t,
            other => panic!("not a todo: {other:?}"),
        }
    }

    #[tokio::test]
    async fn adds_to_the_inbox_with_an_id_and_backfills_the_file() {
        let fake = Fake::with(&[(INBOX, SEED)]);
        let t = todo(
            exec(
                &fake,
                &[
                    "add",
                    "Call",
                    "mom",
                    "--tag",
                    "#family",
                    "--due",
                    "2026-11-13",
                    "--priority",
                    "high",
                    "--note",
                    "about xmas",
                ],
            )
            .await
            .unwrap(),
        );
        let id = t.id.clone().unwrap();
        assert_eq!(t.list, INBOX);
        assert_eq!(t.text, "Call mom");
        assert_eq!(t.tags, ["family"]);
        let content = fake.content(INBOX);
        let lines: Vec<_> = content.lines().collect();
        assert_eq!(&lines[..2], SEED.lines().take(2).collect::<Vec<_>>());
        assert_eq!(lines[2], "- [ ] No id yet");
        assert!(lines[3].starts_with("::id:: "));
        assert_eq!(lines[4], "- [ ] Call mom #family ^high");
        assert_eq!(
            lines[5],
            format!(
                "::updated:: 1800000000000 ::created:: 2027-01-15T08:00:00.000Z ::due:: 2026-11-13 ::id:: {id}"
            )
        );
        assert_eq!(lines[6], "  > about xmas");
        assert_eq!(
            *fake.messages.borrow(),
            [format!("kaihuman: todo add {id}")]
        );
    }

    #[tokio::test]
    async fn adds_ndjson_one_commit_per_file_and_skips_known_ids() {
        let fake = Fake::with(&[(INBOX, SEED)]);
        let input = [
            r#"{"text":"a"}"#,
            r#"{"text":"b","list":"work","id":"bbbbbbbb","status":"done","created":"2020-01-01T00:00:00Z"}"#,
            "",
            r#"{"text":"again","id":"aaaaaaaa"}"#,
            r#"{"text":"c","list":"work","tags":["x"],"repeat":"weekly:mon"}"#,
        ]
        .join("\n");
        let Output::Added(report) = exec_stdin(&fake, &["add", "--stdin"], &input)
            .await
            .unwrap()
        else {
            panic!()
        };
        assert_eq!(report.added.len(), 3);
        assert_eq!(
            report.skipped,
            [Skipped {
                id: "aaaaaaaa".into(),
                reason: "an existing todo has this id".into()
            }]
        );
        assert_eq!(fake.messages.borrow().len(), 2);
        assert_eq!(fake.messages.borrow()[1], "kaihuman: todo add 2 todos");
        let work = fake.content(WORK);
        assert!(work.starts_with("- [x] b\n::updated:: 1800000000000 ::created:: 2020-01-01T00:00:00Z ::id:: bbbbbbbb\n"), "{work}");
        assert!(work.contains("- [ ] c #x\n"));
        assert!(work.contains("::repeat:: weekly:mon"));

        // Importing again adds nothing.
        let again = r#"{"text":"b","list":"work","id":"bbbbbbbb"}"#;
        let Output::Added(report) = exec_stdin(&fake, &["add", "--stdin"], again).await.unwrap()
        else {
            panic!()
        };
        assert!(report.added.is_empty());
        assert_eq!(fake.messages.borrow().len(), 2);
    }

    #[tokio::test]
    async fn rejects_bad_input_before_writing() {
        let fake = Fake::with(&[(INBOX, SEED)]);
        for args in [
            &["add", "x", "--due", "2026-02-30"][..],
            &["add", "x", "--priority", "urgent"],
            &["add", "x", "--repeat", "hourly"],
            &["add", "x", "--tag", "a b"],
            &["add", "x", "--list", "../etc"],
            &["add", " "],
            &["update", "aaaaaaaa", "--due", "x"],
            &["show", "nope"],
        ] {
            assert_eq!(code(exec(&fake, args).await), Code::Usage, "{args:?}");
        }
        let bad = exec_stdin(&fake, &["add", "--stdin"], "{\"text\":\"a\",\"colour\":1}").await;
        assert_eq!(code(bad), Code::Usage);
        assert!(fake.messages.borrow().is_empty());
    }

    #[tokio::test]
    async fn updates_a_todo_by_id() {
        let fake = Fake::with(&[(INBOX, SEED)]);
        let t = todo(
            exec(
                &fake,
                &[
                    "update",
                    "aaaaaaaa",
                    "--text",
                    "Buy oat milk #shop",
                    "--add-tag",
                    "x",
                    "--rm-tag",
                    "home",
                    "--due",
                    "2026-11-20T08:00",
                    "--status",
                    "in-progress",
                ],
            )
            .await
            .unwrap(),
        );
        assert_eq!(t.text, "Buy oat milk");
        assert_eq!(t.tags, ["shop", "x"]);
        assert_eq!(t.status, "in-progress");
        assert!(fake.content(INBOX).starts_with(
            "- [>] Buy oat milk #shop #x\n::updated:: 1800000000000 ::due:: 2026-11-20T08:00 ::id:: aaaaaaaa\n"
        ));
        let t = todo(
            exec(&fake, &["update", "aaaaaaaa", "--no-due"])
                .await
                .unwrap(),
        );
        assert_eq!(t.due, None);
        assert_eq!(
            code(exec(&fake, &["update", "zzzzzzzz", "--no-due"]).await),
            Code::NotFound
        );
    }

    #[tokio::test]
    async fn done_advances_a_recurring_todo() {
        let seed = "- [ ] Water #g\n::due:: 2026-11-09 ::repeat:: weekly:mon,thu ::id:: wwwwwwww\n";
        let fake = Fake::with(&[(INBOX, seed)]);
        let t = todo(exec(&fake, &["done", "wwwwwwww"]).await.unwrap());
        assert_eq!(t.status, "open");
        assert_eq!(t.due.as_deref(), Some("2026-11-16"));
        assert!(
            fake.content(INBOX)
                .contains("::done:: 2026-11-12 ::id:: wwwwwwww")
        );
        let fake = Fake::with(&[(INBOX, SEED)]);
        assert_eq!(
            todo(exec(&fake, &["done", "aaaaaaaa"]).await.unwrap()).status,
            "done"
        );
    }

    #[tokio::test]
    async fn moves_in_one_commit_and_removes() {
        let fake = Fake::with(&[(INBOX, SEED), (WORK, "- [ ] w\n::id:: wwwwwwww\n")]);
        let t = todo(
            exec(&fake, &["move", "aaaaaaaa", "--to", "work"])
                .await
                .unwrap(),
        );
        assert_eq!(t.list, WORK);
        assert_eq!(
            *fake.messages.borrow(),
            ["kaihuman: todo move aaaaaaaa to .kh/work.todos.md"; 2]
        );
        assert!(!fake.content(INBOX).contains("Buy milk"));
        assert!(
            fake.content(WORK)
                .contains("- [ ] Buy milk #home\n::updated:: 1800000000000 ::id:: aaaaaaaa\n")
        );
        assert_eq!(
            code(exec(&fake, &["move", "aaaaaaaa", "--to", WORK]).await),
            Code::Usage
        );

        let Output::Removed { removed } = exec(&fake, &["rm", "wwwwwwww"]).await.unwrap() else {
            panic!()
        };
        assert_eq!(removed.text, "w");
        assert!(fake.content(WORK).starts_with("- [ ] Buy milk"));
        assert_eq!(code(exec(&fake, &["rm", "wwwwwwww"]).await), Code::NotFound);
    }

    #[tokio::test]
    async fn assigns_ids_in_one_commit_and_skips_legacy_files() {
        let legacy = "# Old\n- [ ] x\n";
        let fake = Fake::with(&[
            (INBOX, SEED),
            (WORK, "- [ ] a\n- [ ] b\n"),
            (".kh/old.todos.md", legacy),
        ]);
        let Output::Assigned { files, total } = exec(&fake, &["assign-ids"]).await.unwrap() else {
            panic!()
        };
        assert_eq!(total, 3);
        assert_eq!(files.len(), 2);
        assert_eq!(fake.content(".kh/old.todos.md"), legacy);
        let Output::Assigned { total, .. } = exec(&fake, &["assign-ids"]).await.unwrap() else {
            panic!()
        };
        assert_eq!(total, 0);
        assert_eq!(fake.messages.borrow().len(), 2);
        assert_eq!(
            code(exec(&fake, &["add", "y", "--list", "old"]).await),
            Code::Error
        );
    }

    #[tokio::test]
    async fn retries_once_on_a_conflict_then_gives_up() {
        let fake = Fake::with(&[(INBOX, SEED), (WORK, "")]);
        *fake.races.borrow_mut() = 1;
        exec(&fake, &["done", "aaaaaaaa"]).await.unwrap();
        *fake.races.borrow_mut() = 1;
        exec(&fake, &["move", "aaaaaaaa", "--to", "work"])
            .await
            .unwrap();
        *fake.races.borrow_mut() = 2;
        assert_eq!(code(exec(&fake, &["add", "x"]).await), Code::Conflict);
        *fake.races.borrow_mut() = 2;
        assert_eq!(
            code(exec(&fake, &["move", "aaaaaaaa", "--to", "inbox"]).await),
            Code::Conflict
        );
    }

    #[tokio::test]
    async fn lists_and_filters() {
        let inbox = "- [ ] late\n::due:: 2026-11-01 ::id:: 11111111\n- [>] now #t\n::due:: 2026-11-12 ::id:: 22222222\n- [x] old\n::due:: 2026-11-01 ::id:: 33333333\n- [ ] later\n::due:: 2026-11-30 ::id:: 44444444\n";
        let fake = Fake::with(&[(INBOX, inbox), (WORK, "- [-] nope\n")]);
        let Output::Lists(lists) = exec(&fake, &["lists"]).await.unwrap() else {
            panic!()
        };
        assert_eq!(lists[0].path, INBOX);
        assert!(lists[0].inbox);
        assert_eq!(
            (lists[0].open, lists[0].in_progress, lists[0].done),
            (2, 1, 1)
        );
        assert_eq!(lists[1].rejected, 1);

        let ids = |o: Output| match o {
            Output::Todos(t) => t
                .into_iter()
                .map(|t| t.id.unwrap_or_default())
                .collect::<Vec<_>>(),
            _ => panic!(),
        };
        assert_eq!(
            ids(exec(&fake, &["list"]).await.unwrap()),
            ["11111111", "22222222", "44444444"]
        );
        assert_eq!(
            ids(exec(&fake, &["list", "--due", "overdue"]).await.unwrap()),
            ["11111111"]
        );
        assert_eq!(
            ids(exec(&fake, &["list", "--due", "today"]).await.unwrap()),
            ["22222222"]
        );
        assert_eq!(
            ids(exec(&fake, &["list", "--due", "week", "--status", "any"])
                .await
                .unwrap()),
            ["11111111", "22222222", "33333333"]
        );
        assert_eq!(
            ids(exec(&fake, &["list", "--due", "2026-11-30"]).await.unwrap()),
            ["44444444"]
        );
        assert_eq!(
            ids(exec(&fake, &["list", "--tag", "t"]).await.unwrap()),
            ["22222222"]
        );
        assert_eq!(
            ids(
                exec(&fake, &["list", "--status", "rejected", "--list", "work"])
                    .await
                    .unwrap()
            ),
            [""]
        );
        assert_eq!(
            ids(exec(&fake, &["list", "--limit", "1", "--list", "inbox"])
                .await
                .unwrap()),
            ["11111111"]
        );

        let t = todo(exec(&fake, &["show", "44444444"]).await.unwrap());
        assert_eq!(
            serde_json::to_value(&t).unwrap(),
            serde_json::json!({"id": "44444444", "list": INBOX, "status": "open", "text": "later", "tags": [], "priority": null, "due": "2026-11-30", "repeat": null, "created": null, "updated": null, "note": null})
        );
        assert_eq!(
            code(exec(&fake, &["show", "99999999"]).await),
            Code::NotFound
        );
    }

    #[test]
    fn app_folder_defaults_to_kh_in_a_new_repo() {
        assert_eq!(app_folder_for(["README.md"].into_iter()), ".kh");
        assert_eq!(app_folder_for(std::iter::empty()), ".kh");
        assert_eq!(
            app_folder_for([".lifeos/a.todos.md"].into_iter()),
            ".lifeos"
        );
        assert_eq!(
            app_folder_for([".lifeos/a.todos.md", ".kh/b.md"].into_iter()),
            ".kh"
        );
    }

    #[test]
    fn resolves_list_names() {
        assert_eq!(resolve_list("inbox", ".kh").unwrap(), INBOX);
        assert_eq!(
            resolve_list("work", ".lifeos").unwrap(),
            ".lifeos/work.todos.md"
        );
        assert_eq!(
            resolve_list("./a/b.todos.md", ".kh").unwrap(),
            "a/b.todos.md"
        );
        for bad in ["all", "", "../x", "a//b"] {
            assert!(resolve_list(bad, ".kh").is_err(), "{bad}");
        }
    }

    #[test]
    fn errors_print_as_json_with_their_exit_code() {
        assert_eq!(report_error(&not_found("x"), true), 3);
        assert_eq!(report_error(&anyhow::anyhow!("boom"), true), 1);
        assert_eq!(
            report_usage_json("error: unexpected argument\n\nUsage: …"),
            2
        );
    }

    const TICKTICK: &str = include_str!("../tests/fixtures/ticktick.csv");

    /// The fixture on disk (the command reads a path) and the plan of importing it.
    async fn import_run(fake: &Fake, extra: &[&str]) -> ImportPlan {
        // Tests run in parallel in one process, so each call needs its own file.
        static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let n = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("kh-import-{}-{n}.csv", std::process::id()));
        std::fs::write(&path, TICKTICK).unwrap();
        let mut args = vec!["import", "ticktick", path.to_str().unwrap()];
        args.extend(extra);
        let out = exec(fake, &args).await;
        std::fs::remove_file(&path).ok();
        match out.unwrap() {
            Output::Import(plan) => plan,
            other => panic!("not a plan: {other:?}"),
        }
    }

    #[tokio::test]
    async fn import_dry_run_plans_per_file_and_writes_nothing() {
        let fake = Fake::with(&[(INBOX, SEED)]);
        let plan = import_run(&fake, &[]).await;
        assert!(!plan.applied);
        assert_eq!((plan.new, plan.existing, plan.excluded_done), (7, 0, 3));
        let paths: Vec<_> = plan.files.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(
            paths,
            [
                ".kh/home.todos.md",
                ".kh/inbox.todos.md",
                ".kh/travel-2027.todos.md",
                ".kh/work.todos.md"
            ]
        );
        assert_eq!(plan.files[1].todos.len(), 2);
        assert_eq!(fake.content(INBOX), SEED);
        assert!(fake.messages.borrow().is_empty());
    }

    #[tokio::test]
    async fn import_apply_commits_per_file_and_a_rerun_adds_nothing() {
        let fake = Fake::with(&[(INBOX, SEED)]);
        let plan = import_run(&fake, &["--apply", "--include-done"]).await;
        assert!(plan.applied);
        assert_eq!(plan.new, 10);
        assert_eq!(fake.messages.borrow().len(), 4);
        let inbox = fake.content(INBOX);
        assert!(inbox.contains("Buy milk\n") || inbox.contains("- [ ] Buy milk"));
        assert!(inbox.contains("- [x] Done with 2"));
        assert!(inbox.contains("- [-] Won't do"));
        let after = fake.content(INBOX);
        let again = import_run(&fake, &["--apply", "--include-done"]).await;
        assert_eq!((again.new, again.existing), (0, 10));
        assert_eq!(fake.content(INBOX), after);
        assert_eq!(fake.messages.borrow().len(), 4);
    }

    #[tokio::test]
    async fn import_reads_a_missing_file_as_a_usage_error() {
        let fake = Fake::with(&[(INBOX, SEED)]);
        let r = exec(&fake, &["import", "ticktick", "/nonexistent/x.csv"]).await;
        assert_eq!(code(r), Code::Usage);
    }
}
