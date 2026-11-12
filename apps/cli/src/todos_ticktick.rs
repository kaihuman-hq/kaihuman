//! TickTick backup CSV → `NewTodo`s (spec: "TickTick import mapping"). Pure: no I/O, so the
//! mapping is testable; `todos_cli::import` plans and writes with it.

use anyhow::{Result, bail};
use chrono::{DateTime, FixedOffset, NaiveDateTime, TimeZone, Utc};
use chrono_tz::Tz;

use crate::todos_cli::NewTodo;

/// Rows are 0 open, 1 or 2 done (exports differ), -1 won't do.
const CLOSED: [&str; 3] = ["1", "2", "-1"];

/// FNV-1a over the TickTick taskId, as 8 base36 characters: the same task always gets the same id.
fn stable_id(key: &str) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in key.bytes() {
        h ^= u64::from(b);
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    let mut out = [b'0'; 8];
    for slot in out.iter_mut().rev() {
        *slot = b"0123456789abcdefghijklmnopqrstuvwxyz"[(h % 36) as usize];
        h /= 36;
    }
    String::from_utf8(out.to_vec()).expect("ascii")
}

/// `Inbox` (or no list) → the inbox; any other name → a file-name slug.
fn list_of(name: &str) -> String {
    let name = name.trim();
    if name.is_empty() || name.eq_ignore_ascii_case("inbox") {
        return "inbox".into();
    }
    let slug = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    // A path segment must stay ASCII-safe for the todo list resolver; names with no letters
    // (emoji, symbols) share one list instead of failing the import.
    if slug.is_empty() || !slug.is_ascii() {
        "imported".into()
    } else {
        slug
    }
}

fn tag_of(raw: &str) -> Option<String> {
    let tag: String = raw
        .trim()
        .trim_start_matches('#')
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let tag = tag.trim_matches('-').to_string();
    (!tag.is_empty()).then_some(tag)
}

/// `2026-11-12T09:00:00+0000` (also `+00:00`, `Z`) → a fixed-offset instant.
fn parse_instant(raw: &str) -> Option<DateTime<FixedOffset>> {
    let raw = raw.trim();
    ["%Y-%m-%dT%H:%M:%S%.f%z", "%Y-%m-%dT%H:%M:%S%.f%:z"]
        .iter()
        .find_map(|f| DateTime::parse_from_str(raw, f).ok())
        .or_else(|| DateTime::parse_from_rfc3339(raw).ok())
        .or_else(|| {
            NaiveDateTime::parse_from_str(raw, "%Y-%m-%dT%H:%M:%S")
                .ok()
                .map(|n| Utc.from_utc_datetime(&n).fixed_offset())
        })
}

/// The due value: local `YYYY-MM-DD`, or `YYYY-MM-DDTHH:MM`. The task's own `Timezone` wins; the
/// zone of `fallback` (the machine's, in production) covers exports without one.
fn due_of<F: TimeZone>(raw: &str, all_day: bool, tz_name: &str, fallback: &F) -> Option<String>
where
    F::Offset: std::fmt::Display,
{
    let at = parse_instant(raw)?;
    let local = match tz_name.trim().parse::<Tz>() {
        Ok(tz) => at.with_timezone(&tz).naive_local(),
        Err(_) => at.with_timezone(fallback).naive_local(),
    };
    Some(if all_day {
        local.format("%Y-%m-%d").to_string()
    } else {
        local.format("%Y-%m-%dT%H:%M").to_string()
    })
}

