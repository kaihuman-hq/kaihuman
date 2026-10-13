//! Ideas: one markdown file per product or feature idea in `.kh/ideas/<slug>.md` (doc/ideas.md).
//!
//! The Rust mirror of `packages/formats/src/ideas.ts`. Every edit works on the text and leaves the
//! parts it does not own as they were. Both test suites read `packages/formats/fixtures/ideas/`, so
//! a change to the format must be made in both places.

use anyhow::{Result, bail};
use chrono::{DateTime, FixedOffset, NaiveDateTime, TimeZone};
use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;

/// Mirrors `IDEAS_FOLDER`.
pub const IDEAS_FOLDER: &str = ".kh/ideas";

/// Mirrors `IdeaStatus` / `IDEA_STATUSES`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IdeaStatus {
    Seed,
    Exploring,
    Committed,
    Shipped,
    Parked,
    Dropped,
}

impl IdeaStatus {
    pub const ALL: [IdeaStatus; 6] = [
        IdeaStatus::Seed,
        IdeaStatus::Exploring,
        IdeaStatus::Committed,
        IdeaStatus::Shipped,
        IdeaStatus::Parked,
        IdeaStatus::Dropped,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            IdeaStatus::Seed => "seed",
            IdeaStatus::Exploring => "exploring",
            IdeaStatus::Committed => "committed",
            IdeaStatus::Shipped => "shipped",
            IdeaStatus::Parked => "parked",
            IdeaStatus::Dropped => "dropped",
        }
    }

    /// Mirrors `OPEN_IDEA_STATUSES`: statuses an idea can still move on from.
    pub fn is_open(self) -> bool {
        matches!(
            self,
            IdeaStatus::Seed | IdeaStatus::Exploring | IdeaStatus::Committed
        )
    }
}

impl fmt::Display for IdeaStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Mirrors `isIdeaStatus`.
impl FromStr for IdeaStatus {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        IdeaStatus::ALL
            .into_iter()
            .find(|status| status.as_str() == value)
            .ok_or_else(|| format!("\"{value}\" is not an idea status."))
    }
}

/// Mirrors `IdeaSlug`: lowercase kebab-case, 2–40 characters. Only `IdeaSlug::parse` makes one.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(transparent)]
pub struct IdeaSlug(String);

impl IdeaSlug {
    /// Mirrors `asIdeaSlug`: `^[a-z0-9][a-z0-9-]{1,39}$`.
    pub fn parse(value: &str) -> Option<IdeaSlug> {
        let mut chars = value.chars();
        let first_ok = chars
            .next()
            .is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit());
        let len = value.len();
        let rest_ok = chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
        (first_ok && rest_ok && (2..=40).contains(&len)).then(|| IdeaSlug(value.to_string()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for IdeaSlug {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// A slug read back (from a queued op) is checked like a new one.
impl<'de> Deserialize<'de> for IdeaSlug {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let value = String::deserialize(d)?;
        IdeaSlug::parse(&value)
            .ok_or_else(|| serde::de::Error::custom(format!("\"{value}\" is not a slug")))
    }
}

/// Mirrors `ideaPath`.
pub fn idea_path(slug: &IdeaSlug) -> String {
    format!("{IDEAS_FOLDER}/{slug}.md")
}

/// Mirrors `ideaSlugOf`: the slug an idea's file names, or `None` for any other path.
pub fn idea_slug_of(path: &str) -> Option<IdeaSlug> {
    let name = path
        .strip_prefix(IDEAS_FOLDER)?
        .strip_prefix('/')?
        .strip_suffix(".md")?;
    IdeaSlug::parse(name)
}

/// Folds the accented Latin letters NFKD would split into letter + mark.
fn fold_accent(c: char) -> char {
    const FOLDS: &[(&str, char)] = &[
        ("àáâãäåāăą", 'a'),
        ("çćĉċč", 'c'),
        ("ďđ", 'd'),
        ("èéêëēĕėęě", 'e'),
        ("ĝğġģ", 'g'),
        ("ĥħ", 'h'),
        ("ìíîïĩīĭįı", 'i'),
        ("ĵ", 'j'),
        ("ķ", 'k'),
        ("ĺļľŀł", 'l'),
        ("ñńņňŉ", 'n'),
        ("òóôõöøōŏő", 'o'),
        ("ŕŗř", 'r'),
        ("śŝşšș", 's'),
        ("ţťŧț", 't'),
        ("ùúûüũūŭůűų", 'u'),
        ("ŵ", 'w'),
        ("ýÿŷ", 'y'),
        ("źżž", 'z'),
    ];
    FOLDS
        .iter()
        .find(|(from, _)| from.contains(c))
        .map_or(c, |(_, to)| *to)
}

const SLUG_LENGTH: usize = 40;

/// Mirrors `slugifyIdeaTitle`: words joined by `-`, cut at a word end so it stays readable.
pub fn slugify_idea_title(title: &str) -> IdeaSlug {
    let folded: String = title
        .chars()
        .flat_map(char::to_lowercase)
        .map(fold_accent)
        .collect();
    let words: Vec<&str> = folded
        .split(|c: char| !(c.is_ascii_lowercase() || c.is_ascii_digit()))
        .filter(|word| !word.is_empty())
        .collect();
    let mut slug = String::new();
    for word in &words {
        let next = if slug.is_empty() {
            word.to_string()
        } else {
            format!("{slug}-{word}")
        };
        if next.len() > SLUG_LENGTH {
            break;
        }
        slug = next;
    }
    if slug.is_empty() {
        slug = words
            .first()
            .map(|word| word.chars().take(SLUG_LENGTH).collect())
            .unwrap_or_default();
    }
    IdeaSlug::parse(&slug).unwrap_or_else(|| IdeaSlug("idea".to_string()))
}

/// Mirrors `ideaLogTime`: `2026-10-13 09:12`, local time to the minute.
pub fn idea_log_time(now: &DateTime<FixedOffset>) -> String {
    now.format("%Y-%m-%d %H:%M").to_string()
}

/// Mirrors `ideaTimestamp`: `2026-10-13T09:12+02:00`, local time with its offset.
pub fn idea_timestamp(now: &DateTime<FixedOffset>) -> String {
    now.format("%Y-%m-%dT%H:%M%:z").to_string()
}

/// Mirrors `AUTHOR`: `^[a-z0-9][a-z0-9.-]{0,30}$`.
fn is_author(author: &str) -> bool {
    let mut chars = author.chars();
    chars
        .next()
        .is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.' || c == '-')
        && author.len() <= 31
}

/// Mirrors `TAG`: `^[\p{L}\p{N}][\p{L}\p{N}_./-]{0,49}$`.
fn is_tag(tag: &str) -> bool {
    let mut chars = tag.chars();
    chars.next().is_some_and(char::is_alphanumeric)
        && chars.all(|c| c.is_alphanumeric() || "_./-".contains(c))
        && tag.chars().count() <= 50
}

/// Mirrors `IdeaLogEntry`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct IdeaLogEntry {
    /// `YYYY-MM-DD HH:MM`, local time.
    pub at: String,
    pub author: String,
    pub text: String,
}

/// Mirrors `IdeaChallenge`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct IdeaChallenge {
    pub done: bool,
    pub text: String,
}

/// Mirrors `Idea`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Idea {
    pub title: String,
    pub status: IdeaStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub product: Option<String>,
    pub tags: Vec<String>,
    pub links: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated: Option<String>,
    pub summary: String,
    /// Newest first, as in the file.
    pub log: Vec<IdeaLogEntry>,
    pub challenges: Vec<IdeaChallenge>,
    pub braindump: String,
}

