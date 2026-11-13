//! Pure parse/serialize of `*.todos.md`: a port of `packages/formats/src/todos.ts` and
//! `todo-repeat.ts`, plus the `::id:: <id>` field from docs/superpowers/specs/2026-11-12-todo-cli-design.md.
//!
//! A parsed file keeps every line it did not understand, and every todo keeps its original text
//! until it is changed, so rendering an unchanged file gives back the same bytes and a change
//! touches only the todos it changes. Changed todos are written exactly as `serializeTodos` does.

use chrono::{Datelike, Duration, NaiveDate};
use std::collections::HashSet;
use std::fmt;

// --- small types ---------------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Open,
    InProgress,
    Done,
    Rejected,
}

impl Status {
    fn from_marker(marker: &str) -> Self {
        match marker {
            ">" => Status::InProgress,
            "x" | "X" => Status::Done,
            "-" => Status::Rejected,
            _ => Status::Open,
        }
    }

    fn marker(self) -> &'static str {
        match self {
            Status::Open => "[ ]",
            Status::InProgress => "[>]",
            Status::Done => "[x]",
            Status::Rejected => "[-]",
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Status::Open => "open",
            Status::InProgress => "in-progress",
            Status::Done => "done",
            Status::Rejected => "rejected",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        [
            Status::Open,
            Status::InProgress,
            Status::Done,
            Status::Rejected,
        ]
        .into_iter()
        .find(|s| s.as_str() == value)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Priority {
    High,
    SuperHigh,
    UltraHigh,
}

impl Priority {
    pub fn as_str(self) -> &'static str {
        match self {
            Priority::High => "high",
            Priority::SuperHigh => "super-high",
            Priority::UltraHigh => "ultra-high",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        [Priority::High, Priority::SuperHigh, Priority::UltraHigh]
            .into_iter()
            .find(|p| p.as_str() == value)
    }
}

/// A todo's stable id: 8 characters of `[0-9a-z]`.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct TodoId(String);

const ID_ALPHABET: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";

impl TodoId {
    pub fn parse(value: &str) -> Option<Self> {
        (value.len() == 8 && value.bytes().all(|b| ID_ALPHABET.contains(&b)))
            .then(|| Self(value.to_string()))
    }

    /// A random id not in `taken`, which it is added to.
    pub fn fresh(taken: &mut HashSet<TodoId>) -> Self {
        loop {
            let mut bytes = [0u8; 8];
            getrandom::getrandom(&mut bytes).expect("the OS random source");
            // 252 = 7 * 36: dropping larger bytes keeps every character equally likely.
            if bytes.iter().any(|b| *b >= 252) {
                continue;
            }
            let id = Self(
                bytes
                    .iter()
                    .map(|b| ID_ALPHABET[(*b % 36) as usize] as char)
                    .collect(),
            );
            if taken.insert(id.clone()) {
                return id;
            }
        }
    }
}

impl fmt::Display for TodoId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// A local due date, with an optional `HH:MM` time.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Due {
    pub date: NaiveDate,
    pub time: Option<String>,
}

fn digits(s: &str) -> Option<u32> {
    (!s.is_empty() && s.bytes().all(|b| b.is_ascii_digit()))
        .then(|| s.parse().ok())
        .flatten()
}

/// `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`; anything else, impossible dates included, is `None`.
pub fn parse_due(value: &str) -> Option<Due> {
    let b = value.as_bytes();
    if !(b.len() == 10 || b.len() == 16) || b[4] != b'-' || b[7] != b'-' {
        return None;
    }
    let (y, m, d) = (
        digits(&value[0..4])?,
        digits(&value[5..7])?,
        digits(&value[8..10])?,
    );
    // `Date.UTC` reads years 0-99 as 1900-1999, so the TS check rejects them.
    if y < 100 {
        return None;
    }
    let date = NaiveDate::from_ymd_opt(y as i32, m, d)?;
    if b.len() == 10 {
        return Some(Due { date, time: None });
    }
    if b[10] != b'T' || b[13] != b':' {
        return None;
    }
    let (h, min) = (digits(&value[11..13])?, digits(&value[14..16])?);
    (h <= 23 && min <= 59).then(|| Due {
        date,
        time: Some(value[11..16].to_string()),
    })
}

impl fmt::Display for Due {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.date.format("%Y-%m-%d"))?;
        if let Some(time) = &self.time {
            write!(f, "T{time}")?;
        }
        Ok(())
    }
}

/// The moment a change is made: Unix ms plus the local calendar date and `HH:MM`.
#[derive(Debug, Clone)]
pub struct Now {
    pub ms: i64,
    pub today: NaiveDate,
    pub time: String,
}

impl Now {
    pub fn local() -> Self {
        let now = chrono::Local::now();
        Self {
            ms: now.timestamp_millis(),
            today: now.date_naive(),
            time: now.format("%H:%M").to_string(),
        }
    }

    /// `new Date(ms).toISOString()`.
    pub fn iso(&self) -> String {
        chrono::DateTime::from_timestamp_millis(self.ms)
            .unwrap_or_default()
            .format("%Y-%m-%dT%H:%M:%S%.3fZ")
            .to_string()
    }
}

