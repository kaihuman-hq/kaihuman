//! `lifosy-palette`: the Lifosy command palette as a desktop overlay.
//!
//! One resident daemon keeps the palette's webview loaded and hidden, so opening it is only showing
//! a window. `lifosy-palette-toggle` — the binary to bind to a key — and the commands below reach
//! it over a Unix socket (see `lib.rs`). The window is a wlr-layer-shell overlay covering the
//! focused output, which the compositor places above the tiled layout (see `layer.rs`).

mod bookmarks;
mod config;
mod github;
#[cfg(target_os = "linux")]
mod layer;
mod recents;
mod requests;

use std::io::{BufRead, BufReader, IsTerminal};
use std::os::unix::net::UnixListener;
use std::sync::Mutex;

use desktop_palette::{Command, Delivery, now_ms, parse_request, send, socket_path};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const LABEL: &str = "palette";

const USAGE: &str = "\
usage: lifosy-palette [toggle|show|hide|quit|daemon]
       lifosy-palette login [--repo owner/name]
       lifosy-palette logout

Bind `lifosy-palette-toggle` to a key; it starts the daemon when none is running.";

#[derive(Debug, PartialEq)]
enum Cli {
    Palette(Command),
    Login { repo: Option<String> },
    Logout,
}

fn parse_args(args: impl IntoIterator<Item = String>) -> Result<Cli, String> {
    let mut args = args.into_iter();
    let Some(first) = args.next() else {
        return Ok(Cli::Palette(Command::Toggle));
    };
    let cli = match first.as_str() {
        "login" => {
            let mut repo = None;
            while let Some(arg) = args.next() {
                match arg.as_str() {
                    "--repo" => repo = Some(args.next().ok_or("--repo needs owner/name")?),
                    other => return Err(format!("unexpected {other:?}\n\n{USAGE}")),
                }
            }
            if let Some(repo) = &repo
                && !config::is_repo_name(repo)
            {
                return Err(format!("{repo} is not an owner/name repository"));
            }
            return Ok(Cli::Login { repo });
        }
        "logout" => Cli::Logout,
        "-h" | "--help" => return Err(USAGE.to_string()),
        other => {
            Cli::Palette(Command::parse(other).map_err(|error| format!("{error}\n\n{USAGE}"))?)
        }
    };
    match args.next() {
        Some(extra) => Err(format!("unexpected {extra:?}\n\n{USAGE}")),
        None => Ok(cli),
    }
}

/// Reads a token without echoing it when typed; a piped one (`pass github | lifosy-palette login`)
/// is read as the first line of stdin.
fn read_token() -> Result<String, String> {
    let token = if std::io::stdin().is_terminal() {
        rpassword::prompt_password("GitHub token (needs contents read/write on the repo): ")
            .map_err(|error| format!("could not read the token: {error}"))?
    } else {
        let mut line = String::new();
        std::io::stdin()
            .read_line(&mut line)
            .map_err(|error| format!("could not read the token: {error}"))?;
        line
    };
    let token = token.trim().to_string();
    if token.is_empty() {
        return Err("no token given".into());
    }
    Ok(token)
}

/// Checks the token against the repository before storing anything.
fn login(repo: Option<String>) -> Result<(), String> {
    let mut settings = config::Settings::load();
    let repo = repo.unwrap_or_else(|| settings.repo());
    let token = read_token()?;
    let client = github::Client::new(token.clone(), repo.clone());
    tauri::async_runtime::block_on(client.can_read_repo())?;
    config::store_token(&token)?;
    settings.use_repo(&repo);
    settings.save()?;
    println!("Logged in; the palette now works on {repo}.");
    Ok(())
}

fn palette(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(LABEL)
}

/// Maps the window, then tells the webview to open the palette, which focuses its input.
fn show(app: &AppHandle) {
    let Some(window) = palette(app) else {
        eprintln!("palette window is missing");
        return;
    };
    if let Err(error) = window.show() {
        eprintln!("could not show the palette: {error}");
        return;
    }
    let _ = window.set_focus();
    if let Err(error) = window.emit("palette:show", ()) {
        eprintln!("could not open the palette: {error}");
    }
}

/// Unmaps at once; the webview closes the palette too, so the next show starts fresh.
fn hide(app: &AppHandle) {
    if let Some(window) = palette(app) {
        let _ = window.hide();
        let _ = window.emit("palette:hide", ());
    }
}

fn toggle(app: &AppHandle) {
    let visible = palette(app)
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false);
    if visible { hide(app) } else { show(app) }
}

fn dispatch(app: &AppHandle, command: Command) {
    match command {
        Command::Toggle => toggle(app),
        Command::Show => show(app),
        Command::Hide => hide(app),
        Command::Quit => {
            let _ = std::fs::remove_file(socket_path());
            app.exit(0);
        }
        Command::Daemon => {}
    }
}

/// Serves one request line per connection.
fn serve(listener: UnixListener, app: AppHandle) {
    for stream in listener.incoming() {
        let Ok(stream) = stream else { continue };
        let mut line = String::new();
        if BufReader::new(stream).read_line(&mut line).is_err() {
            continue;
        }
        match parse_request(&line) {
            Some((Ok(command), _)) => dispatch(&app, command),
            Some((Err(error), _)) => eprintln!("ignoring request: {error}"),
            None => {}
        }
    }
}

