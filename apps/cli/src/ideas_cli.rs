//! `kaihuman idea`, `kaihuman ideas …` and `kaihuman skills install` (doc/ideas.md, Decision 5).
//!
//! Reads come from the local clone, pulled first. Writes go through the GitHub contents API: a new
//! idea is a create-only PUT, an edit re-reads the file and PUTs with its sha, retrying once on a
//! conflict. When GitHub cannot be reached, the write is queued as a JSON op in
//! `<config>/spool/ideas/` and replayed, oldest first, by the next ideas command that is online.
//! The edits themselves are the pure functions in `ideas.rs`; this module is the thin layer around
//! them.

use anyhow::{Context, Result, bail};
use chrono::{DateTime, FixedOffset, Local};
use clap::{Args, Subcommand};
use serde::{Deserialize, Serialize};
use std::fmt;
use std::fs;
use std::io::IsTerminal;
use std::path::{Path, PathBuf};

use crate::auth::AuthManager;
use crate::capture::resolve_text;
use crate::github::{GithubClient, PutOutcome};
use crate::ideas::{
    self, Idea, IdeaActivity, IdeaFile, IdeaHandoff, IdeaRef, IdeaSlug, IdeaStatus, NewIdea,
};

/// The agent skill, installed by `kaihuman skills install`.
pub const KH_IDEAS_SKILL: &str = include_str!("../../../packages/formats/skills/kh-ideas/SKILL.md");

// --- command line --------------------------------------------------------------------------------

#[derive(Args)]
pub struct IdeaArgs {
    /// Idea text: the first line is the title, the rest the braindump. If omitted, reads piped
    /// stdin, or opens $EDITOR when interactive.
    pub text: Vec<String>,
    /// The id, 2–40 of a-z, 0-9 and "-" (default: from the title)
    #[arg(long)]
    pub slug: Option<String>,
    /// The product the idea is for
    #[arg(long)]
    pub product: Option<String>,
    /// A tag; repeat for more
    #[arg(long = "tag")]
    pub tags: Vec<String>,
    /// Who writes: `human`, or an agent's short name such as `claude`
    #[arg(long = "by", default_value = "human")]
    pub author: String,
}

#[derive(Args)]
pub struct IdeasArgs {
    #[command(subcommand)]
    pub command: Option<IdeasCommand>,
    /// Only ideas with this status (seed, exploring, committed, shipped, parked, dropped)
    #[arg(long)]
    pub status: Option<IdeaStatus>,
    /// Only ideas for this product
    #[arg(long)]
    pub product: Option<String>,
    /// Also list closed ideas (shipped, parked, dropped)
    #[arg(long)]
    pub all: bool,
    /// Print JSON
    #[arg(long)]
    pub json: bool,
}

#[derive(Subcommand)]
pub enum IdeasCommand {
    /// Print an idea's file
    Show {
        /// The idea's slug, such as palette-sync
        slug: String,
        /// Print the parsed idea as JSON
        #[arg(long)]
        json: bool,
    },
    /// Ideas matching a few words in the slug, title, product or tags, best first
    Find {
        #[arg(required = true)]
        words: Vec<String>,
        /// Print JSON
        #[arg(long)]
        json: bool,
    },
    /// Add a log entry (a finding, a decision, a result)
    Log {
        /// The idea's slug, such as palette-sync
        slug: String,
        #[arg(required = true)]
        text: Vec<String>,
        #[arg(long = "by", default_value = "human")]
        author: String,
    },
    /// Add an open challenge (a risk or an open question)
    Challenge {
        /// The idea's slug, such as palette-sync
        slug: String,
        #[arg(required = true)]
        text: Vec<String>,
    },
    /// Append to the braindump (reads stdin or $EDITOR when no text is given)
    Dump {
        /// The idea's slug, such as palette-sync
        slug: String,
        text: Vec<String>,
    },
    /// Replace the summary under the title
    Summary {
        /// The idea's slug, such as palette-sync
        slug: String,
        #[arg(required = true)]
        text: Vec<String>,
    },
    /// Change the status, with a log entry
    Status {
        /// The idea's slug, such as palette-sync
        slug: String,
        status: IdeaStatus,
        /// Why; always give one when parking or dropping
        #[arg(long)]
        reason: Option<String>,
        #[arg(long = "by", default_value = "human")]
        author: String,
    },
    /// Apply `kh-idea` hand-off blocks from stdin (or $EDITOR)
    Import {
        #[arg(long = "by", default_value = "human")]
        author: String,
    },
    /// The local clone path of the ideas folder, or of one idea
    Path {
        /// The idea's slug; leave out for the folder
        slug: Option<String>,
    },
}

#[derive(Subcommand)]
pub enum SkillsCommand {
    /// Install the kh-ideas skill to ~/.claude/skills/ and ~/.agents/skills/
    Install {
        /// Install under this directory instead of your home directory
        #[arg(long)]
        dir: Option<PathBuf>,
    },
}

// --- operations ----------------------------------------------------------------------------------

/// One write to one idea, as it is queued while offline.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "lowercase")]
pub enum IdeaOp {
    /// A rendered new idea, written create-only.
    Create {
        slug: IdeaSlug,
        content: String,
    },
    Log {
        slug: IdeaSlug,
        text: String,
        author: String,
    },
    Challenge {
        slug: IdeaSlug,
        text: String,
    },
    Dump {
        slug: IdeaSlug,
        text: String,
    },
    Summary {
        slug: IdeaSlug,
        text: String,
    },
    Status {
        slug: IdeaSlug,
        status: IdeaStatus,
        reason: Option<String>,
        author: String,
    },
    Import {
        handoff: IdeaHandoff,
        author: String,
    },
}