// --- repeat (todo-repeat.ts) ---------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Unit {
    Day,
    Week,
    Month,
    Year,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RepeatOn {
    Any,
    /// 0 = Monday … 6 = Sunday, sorted, no duplicates.
    Weekdays(Vec<u32>),
    MonthDay(u32),
    LastDay,
    /// Month and day of a yearly rule.
    Date(u32, u32),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Repeat {
    pub unit: Unit,
    pub interval: u32,
    pub on: RepeatOn,
}

const WEEKDAY_NAMES: [&str; 7] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const WORKDAYS: [u32; 5] = [0, 1, 2, 3, 4];
const MAX_REPEAT_INTERVAL: u32 = 999;

fn days_in_month(year: i32, month: u32) -> u32 {
    let (ny, nm) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    NaiveDate::from_ymd_opt(ny, nm, 1)
        .and_then(|d| d.pred_opt())
        .map_or(31, |d| d.day())
}

fn parse_on(unit: Unit, on: &str) -> Option<RepeatOn> {
    match unit {
        Unit::Week => {
            let mut days = on
                .split(',')
                .map(|s| WEEKDAY_NAMES.iter().position(|n| *n == s.trim()))
                .map(|d| d.map(|d| d as u32))
                .collect::<Option<Vec<_>>>()?;
            days.sort_unstable();
            days.dedup();
            Some(RepeatOn::Weekdays(days))
        }
        Unit::Month => {
            if on == "last" {
                return Some(RepeatOn::LastDay);
            }
            let day = (on.len() <= 2).then(|| digits(on)).flatten()?;
            (1..=31).contains(&day).then_some(RepeatOn::MonthDay(day))
        }
        Unit::Year => {
            let (mm, dd) = on.split_once('-')?;
            if mm.len() != 2 || dd.len() != 2 {
                return None;
            }
            let (m, d) = (digits(mm)?, digits(dd)?);
            ((1..=12).contains(&m) && d >= 1 && d <= days_in_month(2000, m))
                .then_some(RepeatOn::Date(m, d))
        }
        Unit::Day => None,
    }
}

fn parse_unit(word: &str) -> Option<Unit> {
    match word.strip_suffix('s').unwrap_or(word) {
        "day" => Some(Unit::Day),
        "week" => Some(Unit::Week),
        "month" => Some(Unit::Month),
        "year" => Some(Unit::Year),
        _ => None,
    }
}

/// A `::repeat::` value; unknown or malformed rules are `None`.
pub fn parse_repeat(value: &str) -> Option<Repeat> {
    let v = value.trim().to_lowercase();
    let (base, on) = match v.split_once(':') {
        Some((base, on)) if !on.is_empty() && !on.contains(char::is_whitespace) => (base, Some(on)),
        Some(_) => return None,
        None => (v.as_str(), None),
    };
    let (unit, interval, named_weekdays) = match base {
        "daily" => (Unit::Day, 1, false),
        "weekdays" => (Unit::Week, 1, true),
        "weekly" => (Unit::Week, 1, false),
        "monthly" => (Unit::Month, 1, false),
        "yearly" => (Unit::Year, 1, false),
        _ => {
            // every\s+(\d+)\s+(day|week|month|year)s?
            let rest = base.strip_prefix("every")?;
            let rest = rest.strip_prefix(char::is_whitespace)?.trim_start();
            let n_len = rest
                .find(|c: char| !c.is_ascii_digit())
                .unwrap_or(rest.len());
            let (n, rest) = rest.split_at(n_len);
            let unit = parse_unit(rest.strip_prefix(char::is_whitespace)?.trim_start())?;
            let n = digits(n).filter(|n| (1..=MAX_REPEAT_INTERVAL).contains(n))?;
            (unit, n, false)
        }
    };
    if named_weekdays && on.is_some() {
        return None;
    }
    let on = match on {
        Some(on) => parse_on(unit, on)?,
        None if named_weekdays => RepeatOn::Weekdays(WORKDAYS.to_vec()),
        None => RepeatOn::Any,
    };
    Some(Repeat { unit, interval, on })
}

impl fmt::Display for Repeat {
    /// The canonical `::repeat::` value; `parse_repeat` gives the rule back.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.unit == Unit::Week
            && self.interval == 1
            && self.on == RepeatOn::Weekdays(WORKDAYS.to_vec())
        {
            return f.write_str("weekdays");
        }
        let (single, word) = match self.unit {
            Unit::Day => ("daily", "day"),
            Unit::Week => ("weekly", "week"),
            Unit::Month => ("monthly", "month"),
            Unit::Year => ("yearly", "year"),
        };
        if self.interval == 1 {
            f.write_str(single)?;
        } else {
            write!(f, "every {} {word}s", self.interval)?;
        }
        match &self.on {
            RepeatOn::Weekdays(days) if self.unit == Unit::Week && !days.is_empty() => {
                let names: Vec<_> = days.iter().map(|d| WEEKDAY_NAMES[*d as usize]).collect();
                write!(f, ":{}", names.join(","))
            }
            RepeatOn::MonthDay(d) if self.unit == Unit::Month => write!(f, ":{d}"),
            RepeatOn::LastDay if self.unit == Unit::Month => f.write_str(":last"),
            RepeatOn::Date(m, d) if self.unit == Unit::Year => write!(f, ":{m:02}-{d:02}"),
            _ => Ok(()),
        }
    }
}

fn weekday_of(date: NaiveDate) -> u32 {
    date.weekday().num_days_from_monday()
}

fn clamped_date(year: i32, month: u32, day: Option<u32>) -> NaiveDate {
    let max = days_in_month(year, month);
    let day = day.map_or(max, |d| d.min(max));
    NaiveDate::from_ymd_opt(year, month, day).expect("a clamped day exists")
}

