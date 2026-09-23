//! The binary to bind to a key: sends one command to the palette daemon and exits.
//!
//! It links only the socket protocol, not Tauri, so it starts in a few milliseconds. When no daemon
//! is running it starts one — the full `lifosy-palette-spike` next to this binary — which then
//! shows the palette itself.

use desktop_palette_spike::{Command, Delivery, now_ms, send};

const DAEMON_BINARY: &str = "lifosy-palette-spike";

fn main() {
    let sent_at = now_ms();
    let command = match std::env::args().nth(1).as_deref() {
        None => Command::Toggle,
        Some("daemon") => fail("use `lifosy-palette-spike daemon` to start the daemon itself"),
        Some(arg) => Command::parse(arg).unwrap_or_else(|message| fail(&message)),
    };

    match send(command, sent_at) {
        Ok(Delivery::Sent) => {}
        Ok(Delivery::NoDaemon) if command.starts_daemon() => start_daemon(command),
        Ok(Delivery::NoDaemon) => eprintln!("the palette daemon is not running"),
        Err(error) => fail(&format!("could not reach the palette daemon: {error}")),
    }
}

/// Starts the daemon with the same command, so a cold `toggle` still ends with the palette open.
/// The daemon keeps running after this process exits.
fn start_daemon(command: Command) {
    let daemon = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join(DAEMON_BINARY)))
        .filter(|path| path.is_file())
        .unwrap_or_else(|| fail(&format!("{DAEMON_BINARY} is not next to this binary")));
    if let Err(error) = std::process::Command::new(&daemon)
        .arg(command.as_str())
        .stdin(std::process::Stdio::null())
        .spawn()
    {
        fail(&format!("could not start {}: {error}", daemon.display()));
    }
}

fn fail(message: &str) -> ! {
    eprintln!("{message}");
    std::process::exit(1);
}