impl IdeaOp {
    fn name(&self) -> &'static str {
        match self {
            IdeaOp::Create { .. } => "create",
            IdeaOp::Log { .. } => "log",
            IdeaOp::Challenge { .. } => "challenge",
            IdeaOp::Dump { .. } => "dump",
            IdeaOp::Summary { .. } => "summary",
            IdeaOp::Status { .. } => "status",
            IdeaOp::Import { .. } => "import",
        }
    }

    /// The idea it writes. A hand-off for a new idea has no slug, so it is the title's.
    fn slug(&self) -> Result<IdeaSlug> {
        match self {
            IdeaOp::Create { slug, .. }
            | IdeaOp::Log { slug, .. }
            | IdeaOp::Challenge { slug, .. }
            | IdeaOp::Dump { slug, .. }
            | IdeaOp::Summary { slug, .. }
            | IdeaOp::Status { slug, .. } => Ok(slug.clone()),
            IdeaOp::Import { handoff, .. } => match (&handoff.slug, &handoff.title) {
                (Some(slug), _) => parse_slug(slug),
                (None, Some(title)) => Ok(ideas::slugify_idea_title(title)),
                (None, None) => bail!("A new idea needs a title."),
            },
        }
    }

    /// True for a write that makes a new file and must never overwrite one.
    fn creates_only(&self) -> bool {
        match self {
            IdeaOp::Create { .. } => true,
            IdeaOp::Import { handoff, .. } => handoff.slug.is_none(),
            _ => false,
        }
    }

    /// The idea's new content. `existing` is the current file, `None` when there is none.
    pub fn apply(&self, existing: Option<&str>, now: &DateTime<FixedOffset>) -> Result<String> {
        if let IdeaOp::Import { handoff, author } = self {
            return Ok(ideas::apply_idea_handoff(existing, handoff, author, now)?.content);
        }
        let slug = self.slug()?;
        if let IdeaOp::Create { content, .. } = self {
            if existing.is_some() {
                bail!("{}", already_exists(&slug));
            }
            return Ok(content.clone());
        }
        let Some(text) = existing else {
            bail!(
                "No idea named {slug}. Find it with `kaihuman ideas find \"<words>\"`, or create it with `kaihuman idea \"<title>\" --slug {slug}`."
            );
        };
        match self {
            IdeaOp::Log {
                text: t, author, ..
            } => ideas::log_idea(text, t, author, now),
            IdeaOp::Challenge { text: t, .. } => ideas::add_idea_challenge(text, t, now),
            IdeaOp::Dump { text: t, .. } => ideas::append_idea_braindump(text, t, now),
            IdeaOp::Summary { text: t, .. } => ideas::set_idea_summary(text, t, now),
            IdeaOp::Status {
                status,
                reason,
                author,
                ..
            } => ideas::set_idea_status(text, *status, reason.as_deref(), author, now),
            IdeaOp::Create { .. } | IdeaOp::Import { .. } => unreachable!("handled above"),
        }
    }
}

fn already_exists(slug: &IdeaSlug) -> String {
    format!(
        "An idea named {slug} already exists ({}). Pick another name with --slug {slug}-2, or add to it with `kaihuman ideas log {slug} \"…\"`.",
        ideas::idea_path(slug)
    )
}

fn parse_slug(value: &str) -> Result<IdeaSlug> {
    let value = value.strip_prefix("idea:").unwrap_or(value);
    IdeaSlug::parse(value).ok_or_else(|| {
        anyhow::anyhow!(
            "\"{value}\" is not a slug: use 2–40 lowercase letters, digits and \"-\", such as palette-sync."
        )
    })
}

/// An op with the time it was made, so a replayed log entry keeps its real time.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct QueuedOp {
    pub at: String,
    #[serde(flatten)]
    pub op: IdeaOp,
}

impl QueuedOp {
    pub fn now(op: IdeaOp) -> Self {
        Self {
            at: Local::now().fixed_offset().to_rfc3339(),
            op,
        }
    }

    fn time(&self) -> Result<DateTime<FixedOffset>> {
        DateTime::parse_from_rfc3339(&self.at)
            .with_context(|| format!("bad time \"{}\" in a queued idea change", self.at))
    }
}

// --- remote --------------------------------------------------------------------------------------

/// GitHub did not take the request: no network, or an error status such as 401 or 503. The
/// write is queued instead of failing, and a queued write is kept, never set aside, so an expired
/// login or an outage cannot lose it.
#[derive(Debug)]
pub struct Offline(String);

impl fmt::Display for Offline {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "GitHub did not answer: {}", self.0)
    }
}

impl std::error::Error for Offline {}

fn is_offline(error: &anyhow::Error) -> bool {
    error.downcast_ref::<Offline>().is_some()
}

/// Where idea files are read from and written to: GitHub, or a fake in the tests.
trait Remote {
    async fn get(&self, path: &str) -> Result<Option<(String, String)>>;
    async fn put(
        &self,
        path: &str,
        content: &str,
        message: &str,
        sha: Option<&str>,
    ) -> Result<PutOutcome>;
}

struct GithubRemote {
    client: GithubClient,
    owner: String,
    repo: String,
}

fn to_offline(error: anyhow::Error) -> anyhow::Error {
    anyhow::Error::new(Offline(format!("{error:#}")))
}

impl Remote for GithubRemote {
    async fn get(&self, path: &str) -> Result<Option<(String, String)>> {
        self.client
            .get_file(&self.owner, &self.repo, path)
            .await
            .map_err(to_offline)
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
            .map_err(to_offline)
    }
}

/// Writes one op: create-only for a new idea; read, apply and PUT with the sha for an edit,
/// re-reading once if the file changed in between. Returns the idea's repo path.
async fn write_op(remote: &impl Remote, queued: &QueuedOp) -> Result<String> {
    let now = queued.time()?;
    let slug = queued.op.slug()?;
    let path = ideas::idea_path(&slug);
    let message = format!("kaihuman: idea {slug} — {}", queued.op.name());
    if queued.op.creates_only() {
        let content = queued.op.apply(None, &now)?;
        return match remote.put(&path, &content, &message, None).await? {
            PutOutcome::Written => Ok(path),
            PutOutcome::Conflict => bail!("{}", already_exists(&slug)),
        };
    }
    for _ in 0..2 {
        let existing = remote.get(&path).await?;
        let content = queued
            .op
            .apply(existing.as_ref().map(|(c, _)| c.as_str()), &now)?;
        let sha = existing.as_ref().map(|(_, s)| s.as_str());
        if remote.put(&path, &content, &message, sha).await? == PutOutcome::Written {
            return Ok(path);
        }
    }
    bail!("{path} changed on GitHub twice while it was being written. Run the command again.")
}