/// The first occurrence of `repeat` strictly after both `date` and `after`. `date` is the current
/// due date and anchors the cycle: weeks and months are counted from it.
pub fn next_occurrence_date(date: NaiveDate, repeat: &Repeat, after: NaiveDate) -> NaiveDate {
    let reference = after.max(date);
    let n = i64::from(repeat.interval);
    let weekdays = match &repeat.on {
        RepeatOn::Weekdays(days) if !days.is_empty() => Some(days),
        _ => None,
    };
    match (repeat.unit, weekdays) {
        (Unit::Day, _) | (Unit::Week, None) => {
            let step = if repeat.unit == Unit::Day { n } else { 7 * n };
            let diff = (reference - date).num_days();
            date + Duration::days((diff.div_euclid(step) + 1) * step)
        }
        (Unit::Week, Some(days)) => {
            let week_start = date - Duration::days(i64::from(weekday_of(date)));
            for i in 1..=14 * n + 7 {
                let candidate = reference + Duration::days(i);
                let week = (candidate - week_start).num_days().div_euclid(7);
                if week % n == 0 && days.contains(&weekday_of(candidate)) {
                    return candidate;
                }
            }
            unreachable!("a weekly rule always has a next day")
        }
        (Unit::Month, _) => {
            let day = match repeat.on {
                RepeatOn::MonthDay(d) => Some(d),
                RepeatOn::LastDay => None,
                _ => Some(date.day()),
            };
            let (y, m) = (i64::from(date.year()), i64::from(date.month()));
            let ahead = (i64::from(reference.year()) - y) * 12 + (i64::from(reference.month()) - m);
            let mut k = ahead.div_euclid(n).max(0);
            loop {
                let total = m - 1 + k * n;
                let candidate = clamped_date(
                    (y + total.div_euclid(12)) as i32,
                    (total.rem_euclid(12) + 1) as u32,
                    day,
                );
                if candidate > reference {
                    return candidate;
                }
                k += 1;
            }
        }
        (Unit::Year, _) => {
            let (mm, dd) = match repeat.on {
                RepeatOn::Date(m, d) => (m, d),
                _ => (date.month(), date.day()),
            };
            let y = i64::from(date.year());
            let mut k = ((i64::from(reference.year()) - y).div_euclid(n)).max(0);
            loop {
                let candidate = clamped_date((y + k * n) as i32, mm, Some(dd));
                if candidate > reference {
                    return candidate;
                }
                k += 1;
            }
        }
    }
}

/// Pins a month or year rule to the due date's day, so clamping does not drift later occurrences.
pub fn anchor_repeat(repeat: &Repeat, date: NaiveDate) -> Repeat {
    let on = match (repeat.unit, &repeat.on) {
        (Unit::Month, RepeatOn::Any) => RepeatOn::MonthDay(date.day()),
        (Unit::Year, RepeatOn::Any) => RepeatOn::Date(date.month(), date.day()),
        (_, on) => on.clone(),
    };
    Repeat {
        on,
        ..repeat.clone()
    }
}

// --- todo ----------------------------------------------------------------------------------------

/// Most completions kept in `::done::`.
pub const DONE_LOG_LIMIT: usize = 30;

#[derive(Debug, Clone, PartialEq)]
pub struct Todo {
    pub id: Option<TodoId>,
    pub text: String,
    pub status: Status,
    pub tags: Vec<String>,
    pub milestone: Option<String>,
    pub priority: Option<Priority>,
    /// The `  > ` lines under the todo (the console calls them the prompt).
    pub note: Vec<String>,
    pub note_ref: Option<String>,
    pub created: Option<String>,
    pub updated: Option<i64>,
    pub due: Option<Due>,
    pub repeat: Option<Repeat>,
    pub done_log: Vec<String>,
    /// The lines the todo was parsed from; `None` once it changes, so it is serialized again.
    raw: Option<String>,
}

impl Todo {
    /// A new open todo, created and updated `now`.
    pub fn new(text: &str, now: &Now) -> Self {
        Self {
            id: None,
            text: text.to_string(),
            status: Status::Open,
            tags: Vec::new(),
            milestone: None,
            priority: None,
            note: Vec::new(),
            note_ref: None,
            created: Some(now.iso()),
            updated: Some(now.ms),
            due: None,
            repeat: None,
            done_log: Vec::new(),
            raw: None,
        }
    }

    /// Marks the todo changed at `now`: it is written again, with this `::updated::`.
    pub fn touch(&mut self, now: &Now) {
        self.raw = None;
        self.updated = Some(now.ms);
    }

    /// `setStatus`: done on a recurring todo completes it instead.
    pub fn set_status(&mut self, status: Status, now: &Now) {
        if status == Status::Done && self.repeat.is_some() {
            return self.complete(now);
        }
        self.status = status;
        self.touch(now);
    }

    /// `completeTodo`: a recurring todo moves its due date to the first occurrence after both the
    /// current one and today, logs today and stays open; a plain todo is done.
    pub fn complete(&mut self, now: &Now) {
        let Some(repeat) = &self.repeat else {
            self.status = Status::Done;
            return self.touch(now);
        };
        let anchor = self.due.as_ref().map_or(now.today, |d| d.date);
        let repeat = anchor_repeat(repeat, anchor);
        let date = next_occurrence_date(anchor, &repeat, now.today);
        self.due = Some(Due {
            date,
            time: self.due.as_ref().and_then(|d| d.time.clone()),
        });
        self.repeat = Some(repeat);
        self.status = Status::Open;
        self.done_log.push(now.today.format("%Y-%m-%d").to_string());
        let extra = self.done_log.len().saturating_sub(DONE_LOG_LIMIT);
        self.done_log.drain(..extra);
        self.touch(now);
    }

