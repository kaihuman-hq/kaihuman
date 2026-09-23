//! The socket protocol between the palette daemon and its clients.
//!
//! Kept free of Tauri so `lifosy-palette-toggle`, which links only this, starts in a couple of
//! milliseconds instead of loading the ~130 shared libraries the WebKitGTK daemon needs.

use std::io::Write;
use std::os::unix::net::UnixStream;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Command {
    Toggle,
    Show,
    Hide,
    Quit,
    /// Start the daemon without showing anything, e.g. from Hyprland's autostart.
    Daemon,
}

impl Command {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "toggle" => Ok(Self::Toggle),
            "show" => Ok(Self::Show),
            "hide" => Ok(Self::Hide),
            "quit" => Ok(Self::Quit),
            "daemon" => Ok(Self::Daemon),
            other => Err(format!(
                "unknown command {other:?}; expected toggle, show, hide, quit or daemon"
            )),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Toggle => "toggle",
            Self::Show => "show",
            Self::Hide => "hide",
            Self::Quit => "quit",
            Self::Daemon => "daemon",
        }
    }

    /// Whether a missing daemon should be started for this command rather than reported.
    pub fn starts_daemon(self) -> bool {
        matches!(self, Self::Toggle | Self::Show | Self::Daemon)
    }
}

/// Milliseconds since the epoch: the one clock both the client and the daemon can read.
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

pub fn socket_path() -> PathBuf {
    // XDG_RUNTIME_DIR is per-user and mode 0700, so no other user can drive the palette.
    let dir = std::env::var_os("XDG_RUNTIME_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    dir.join("lifosy-palette.sock")
}

/// One request per connection: `<command> <client start in ms>\n`.
pub fn request_line(command: Command, sent_at: u64) -> String {
    format!("{} {sent_at}\n", command.as_str())
}

/// Reads a request line. A missing or unreadable timestamp is `None`, so a request from
/// `printf 'toggle\n' | nc -U …` still works; the daemon then times from receipt.
pub fn parse_request(line: &str) -> Option<(Result<Command, String>, Option<u64>)> {
    let mut parts = line.split_whitespace();
    let command = Command::parse(parts.next()?);
    let sent_at = parts.next().and_then(|t| t.parse().ok());
    Some((command, sent_at))
}

pub enum Delivery {
    Sent,
    /// Nothing listens on the socket: no daemon, or one that died and left the file behind.
    NoDaemon,
}

/// Hands `command` to a running daemon.
pub fn send(command: Command, sent_at: u64) -> std::io::Result<Delivery> {
    let Ok(mut stream) = UnixStream::connect(socket_path()) else {
        return Ok(Delivery::NoDaemon);
    };
    stream.write_all(request_line(command, sent_at).as_bytes())?;
    Ok(Delivery::Sent)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn commands_round_trip_through_the_request_line() {
        for command in [
            Command::Toggle,
            Command::Show,
            Command::Hide,
            Command::Quit,
            Command::Daemon,
        ] {
            let (parsed, sent_at) = parse_request(&request_line(command, 42)).unwrap();
            assert_eq!(parsed, Ok(command));
            assert_eq!(sent_at, Some(42));
        }
    }

    #[test]
    fn accepts_a_bare_command_without_a_timestamp() {
        let (parsed, sent_at) = parse_request("toggle\n").unwrap();
        assert_eq!(parsed, Ok(Command::Toggle));
        assert_eq!(sent_at, None);
    }

    #[test]
    fn reports_unknown_commands_and_ignores_empty_lines() {
        let (parsed, _) = parse_request("open 1").unwrap();
        assert!(parsed.unwrap_err().contains("toggle"));
        assert!(parse_request("  \n").is_none());
    }

    #[test]
    fn only_opening_commands_start_a_daemon() {
        assert!(Command::Toggle.starts_daemon());
        assert!(Command::Show.starts_daemon());
        assert!(!Command::Hide.starts_daemon());
        assert!(!Command::Quit.starts_daemon());
    }
}