// --- queue ---------------------------------------------------------------------------------------

/// Adds an op to the queue. File names start with the time in ms, so they sort in order.
fn enqueue(dir: &Path, queued: &QueuedOp) -> Result<PathBuf> {
    fs::create_dir_all(dir)?;
    let ms = chrono::Utc::now().timestamp_millis();
    let mut n = 0;
    let path = loop {
        let path = dir.join(format!("{ms:013}-{n}.json"));
        if !path.exists() {
            break path;
        }
        n += 1;
    };
    fs::write(&path, serde_json::to_string_pretty(queued)?)
        .with_context(|| format!("Failed to write {}", path.display()))?;
    Ok(path)
}

fn queued_files(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut files: Vec<PathBuf> = entries
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|x| x == "json"))
        .collect();
    files.sort();
    files
}

#[derive(Debug, Default, PartialEq)]
pub struct FlushReport {
    pub applied: usize,
    /// Still queued because GitHub went away mid-flush.
    pub pending: usize,
    /// Ops that can never apply, kept as `<name>.json.failed` with the reason.
    pub failed: Vec<String>,
}

/// Replays the queue oldest first. It stops at the first offline error so the order holds; an op
/// that fails for any other reason is renamed to `.failed` so it does not block the rest.
async fn flush_queue(remote: &impl Remote, dir: &Path) -> FlushReport {
    let mut report = FlushReport::default();
    let files = queued_files(dir);
    for (i, path) in files.iter().enumerate() {
        let result = match fs::read_to_string(path) {
            Ok(text) => match serde_json::from_str::<QueuedOp>(&text) {
                Ok(queued) => write_op(remote, &queued).await,
                Err(e) => Err(e.into()),
            },
            Err(e) => Err(e.into()),
        };
        match result {
            Ok(_) => {
                let _ = fs::remove_file(path);
                report.applied += 1;
            }
            Err(e) if is_offline(&e) => {
                report.pending = files.len() - i;
                break;
            }
            Err(e) => {
                let mut failed = path.clone().into_os_string();
                failed.push(".failed");
                let _ = fs::rename(path, &failed);
                report
                    .failed
                    .push(format!("{}: {e:#}", Path::new(&failed).display()));
            }
        }
    }
    report
}

fn print_flush(report: &FlushReport) {
    if report.applied > 0 {
        eprintln!("Applied {} queued idea change(s).", report.applied);
    }
    for failure in &report.failed {
        eprintln!("warning: a queued idea change could not be applied: {failure}");
    }
    if report.pending > 0 {
        eprintln!(
            "{} idea change(s) still queued: GitHub did not answer.",
            report.pending
        );
    }
}

// --- session -------------------------------------------------------------------------------------

/// The active repo, its local clone and the way to GitHub, from the CLI's saved login.
pub struct Session {
    config_dir: PathBuf,
    repo: Option<(String, String)>,
    token: Option<String>,
}

pub enum Submitted {
    Written { path: String },
    Queued { reason: String },
}

impl Session {
    pub fn load() -> Result<Self> {
        let auth = AuthManager::new()?;
        let repo = auth.get_active_repo()?.and_then(|r| {
            let (owner, name) = r.split_once('/')?;
            Some((owner.to_string(), name.to_string()))
        });
        Ok(Self {
            config_dir: auth.config_dir().to_path_buf(),
            repo,
            token: auth.get_token().ok(),
        })
    }

    pub fn repo_name(&self) -> String {
        self.repo
            .as_ref()
            .map_or_else(|| "?".to_string(), |(o, r)| format!("{o}/{r}"))
    }

    fn queue_dir(&self) -> PathBuf {
        self.config_dir.join("spool").join("ideas")
    }

    fn require_repo(&self) -> Result<&(String, String)> {
        self.repo.as_ref().context(
            "No active repo. Run `kaihuman`, log in with `l` and select your data repo with `s`.",
        )
    }

    /// The clone dir, whether or not it exists yet.
    pub fn clone_dir(&self) -> Result<PathBuf> {
        let (owner, name) = self.require_repo()?;
        Ok(self.config_dir.join("repos").join(owner).join(name))
    }

    fn remote(&self) -> Option<GithubRemote> {
        let (owner, repo) = self.repo.clone()?;
        let client = GithubClient::new(self.token.clone()?).ok()?;
        Some(GithubRemote {
            client,
            owner,
            repo,
        })
    }

    /// Replays queued writes, if any and if GitHub may be reachable.
    pub async fn flush(&self) -> FlushReport {
        match self.remote() {
            Some(remote) if !queued_files(&self.queue_dir()).is_empty() => {
                flush_queue(&remote, &self.queue_dir()).await
            }
            _ => FlushReport::default(),
        }
    }

    /// Pulls the clone (or clones it) and returns its path. A failed pull keeps the old copy and
    /// returns its reason as a warning; with no copy at all it is an error.
    pub async fn sync_clone(&self) -> Result<(PathBuf, Option<String>)> {
        let dir = self.clone_dir()?;
        if dir.join(".git").exists() {
            let warning = crate::git::pull_repo(&dir).await.err().map(|e| {
                let error = format!("{e:#}");
                let reason = error.lines().next().unwrap_or_default();
                format!("Could not update the local clone ({reason}); showing what it had.")
            });
            return Ok((dir, warning));
        }
        let (owner, name) = self.require_repo()?;
        let token = self
            .token
            .as_deref()
            .context("Not logged in. Run `kaihuman` and press `l` to log in.")?;
        let dir = crate::git::sync_repo(&self.config_dir, owner, name, token)
            .await
            .with_context(|| {
                format!(
                    "Ideas are read from a local clone of {owner}/{name}, and cloning it failed"
                )
            })?;
        Ok((dir, None))
    }