impl Idea {
    pub fn open_challenges(&self) -> usize {
        self.challenges.iter().filter(|c| !c.done).count()
    }
}

// --- frontmatter ---------------------------------------------------------------------------------

struct Split {
    front: Vec<String>,
    body: Vec<String>,
}

/// Mirrors `split`.
fn split(text: &str) -> Split {
    let lines: Vec<String> = text
        .replace("\r\n", "\n")
        .split('\n')
        .map(str::to_string)
        .collect();
    if lines.first().is_some_and(|line| line.trim() == "---")
        && let Some(end) = lines
            .iter()
            .skip(1)
            .position(|line| line.trim() == "---")
            .map(|i| i + 1)
    {
        return Split {
            front: lines[1..end].to_vec(),
            body: lines[end + 1..].to_vec(),
        };
    }
    Split {
        front: Vec::new(),
        body: lines,
    }
}

/// Mirrors `join`.
fn join(doc: &Split) -> String {
    let mut all = vec!["---".to_string()];
    all.extend(doc.front.iter().cloned());
    all.push("---".to_string());
    all.extend(doc.body.iter().cloned());
    format!("{}\n", all.join("\n").trim_end_matches('\n'))
}

fn field_index(front: &[String], key: &str) -> Option<usize> {
    let prefix = format!("{key}:");
    front.iter().position(|line| line.starts_with(&prefix))
}

fn field_value<'a>(front: &'a [String], key: &str) -> Option<&'a str> {
    field_index(front, key).map(|i| front[i][key.len() + 1..].trim())
}

fn set_field(front: &mut Vec<String>, key: &str, value: &str) {
    let line = format!("{key}: {value}");
    match field_index(front, key) {
        Some(i) => front[i] = line,
        None => front.push(line),
    }
}

/// Mirrors `unquote`: a JSON string, a YAML single-quoted string, or the bare value.
fn unquote(value: &str) -> String {
    if let Some(inner) = value.strip_prefix('"') {
        if let Ok(parsed) = serde_json::from_str::<String>(value) {
            return parsed;
        }
        return inner.strip_suffix('"').unwrap_or(inner).to_string();
    }
    if value.len() > 1 && value.starts_with('\'') && value.ends_with('\'') {
        return value[1..value.len() - 1].replace("''", "'");
    }
    value.to_string()
}

/// Mirrors `listField`: `[a, b]` on one line, or a block of `  - a` lines under an empty `key:`.
fn list_field(front: &[String], key: &str) -> Vec<String> {
    let Some(index) = field_index(front, key) else {
        return Vec::new();
    };
    let inline = front[index][key.len() + 1..].trim();
    if inline.starts_with('[') {
        let inner = inline.strip_prefix('[').unwrap_or(inline);
        let inner = inner.strip_suffix(']').unwrap_or(inner);
        return inner
            .split(',')
            .map(|item| unquote(item.trim()))
            .filter(|item| !item.is_empty())
            .collect();
    }
    front[index + 1..]
        .iter()
        .map_while(|line| list_item(line).map(unquote))
        .collect()
}

/// `^\s+-\s+(.+)$`, trimmed: an indented YAML list item.
fn list_item(line: &str) -> Option<&str> {
    let rest = line.trim_start();
    if rest.len() == line.len() {
        return None;
    }
    let after = rest.strip_prefix('-')?;
    let item = after.trim_start();
    (after.starts_with(char::is_whitespace) && !item.is_empty()).then(|| item.trim_end())
}

// --- sections ------------------------------------------------------------------------------------

/// Mirrors `SECTION`: the name of a `## Name` heading.
fn section_name(line: &str) -> Option<&str> {
    let rest = line.strip_prefix("##")?;
    if !rest.starts_with(char::is_whitespace) {
        return None;
    }
    let name = rest.trim().trim_end_matches('#').trim_end();
    (!name.is_empty()).then_some(name)
}

/// Mirrors `isHeading`: `^#{1,2}\s`.
fn is_heading(line: &str) -> bool {
    let rest = line.strip_prefix("##").or_else(|| line.strip_prefix('#'));
    rest.is_some_and(|r| r.starts_with(char::is_whitespace))
}

/// `^#\s`: the title heading.
fn is_title(line: &str) -> bool {
    line.strip_prefix('#')
        .is_some_and(|r| r.starts_with(char::is_whitespace))
}

/// `^##\s`.
fn is_section(line: &str) -> bool {
    line.strip_prefix("##")
        .is_some_and(|r| r.starts_with(char::is_whitespace))
}

/// Mirrors `findSection`: `(start, end)`, the `## Name` line and the index after its last line.
fn find_section(body: &[String], name: &str) -> Option<(usize, usize)> {
    let wanted = name.to_lowercase();
    let start = body
        .iter()
        .position(|line| section_name(line).is_some_and(|n| n.to_lowercase() == wanted))?;
    let mut end = start + 1;
    while end < body.len() && !is_heading(&body[end]) {
        end += 1;
    }
    Some((start, end))
}

/// Mirrors `trimBlank`.
fn trim_blank(lines: &[String]) -> Vec<String> {
    let from = lines.iter().position(|l| !l.trim().is_empty());
    let to = lines.iter().rposition(|l| !l.trim().is_empty());
    match (from, to) {
        (Some(from), Some(to)) => lines[from..=to].to_vec(),
        _ => Vec::new(),
    }
}

fn section_lines(body: &[String], name: &str) -> Vec<String> {
    find_section(body, name).map_or_else(Vec::new, |(start, end)| trim_blank(&body[start + 1..end]))
}

/// Mirrors `titleIndex`.
fn title_index(body: &[String]) -> Option<usize> {
    body.iter().position(|line| is_title(line))
}

/// Mirrors `firstSection`: where the summary ends, the first `##` heading after the title.
fn first_section(body: &[String]) -> usize {
    let from = title_index(body).map_or(0, |i| i + 1);
    (from..body.len())
        .find(|&i| is_section(&body[i]))
        .unwrap_or(body.len())
}