/// A repeat rule `todo-repeat.ts` supports, from a TickTick RRULE; `None` for anything else.
fn repeat_of(raw: &str) -> Option<String> {
    let rule = raw.trim().strip_prefix("RRULE:").unwrap_or(raw.trim());
    let part = |key: &str| {
        rule.split(';')
            .find_map(|p| p.strip_prefix(key)?.strip_prefix('='))
    };
    let interval: u32 = part("INTERVAL").map_or(Some(1), |i| i.parse().ok())?;
    let every = |unit: &str| {
        if interval == 1 {
            None
        } else {
            Some(format!("every {interval} {unit}"))
        }
    };
    let freq = part("FREQ")?;
    // A key this mapping would drop (COUNT, BYSETPOS, a BYDAY on a monthly rule…) changes the rule.
    let allowed: &[&str] = match freq {
        "DAILY" => &["FREQ", "INTERVAL"],
        "WEEKLY" => &["FREQ", "INTERVAL", "BYDAY"],
        "MONTHLY" => &["FREQ", "INTERVAL", "BYMONTHDAY"],
        "YEARLY" => &["FREQ", "INTERVAL", "BYMONTH", "BYMONTHDAY"],
        _ => return None,
    };
    if rule
        .split(';')
        .any(|p| !allowed.contains(&p.split('=').next().unwrap_or("")))
    {
        return None;
    }
    let candidate = match freq {
        "DAILY" => every("days").unwrap_or_else(|| "daily".into()),
        "WEEKLY" => {
            let days: Option<Vec<&str>> = part("BYDAY").map(|d| {
                d.split(',')
                    .map(|d| match d {
                        "MO" => "mon",
                        "TU" => "tue",
                        "WE" => "wed",
                        "TH" => "thu",
                        "FR" => "fri",
                        "SA" => "sat",
                        "SU" => "sun",
                        _ => "?",
                    })
                    .collect()
            });
            match days {
                Some(d) if interval == 1 && d == ["mon", "tue", "wed", "thu", "fri"] => {
                    "weekdays".into()
                }
                Some(d) => format!(
                    "{}:{}",
                    every("weeks").unwrap_or_else(|| "weekly".into()),
                    d.join(",")
                ),
                None => every("weeks").unwrap_or_else(|| "weekly".into()),
            }
        }
        "MONTHLY" => {
            let base = every("months").unwrap_or_else(|| "monthly".into());
            match part("BYMONTHDAY") {
                Some("-1") => format!("{base}:last"),
                Some(d) => format!("{base}:{d}"),
                None => base,
            }
        }
        "YEARLY" => {
            let base = every("years").unwrap_or_else(|| "yearly".into());
            match (part("BYMONTH"), part("BYMONTHDAY")) {
                (Some(m), Some(d)) => format!("{base}:{m:0>2}-{d:0>2}"),
                _ => base,
            }
        }
        _ => return None,
    };
    crate::todos::parse_repeat(&candidate).map(|_| candidate)
}

/// What the import left out, for the plan.
#[derive(Debug, Default, PartialEq)]
pub struct Parsed {
    pub todos: Vec<NewTodo>,
    /// Completed or won't-do rows, left out because `--include-done` was not given.
    pub excluded_done: usize,
}

/// Rows of the CSV after the preamble: the header row starts with `Folder Name` or holds both
/// `List Name` and `Title`.
fn rows(csv: &str) -> Result<(Vec<String>, Vec<csv::StringRecord>)> {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_reader(csv.trim_start_matches('\u{feff}').as_bytes());
    let mut records = reader.records();
    while let Some(record) = records.next() {
        let record = record?;
        let has = |n: &str| record.iter().any(|f| f.trim() == n);
        if record.get(0).map(str::trim) == Some("Folder Name") || (has("List Name") && has("Title"))
        {
            let header = record.iter().map(|f| f.trim().to_string()).collect();
            return Ok((header, records.collect::<Result<_, _>>()?));
        }
    }
    bail!("not a TickTick backup: no header row with \"List Name\" and \"Title\" found")
}