    /// Writes an op now, or queues it when GitHub cannot be reached (or the queue still holds
    /// older writes, which must go first). Also returns what replaying the queue did.
    pub async fn submit(&self, queued: QueuedOp) -> Result<(Submitted, FlushReport)> {
        let report = self.flush().await;
        let reason = match self.remote() {
            None if self.token.is_none() => "not logged in".to_string(),
            None => "no active repo".to_string(),
            Some(_) if report.pending > 0 => "older changes are still queued".to_string(),
            Some(remote) => match write_op(&remote, &queued).await {
                Ok(path) => return Ok((Submitted::Written { path }, report)),
                Err(e) if is_offline(&e) => e.to_string(),
                Err(e) => return Err(e),
            },
        };
        self.check_against_clone(&queued)?;
        enqueue(&self.queue_dir(), &queued)?;
        Ok((Submitted::Queued { reason }, report))
    }

    /// Before queueing, applies the op to the clone's copy so a mistake shows now, not at replay.
    fn check_against_clone(&self, queued: &QueuedOp) -> Result<()> {
        let Ok(dir) = self.clone_dir() else {
            return Ok(());
        };
        let slug = queued.op.slug()?;
        let existing = fs::read_to_string(dir.join(ideas::idea_path(&slug))).ok();
        if queued.op.creates_only() {
            if existing.is_some() {
                bail!("{}", already_exists(&slug));
            }
            queued.op.apply(None, &queued.time()?)?;
        } else if let Some(text) = existing {
            queued.op.apply(Some(&text), &queued.time()?)?;
        }
        Ok(())
    }
}

/// Every idea in a clone, by slug. Files whose name is not a slug are skipped.
pub fn load_ideas(clone: &Path) -> Vec<IdeaRef> {
    let Ok(entries) = fs::read_dir(clone.join(ideas::IDEAS_FOLDER)) else {
        return Vec::new();
    };
    let mut refs: Vec<IdeaRef> = entries
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().into_string().ok()?;
            let slug = ideas::idea_slug_of(&format!("{}/{name}", ideas::IDEAS_FOLDER))?;
            let text = fs::read_to_string(e.path()).ok()?;
            Some(IdeaRef {
                slug,
                idea: ideas::parse_idea(&text),
            })
        })
        .collect();
    refs.sort_by(|a, b| a.slug.cmp(&b.slug));
    refs
}

// --- overview ------------------------------------------------------------------------------------

/// Open statuses first, the order an overview shows them in.
pub const STATUS_ORDER: [IdeaStatus; 6] = [
    IdeaStatus::Exploring,
    IdeaStatus::Committed,
    IdeaStatus::Seed,
    IdeaStatus::Parked,
    IdeaStatus::Shipped,
    IdeaStatus::Dropped,
];

pub struct IdeaRow {
    pub slug: IdeaSlug,
    pub idea: Idea,
    pub activity: IdeaActivity,
}

/// Ideas in overview order: by status, then the latest activity first.
pub fn idea_rows(refs: Vec<IdeaRef>, now: &DateTime<FixedOffset>) -> Vec<IdeaRow> {
    let rank = |s: IdeaStatus| STATUS_ORDER.iter().position(|o| *o == s).unwrap_or(0);
    let mut rows: Vec<IdeaRow> = refs
        .into_iter()
        .map(|r| IdeaRow {
            activity: ideas::idea_activity(&r.idea, now),
            slug: r.slug,
            idea: r.idea,
        })
        .collect();
    rows.sort_by(|a, b| {
        rank(a.idea.status)
            .cmp(&rank(b.idea.status))
            .then(b.activity.last_at.cmp(&a.activity.last_at))
            .then_with(|| a.slug.cmp(&b.slug))
    });
    rows
}

/// `5m ago`, `2h ago`, `3d ago`, `4mo ago`, `1y ago`.
pub fn relative_age(last_at: Option<i64>, now_ms: i64) -> String {
    let Some(at) = last_at else {
        return "—".to_string();
    };
    let minutes = (now_ms - at).max(0) / 60_000;
    match minutes {
        0 => "just now".to_string(),
        m if m < 60 => format!("{m}m ago"),
        m if m < 60 * 24 => format!("{}h ago", m / 60),
        m if m < 60 * 24 * 60 => format!("{}d ago", m / (60 * 24)),
        m if m < 60 * 24 * 365 => format!("{}mo ago", m / (60 * 24 * 30)),
        m => format!("{}y ago", m / (60 * 24 * 365)),
    }
}

pub struct Filter {
    pub status: Option<IdeaStatus>,
    pub product: Option<String>,
    pub all: bool,
}

impl Filter {
    fn product_matches(&self, idea: &Idea) -> bool {
        self.product.as_deref().is_none_or(|p| {
            idea.product
                .as_deref()
                .is_some_and(|q| q.eq_ignore_ascii_case(p))
        })
    }

    /// Whether the idea's group is listed in full (closed ones are collapsed into a count).
    fn expands(&self, status: IdeaStatus) -> bool {
        self.status
            .map_or(self.all || status.is_open(), |s| s == status)
    }
}

fn paint(color: bool, code: &str, text: &str) -> String {
    if color {
        format!("\x1b[{code}m{text}\x1b[0m")
    } else {
        text.to_string()
    }
}

fn status_color(status: IdeaStatus) -> &'static str {
    match status {
        IdeaStatus::Exploring => "1;36",
        IdeaStatus::Committed => "1;32",
        IdeaStatus::Seed => "1;33",
        _ => "2",
    }
}

fn truncate(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let mut cut: String = text.chars().take(max - 1).collect();
    cut.push('…');
    cut
}

fn row_line(row: &IdeaRow, slug_width: usize, now_ms: i64, color: bool, status: bool) -> String {
    let title = truncate(&row.idea.title, 40);
    let product = row.idea.product.as_deref().unwrap_or("—");
    let mut line = format!("  {:<slug_width$}  {title:<40}  ", row.slug.as_str());
    if status {
        line.push_str(&format!("{:<10} ", row.idea.status));
    }
    line.push_str(&format!("{:<10} ", truncate(product, 10)));
    line.push_str(&paint(
        color,
        "2",
        &format!("{:>8}", relative_age(row.activity.last_at, now_ms)),
    ));
    let open = row.idea.open_challenges();
    if open > 0 {
        line.push_str("   ");
        line.push_str(&paint(color, "33", &format!("⚠ {open}")));
    }
    line.trim_end().to_string()
}