/// Mirrors `Place`.
#[derive(Clone, Copy)]
enum Place {
    AfterSummary,
    BeforeBraindump,
    End,
}

/// Mirrors `editSection`: replaces a section's content with `edit(content)`, creating the section
/// where `place` says if it is missing.
fn edit_section(
    body: &[String],
    name: &str,
    place: Place,
    edit: impl FnOnce(Vec<String>) -> Vec<String>,
) -> Vec<String> {
    let block = |content: Vec<String>| {
        let mut out = vec![format!("## {name}"), String::new()];
        out.extend(trim_blank(&content));
        out.push(String::new());
        out
    };
    if let Some((start, end)) = find_section(body, name) {
        let content = edit(trim_blank(&body[start + 1..end]));
        let mut out = body[..start].to_vec();
        out.extend(block(content));
        out.extend_from_slice(&body[end..]);
        return out;
    }
    let at = match place {
        Place::AfterSummary => first_section(body),
        Place::BeforeBraindump => find_section(body, "Braindump").map_or(body.len(), |(s, _)| s),
        Place::End => body.len(),
    };
    let mut out = body[..at].to_vec();
    while out.last().is_some_and(|l| l.trim().is_empty()) {
        out.pop();
    }
    out.push(String::new());
    out.extend(block(edit(Vec::new())));
    out.extend_from_slice(&body[at..]);
    out
}

// --- parse ---------------------------------------------------------------------------------------

/// `[-*]\s+` at the start: the rest of a list line.
fn strip_bullet(line: &str) -> Option<&str> {
    let rest = line.strip_prefix('-').or_else(|| line.strip_prefix('*'))?;
    rest.starts_with(char::is_whitespace)
        .then(|| rest.trim_start())
}

/// `\s+[·|]\s+` at the start: the rest after a log separator.
fn strip_separator(text: &str) -> Option<&str> {
    let trimmed = text.trim_start();
    if trimmed.len() == text.len() {
        return None;
    }
    let rest = trimmed
        .strip_prefix('·')
        .or_else(|| trimmed.strip_prefix('|'))?;
    let after = rest.trim_start();
    (after.len() < rest.len() && !after.is_empty()).then_some(after)
}

fn is_log_time(at: &str) -> bool {
    at.len() == 16
        && at.char_indices().all(|(i, c)| match i {
            4 | 7 => c == '-',
            10 => c == ' ',
            13 => c == ':',
            _ => c.is_ascii_digit(),
        })
}

/// Mirrors `LOG_ENTRY`: `- YYYY-MM-DD HH:MM · <author> · <text>`.
fn parse_log_entry(line: &str) -> Option<IdeaLogEntry> {
    let rest = strip_bullet(line)?;
    let at = rest.get(..16).filter(|at| is_log_time(at))?;
    let rest = strip_separator(&rest[16..])?;
    // The author is the shortest run that a separator follows.
    let (author, text) = rest
        .char_indices()
        .skip(1)
        .filter(|(_, c)| c.is_whitespace())
        .find_map(|(i, _)| strip_separator(&rest[i..]).map(|text| (&rest[..i], text)))?;
    Some(IdeaLogEntry {
        at: at.to_string(),
        author: author.to_string(),
        text: text.to_string(),
    })
}

/// Mirrors `CHALLENGE`: `- [ ] text` or `- [x] text`.
fn parse_challenge(line: &str) -> Option<IdeaChallenge> {
    let rest = strip_bullet(line)?;
    let mark = rest.strip_prefix('[')?.chars().next()?;
    let rest = rest[1 + mark.len_utf8()..].strip_prefix(']')?;
    let text = rest.trim_start();
    if !matches!(mark, ' ' | 'x' | 'X') || text.len() == rest.len() || text.is_empty() {
        return None;
    }
    Some(IdeaChallenge {
        done: mark != ' ',
        text: text.to_string(),
    })
}

/// Mirrors `parseIdea`: reads leniently; an unknown status reads as `seed`.
pub fn parse_idea(text: &str) -> Idea {
    let Split { front, body } = split(text);
    let title_at = title_index(&body);
    let non_empty = |value: String| (!value.is_empty()).then_some(value);
    let field = |key: &str| non_empty(unquote(field_value(&front, key).unwrap_or("")));
    let title = field("title")
        .or_else(|| title_at.and_then(|i| non_empty(body[i][1..].trim_start().trim().to_string())))
        .unwrap_or_else(|| "(untitled)".to_string());
    let summary_from = title_at.map_or(0, |i| i + 1);
    let summary_to = first_section(&body).max(summary_from);
    Idea {
        title,
        status: field_value(&front, "status")
            .and_then(|s| s.parse().ok())
            .unwrap_or(IdeaStatus::Seed),
        product: field("product"),
        tags: list_field(&front, "tags"),
        links: list_field(&front, "links"),
        created: field("created"),
        updated: field("updated"),
        summary: trim_blank(&body[summary_from..summary_to]).join("\n"),
        log: section_lines(&body, "Log")
            .iter()
            .filter_map(|line| parse_log_entry(line.trim()))
            .collect(),
        challenges: section_lines(&body, "Challenges")
            .iter()
            .filter_map(|line| parse_challenge(line.trim()))
            .collect(),
        braindump: section_lines(&body, "Braindump").join("\n"),
    }
}

// --- edits ---------------------------------------------------------------------------------------

/// Mirrors `oneLine`: newlines and runs of spaces collapse, so an entry can never break the list.
fn one_line(text: &str, what: &str) -> Result<String> {
    let line = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if line.is_empty() {
        bail!("The {what} is empty.");
    }
    Ok(line)
}

/// Mirrors `checkAuthor`.
fn check_author(author: &str) -> Result<&str> {
    if !is_author(author) {
        bail!(
            "\"{author}\" is not an author name: use lowercase letters, digits, \".\" or \"-\", such as claude."
        );
    }
    Ok(author)
}

/// Mirrors `touch`.
fn touch(doc: &mut Split, now: &DateTime<FixedOffset>) {
    set_field(&mut doc.front, "updated", &idea_timestamp(now));
}

/// Mirrors `logLine`.
fn log_line(message: &str, author: &str, now: &DateTime<FixedOffset>) -> Result<String> {
    Ok(format!(
        "- {} · {} · {}",
        idea_log_time(now),
        check_author(author)?,
        one_line(message, "log entry")?
    ))
}

/// Mirrors `withLog`.
fn with_log(body: &[String], line: String) -> Vec<String> {
    edit_section(body, "Log", Place::AfterSummary, |content| {
        let mut out = vec![line];
        out.extend(content);
        out
    })
}

fn text_lines(text: &str) -> Vec<String> {
    let lines: Vec<String> = text
        .replace("\r\n", "\n")
        .split('\n')
        .map(str::to_string)
        .collect();
    trim_blank(&lines)
}