    /// `dueStatus`: `overdue`, `today` or `upcoming` for an open todo with a due date.
    pub fn due_status(&self, now: &Now) -> Option<&'static str> {
        let due = self.due.as_ref()?;
        if matches!(self.status, Status::Done | Status::Rejected) {
            return None;
        }
        Some(if due.date < now.today {
            "overdue"
        } else if due.date > now.today {
            "upcoming"
        } else if due.time.as_ref().is_some_and(|t| *t <= now.time) {
            "overdue"
        } else {
            "today"
        })
    }

    /// The todo as `serializeTodos` writes it, plus `::id::` last on the metadata line.
    pub fn serialize(&self) -> String {
        let mut suffix: Vec<String> = Vec::new();
        if !self.tags.is_empty() {
            let tags: Vec<_> = self.tags.iter().map(|t| format!("#{t}")).collect();
            suffix.push(tags.join(" "));
        }
        if let Some(m) = &self.milestone {
            suffix.push(format!("!{m}"));
        }
        if let Some(p) = self.priority {
            suffix.push(format!("^{}", p.as_str()));
        }
        let mut out = format!("- {} {}", self.status.marker(), self.text);
        if !suffix.is_empty() {
            out.push(' ');
            out.push_str(&suffix.join(" "));
        }
        out.push('\n');
        let mut meta: Vec<String> = Vec::new();
        // `if (item.updatedAt)`: 0 is not written.
        if let Some(u) = self.updated.filter(|u| *u != 0) {
            meta.push(format!("::updated:: {u}"));
        }
        if let Some(c) = &self.created {
            meta.push(format!("::created:: {c}"));
        }
        if let Some(d) = &self.due {
            meta.push(format!("::due:: {d}"));
        }
        if let Some(r) = &self.repeat {
            meta.push(format!("::repeat:: {r}"));
        }
        if !self.done_log.is_empty() {
            meta.push(format!("::done:: {}", self.done_log.join(",")));
        }
        if let Some(id) = &self.id {
            meta.push(format!("::id:: {id}"));
        }
        if !meta.is_empty() {
            out.push_str(&meta.join(" "));
            out.push('\n');
        }
        for line in &self.note {
            out.push_str(&format!("  > {line}\n"));
        }
        if let Some(r) = &self.note_ref {
            out.push_str(&format!("  > ref:{r}\n"));
        }
        out
    }
}

// --- parse helpers (the regexes of todos.ts, by hand) --------------------------------------------

fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || c == '-'
}

/// `^(\s*)([-*])\s+\[([^\]]*)\]\s+(.*)` → (marker, text).
fn match_todo(line: &str) -> Option<(&str, &str)> {
    let rest = line.trim_start();
    let rest = rest.strip_prefix('-').or_else(|| rest.strip_prefix('*'))?;
    if !rest.starts_with(char::is_whitespace) {
        return None;
    }
    let rest = rest.trim_start().strip_prefix('[')?;
    let (marker, rest) = rest.split_once(']')?;
    if !rest.starts_with(char::is_whitespace) {
        return None;
    }
    Some((marker, rest.trim_start()))
}

/// `^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s+(.*)`
fn match_iso_prefix(text: &str) -> Option<(&str, &str)> {
    let shape = b"dddd-dd-ddTdd:dd:dd";
    let b = text.as_bytes();
    if b.len() < shape.len()
        || !shape.iter().zip(b).all(|(s, c)| match s {
            b'd' => c.is_ascii_digit(),
            s => s == c,
        })
    {
        return None;
    }
    let mut end = shape.len();
    if b.get(end) == Some(&b'.') {
        let digits = b[end + 1..]
            .iter()
            .take_while(|c| c.is_ascii_digit())
            .count();
        if digits == 0 {
            return None;
        }
        end += 1 + digits;
    }
    if b.get(end) != Some(&b'Z') {
        return None;
    }
    let rest = &text[end + 1..];
    rest.starts_with(char::is_whitespace)
        .then(|| (&text[..=end], rest.trim_start()))
}

/// Removes every `<sigil>[\w-]+` and returns the words found.
fn take_words(text: &str, sigil: char) -> (String, Vec<String>) {
    let mut out = String::with_capacity(text.len());
    let mut words = Vec::new();
    let mut rest = text;
    while let Some(pos) = rest.find(sigil) {
        out.push_str(&rest[..pos]);
        let after = &rest[pos + sigil.len_utf8()..];
        let len = after.find(|c| !is_word(c)).unwrap_or(after.len());
        if len == 0 {
            out.push(sigil);
        } else {
            words.push(after[..len].to_string());
        }
        rest = &after[len..];
    }
    out.push_str(rest);
    (out, words)
}