/// The `kaihuman ideas` table: one group per status; closed groups collapse into one line.
pub fn render_overview(
    rows: &[IdeaRow],
    filter: &Filter,
    now: &DateTime<FixedOffset>,
    color: bool,
) -> String {
    let rows: Vec<&IdeaRow> = rows
        .iter()
        .filter(|r| filter.product_matches(&r.idea))
        .filter(|r| filter.status.is_none_or(|s| s == r.idea.status))
        .collect();
    if rows.is_empty() {
        return "No ideas yet. Add one with `kaihuman idea \"<title>\"`.\n".to_string();
    }
    let slug_width = rows
        .iter()
        .filter(|r| filter.expands(r.idea.status))
        .map(|r| r.slug.as_str().len())
        .max()
        .unwrap_or(0);
    let mut out = String::new();
    let mut collapsed = Vec::new();
    for status in STATUS_ORDER {
        let group: Vec<&&IdeaRow> = rows.iter().filter(|r| r.idea.status == status).collect();
        if group.is_empty() {
            continue;
        }
        let heading = format!("{} ({})", status.as_str().to_uppercase(), group.len());
        if !filter.expands(status) {
            collapsed.push(heading);
            continue;
        }
        out.push_str(&paint(color, status_color(status), &heading));
        out.push('\n');
        for row in group {
            out.push_str(&row_line(
                row,
                slug_width,
                now.timestamp_millis(),
                color,
                false,
            ));
            out.push('\n');
        }
    }
    if !collapsed.is_empty() {
        let line = format!("{}    (--all to show)", collapsed.join(" · "));
        out.push_str(&paint(color, "2", &line));
        out.push('\n');
    }
    out
}

#[derive(Serialize)]
struct IdeaJson<'a> {
    slug: &'a IdeaSlug,
    path: String,
    #[serde(flatten)]
    idea: &'a Idea,
    activity: &'a IdeaActivity,
}

fn to_json(row: &IdeaRow) -> IdeaJson<'_> {
    IdeaJson {
        slug: &row.slug,
        path: ideas::idea_path(&row.slug),
        idea: &row.idea,
        activity: &row.activity,
    }
}

fn use_color() -> bool {
    std::io::stdout().is_terminal() && std::env::var_os("NO_COLOR").is_none_or(|v| v.is_empty())
}

// --- skills --------------------------------------------------------------------------------------

/// Writes the kh-ideas skill where Claude Code (`.claude/skills/`) and the other agents
/// (`.agents/skills/`) read user skills, overwriting older copies.
pub fn install_skill(home: &Path) -> Result<Vec<PathBuf>> {
    [".claude", ".agents"]
        .iter()
        .map(|base| {
            let dir = home.join(base).join("skills").join("kh-ideas");
            fs::create_dir_all(&dir)
                .with_context(|| format!("Failed to create {}", dir.display()))?;
            let path = dir.join("SKILL.md");
            fs::write(&path, KH_IDEAS_SKILL)
                .with_context(|| format!("Failed to write {}", path.display()))?;
            Ok(path)
        })
        .collect()
}

pub fn run_skills(command: SkillsCommand) -> Result<()> {
    let SkillsCommand::Install { dir } = command;
    let home = match dir {
        Some(dir) => dir,
        None => directories::BaseDirs::new()
            .context("Could not find your home directory; pass --dir")?
            .home_dir()
            .to_path_buf(),
    };
    for path in install_skill(&home)? {
        println!("{}", path.display());
    }
    Ok(())
}

// --- commands ------------------------------------------------------------------------------------

fn now() -> DateTime<FixedOffset> {
    Local::now().fixed_offset()
}

/// Splits idea text into the title (first non-blank line) and the braindump (the rest).
pub fn split_title(text: &str) -> Option<(String, String)> {
    let text = text.trim();
    let (title, rest) = text.split_once('\n').unwrap_or((text, ""));
    let title = title.trim();
    (!title.is_empty()).then(|| (title.to_string(), rest.trim().to_string()))
}

/// One line on what a write did; `op` is the op's name (`create`, `log`, …).
fn report(session: &Session, submitted: Submitted, slug: &IdeaSlug, op: &str) {
    match submitted {
        Submitted::Written { path } => {
            println!("{slug} {path} ({op} → {})", session.repo_name());
        }
        Submitted::Queued { reason } => println!(
            "{slug} queued ({op}; {reason}). It is pushed by the next `kaihuman idea`/`ideas` command that reaches GitHub."
        ),
    }
}

/// `kaihuman idea`.
pub async fn run_idea(args: IdeaArgs) -> Result<()> {
    let inline = (!args.text.is_empty()).then(|| args.text.join(" "));
    let Some((title, braindump)) = split_title(&resolve_text(inline)?) else {
        println!("Nothing captured.");
        return Ok(());
    };
    let file = ideas::new_idea(
        &NewIdea {
            title,
            slug: args
                .slug
                .map(|s| s.strip_prefix("idea:").unwrap_or(&s).to_string()),
            product: args.product,
            tags: args.tags,
            braindump: Some(braindump),
            ..NewIdea::default()
        },
        &args.author,
        &now(),
    )?;
    let session = Session::load()?;
    let IdeaFile { slug, content, .. } = file;
    let (submitted, flushed) = session
        .submit(QueuedOp::now(IdeaOp::Create {
            slug: slug.clone(),
            content,
        }))
        .await?;
    print_flush(&flushed);
    report(&session, submitted, &slug, "create");
    Ok(())
}