/// Mirrors `braindumpLines`: a line starting with `#` or `##` would end the section (or read as
/// the title), so it becomes a `###` heading. Deeper headings and all other text stay as typed.
fn braindump_lines(text: &str) -> Vec<String> {
    text_lines(text)
        .into_iter()
        .map(|line| {
            if !is_heading(&line) {
                return line;
            }
            let rest = line
                .strip_prefix("##")
                .or_else(|| line.strip_prefix('#'))
                .unwrap_or(&line);
            format!("###{rest}")
        })
        .collect()
}

/// Mirrors `logIdea`: adds a log entry at the top of `## Log`.
pub fn log_idea(
    text: &str,
    message: &str,
    author: &str,
    now: &DateTime<FixedOffset>,
) -> Result<String> {
    let line = log_line(message, author, now)?;
    let mut doc = split(text);
    touch(&mut doc, now);
    doc.body = with_log(&doc.body, line);
    Ok(join(&doc))
}

/// Mirrors `addIdeaChallenge`: adds an open challenge at the end of `## Challenges`.
pub fn add_idea_challenge(
    text: &str,
    challenge: &str,
    now: &DateTime<FixedOffset>,
) -> Result<String> {
    let line = format!("- [ ] {}", one_line(challenge, "challenge")?);
    let mut doc = split(text);
    touch(&mut doc, now);
    doc.body = edit_section(&doc.body, "Challenges", Place::BeforeBraindump, |mut c| {
        c.push(line);
        c
    });
    Ok(join(&doc))
}

/// Mirrors `appendIdeaBraindump`: appends text at the end of `## Braindump`.
pub fn append_idea_braindump(
    text: &str,
    addition: &str,
    now: &DateTime<FixedOffset>,
) -> Result<String> {
    let lines = braindump_lines(addition);
    if lines.is_empty() {
        bail!("The braindump text is empty.");
    }
    let mut doc = split(text);
    touch(&mut doc, now);
    doc.body = edit_section(&doc.body, "Braindump", Place::End, |mut content| {
        if !content.is_empty() {
            content.push(String::new());
        }
        content.extend(lines);
        content
    });
    Ok(join(&doc))
}

/// Mirrors `setIdeaSummary`: replaces the summary, the one part that is rewritten.
pub fn set_idea_summary(text: &str, summary: &str, now: &DateTime<FixedOffset>) -> Result<String> {
    let lines = text_lines(summary);
    if lines.is_empty() {
        bail!("The summary is empty.");
    }
    let mut doc = split(text);
    touch(&mut doc, now);
    let end = first_section(&doc.body);
    let mut body = title_index(&doc.body).map_or_else(Vec::new, |i| doc.body[..=i].to_vec());
    body.push(String::new());
    body.extend(lines);
    body.push(String::new());
    body.extend_from_slice(&doc.body[end..]);
    doc.body = body;
    Ok(join(&doc))
}

/// Mirrors `setIdeaStatus`: changes the status and logs the change, with the reason if any.
pub fn set_idea_status(
    text: &str,
    status: IdeaStatus,
    reason: Option<&str>,
    author: &str,
    now: &DateTime<FixedOffset>,
) -> Result<String> {
    let from = parse_idea(text).status;
    if from == status {
        bail!("The idea is already {status}.");
    }
    let reason = match reason.filter(|r| !r.trim().is_empty()) {
        Some(r) => format!(" {}", one_line(r, "reason")?),
        None => String::new(),
    };
    let line = log_line(&format!("Status {from} → {status}.{reason}"), author, now)?;
    let mut doc = split(text);
    touch(&mut doc, now);
    set_field(&mut doc.front, "status", status.as_str());
    doc.body = with_log(&doc.body, line);
    Ok(join(&doc))
}

/// Mirrors `NewIdea`.
#[derive(Debug, Clone, Default)]
pub struct NewIdea {
    pub title: String,
    /// Defaults to the slug of the title.
    pub slug: Option<String>,
    pub status: Option<IdeaStatus>,
    pub product: Option<String>,
    pub tags: Vec<String>,
    pub summary: Option<String>,
    /// The raw thought, kept as the braindump.
    pub braindump: Option<String>,
    /// What the first log entry says; defaults to `Created.`
    pub note: Option<String>,
}

/// A rendered idea file and where it goes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IdeaFile {
    pub slug: IdeaSlug,
    pub path: String,
    pub content: String,
}

/// Mirrors `newIdea`. The caller writes it create-only, so an existing slug is never overwritten.
pub fn new_idea(input: &NewIdea, author: &str, now: &DateTime<FixedOffset>) -> Result<IdeaFile> {
    let title = one_line(&input.title, "title")?;
    let slug = match &input.slug {
        None => slugify_idea_title(&title),
        Some(s) => IdeaSlug::parse(s).ok_or_else(|| {
            anyhow::anyhow!(
                "\"{s}\" is not a slug: use 2–40 lowercase letters, digits and \"-\", starting with a letter or digit."
            )
        })?,
    };
    let tags: Vec<&str> = input
        .tags
        .iter()
        .map(|t| t.trim())
        .filter(|t| !t.is_empty())
        .collect();
    if let Some(bad) = tags.iter().find(|t| !is_tag(t)) {
        bail!("\"{bad}\" is not a tag: use letters, digits, \"_\", \".\", \"/\", \"-\".");
    }
    let stamp = idea_timestamp(now);
    let mut front = vec![
        format!("title: {}", serde_json::to_string(&title)?),
        format!("status: {}", input.status.unwrap_or(IdeaStatus::Seed)),
    ];
    if let Some(product) = input.product.as_deref().filter(|p| !p.trim().is_empty()) {
        front.push(format!("product: {}", one_line(product, "product")?));
    }
    if !tags.is_empty() {
        front.push(format!("tags: [{}]", tags.join(", ")));
    }
    front.push(format!("created: {stamp}"));
    front.push(format!("updated: {stamp}"));

    let note = input
        .note
        .as_deref()
        .filter(|n| !n.trim().is_empty())
        .unwrap_or("Created.");
    let summary = text_lines(input.summary.as_deref().unwrap_or(""));
    let braindump = braindump_lines(input.braindump.as_deref().unwrap_or(""));
    let mut body = vec![String::new(), format!("# {title}"), String::new()];
    if !summary.is_empty() {
        body.extend(summary);
        body.push(String::new());
    }
    body.extend([
        "## Log".to_string(),
        String::new(),
        log_line(note, author, now)?,
        String::new(),
    ]);
    if !braindump.is_empty() {
        body.extend(["## Braindump".to_string(), String::new()]);
        body.extend(braindump);
        body.push(String::new());
    }
    Ok(IdeaFile {
        path: idea_path(&slug),
        slug,
        content: join(&Split { front, body }),
    })
}