/// Everything the palette asks of its backend: `PaletteProtocol`, answered in `requests.rs`.
#[tauri::command]
async fn palette_request(request: serde_json::Value) -> Result<serde_json::Value, String> {
    requests::handle(request).await
}

/// The palette closed itself (Esc, a click outside, or after opening something).
#[tauri::command]
fn hide_palette(app: AppHandle) {
    if let Some(window) = palette(&app) {
        let _ = window.hide();
    }
}

/// A show that arrived before the page could listen for it: the daemon's own first command.
struct PendingShow(Mutex<bool>);

#[tauri::command]
fn webview_ready(app: AppHandle, pending: tauri::State<PendingShow>) {
    let due = pending
        .0
        .lock()
        .map(|mut slot| std::mem::take(&mut *slot))
        .unwrap_or(false);
    if due {
        show(&app);
    }
}

fn build_palette(app: &AppHandle) -> Result<WebviewWindow, Box<dyn std::error::Error>> {
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("lifosy-palette")
        .inner_size(620.0, 420.0)
        .decorations(false)
        .transparent(true)
        // Hyprland 0.56 was seen to lose transparency on resizable layer surfaces.
        .resizable(false)
        .skip_taskbar(true)
        // A layer surface must be configured before it is first mapped, so it starts hidden.
        .visible(false)
        .build()?;

    #[cfg(target_os = "linux")]
    {
        if layer::is_supported() {
            layer::configure(&window.gtk_window()?);
        } else {
            // GNOME and X11: an ordinary window, which the window manager places itself.
            eprintln!(
                "this compositor has no wlr-layer-shell; the palette opens as a normal window"
            );
        }
    }

    let for_events = window.clone();
    window.on_window_event(move |event| {
        // The daemon keeps the webview warm: closing only hides it.
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = for_events.hide();
        }
    });
    Ok(window)
}

fn run_daemon(first: Command, listener: UnixListener) {
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            palette_request,
            hide_palette,
            webview_ready
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            build_palette(&handle)?;
            handle.manage(PendingShow(Mutex::new(matches!(
                first,
                Command::Toggle | Command::Show
            ))));
            std::thread::spawn(move || serve(listener, handle));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("could not start the palette");

    app.run(|_, event| {
        if let tauri::RunEvent::Exit = event {
            let _ = std::fs::remove_file(socket_path());
        }
    });
}

fn main() {
    let cli = match parse_args(std::env::args().skip(1)) {
        Ok(cli) => cli,
        Err(message) => {
            eprintln!("{message}");
            std::process::exit(2);
        }
    };
    let command = match cli {
        Cli::Login { repo } => {
            if let Err(error) = login(repo) {
                eprintln!("{error}");
                std::process::exit(1);
            }
            return;
        }
        Cli::Logout => {
            if let Err(error) = config::forget_token() {
                eprintln!("{error}");
                std::process::exit(1);
            }
            println!("Logged out.");
            return;
        }
        Cli::Palette(command) => command,
    };

    // A daemon is running: hand it the command. `lifosy-palette-toggle` does the same, faster.
    match send(command, now_ms()) {
        Ok(Delivery::Sent) => return,
        Ok(Delivery::NoDaemon) if command.starts_daemon() => {}
        Ok(Delivery::NoDaemon) => {
            eprintln!("the palette daemon is not running");
            return;
        }
        Err(error) => {
            eprintln!("could not reach the palette daemon: {error}");
            std::process::exit(1);
        }
    }

    let path = socket_path();
    // Nothing answered, so whatever file is there is left over from a daemon that died.
    let _ = std::fs::remove_file(&path);
    let listener = match UnixListener::bind(&path) {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!("could not listen on {}: {error}", path.display());
            std::process::exit(1);
        }
    };

    // GTK prefers X11 when both are there; the overlay needs Wayland.
    if std::env::var_os("WAYLAND_DISPLAY").is_some() && std::env::var_os("GDK_BACKEND").is_none() {
        // SAFETY: no other thread exists yet.
        unsafe { std::env::set_var("GDK_BACKEND", "wayland") };
    }

    run_daemon(command, listener);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Result<Cli, String> {
        parse_args(list.iter().map(|arg| arg.to_string()))
    }

    #[test]
    fn toggles_by_default_and_reads_palette_commands() {
        assert_eq!(args(&[]), Ok(Cli::Palette(Command::Toggle)));
        assert_eq!(args(&["daemon"]), Ok(Cli::Palette(Command::Daemon)));
        assert!(args(&["show", "extra"]).is_err());
        assert!(args(&["open"]).unwrap_err().contains("expected toggle"));
    }

    #[test]
    fn reads_login_with_an_optional_repository() {
        assert_eq!(args(&["login"]), Ok(Cli::Login { repo: None }));
        assert_eq!(
            args(&["login", "--repo", "o/r"]),
            Ok(Cli::Login {
                repo: Some("o/r".into())
            })
        );
        assert!(args(&["login", "--repo"]).is_err());
        assert!(args(&["login", "--repo", "../x"]).is_err());
        assert_eq!(args(&["logout"]), Ok(Cli::Logout));
    }
}