/// `kaihuman ideas …`.
pub async fn run_ideas(args: IdeasArgs) -> Result<()> {
    let session = Session::load()?;
    let op = match args.command {
        None => {
            let filter = Filter {
                status: args.status,
                product: args.product,
                all: args.all,
            };
            return list(&session, &filter, args.json).await;
        }
        Some(IdeasCommand::Show { slug, json }) => return show(&session, &slug, json).await,
        Some(IdeasCommand::Find { words, json }) => {
            return find(&session, &words.join(" "), json).await;
        }
        Some(IdeasCommand::Path { slug }) => {
            let (dir, warning) = read_prelude(&session).await?;
            let path = match slug {
                Some(s) => dir.join(ideas::idea_path(&parse_slug(&s)?)),
                None => dir.join(ideas::IDEAS_FOLDER),
            };
            warn(warning);
            println!("{}", path.display());
            return Ok(());
        }
        Some(IdeasCommand::Import { author }) => return import(&session, &author).await,
        Some(IdeasCommand::Log { slug, text, author }) => IdeaOp::Log {
            slug: parse_slug(&slug)?,
            text: text.join(" "),
            author,
        },
        Some(IdeasCommand::Challenge { slug, text }) => IdeaOp::Challenge {
            slug: parse_slug(&slug)?,
            text: text.join(" "),
        },
        Some(IdeasCommand::Dump { slug, text }) => {
            let slug = parse_slug(&slug)?;
            let inline = (!text.is_empty()).then(|| text.join(" "));
            IdeaOp::Dump {
                slug,
                text: resolve_text(inline)?,
            }
        }
        Some(IdeasCommand::Summary { slug, text }) => IdeaOp::Summary {
            slug: parse_slug(&slug)?,
            text: text.join(" "),
        },
        Some(IdeasCommand::Status {
            slug,
            status,
            reason,
            author,
        }) => IdeaOp::Status {
            slug: parse_slug(&slug)?,
            status,
            reason,
            author,
        },
    };
    let slug = op.slug()?;
    let name = op.name();
    let (submitted, flushed) = session.submit(QueuedOp::now(op)).await?;
    print_flush(&flushed);
    report(&session, submitted, &slug, name);
    Ok(())
}

fn warn(warning: Option<String>) {
    if let Some(w) = warning {
        eprintln!("warning: {w}");
    }
}

/// Every read first replays queued writes, then pulls the clone.
async fn read_prelude(session: &Session) -> Result<(PathBuf, Option<String>)> {
    print_flush(&session.flush().await);
    session.sync_clone().await
}

async fn load_rows(session: &Session) -> Result<Vec<IdeaRow>> {
    let (dir, warning) = read_prelude(session).await?;
    warn(warning);
    Ok(idea_rows(load_ideas(&dir), &now()))
}

async fn list(session: &Session, filter: &Filter, json: bool) -> Result<()> {
    let rows = load_rows(session).await?;
    if json {
        let shown: Vec<IdeaJson> = rows
            .iter()
            .filter(|r| filter.product_matches(&r.idea) && filter.expands(r.idea.status))
            .map(to_json)
            .collect();
        println!("{}", serde_json::to_string_pretty(&shown)?);
    } else {
        print!("{}", render_overview(&rows, filter, &now(), use_color()));
    }
    Ok(())
}

async fn show(session: &Session, slug: &str, json: bool) -> Result<()> {
    let slug = parse_slug(slug)?;
    let (dir, warning) = read_prelude(session).await?;
    warn(warning);
    let text = fs::read_to_string(dir.join(ideas::idea_path(&slug))).map_err(|_| {
        anyhow::anyhow!("No idea named {slug}. Find it with `kaihuman ideas find \"<words>\"`.")
    })?;
    if json {
        let idea = ideas::parse_idea(&text);
        let row = IdeaRow {
            activity: ideas::idea_activity(&idea, &now()),
            slug,
            idea,
        };
        println!("{}", serde_json::to_string_pretty(&to_json(&row))?);
    } else {
        print!("{text}");
    }
    Ok(())
}

async fn find(session: &Session, query: &str, json: bool) -> Result<()> {
    let (dir, warning) = read_prelude(session).await?;
    warn(warning);
    let refs = load_ideas(&dir);
    let now = now();
    let found: Vec<IdeaRow> = ideas::find_ideas(&refs, query)
        .into_iter()
        .map(|r| IdeaRow {
            slug: r.slug.clone(),
            activity: ideas::idea_activity(&r.idea, &now),
            idea: r.idea.clone(),
        })
        .collect();
    if json {
        let out: Vec<IdeaJson> = found.iter().map(to_json).collect();
        println!("{}", serde_json::to_string_pretty(&out)?);
    } else if found.is_empty() {
        println!("No idea matches \"{query}\". Create one with `kaihuman idea \"<title>\"`.");
    } else {
        let width = found
            .iter()
            .map(|r| r.slug.as_str().len())
            .max()
            .unwrap_or(0);
        for row in &found {
            println!(
                "{}",
                row_line(row, width, now.timestamp_millis(), use_color(), true)
            );
        }
    }
    Ok(())
}