// --- activity ------------------------------------------------------------------------------------

/// Mirrors `IdeaActivityLevel`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum IdeaActivityLevel {
    Hot,
    Warm,
    Cool,
    Dormant,
}

/// Mirrors `IdeaActivity`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdeaActivity {
    /// ms since epoch of the newest log entry or `updated`, whichever is later.
    pub last_at: Option<i64>,
    /// Log entries in the last 30 days.
    pub recent: usize,
    pub total: usize,
    pub level: IdeaActivityLevel,
}

const DAY_MS: i64 = 86_400_000;
/// Mirrors `IDEA_RECENT_DAYS`.
pub const IDEA_RECENT_DAYS: i64 = 30;

/// Mirrors `ideaLogEntryTime`: a log entry's `at` as ms since epoch in `tz`'s local time.
pub fn idea_log_entry_time<Tz: TimeZone>(at: &str, tz: &Tz) -> Option<i64> {
    let naive = NaiveDateTime::parse_from_str(at, "%Y-%m-%d %H:%M").ok()?;
    Some(
        tz.from_local_datetime(&naive)
            .earliest()?
            .timestamp_millis(),
    )
}

/// `created` / `updated` as ms since epoch.
pub fn parse_idea_timestamp(value: &str) -> Option<i64> {
    DateTime::parse_from_str(value, "%Y-%m-%dT%H:%M%:z")
        .or_else(|_| DateTime::parse_from_rfc3339(value))
        .ok()
        .map(|d| d.timestamp_millis())
}

/// Mirrors `ideaActivity`. Log times are read in `now`'s time zone.
pub fn idea_activity<Tz: TimeZone>(idea: &Idea, now: &DateTime<Tz>) -> IdeaActivity {
    let tz = now.timezone();
    let times: Vec<i64> = idea
        .log
        .iter()
        .filter_map(|entry| idea_log_entry_time(&entry.at, &tz))
        .collect();
    let updated = idea.updated.as_deref().and_then(parse_idea_timestamp);
    let last_at = times.iter().copied().chain(updated).max();
    let now_ms = now.timestamp_millis();
    let since = now_ms - IDEA_RECENT_DAYS * DAY_MS;
    let level = match last_at.map(|t| now_ms - t) {
        Some(age) if age <= 7 * DAY_MS => IdeaActivityLevel::Hot,
        Some(age) if age <= 30 * DAY_MS => IdeaActivityLevel::Warm,
        Some(age) if age <= 90 * DAY_MS => IdeaActivityLevel::Cool,
        _ => IdeaActivityLevel::Dormant,
    };
    IdeaActivity {
        last_at,
        recent: times.iter().filter(|&&t| t >= since).count(),
        total: idea.log.len(),
        level,
    }
}

// --- hand-off ------------------------------------------------------------------------------------

/// Mirrors `IdeaHandoff`: what a chat app that cannot write to the repo hands over.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct IdeaHandoff {
    /// An existing slug, or `None` for a new idea.
    pub slug: Option<String>,
    pub title: Option<String>,
    pub status: Option<IdeaStatus>,
    pub product: Option<String>,
    pub tags: Vec<String>,
    pub summary: Option<String>,
    pub log: Option<String>,
    pub challenges: Vec<String>,
    pub braindump: Option<String>,
}

const HANDOFF_KEYS: [&str; 9] = [
    "slug",
    "title",
    "status",
    "product",
    "tags",
    "summary",
    "log",
    "challenges",
    "braindump",
];

/// `^([a-z]+):\s*(.*)$` with a known key.
fn handoff_field(line: &str) -> Option<(&'static str, &str)> {
    let (key, value) = line.split_once(':')?;
    let key = HANDOFF_KEYS.into_iter().find(|k| *k == key)?;
    Some((key, value.trim()))
}

fn append_text(slot: &mut Option<String>, line: &str) {
    *slot = Some(match slot.take() {
        None => line.to_string(),
        Some(previous) => format!("{previous}\n{line}"),
    });
}

/// Mirrors `parseHandoffBody`.
fn parse_handoff_body(block: &str) -> Result<IdeaHandoff> {
    let mut handoff = IdeaHandoff::default();
    let mut key: Option<&str> = None;
    for raw in block.split('\n') {
        if let Some((k, value)) = handoff_field(raw) {
            key = Some(k);
            if value.is_empty() || value == "|" {
                continue;
            }
            match k {
                "tags" => handoff.tags = list_field(&[format!("tags: {value}")], "tags"),
                "challenges" => handoff.challenges.push(unquote(value)),
                "status" => handoff.status = Some(value.parse().map_err(anyhow::Error::msg)?),
                "slug" => {
                    if value != "new" {
                        handoff.slug = Some(value.to_string());
                    }
                }
                "title" => handoff.title = Some(unquote(value)),
                "product" => handoff.product = Some(unquote(value)),
                "summary" => handoff.summary = Some(unquote(value)),
                "log" => handoff.log = Some(unquote(value)),
                _ => handoff.braindump = Some(unquote(value)),
            }
            continue;
        }
        // Continuation lines: list items, or more text for a multi-line field.
        let item = raw
            .trim_start()
            .strip_prefix('-')
            .filter(|r| r.starts_with(char::is_whitespace))
            .map(str::trim)
            .filter(|r| !r.is_empty());
        let line = raw.strip_prefix("  ").unwrap_or(raw);
        match (key, item) {
            (Some("challenges"), Some(item)) => handoff.challenges.push(unquote(item)),
            (Some("tags"), Some(item)) => handoff.tags.push(unquote(item)),
            (Some("summary"), _) => append_text(&mut handoff.summary, line),
            (Some("braindump"), _) => append_text(&mut handoff.braindump, line),
            (Some("log"), _) => append_text(&mut handoff.log, line),
            _ => {}
        }
    }
    for slot in [
        &mut handoff.summary,
        &mut handoff.braindump,
        &mut handoff.log,
    ] {
        *slot = slot
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(str::to_string);
    }
    Ok(handoff)
}

/// Mirrors `parseIdeaHandoffs`: every `kh-idea` block in a pasted text; a paste of a bare block
/// body counts as one block.
pub fn parse_idea_handoffs(text: &str) -> Result<Vec<IdeaHandoff>> {
    const OPEN: &str = "```kh-idea";
    let normalized = text.replace("\r\n", "\n");
    let mut blocks = Vec::new();
    let mut rest = normalized.as_str();
    while let Some(open) = rest.find(OPEN) {
        let after = &rest[open + OPEN.len()..];
        let Some(newline) = after.find('\n') else {
            break;
        };
        let body = &after[newline + 1..];
        let Some(close) = body.find("```") else {
            break;
        };
        blocks.push(&body[..close]);
        rest = &body[close + 3..];
    }
    let bare = normalized
        .lines()
        .any(|l| l.starts_with("slug:") || l.starts_with("title:"));
    if blocks.is_empty() && bare {
        blocks.push(&normalized);
    }
    blocks.into_iter().map(parse_handoff_body).collect()
}

