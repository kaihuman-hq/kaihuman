//! Running a filled-in command from a `.commands.md` file — the palette's `>x`, desktop only.
//!
//! The palette has already shown the exact command and the user has picked how to run it; this
//! only starts it. Both ways run it with bash from the home directory:
//! - **terminal**: in a ghostty window that shows the command and its output and stays open, with
//!   the exit status, until a key is pressed — as omarchy's `omarchy-show-commands` does;
//! - **background**: detached, with a notification saying how it ended.

use std::path::PathBuf;
use std::process::{Command, Stdio};

use serde::Deserialize;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Where {
    Terminal,
    Background,
}

/// Run by bash inside ghostty with the command as `$1`, so it needs no quoting of its own.
const TERMINAL_SCRIPT: &str = r#"printf '$ %s\n\n' "$1"; eval "$1"; status=$?; echo; read -n 1 -s -r -p "[exit $status] Press any key to close""#;

fn home() -> PathBuf {
    PathBuf::from(std::env::var_os("HOME").unwrap_or_default())
}

pub fn run(command: &str, place: Where) -> Result<(), String> {
    if command.trim().is_empty() {
        return Err("There is no command to run".into());
    }
    match place {
        Where::Terminal => {
            let mut child = Command::new("ghostty")
                .args([
                    "-e",
                    "bash",
                    "-c",
                    TERMINAL_SCRIPT,
                    "lifosy-command",
                    command,
                ])
                .current_dir(home())
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|error| format!("Could not start ghostty ({error}) — is it installed?"))?;
            // Reaped in the background, so the palette can close at once.
            std::thread::spawn(move || child.wait());
        }
        Where::Background => {
            let command = command.to_string();
            std::thread::spawn(move || crate::notify(&run_and_describe(&command)));
        }
    }
    Ok(())
}

/// Runs the command to its end and says how it went, for the notification.
pub fn run_and_describe(command: &str) -> String {
    let first_line = command.lines().next().unwrap_or_default();
    match Command::new("bash")
        .args(["-c", command])
        .current_dir(home())
        .stdin(Stdio::null())
        .output()
    {
        Ok(output) if output.status.success() => format!("✓ {first_line}"),
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let reason = stderr.lines().rev().find(|line| !line.trim().is_empty());
            let code = output
                .status
                .code()
                .map_or("a signal".to_string(), |code| format!("exit {code}"));
            match reason {
                Some(reason) => format!("✗ {first_line} — {code}: {}", reason.trim()),
                None => format!("✗ {first_line} — {code}"),
            }
        }
        Err(error) => format!("✗ {first_line} — could not start bash: {error}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn describes_how_a_command_ended() {
        assert_eq!(run_and_describe("true"), "✓ true");
        assert_eq!(run_and_describe("exit 3"), "✗ exit 3 — exit 3");
        assert_eq!(
            run_and_describe("echo first >&2; echo oops >&2; exit 1"),
            "✗ echo first >&2; echo oops >&2; exit 1 — exit 1: oops"
        );
        assert_eq!(run_and_describe("true\nfalse"), "✗ true — exit 1");
    }

    #[test]
    fn runs_from_the_home_directory() {
        let home = home();
        let check = format!("test \"$PWD\" = '{}'", home.display());
        assert!(run_and_describe(&check).starts_with('✓'));
    }

    #[test]
    fn refuses_an_empty_command() {
        assert_eq!(
            run("  ", Where::Background).unwrap_err(),
            "There is no command to run"
        );
    }

    #[test]
    fn hands_the_command_to_the_terminal_script_as_an_argument() {
        // What ghostty runs, minus ghostty: the command arrives as $1, quotes and all.
        let output = Command::new("bash")
            .args([
                "-c",
                TERMINAL_SCRIPT.split("; echo;").next().unwrap(),
                "lifosy-command",
                "echo \"it's $((1 + 1))\"",
            ])
            .output()
            .unwrap();
        assert_eq!(
            String::from_utf8_lossy(&output.stdout),
            "$ echo \"it's $((1 + 1))\"\n\nit's 2\n"
        );
    }
}