async fn import(session: &Session, author: &str) -> Result<()> {
    let handoffs = ideas::parse_idea_handoffs(&resolve_text(None)?)?;
    if handoffs.is_empty() {
        bail!(
            "No kh-idea block found in the input. Paste the block the chat app wrote, fences and all."
        );
    }
    let mut failed = 0;
    for handoff in handoffs {
        let op = IdeaOp::Import {
            handoff,
            author: author.to_string(),
        };
        let result = match op.slug() {
            Ok(slug) => session
                .submit(QueuedOp::now(op))
                .await
                .map(|(submitted, flushed)| {
                    print_flush(&flushed);
                    report(session, submitted, &slug, "import");
                }),
            Err(e) => Err(e),
        };
        if let Err(e) = result {
            eprintln!("error: {e:#}");
            failed += 1;
        }
    }
    if failed > 0 {
        bail!("{failed} hand-off block(s) were not applied.");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::HashMap;

    const SAMPLE: &str = include_str!("../../../packages/formats/fixtures/ideas/palette-sync.md");

    fn at() -> DateTime<FixedOffset> {
        DateTime::parse_from_rfc3339("2026-10-15T08:05:00+02:00").unwrap()
    }

    fn queued(op: IdeaOp) -> QueuedOp {
        QueuedOp {
            at: at().to_rfc3339(),
            op,
        }
    }

    fn slug(s: &str) -> IdeaSlug {
        IdeaSlug::parse(s).unwrap()
    }

    /// An in-memory repo: path → (content, sha). It can be offline, or change a file behind the
    /// writer's back once.
    #[derive(Default)]
    struct Fake {
        files: RefCell<HashMap<String, (String, String)>>,
        offline: bool,
        race_once: RefCell<bool>,
        messages: RefCell<Vec<String>>,
    }

    impl Fake {
        fn with(path: &str, content: &str) -> Self {
            let fake = Fake::default();
            fake.files
                .borrow_mut()
                .insert(path.into(), (content.into(), "sha0".into()));
            fake
        }

        fn content(&self, path: &str) -> String {
            self.files.borrow()[path].0.clone()
        }
    }

    impl Remote for Fake {
        async fn get(&self, path: &str) -> Result<Option<(String, String)>> {
            if self.offline {
                return Err(Offline("test".into()).into());
            }
            Ok(self.files.borrow().get(path).cloned())
        }

        async fn put(
            &self,
            path: &str,
            content: &str,
            message: &str,
            sha: Option<&str>,
        ) -> Result<PutOutcome> {
            if self.offline {
                return Err(Offline("test".into()).into());
            }
            let mut files = self.files.borrow_mut();
            if self.race_once.replace(false)
                && let Some(entry) = files.get_mut(path)
            {
                entry.0 = ideas::log_idea(&entry.0, "Meanwhile.", "codex", &at()).unwrap();
                entry.1 = "sha-race".into();
            }
            let current = files.get(path).map(|(_, s)| s.as_str());
            if current != sha {
                return Ok(PutOutcome::Conflict);
            }
            let next = format!("sha{}", self.messages.borrow().len() + 1);
            files.insert(path.into(), (content.into(), next));
            self.messages.borrow_mut().push(message.into());
            Ok(PutOutcome::Written)
        }
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("kaihuman-ideas-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    const PATH: &str = ".kh/ideas/palette-sync.md";

    #[test]
    fn applies_each_op_to_the_text() {
        let log = IdeaOp::Log {
            slug: slug("palette-sync"),
            text: "Done.".into(),
            author: "claude".into(),
        };
        let next = log.apply(Some(SAMPLE), &at()).unwrap();
        assert_eq!(ideas::parse_idea(&next).log[0].text, "Done.");
        let missing = log.apply(None, &at()).unwrap_err().to_string();
        assert!(missing.contains("No idea named palette-sync"), "{missing}");

        let create = IdeaOp::Create {
            slug: slug("palette-sync"),
            content: "x".into(),
        };
        assert!(create.creates_only());
        let exists = create.apply(Some(SAMPLE), &at()).unwrap_err().to_string();
        assert!(exists.contains("--slug palette-sync-2"), "{exists}");

        let status = IdeaOp::Status {
            slug: slug("palette-sync"),
            status: IdeaStatus::Dropped,
            reason: Some("Too big.".into()),
            author: "human".into(),
        };
        let next = ideas::parse_idea(&status.apply(Some(SAMPLE), &at()).unwrap());
        assert_eq!(next.status, IdeaStatus::Dropped);
        assert_eq!(next.log[0].text, "Status exploring → dropped. Too big.");

        let import = IdeaOp::Import {
            handoff: IdeaHandoff {
                title: Some("New thing".into()),
                ..IdeaHandoff::default()
            },
            author: "claude.ai".into(),
        };
        assert!(import.creates_only());
        assert_eq!(import.slug().unwrap().as_str(), "new-thing");
    }

    #[test]
    fn a_queued_op_round_trips_through_json() {
        let op = queued(IdeaOp::Status {
            slug: slug("palette-sync"),
            status: IdeaStatus::Parked,
            reason: None,
            author: "claude".into(),
        });
        let json = serde_json::to_string(&op).unwrap();
        assert!(json.contains("\"op\":\"status\""), "{json}");
        assert_eq!(serde_json::from_str::<QueuedOp>(&json).unwrap(), op);
        let bad = json.replace("palette-sync", "Bad Slug");
        assert!(serde_json::from_str::<QueuedOp>(&bad).is_err());
    }

    #[tokio::test]
    async fn creates_only_once_and_names_the_way_out() {
        let fake = Fake::default();
        let file = ideas::new_idea(
            &NewIdea {
                title: "Palette sync".into(),
                ..NewIdea::default()
            },
            "human",
            &at(),
        )
        .unwrap();
        let op = queued(IdeaOp::Create {
            slug: file.slug.clone(),
            content: file.content.clone(),
        });
        assert_eq!(write_op(&fake, &op).await.unwrap(), PATH);
        assert_eq!(fake.content(PATH), file.content);
        assert_eq!(
            fake.messages.borrow()[0],
            "kaihuman: idea palette-sync — create"
        );
        let again = write_op(&fake, &op).await.unwrap_err().to_string();
        assert!(again.contains("already exists"), "{again}");
    }

    #[tokio::test]
    async fn an_edit_re_reads_and_retries_once_on_a_conflict() {
        let fake = Fake::with(PATH, SAMPLE);
        *fake.race_once.borrow_mut() = true;
        let op = queued(IdeaOp::Log {
            slug: slug("palette-sync"),
            text: "Mine.".into(),
            author: "claude".into(),
        });
        write_op(&fake, &op).await.unwrap();
        let log = ideas::parse_idea(&fake.content(PATH)).log;
        let texts: Vec<_> = log.iter().take(2).map(|e| e.text.as_str()).collect();
        assert_eq!(texts, ["Mine.", "Meanwhile."], "both writes survive");
        assert_eq!(
            fake.messages.borrow().as_slice(),
            ["kaihuman: idea palette-sync — log"]
        );
    }

    #[tokio::test]
    async fn the_queue_replays_in_order_and_sets_aside_what_cannot_apply() {
        let dir = temp_dir("queue");
        let log = |text: &str| {
            queued(IdeaOp::Log {
                slug: slug("palette-sync"),
                text: text.into(),
                author: "human".into(),
            })
        };
        enqueue(&dir, &log("First.")).unwrap();
        enqueue(
            &dir,
            &queued(IdeaOp::Dump {
                slug: slug("no-such-idea"),
                text: "x".into(),
            }),
        )
        .unwrap();
        enqueue(&dir, &log("Second.")).unwrap();

        let offline = Fake {
            offline: true,
            ..Fake::with(PATH, SAMPLE)
        };
        let report = flush_queue(&offline, &dir).await;
        assert_eq!((report.applied, report.pending), (0, 3));
        assert_eq!(queued_files(&dir).len(), 3, "nothing lost while offline");

        let online = Fake::with(PATH, SAMPLE);
        let report = flush_queue(&online, &dir).await;
        assert_eq!((report.applied, report.pending), (2, 0));
        assert_eq!(report.failed.len(), 1);
        assert!(report.failed[0].contains("No idea named no-such-idea"));
        assert!(queued_files(&dir).is_empty());
        let log = ideas::parse_idea(&online.content(PATH)).log;
        let texts: Vec<_> = log.iter().take(2).map(|e| e.text.as_str()).collect();
        assert_eq!(texts, ["Second.", "First."]);
        assert_eq!(log[0].at, "2026-10-15 08:05", "the queued time is kept");
        fs::remove_dir_all(dir).unwrap();
    }

    fn row(slug_: &str, text: &str) -> IdeaRef {
        IdeaRef {
            slug: slug(slug_),
            idea: ideas::parse_idea(text),
        }
    }

    #[test]
    fn renders_the_overview_grouped_with_closed_ideas_collapsed() {
        let now = DateTime::parse_from_rfc3339("2026-10-14T20:40:00+02:00").unwrap();
        let refs = vec![
            row("palette-sync", SAMPLE),
            row(
                "voice-capture",
                "---\nstatus: seed\nupdated: 2026-10-13T20:40+02:00\n---\n# Voice capture\n",
            ),
            row("old-thing", "---\nstatus: dropped\n---\n# Old\n"),
            row("other-product", "---\nproduct: other\n---\n# Other\n"),
        ];
        let rows = idea_rows(refs, &now);
        let filter = Filter {
            status: None,
            product: None,
            all: false,
        };
        let text = render_overview(&rows, &filter, &now, false);
        let expected = [
            "EXPLORING (1)",
            "  palette-sync   Offline sync: the desktop palette         kaihuman     2h ago   ⚠ 1",
            "SEED (2)",
            "  voice-capture  Voice capture                             —            1d ago",
            "  other-product  Other                                     other             —",
            "DROPPED (1)    (--all to show)",
            "",
        ]
        .join("\n");
        assert_eq!(text, expected);

        let all = Filter {
            status: None,
            product: None,
            all: true,
        };
        assert!(render_overview(&rows, &all, &now, false).contains("DROPPED (1)\n  old-thing"));
        let product = Filter {
            product: Some("Other".into()),
            all: false,
            status: None,
        };
        let only = render_overview(&rows, &product, &now, false);
        assert!(only.starts_with("SEED (1)\n  other-product"), "{only}");
        let dropped = Filter {
            status: Some(IdeaStatus::Dropped),
            product: None,
            all: false,
        };
        assert!(render_overview(&rows, &dropped, &now, false).starts_with("DROPPED (1)\n"));
        assert!(render_overview(&rows, &filter, &now, true).contains("\x1b[1;36mEXPLORING"));
    }

    #[test]
    fn ages_read_like_people_say_them() {
        let min = 60_000;
        assert_eq!(relative_age(None, 0), "—");
        assert_eq!(relative_age(Some(0), 30_000), "just now");
        assert_eq!(relative_age(Some(0), 5 * min), "5m ago");
        assert_eq!(relative_age(Some(0), 120 * min), "2h ago");
        assert_eq!(relative_age(Some(0), 3 * 1440 * min), "3d ago");
        assert_eq!(relative_age(Some(0), 90 * 1440 * min), "3mo ago");
        assert_eq!(relative_age(Some(0), 400 * 1440 * min), "1y ago");
    }

    #[test]
    fn splits_the_title_from_the_braindump() {
        assert_eq!(
            split_title("\n  Title here \nmore\n\nlines\n"),
            Some(("Title here".into(), "more\n\nlines".into()))
        );
        assert_eq!(split_title("only"), Some(("only".into(), String::new())));
        assert_eq!(split_title("  \n "), None);
    }

    #[test]
    fn loads_only_files_named_by_a_slug() {
        let dir = temp_dir("load");
        let ideas_dir = dir.join(ideas::IDEAS_FOLDER);
        fs::create_dir_all(ideas_dir.join("palette-sync")).unwrap();
        fs::write(ideas_dir.join("palette-sync.md"), SAMPLE).unwrap();
        fs::write(ideas_dir.join("Bad Name.md"), "# x\n").unwrap();
        fs::write(ideas_dir.join("notes.txt"), "x").unwrap();
        let refs = load_ideas(&dir);
        assert_eq!(refs.len(), 1);
        assert_eq!(refs[0].slug.as_str(), "palette-sync");
        assert!(load_ideas(&dir.join("missing")).is_empty());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn installs_the_skill_for_every_agent() {
        let home = temp_dir("skills");
        let paths = install_skill(&home).unwrap();
        assert_eq!(
            paths,
            [
                home.join(".claude/skills/kh-ideas/SKILL.md"),
                home.join(".agents/skills/kh-ideas/SKILL.md"),
            ]
        );
        fs::write(&paths[0], "old").unwrap();
        install_skill(&home).unwrap();
        for path in paths {
            let text = fs::read_to_string(path).unwrap();
            assert!(text.starts_with("---\nname: kh-ideas\n"));
        }
        fs::remove_dir_all(home).unwrap();
    }
}