/// Mirrors `applyIdeaHandoff`: applies a hand-off to an idea's text, or creates the idea when
/// `existing` is `None`.
pub fn apply_idea_handoff(
    existing: Option<&str>,
    handoff: &IdeaHandoff,
    author: &str,
    now: &DateTime<FixedOffset>,
) -> Result<IdeaFile> {
    let Some(existing) = existing else {
        let Some(title) = &handoff.title else {
            bail!("A new idea needs a title.");
        };
        let mut file = new_idea(
            &NewIdea {
                title: title.clone(),
                slug: handoff.slug.clone(),
                status: handoff.status,
                product: handoff.product.clone(),
                tags: handoff.tags.clone(),
                summary: handoff.summary.clone(),
                braindump: handoff.braindump.clone(),
                note: Some(handoff.log.clone().unwrap_or_else(|| "Imported.".into())),
            },
            author,
            now,
        )?;
        for challenge in &handoff.challenges {
            file.content = add_idea_challenge(&file.content, challenge, now)?;
        }
        return Ok(file);
    };
    let Some(slug) = handoff.slug.as_deref().and_then(IdeaSlug::parse) else {
        bail!("A hand-off for an existing idea needs its slug.");
    };
    let mut content = existing.to_string();
    if let Some(summary) = &handoff.summary {
        content = set_idea_summary(&content, summary, now)?;
    }
    for challenge in &handoff.challenges {
        content = add_idea_challenge(&content, challenge, now)?;
    }
    if let Some(braindump) = &handoff.braindump {
        content = append_idea_braindump(&content, braindump, now)?;
    }
    if let Some(status) = handoff.status
        && status != parse_idea(&content).status
    {
        content = set_idea_status(&content, status, None, author, now)?;
    }
    if let Some(log) = &handoff.log {
        content = log_idea(&content, log, author, now)?;
    }
    if content == existing {
        bail!("The hand-off for {slug} changes nothing.");
    }
    Ok(IdeaFile {
        path: idea_path(&slug),
        slug,
        content,
    })
}

// --- finding -------------------------------------------------------------------------------------

/// Mirrors `IdeaRef`.
#[derive(Debug, Clone)]
pub struct IdeaRef {
    pub slug: IdeaSlug,
    pub idea: Idea,
}