pub fn parse<F: TimeZone>(csv: &str, include_done: bool, fallback: &F) -> Result<Parsed>
where
    F::Offset: std::fmt::Display,
{
    let (header, records) = rows(csv)?;
    let col = |n: &str| header.iter().position(|h| h == n);
    if col("Title").is_none() {
        bail!("not a TickTick backup: no \"Title\" column");
    }
    let mut out = Parsed::default();
    for r in &records {
        let get = |n: &str| col(n).and_then(|i| r.get(i)).map_or("", str::trim);
        let title = get("Title");
        if title.is_empty() {
            continue;
        }
        let status = get("Status");
        let closed = CLOSED.contains(&status);
        if closed && !include_done {
            out.excluded_done += 1;
            continue;
        }
        let mut tags: Vec<String> = get("Tags").split(',').filter_map(tag_of).collect();
        let mut note: Vec<String> = r
            .get(col("Content").unwrap_or(usize::MAX))
            .unwrap_or("")
            .lines()
            .map(String::from)
            .collect();
        let repeat = match get("Repeat") {
            "" => None,
            raw => repeat_of(raw).or_else(|| {
                tags.push("repeat-unmapped".into());
                note.push(format!("TickTick repeat: {raw}"));
                None
            }),
        };
        let created = parse_instant(get("Created Time"));
        let all_day = matches!(
            get("Is All Day").to_lowercase().as_str(),
            "true" | "1" | "yes"
        );
        let task_id = get("taskId");
        tags.dedup();
        out.todos.push(NewTodo {
            text: title.to_string(),
            list: Some(list_of(get("List Name"))),
            due: due_of(get("Due Date"), all_day, get("Timezone"), fallback),
            tags,
            priority: match get("Priority") {
                "5" => Some("super-high".into()),
                "3" => Some("high".into()),
                _ => None,
            },
            repeat,
            note: (!note.is_empty()).then(|| note.join("\n")),
            id: Some(stable_id(&if task_id.is_empty() {
                format!(
                    "{}\u{1f}{title}\u{1f}{}",
                    get("List Name"),
                    get("Created Time")
                )
            } else {
                task_id.to_string()
            })),
            status: Some(
                match status {
                    "1" | "2" => "done",
                    "-1" => "rejected",
                    _ => "open",
                }
                .into(),
            ),
            created: created.map(|c| {
                c.with_timezone(&Utc)
                    .format("%Y-%m-%dT%H:%M:%S%.3fZ")
                    .to_string()
            }),
            updated: created.map(|c| c.timestamp_millis()),
        });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("../tests/fixtures/ticktick.csv");

    fn utc() -> FixedOffset {
        FixedOffset::east_opt(0).unwrap()
    }

    fn by_text<'a>(p: &'a Parsed, text: &str) -> &'a NewTodo {
        p.todos
            .iter()
            .find(|t| t.text == text)
            .unwrap_or_else(|| panic!("no todo {text}"))
    }

    #[test]
    fn skips_the_preamble_and_closed_rows_by_default() {
        let p = parse(FIXTURE, false, &utc()).unwrap();
        assert_eq!(p.todos.len(), 7);
        assert_eq!(p.excluded_done, 3);
        assert!(p.todos.iter().all(|t| t.status.as_deref() == Some("open")));
    }

    #[test]
    fn include_done_keeps_done_and_rejected() {
        let p = parse(FIXTURE, true, &utc()).unwrap();
        assert_eq!(p.todos.len(), 10);
        let status = |t: &str| by_text(&p, t).status.clone().unwrap();
        assert_eq!(status("Done with 2"), "done");
        assert_eq!(status("Done with 1"), "done");
        assert_eq!(status("Won't do"), "rejected");
    }

    #[test]
    fn maps_lists_tags_priority_and_multiline_content() {
        let p = parse(FIXTURE, false, &utc()).unwrap();
        let t = by_text(&p, "Plan, \"big\" trip");
        assert_eq!(t.list.as_deref(), Some("travel-2027"));
        assert_eq!(t.tags, ["trip", "fun-stuff"]);
        assert_eq!(t.priority.as_deref(), Some("super-high"));
        assert_eq!(t.note.as_deref(), Some("Book flights\nAsk Sam about hotel"));
        assert_eq!(by_text(&p, "Buy milk").list.as_deref(), Some("inbox"));
        assert_eq!(by_text(&p, "Call mom").priority.as_deref(), Some("high"));
        assert_eq!(by_text(&p, "Buy milk").priority, None);
    }

    #[test]
    fn converts_due_dates_to_the_task_timezone() {
        let p = parse(FIXTURE, false, &utc()).unwrap();
        // 2026-11-11T23:00Z is already the 12th in Berlin; an all-day task keeps only the date.
        assert_eq!(by_text(&p, "Call mom").due.as_deref(), Some("2026-11-12"));
        assert_eq!(
            by_text(&p, "Dentist").due.as_deref(),
            Some("2026-11-12T10:30")
        );
        assert_eq!(by_text(&p, "Buy milk").due, None);
    }

    #[test]
    fn without_a_timezone_column_value_the_fallback_zone_is_used() {
        let p = parse(FIXTURE, false, &FixedOffset::east_opt(9 * 3600).unwrap()).unwrap();
        assert_eq!(
            by_text(&p, "Water plants").due.as_deref(),
            Some("2026-11-13T07:00")
        );
    }

    #[test]
    fn maps_supported_repeats_and_flags_the_rest() {
        let p = parse(FIXTURE, false, &utc()).unwrap();
        assert_eq!(
            by_text(&p, "Water plants").repeat.as_deref(),
            Some("every 2 weeks:fri")
        );
        assert_eq!(by_text(&p, "Standup").repeat.as_deref(), Some("weekdays"));
        let odd = by_text(&p, "Pay rent");
        assert_eq!(odd.repeat, None);
        assert!(odd.tags.contains(&"repeat-unmapped".to_string()));
        assert!(
            odd.note
                .as_deref()
                .unwrap()
                .contains("FREQ=MONTHLY;BYSETPOS=1")
        );
    }

    #[test]
    fn repeat_forms() {
        let r = |s: &str| repeat_of(s);
        assert_eq!(r("RRULE:FREQ=DAILY;INTERVAL=1").as_deref(), Some("daily"));
        assert_eq!(r("FREQ=DAILY;INTERVAL=3").as_deref(), Some("every 3 days"));
        assert_eq!(
            r("FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TH").as_deref(),
            Some("weekly:mon,thu")
        );
        assert_eq!(
            r("FREQ=MONTHLY;BYMONTHDAY=15").as_deref(),
            Some("monthly:15")
        );
        assert_eq!(
            r("FREQ=MONTHLY;BYMONTHDAY=-1").as_deref(),
            Some("monthly:last")
        );
        assert_eq!(
            r("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29").as_deref(),
            Some("yearly:02-29")
        );
        assert_eq!(r("FREQ=HOURLY"), None);
        assert_eq!(r("FREQ=WEEKLY;BYDAY=XX"), None);
    }

    #[test]
    fn ids_are_stable_and_valid() {
        let a = parse(FIXTURE, true, &utc()).unwrap();
        let b = parse(FIXTURE, true, &utc()).unwrap();
        assert_eq!(a, b);
        let mut ids: Vec<_> = a.todos.iter().map(|t| t.id.clone().unwrap()).collect();
        assert!(ids.iter().all(|i| crate::todos::TodoId::parse(i).is_some()));
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), a.todos.len());
    }

    #[test]
    fn keeps_created_time_as_iso_and_updated_as_ms() {
        let p = parse(FIXTURE, false, &utc()).unwrap();
        let t = by_text(&p, "Buy milk");
        assert_eq!(t.created.as_deref(), Some("2026-10-01T08:15:00.000Z"));
        assert_eq!(t.updated, Some(1_790_842_500_000));
    }

    #[test]
    fn rejects_a_file_that_is_not_a_ticktick_backup() {
        assert!(parse("a,b\n1,2\n", false, &utc()).is_err());
    }
}