/// `(^|\s)\^(super-high|ultra-high|high)(?=\s|$)` removed; the last one wins.
fn take_priority(text: &str) -> (String, Option<Priority>) {
    let mut out = String::with_capacity(text.len());
    let mut priority = None;
    let mut rest = text;
    let mut at_start = true;
    while let Some(pos) = rest.find('^') {
        let lead_ok = (at_start && pos == 0)
            || rest[..pos]
                .chars()
                .next_back()
                .is_some_and(char::is_whitespace);
        let after = &rest[pos + 1..];
        let found = ["super-high", "ultra-high", "high"].into_iter().find(|w| {
            after.starts_with(w)
                && after[w.len()..]
                    .chars()
                    .next()
                    .is_none_or(char::is_whitespace)
        });
        out.push_str(&rest[..pos]);
        match found {
            Some(word) if lead_ok => {
                priority = Priority::parse(word);
                rest = &after[word.len()..];
            }
            _ => {
                out.push('^');
                rest = after;
            }
        }
        at_start = false;
    }
    out.push_str(rest);
    (out, priority)
}

/// The value after `::name::`, up to the next `::`; `""` when absent.
fn meta_field<'a>(line: &'a str, name: &str) -> &'a str {
    let key = format!("::{name}::");
    let Some(pos) = line.find(&key) else {
        return "";
    };
    let rest = line[pos + key.len()..].trim_start();
    rest[..rest.find("::").unwrap_or(rest.len())].trim_end()
}

fn is_meta_line(line: &str) -> bool {
    ["updated", "created", "due", "repeat", "done", "id"]
        .iter()
        .any(|k| line.starts_with(&format!("::{k}::")))
}

/// `^\s{2,}>\s` → the rest of the line.
fn match_note(line: &str) -> Option<&str> {
    let rest = line.trim_start();
    let indent = line[..line.len() - rest.len()].chars().count();
    if indent < 2 {
        return None;
    }
    let rest = rest.strip_prefix('>')?;
    let ws = rest.chars().next().filter(|c| c.is_whitespace())?;
    Some(&rest[ws.len_utf8()..])
}

fn legacy_group(line: &str) -> Option<String> {
    let rest = line.strip_prefix('#')?;
    if !rest.starts_with(char::is_whitespace) {
        return None;
    }
    Some(
        rest.trim()
            .to_lowercase()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join("-"),
    )
}

// --- file ----------------------------------------------------------------------------------------

#[derive(Debug, Clone)]
enum Part {
    Text(String),
    Todo(Box<Todo>),
}

/// A parsed `*.todos.md`.
#[derive(Debug, Clone)]
pub struct TodoFile {
    head: String,
    parts: Vec<Part>,
    /// Old `# Group` format: its groups are tags, so it is not edited in place.
    pub legacy: bool,
}

/// One line of the body: (with its line break, without it).
fn split_lines(body: &str) -> Vec<(&str, &str)> {
    body.split_inclusive('\n')
        .map(|raw| {
            let line = raw.strip_suffix('\n').unwrap_or(raw);
            (raw, line.strip_suffix('\r').unwrap_or(line))
        })
        .collect()
}

impl TodoFile {
    pub fn parse(content: &str) -> Self {
        let mut head_len = 0;
        if let Some(after) = content.strip_prefix("---")
            && let Some(close) = after.find("\n---")
        {
            let remaining = &after[close + 4..];
            let remaining = remaining.strip_prefix('\n').unwrap_or(remaining);
            head_len = content.len() - remaining.len();
        }
        let (head, body) = content.split_at(head_len);
        let lines = split_lines(body);
        let legacy = lines.iter().any(|(_, l)| legacy_group(l).is_some());

        let mut parts = Vec::new();
        let mut group = String::new();
        let mut i = 0;
        while i < lines.len() {
            let (raw, line) = lines[i];
            if legacy && let Some(g) = legacy_group(line) {
                group = g;
            }
            let Some((marker, text)) = (!line.is_empty()).then(|| match_todo(line)).flatten()
            else {
                parts.push(Part::Text(raw.to_string()));
                i += 1;
                continue;
            };
            let mut block = raw.to_string();
            let mut text = text.trim().to_string();
            let mut created = None;
            if let Some((iso, rest)) = match_iso_prefix(&text) {
                created = Some(iso.to_string());
                text = rest.trim().to_string();
            }
            let (rest, mut tags) = take_words(&text, '#');
            if legacy && !group.is_empty() && !tags.contains(&group) {
                tags.push(group.clone());
            }
            let (rest, milestones) = take_words(rest.trim(), '!');
            let (rest, priority) = take_priority(rest.trim());

            let mut todo = Todo {
                id: None,
                text: rest.trim().to_string(),
                status: Status::from_marker(marker),
                tags,
                milestone: milestones.last().cloned(),
                priority,
                note: Vec::new(),
                note_ref: None,
                created,
                updated: None,
                due: None,
                repeat: None,
                done_log: Vec::new(),
                raw: None,
            };

            let meta = lines.get(i + 1).map_or("", |(_, l)| l.trim());
            if is_meta_line(meta) {
                todo.due = parse_due(meta_field(meta, "due"));
                todo.repeat = parse_repeat(meta_field(meta, "repeat"));
                todo.done_log = meta_field(meta, "done")
                    .split(',')
                    .filter(|d| parse_due(d.trim()).is_some() && !d.contains('T'))
                    .map(|d| d.trim().to_string())
                    .collect();
                todo.id = TodoId::parse(meta_field(meta, "id"));
                if let Some(pos) = meta.find("::updated::") {
                    let rest = meta[pos + 11..].trim_start();
                    let end = rest
                        .find(|c: char| !c.is_ascii_digit())
                        .unwrap_or(rest.len());
                    todo.updated = rest[..end].parse().ok();
                }
                if todo.created.is_none()
                    && let Some(pos) = meta.find("::created::")
                {
                    let rest = meta[pos + 11..].trim_start();
                    let end = rest.find(char::is_whitespace).unwrap_or(rest.len());
                    todo.created = (end > 0).then(|| rest[..end].to_string());
                }
                i += 1;
                block.push_str(lines[i].0);
            }
            while let Some(note) = lines.get(i + 1).and_then(|(_, l)| match_note(l)) {
                i += 1;
                block.push_str(lines[i].0);
                let note = note.trim();
                match note.strip_prefix("ref:") {
                    Some(r) => todo.note_ref = Some(r.trim().to_string()),
                    None => todo.note.push(note.to_string()),
                }
            }
            todo.raw = Some(block);
            parts.push(Part::Todo(Box::new(todo)));
            i += 1;
        }
        Self {
            head: head.to_string(),
            parts,
            legacy,
        }
    }