/// Mirrors `findIdeas`: an exact slug wins, then the number of words found in the slug, title,
/// product and tags.
pub fn find_ideas<'a>(ideas: &'a [IdeaRef], query: &str) -> Vec<&'a IdeaRef> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return Vec::new();
    }
    let words: Vec<&str> = q
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .collect();
    let mut scored: Vec<(usize, &IdeaRef)> = ideas
        .iter()
        .map(|r| {
            if r.slug.as_str() == q {
                return (1000, r);
            }
            let mut parts = vec![
                r.slug.as_str(),
                r.idea.title.as_str(),
                r.idea.product.as_deref().unwrap_or(""),
            ];
            parts.extend(r.idea.tags.iter().map(String::as_str));
            let hay = parts.join(" ").to_lowercase();
            let score = words.iter().filter(|w| hay.contains(*w)).count();
            (
                if score == words.len() {
                    score + 10
                } else {
                    score
                },
                r,
            )
        })
        .filter(|(score, _)| *score > 0)
        .collect();
    scored.sort_by(|(a, ra), (b, rb)| b.cmp(a).then_with(|| ra.slug.cmp(&rb.slug)));
    scored.into_iter().map(|(_, r)| r).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = include_str!("../../../packages/formats/fixtures/ideas/palette-sync.md");
    const SAMPLE_JSON: &str =
        include_str!("../../../packages/formats/fixtures/ideas/palette-sync.json");

    /// 2026-10-15 08:05 at +02:00, like the TS suite's `now` in a CEST time zone.
    fn now() -> DateTime<FixedOffset> {
        DateTime::parse_from_rfc3339("2026-10-15T08:05:00+02:00").unwrap()
    }

    fn at(rfc3339: &str) -> DateTime<FixedOffset> {
        DateTime::parse_from_rfc3339(rfc3339).unwrap()
    }

    fn slug(s: &str) -> IdeaSlug {
        IdeaSlug::parse(s).unwrap()
    }

    #[test]
    fn names_an_idea_by_its_slug_and_reads_the_slug_back() {
        let path = idea_path(&slug("palette-sync"));
        assert_eq!(path, ".kh/ideas/palette-sync.md");
        assert_eq!(idea_slug_of(&path), Some(slug("palette-sync")));
    }

    #[test]
    fn refuses_every_other_path() {
        let long = format!(".kh/ideas/{}.md", "a".repeat(41));
        for path in [
            ".kh/ideas/../dump.md",
            ".kh/ideas/Palette.md",
            ".kh/ideas/a.md",
            ".kh/ideas/-x.md",
            ".kh/ideas/x.txt",
            ".kh/ideas/archive/old-idea.md",
            &long,
            ".kh/raw/palette-sync.md",
            "/.kh/ideas/palette-sync.md",
            ".kh/ideas/palette-sync.md\n",
        ] {
            assert_eq!(idea_slug_of(path), None, "{path}");
        }
    }

    #[test]
    fn checks_slugs() {
        assert!(IdeaSlug::parse("ok").is_some());
        assert!(IdeaSlug::parse("a").is_none());
        assert!(IdeaSlug::parse("Has Space").is_none());
        assert!(IdeaSlug::parse(&"a".repeat(40)).is_some());
        assert!(IdeaSlug::parse(&"a".repeat(41)).is_none());
    }

    #[test]
    fn slugify_joins_words_and_drops_accents() {
        assert_eq!(
            slugify_idea_title("Offline sync: the Désktop palette!").as_str(),
            "offline-sync-the-desktop-palette"
        );
    }

    #[test]
    fn slugify_cuts_at_a_word_end_within_40_characters() {
        let s = slugify_idea_title("one two three four five six seven eight nine ten eleven");
        assert_eq!(s.as_str(), "one-two-three-four-five-six-seven-eight");
        assert_eq!(
            slugify_idea_title(&"x".repeat(50)).as_str(),
            "x".repeat(40),
            "a first word longer than 40 is cut"
        );
    }

    #[test]
    fn slugify_falls_back_to_idea() {
        assert_eq!(slugify_idea_title("!!!").as_str(), "idea");
        assert_eq!(slugify_idea_title("x").as_str(), "idea");
    }

    #[test]
    fn formats_log_time_and_timestamp() {
        assert_eq!(idea_log_time(&now()), "2026-10-15 08:05");
        assert_eq!(idea_timestamp(&now()), "2026-10-15T08:05+02:00");
        assert_eq!(
            parse_idea_timestamp(&idea_timestamp(&now())),
            Some(now().timestamp_millis())
        );
    }

    #[test]
    fn reads_the_shared_fixture() {
        let parsed = serde_json::to_value(parse_idea(SAMPLE)).unwrap();
        let expected: serde_json::Value = serde_json::from_str(SAMPLE_JSON).unwrap();
        assert_eq!(parsed, expected);
    }

    #[test]
    fn is_lenient_with_hand_written_files() {
        let idea = parse_idea("# Just a title\n\nSome words.\n");
        assert_eq!(idea.title, "Just a title");
        assert_eq!(idea.status, IdeaStatus::Seed);
        assert_eq!(idea.summary, "Some words.");
        assert!(idea.log.is_empty() && idea.tags.is_empty());
        assert_eq!(
            parse_idea("---\nstatus: wild\n---\n").status,
            IdeaStatus::Seed
        );
        assert_eq!(parse_idea("").title, "(untitled)");
    }

    #[test]
    fn reads_unquoted_and_single_quoted_fields() {
        let idea = parse_idea(
            "---\ntitle: Plain title\nproduct: 'it''s'\ntags:\n  - a\n  - \"b c\"\n---\n",
        );
        assert_eq!(idea.title, "Plain title");
        assert_eq!(idea.product.as_deref(), Some("it's"));
        assert_eq!(idea.tags, vec!["a", "b c"]);
    }

    #[test]
    fn writes_a_new_idea() {
        let file = new_idea(
            &NewIdea {
                title: "Voice capture: on Android".into(),
                product: Some("kaihuman".into()),
                tags: vec!["mobile".into()],
                braindump: Some("hold a key\nand talk".into()),
                ..NewIdea::default()
            },
            "human",
            &now(),
        )
        .unwrap();
        assert_eq!(file.slug.as_str(), "voice-capture-on-android");
        assert_eq!(file.path, ".kh/ideas/voice-capture-on-android.md");
        let stamp = idea_timestamp(&now());
        assert_eq!(
            file.content,
            [
                "---",
                "title: \"Voice capture: on Android\"",
                "status: seed",
                "product: kaihuman",
                "tags: [mobile]",
                &format!("created: {stamp}"),
                &format!("updated: {stamp}"),
                "---",
                "",
                "# Voice capture: on Android",
                "",
                "## Log",
                "",
                "- 2026-10-15 08:05 · human · Created.",
                "",
                "## Braindump",
                "",
                "hold a key",
                "and talk",
                "",
            ]
            .join("\n")
        );
        assert_eq!(parse_idea(&file.content).title, "Voice capture: on Android");
    }

    #[test]
    fn refuses_a_bad_slug_tag_author_or_title() {
        let err = |input: NewIdea, author: &str| {
            new_idea(&input, author, &now()).unwrap_err().to_string()
        };
        let x = || NewIdea {
            title: "x".into(),
            ..NewIdea::default()
        };
        assert!(
            err(
                NewIdea {
                    slug: Some("Bad Slug".into()),
                    ..x()
                },
                "claude"
            )
            .contains("not a slug")
        );
        assert!(
            err(
                NewIdea {
                    tags: vec!["a,b".into()],
                    ..x()
                },
                "claude"
            )
            .contains("not a tag")
        );
        assert!(err(x(), "Claude Code").contains("author"));
        assert!(
            err(
                NewIdea {
                    title: "  ".into(),
                    ..x()
                },
                "claude"
            )
            .contains("empty")
        );
    }

    #[test]
    fn adds_a_log_entry_at_the_top_and_touches_updated() {
        let next = log_idea(SAMPLE, "Tried a queue.\nIt works.", "claude", &now()).unwrap();
        let idea = parse_idea(&next);
        assert_eq!(
            idea.log[0],
            IdeaLogEntry {
                at: "2026-10-15 08:05".into(),
                author: "claude".into(),
                text: "Tried a queue. It works.".into(),
            }
        );
        assert_eq!(idea.log.len(), 4);
        assert_eq!(idea.updated, Some(idea_timestamp(&now())));
        assert_eq!(idea.braindump, parse_idea(SAMPLE).braindump);
        assert_eq!(
            next.split("## Challenges").nth(1),
            SAMPLE.split("## Challenges").nth(1)
        );
    }

    #[test]
    fn creates_the_log_after_the_summary_when_there_is_none() {
        let next = log_idea(
            "# T\n\nSummary.\n\n## Braindump\n\nraw\n",
            "First.",
            "claude",
            &now(),
        )
        .unwrap();
        assert!(next.contains(
            "Summary.\n\n## Log\n\n- 2026-10-15 08:05 · claude · First.\n\n## Braindump"
        ));
    }

    #[test]
    fn adds_a_challenge_at_the_end_before_the_braindump_if_new() {
        let next = add_idea_challenge(SAMPLE, "Battery?", &now()).unwrap();
        assert_eq!(
            parse_idea(&next).challenges.last(),
            Some(&IdeaChallenge {
                done: false,
                text: "Battery?".into()
            })
        );
        let fresh = add_idea_challenge("# T\n\n## Braindump\n\nraw\n", "Why?", &now()).unwrap();
        assert!(fresh.find("## Challenges") < fresh.find("## Braindump"));
    }

    #[test]
    fn appends_to_the_braindump_without_changing_what_is_there() {
        let next = append_idea_braindump(SAMPLE, "And sync on wake.", &now()).unwrap();
        assert_eq!(
            parse_idea(&next).braindump,
            format!("{}\n\nAnd sync on wake.", parse_idea(SAMPLE).braindump)
        );
        assert!(
            append_idea_braindump("# T\n", "raw", &now())
                .unwrap()
                .ends_with("## Braindump\n\nraw\n")
        );
        assert!(append_idea_braindump(SAMPLE, " \n ", &now()).is_err());
    }

    #[test]
    fn keeps_headings_in_braindump_text_inside_the_section() {
        let typed = "# My idea\n\n## Why\nbecause\n### Deeper";
        let file = new_idea(
            &NewIdea {
                title: "My idea".into(),
                braindump: Some(typed.into()),
                ..NewIdea::default()
            },
            "claude",
            &now(),
        )
        .unwrap();
        let idea = parse_idea(&file.content);
        assert_eq!(
            idea.braindump,
            "### My idea\n\n### Why\nbecause\n### Deeper"
        );
        assert_eq!(idea.title, "My idea");
        let appended = append_idea_braindump(SAMPLE, "## Later\nmore", &now()).unwrap();
        assert!(parse_idea(&appended).braindump.ends_with("### Later\nmore"));
    }

    #[test]
    fn replaces_only_the_summary() {
        let next = set_idea_summary(SAMPLE, "Queue writes; no CRDT.", &now()).unwrap();
        assert_eq!(parse_idea(&next).summary, "Queue writes; no CRDT.");
        assert_eq!(parse_idea(&next).log, parse_idea(SAMPLE).log);
    }

    #[test]
    fn changes_the_status_and_logs_it() {
        let next = set_idea_status(
            SAMPLE,
            IdeaStatus::Committed,
            Some("Small enough."),
            "claude",
            &now(),
        )
        .unwrap();
        let idea = parse_idea(&next);
        assert_eq!(idea.status, IdeaStatus::Committed);
        assert_eq!(
            idea.log[0].text,
            "Status exploring → committed. Small enough."
        );
        let err = set_idea_status(SAMPLE, IdeaStatus::Exploring, None, "claude", &now());
        assert!(err.unwrap_err().to_string().contains("already"));
    }

    #[test]
    fn grades_activity() {
        let idea = parse_idea(SAMPLE);
        let activity = idea_activity(&idea, &at("2026-10-20T00:00:00+02:00"));
        assert_eq!((activity.total, activity.recent), (3, 3));
        assert_eq!(activity.level, IdeaActivityLevel::Hot);
        let level = |when: &str| idea_activity(&idea, &at(when)).level;
        assert_eq!(level("2026-11-01T00:00:00+01:00"), IdeaActivityLevel::Warm);
        assert_eq!(level("2026-12-01T00:00:00+01:00"), IdeaActivityLevel::Cool);
        let old = idea_activity(&idea, &at("2027-07-01T00:00:00+02:00"));
        assert_eq!((old.level, old.recent), (IdeaActivityLevel::Dormant, 0));
    }

    #[test]
    fn is_dormant_with_no_dates_at_all() {
        assert_eq!(
            idea_activity(&parse_idea("# T\n"), &now()),
            IdeaActivity {
                last_at: None,
                recent: 0,
                total: 0,
                level: IdeaActivityLevel::Dormant,
            }
        );
    }

    const PASTED: &str = "Here is the summary of our chat:\n\n```kh-idea\nslug: new\ntitle: Ideas tools in kb-mcp\nproduct: kaihuman\ntags: [mcp, ideas]\nlog: Compared CLI vs MCP; MCP for Claude Desktop.\nchallenges:\n  - Needs the clone to be fresh\n  - Who pushes?\nsummary: |\n  Claude Desktop reads and writes ideas\n  through kb-mcp.\n```";

    #[test]
    fn reads_every_hand_off_block() {
        assert_eq!(
            parse_idea_handoffs(PASTED).unwrap(),
            vec![IdeaHandoff {
                title: Some("Ideas tools in kb-mcp".into()),
                product: Some("kaihuman".into()),
                tags: vec!["mcp".into(), "ideas".into()],
                log: Some("Compared CLI vs MCP; MCP for Claude Desktop.".into()),
                challenges: vec!["Needs the clone to be fresh".into(), "Who pushes?".into()],
                summary: Some("Claude Desktop reads and writes ideas\nthrough kb-mcp.".into()),
                ..IdeaHandoff::default()
            }]
        );
        assert!(parse_idea_handoffs("no block here").unwrap().is_empty());
        assert_eq!(
            parse_idea_handoffs("title: Bare").unwrap(),
            vec![IdeaHandoff {
                title: Some("Bare".into()),
                ..IdeaHandoff::default()
            }]
        );
        let two = format!("{PASTED}\n\n```kh-idea\nslug: palette-sync\nlog: Done.\n```\n");
        assert_eq!(parse_idea_handoffs(&two).unwrap().len(), 2);
    }

    #[test]
    fn creates_a_new_idea_from_a_hand_off() {
        let handoff = parse_idea_handoffs(PASTED).unwrap().remove(0);
        let file = apply_idea_handoff(None, &handoff, "claude.ai", &now()).unwrap();
        assert_eq!(file.slug.as_str(), "ideas-tools-in-kb-mcp");
        let idea = parse_idea(&file.content);
        assert_eq!(
            idea.log,
            vec![IdeaLogEntry {
                at: "2026-10-15 08:05".into(),
                author: "claude.ai".into(),
                text: "Compared CLI vs MCP; MCP for Claude Desktop.".into(),
            }]
        );
        let texts: Vec<_> = idea.challenges.iter().map(|c| c.text.as_str()).collect();
        assert_eq!(texts, ["Needs the clone to be fresh", "Who pushes?"]);
        assert_eq!(
            idea.summary,
            "Claude Desktop reads and writes ideas\nthrough kb-mcp."
        );
    }

    #[test]
    fn updates_an_existing_idea_and_refuses_a_no_op() {
        let handoff = IdeaHandoff {
            slug: Some("palette-sync".into()),
            status: Some(IdeaStatus::Parked),
            log: Some("Not now.".into()),
            ..IdeaHandoff::default()
        };
        let next = apply_idea_handoff(Some(SAMPLE), &handoff, "gemini", &now()).unwrap();
        let idea = parse_idea(&next.content);
        assert_eq!(idea.status, IdeaStatus::Parked);
        let texts: Vec<_> = idea.log[..2].iter().map(|e| e.text.as_str()).collect();
        assert_eq!(texts, ["Not now.", "Status exploring → parked."]);

        let noop = IdeaHandoff {
            slug: Some("palette-sync".into()),
            ..IdeaHandoff::default()
        };
        let err = apply_idea_handoff(Some(SAMPLE), &noop, "claude", &now()).unwrap_err();
        assert!(err.to_string().contains("changes nothing"));
        let err = apply_idea_handoff(Some(SAMPLE), &IdeaHandoff::default(), "claude", &now());
        assert!(err.unwrap_err().to_string().contains("slug"));
    }

    #[test]
    fn refuses_an_unknown_hand_off_status() {
        let err = parse_idea_handoffs("```kh-idea\nstatus: done\n```").unwrap_err();
        assert!(err.to_string().contains("status"));
    }

    #[test]
    fn finds_an_exact_slug_first_then_ideas_that_match_every_word() {
        let ideas = vec![
            IdeaRef {
                slug: slug("palette-sync"),
                idea: parse_idea(SAMPLE),
            },
            IdeaRef {
                slug: slug("voice-capture"),
                idea: parse_idea("# Voice capture on Android\n"),
            },
            IdeaRef {
                slug: slug("sync"),
                idea: parse_idea("# Something\n"),
            },
        ];
        let find = |q: &str| -> Vec<String> {
            find_ideas(&ideas, q)
                .iter()
                .map(|r| r.slug.to_string())
                .collect()
        };
        assert_eq!(find("sync"), ["sync", "palette-sync"]);
        assert_eq!(find("offline palette"), ["palette-sync"]);
        assert_eq!(find("android voice"), ["voice-capture"]);
        assert!(find("  ").is_empty());
    }
}