    pub fn render(&self) -> String {
        let mut out = self.head.clone();
        for part in &self.parts {
            match part {
                Part::Text(text) => out.push_str(text),
                Part::Todo(todo) => match &todo.raw {
                    Some(raw) => out.push_str(raw),
                    None => {
                        if !out.is_empty() && !out.ends_with('\n') {
                            out.push('\n');
                        }
                        out.push_str(&todo.serialize());
                    }
                },
            }
        }
        out
    }

    pub fn todos(&self) -> impl Iterator<Item = &Todo> {
        self.parts.iter().filter_map(|p| match p {
            Part::Todo(t) => Some(&**t),
            Part::Text(_) => None,
        })
    }

    fn todos_mut(&mut self) -> impl Iterator<Item = &mut Todo> {
        self.parts.iter_mut().filter_map(|p| match p {
            Part::Todo(t) => Some(&mut **t),
            Part::Text(_) => None,
        })
    }

    pub fn find(&self, id: &TodoId) -> Option<&Todo> {
        self.todos().find(|t| t.id.as_ref() == Some(id))
    }

    /// The todo with `id`, to change; call `Todo::touch` (or a setter) so the change is written.
    pub fn find_mut(&mut self, id: &TodoId) -> Option<&mut Todo> {
        self.todos_mut().find(|t| t.id.as_ref() == Some(id))
    }

    pub fn push(&mut self, mut todo: Todo) {
        todo.raw = None;
        self.parts.push(Part::Todo(Box::new(todo)));
    }

    /// Removes the todo with `id` and its lines.
    pub fn remove(&mut self, id: &TodoId) -> Option<Todo> {
        let index = self
            .parts
            .iter()
            .position(|p| matches!(p, Part::Todo(t) if t.id.as_ref() == Some(id)))?;
        match self.parts.remove(index) {
            Part::Todo(t) => Some(*t),
            Part::Text(_) => unreachable!(),
        }
    }

    /// Gives every todo without an id a fresh one (not in `taken`); returns how many. `::updated::`
    /// stays as it was: an id is bookkeeping, not an edit.
    pub fn assign_ids(&mut self, taken: &mut HashSet<TodoId>) -> usize {
        let mut count = 0;
        for todo in self.todos_mut().filter(|t| t.id.is_none()) {
            todo.id = Some(TodoId::fresh(taken));
            todo.raw = None;
            count += 1;
        }
        count
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIXED: &str = include_str!("../../../packages/formats/fixtures/todos/mixed.todos.md");
    const CRLF: &str = include_str!("../../../packages/formats/fixtures/todos/crlf.todos.md");
    const LEGACY: &str = include_str!("../../../packages/formats/fixtures/todos/legacy.todos.md");

    fn date(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    fn now(today: &str) -> Now {
        Now {
            ms: 1_800_000_000_000,
            today: date(today),
            time: "12:00".into(),
        }
    }

    fn id(s: &str) -> TodoId {
        TodoId::parse(s).unwrap()
    }

    #[test]
    fn unchanged_files_round_trip_byte_exact() {
        for content in [
            MIXED,
            CRLF,
            LEGACY,
            "",
            "\n\n",
            "- [ ] no newline at end",
            "---\n",
        ] {
            assert_eq!(TodoFile::parse(content).render(), content);
        }
    }

    #[test]
    fn parses_like_todos_ts() {
        let file = TodoFile::parse(MIXED);
        let todos: Vec<_> = file.todos().collect();
        assert_eq!(todos.len(), 8);
        let t = todos[0];
        assert_eq!(t.text, "Buy milk");
        assert_eq!(t.tags, ["home", "errand"]);
        assert_eq!(t.priority, Some(Priority::High));
        assert_eq!(t.id, Some(id("a1b2c3d4")));
        assert_eq!(t.updated, Some(1_760_000_000_000));
        assert_eq!(t.created.as_deref(), Some("2026-10-01T08:00:00.000Z"));
        assert_eq!(t.due.as_ref().unwrap().to_string(), "2026-11-10");

        let t = todos[1];
        assert_eq!(t.status, Status::InProgress);
        assert_eq!(t.milestone.as_deref(), Some("v1"));
        assert_eq!(t.priority, Some(Priority::SuperHigh));
        assert_eq!(t.note, ["first line", "second line"]);
        assert_eq!(t.note_ref.as_deref(), Some("prompts/x.md"));
        assert_eq!(t.id, None);

        let t = todos[2];
        assert_eq!(t.status, Status::Done);
        assert_eq!(t.text, "Water plants ^unknown");
        assert_eq!(t.repeat.as_ref().unwrap().to_string(), "weekly:mon,thu");
        assert_eq!(t.done_log, ["2026-11-02", "2026-11-05"]);
        assert_eq!(t.due.as_ref().unwrap().to_string(), "2026-11-09T09:30");

        assert_eq!(todos[3].status, Status::Rejected);
        assert_eq!(todos[3].created.as_deref(), Some("2026-01-02T03:04:05Z"));
        assert_eq!(todos[3].text, "Old style");
        // A metadata line holding only an id.
        assert_eq!(todos[4].id, Some(id("zzzzzzzz")));
        assert_eq!(todos[4].text, "Id only");
        // A bad id is not an id.
        assert_eq!(todos[5].id, None);
        assert_eq!(todos[6].status, Status::Open);
        assert_eq!(todos[6].text, "Star bullet with odd marker");
        assert_eq!(todos[7].text, "Last line, no newline");
    }

    #[test]
    fn a_change_rewrites_only_that_todo() {
        let mut file = TodoFile::parse(MIXED);
        let n = now("2026-11-12");
        file.find_mut(&id("a1b2c3d4"))
            .unwrap()
            .set_status(Status::Done, &n);
        let old = "- [ ]   Buy milk   #home #errand ^high\n::id:: a1b2c3d4 ::updated:: 1760000000000 ::created:: 2026-10-01T08:00:00.000Z ::due:: 2026-11-10\n";
        let new = "- [x] Buy milk #home #errand ^high\n::updated:: 1800000000000 ::created:: 2026-10-01T08:00:00.000Z ::due:: 2026-11-10 ::id:: a1b2c3d4\n";
        assert!(MIXED.contains(old));
        assert_eq!(file.render(), MIXED.replacen(old, new, 1));
    }

    #[test]
    fn serializes_like_serialize_todos_with_the_id_last() {
        let mut t = Todo::new("Call mom", &now("2026-11-12"));
        t.tags = vec!["family".into()];
        t.milestone = Some("m1".into());
        t.priority = Some(Priority::UltraHigh);
        t.due = parse_due("2026-11-13T10:00");
        t.repeat = parse_repeat("every 2 weeks:fri");
        t.done_log = vec!["2026-11-01".into()];
        t.id = Some(id("0abcdefg"));
        t.note = vec!["hi".into()];
        t.note_ref = Some("a.md".into());
        assert_eq!(
            t.serialize(),
            "- [ ] Call mom #family !m1 ^ultra-high\n::updated:: 1800000000000 ::created:: 2027-01-15T08:00:00.000Z ::due:: 2026-11-13T10:00 ::repeat:: every 2 weeks:fri ::done:: 2026-11-01 ::id:: 0abcdefg\n  > hi\n  > ref:a.md\n"
        );
        let back = TodoFile::parse(&t.serialize());
        let mut parsed = back.todos().next().unwrap().clone();
        parsed.raw = None;
        assert_eq!(parsed, t);
    }

    #[test]
    fn appends_after_a_missing_final_newline_and_removes_cleanly() {
        let mut file = TodoFile::parse("- [ ] a\n::id:: aaaaaaaa\n\n- [ ] b");
        let mut t = Todo::new("c", &now("2026-11-12"));
        t.created = None;
        t.updated = None;
        file.push(t);
        assert_eq!(
            file.render(),
            "- [ ] a\n::id:: aaaaaaaa\n\n- [ ] b\n- [ ] c\n"
        );
        file.remove(&id("aaaaaaaa")).unwrap();
        assert_eq!(file.render(), "\n- [ ] b\n- [ ] c\n");
    }

    #[test]
    fn assigns_unique_ids_without_touching_updated() {
        let mut file =
            TodoFile::parse("- [ ] a\n- [ ] b\n::updated:: 5\n- [ ] c\n::id:: cccccccc\n");
        let mut taken: HashSet<TodoId> = [id("cccccccc")].into();
        assert_eq!(file.assign_ids(&mut taken), 2);
        let ids: HashSet<_> = file.todos().filter_map(|t| t.id.clone()).collect();
        assert_eq!(ids.len(), 3);
        assert_eq!(file.todos().nth(1).unwrap().updated, Some(5));
        assert_eq!(TodoFile::parse(&file.render()).todos().count(), 3);
        assert_eq!(file.assign_ids(&mut taken), 0);
    }

    #[test]
    fn ids_are_eight_base36_chars() {
        assert!(TodoId::parse("abc12345").is_some());
        for bad in ["ABC12345", "abc1234", "abc123456", "abc-1234"] {
            assert!(TodoId::parse(bad).is_none(), "{bad}");
        }
        let mut taken = HashSet::new();
        let fresh = TodoId::fresh(&mut taken);
        assert!(TodoId::parse(&fresh.to_string()).is_some());
    }

    #[test]
    fn parses_due_like_parse_due() {
        assert!(parse_due("2026-02-29").is_none());
        assert!(parse_due("2028-02-29").is_some());
        assert!(parse_due("2026-01-01T24:00").is_none());
        assert!(parse_due("2026-1-01").is_none());
        assert!(parse_due("0099-01-01").is_none());
        assert_eq!(
            parse_due("2026-01-01T07:05").unwrap().to_string(),
            "2026-01-01T07:05"
        );
    }

    #[test]
    fn parses_and_formats_repeat_rules_like_todo_repeat_ts() {
        for (input, canonical) in [
            ("daily", Some("daily")),
            ("Weekdays", Some("weekdays")),
            ("weekly:mon,fri", Some("weekly:mon,fri")),
            ("weekly:thu,mon,mon", Some("weekly:mon,thu")),
            ("weekly:mon,tue,wed,thu,fri", Some("weekdays")),
            ("every 2 weeks:fri", Some("every 2 weeks:fri")),
            ("every 1 day", Some("daily")),
            ("every 3 days", Some("every 3 days")),
            ("monthly:last", Some("monthly:last")),
            ("monthly:15", Some("monthly:15")),
            ("yearly:02-29", Some("yearly:02-29")),
            ("every 2 month", Some("every 2 months")),
            ("monthly:32", None),
            ("yearly:02-30", None),
            ("weekdays:mon", None),
            ("daily:mon", None),
            ("every 0 days", None),
            ("every 1000 days", None),
            ("every 2 weekss", None),
            ("every2 days", None),
            ("weekly:", None),
            ("hourly", None),
        ] {
            assert_eq!(
                parse_repeat(input).map(|r| r.to_string()).as_deref(),
                canonical,
                "{input}"
            );
        }
    }

    #[test]
    fn finds_the_next_occurrence_like_next_occurrence_date() {
        let next = |date_: &str, rule: &str, after: &str| {
            next_occurrence_date(date(date_), &parse_repeat(rule).unwrap(), date(after))
                .format("%Y-%m-%d")
                .to_string()
        };
        assert_eq!(next("2026-11-10", "daily", "2026-11-10"), "2026-11-11");
        assert_eq!(
            next("2026-11-01", "every 3 days", "2026-11-12"),
            "2026-11-13"
        );
        assert_eq!(next("2026-11-02", "weekly", "2026-11-12"), "2026-11-16");
        // Mon 2026-11-09; cycle weeks are counted from the due date's week.
        assert_eq!(
            next("2026-11-09", "every 2 weeks:fri", "2026-11-09"),
            "2026-11-13"
        );
        assert_eq!(
            next("2026-11-13", "every 2 weeks:fri", "2026-11-13"),
            "2026-11-27"
        );
        assert_eq!(next("2026-11-13", "weekdays", "2026-11-13"), "2026-11-16");
        assert_eq!(next("2026-01-31", "monthly:31", "2026-01-31"), "2026-02-28");
        assert_eq!(next("2026-02-28", "monthly:31", "2026-02-28"), "2026-03-31");
        assert_eq!(
            next("2026-01-15", "monthly:last", "2026-04-02"),
            "2026-04-30"
        );
        assert_eq!(
            next("2024-02-29", "yearly:02-29", "2024-02-29"),
            "2025-02-28"
        );
        assert_eq!(
            next("2025-02-28", "yearly:02-29", "2025-02-28"),
            "2026-02-28"
        );
        assert_eq!(
            next("2026-03-10", "every 2 years", "2026-03-10"),
            "2028-03-10"
        );
    }

    #[test]
    fn completing_a_recurring_todo_advances_it_like_complete_todo() {
        let mut file = TodoFile::parse(MIXED);
        let n = now("2026-11-12");
        let todo = file.todos_mut().nth(2).unwrap();
        todo.complete(&n);
        assert_eq!(todo.status, Status::Open);
        // Due Mon 2026-11-09 09:30, weekly mon/thu, today Thu 2026-11-12: next is Mon 11-16.
        assert_eq!(todo.due.as_ref().unwrap().to_string(), "2026-11-16T09:30");
        assert_eq!(todo.done_log, ["2026-11-02", "2026-11-05", "2026-11-12"]);
        assert_eq!(todo.updated, Some(n.ms));

        let mut t = Todo::new("pay rent", &n);
        t.repeat = parse_repeat("monthly");
        t.due = parse_due("2026-01-31");
        t.done_log = (0..30).map(|_| "2026-01-01".to_string()).collect();
        t.complete(&n);
        assert_eq!(t.repeat.as_ref().unwrap().to_string(), "monthly:31");
        assert_eq!(t.due.as_ref().unwrap().to_string(), "2026-11-30");
        assert_eq!(t.done_log.len(), DONE_LOG_LIMIT);
        assert_eq!(t.done_log.last().unwrap(), "2026-11-12");

        let mut plain = Todo::new("x", &n);
        plain.set_status(Status::Done, &n);
        assert_eq!(plain.status, Status::Done);
    }

    #[test]
    fn due_status_matches_due_status_ts() {
        let n = now("2026-11-12");
        let mut t = Todo::new("x", &n);
        for (due, expected) in [
            ("2026-11-11", Some("overdue")),
            ("2026-11-12", Some("today")),
            ("2026-11-12T11:59", Some("overdue")),
            ("2026-11-12T12:01", Some("today")),
            ("2026-11-13", Some("upcoming")),
        ] {
            t.due = parse_due(due);
            assert_eq!(t.due_status(&n), expected, "{due}");
        }
        t.status = Status::Done;
        assert_eq!(t.due_status(&n), None);
    }

    #[test]
    fn legacy_groups_become_tags() {
        let file = TodoFile::parse(LEGACY);
        assert!(file.legacy);
        let todos: Vec<_> = file.todos().collect();
        assert_eq!(todos[0].tags, ["work-stuff"]);
        assert_eq!(todos[1].tags, ["x", "home"]);
    }
}
