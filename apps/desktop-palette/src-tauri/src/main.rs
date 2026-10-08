//! `lifosy-palette`: the Lifosy command palette as a desktop overlay.
//!
//! One resident daemon keeps the palette's webview loaded and hidden, so opening it is only showing
//! a window. `lifosy-palette-toggle` — the binary to bind to a key — and the commands below reach
//! it over a Unix socket (see `lib.rs`). The window is a wlr-layer-shell overlay covering the
//! focused output, which the compositor places above the tiled layout (see `layer.rs`).

mod bookmarks;
mod braindumps;
mod claude;
mod commands;
mod config;
mod console_login;
mod dumps;
mod entries;
mod files;
mod github;
#[cfg(target_os = "linux")]
mod layer;
mod native_host;
mod palette_settings;
mod prompts;
mod recents;
mod repos;
mod requests;
mod translate;
mod wifi;

use std::io::{BufRead, BufReader, IsTerminal, Write};
use std::os::unix::net::UnixListener;
use std::sync::Mutex;

use desktop_palette::{Command, Delivery, now_ms, parse_request, send, socket_path};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const LABEL: &str = "palette";

/// The braindump window (doc/braindump.md).
const BRAINDUMP: &str = "braindump";

/// What a compositor rule matches to float the braindump window (see the README), so it never
/// changes; the window shows the braindump's own title inside.
const BRAINDUMP_TITLE: &str = "lifosy-braindump";

const USAGE: &str = "\
usage: lifosy-palette [toggle|show|hide|quit|daemon|braindump]
       lifosy-palette login [--paste] [--repo owner/name]
       lifosy-palette logout
       lifosy-palette native-host install <extension id>

`login` opens the console in your browser and takes the token from there; `--paste` asks for one
instead (or reads it from a pipe). `native-host install` lets the browser extension keep the same
repository as the palette; the id is on chrome://extensions.

Bind `lifosy-palette-toggle` to a key, and `lifosy-palette-toggle braindump` to another for a new
braindump; either starts the daemon when none is running.";

#[derive(Debug, PartialEq)]
enum Cli {
    Palette(Command),
    Login {
        repo: Option<String>,
        paste: bool,
    },
    Logout,
    InstallNativeHost {
        extension_id: String,
    },
    /// Chrome started this binary for the extension, naming it as the first argument.
    NativeHost,
}

fn parse_args(args: impl IntoIterator<Item = String>) -> Result<Cli, String> {
    let mut args = args.into_iter();
    let Some(first) = args.next() else {
        return Ok(Cli::Palette(Command::Toggle));
    };
    let cli = match first.as_str() {
        "login" => {
            let (mut repo, mut paste) = (None, false);
            while let Some(arg) = args.next() {
                match arg.as_str() {
                    "--repo" => repo = Some(args.next().ok_or("--repo needs owner/name")?),
                    "--paste" => paste = true,
                    other => return Err(format!("unexpected {other:?}\n\n{USAGE}")),
                }
            }
            if let Some(repo) = &repo
                && !config::is_repo_name(repo)
            {
                return Err(format!("{repo} is not an owner/name repository"));
            }
            return Ok(Cli::Login { repo, paste });
        }
        "logout" => Cli::Logout,
        "native-host" => match (args.next().as_deref(), args.next()) {
            (Some("install"), Some(extension_id)) => Cli::InstallNativeHost { extension_id },
            _ => {
                return Err(format!(
                    "native-host needs: install <extension id>\n\n{USAGE}"
                ));
            }
        },
        origin if origin.starts_with("chrome-extension://") => return Ok(Cli::NativeHost),
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

/// Opens the console's `/auth/cli` page and waits for it to hand the token back.
fn console_grant() -> Result<console_login::Grant, String> {
    let pending = console_login::Pending::start()?;
    let url = pending.authorize_url()?;
    requests::open_in_browser(&url)?;
    eprintln!("Waiting for the console in your browser… (or open {url})");
    pending.wait(console_login::TIMEOUT)
}

/// Checks the token against the repository before storing anything. The repository is, in order:
/// the one asked for, the one the console had selected, the one in use.
async fn store_login(
    token: String,
    requested: Option<String>,
    from_console: Option<String>,
) -> Result<String, String> {
    let mut settings = config::Settings::load();
    let repo = requested
        .or(from_console.filter(|repo| config::is_repo_name(repo)))
        .unwrap_or_else(|| settings.repo());
    github::Client::new(token.clone(), repo.clone())
        .can_read_repo()
        .await?;
    config::store_token(&token)?;
    settings.use_repo(&repo, now_ms());
    settings.save()?;
    Ok(format!("Logged in; the palette now works on {repo}."))
}

fn login(repo: Option<String>, paste: bool) -> Result<(), String> {
    let (token, from_console) = if paste {
        (read_token()?, None)
    } else {
        let grant = console_grant()?;
        (grant.token, grant.repo)
    };
    let message = tauri::async_runtime::block_on(store_login(token, repo, from_console))?;
    println!("{message}");
    Ok(())
}

/// Best effort: the overlay is hidden while the browser has the screen, so the outcome of a
/// palette login goes to the notification daemon (mako, dunst, swaync…) if there is one.
fn notify(message: &str) {
    let _ = std::process::Command::new("notify-send")
        .args(["--app-name=lifosy-palette", "Lifosy palette", message])
        .spawn()
        .map(|mut child| std::thread::spawn(move || child.wait()));
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

/// Shows the braindump window with that braindump, or a new one. The palette is hidden first: it
/// holds the keyboard while it is up.
fn open_braindump(app: &AppHandle, id: Option<String>) {
    hide(app);
    let Some(window) = app.get_webview_window(BRAINDUMP) else {
        eprintln!("braindump window is missing");
        return;
    };
    if let Err(error) = window.show() {
        eprintln!("could not show the braindump window: {error}");
        return;
    }
    let _ = window.set_focus();
    if let Err(error) = window.emit("braindump:open", serde_json::json!({ "id": id })) {
        eprintln!("could not open the braindump: {error}");
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
        Command::Braindump => open_braindump(app, None),
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

/// Everything the palette asks of its backend: `PaletteProtocol`, answered in `requests.rs` —
/// except opening the braindump window, which needs the app.
#[tauri::command]
async fn palette_request(
    app: AppHandle,
    request: serde_json::Value,
) -> Result<serde_json::Value, String> {
    if request.get("type").and_then(serde_json::Value::as_str) == Some("OPEN_BRAINDUMP") {
        let id = request
            .get("id")
            .and_then(serde_json::Value::as_str)
            .map(str::to_string);
        if let Some(id) = &id
            && !braindumps::is_braindump_id(id)
        {
            return Err(format!("{id} is not a braindump"));
        }
        open_braindump(&app, id);
        return Ok(serde_json::json!({}));
    }
    requests::handle(request).await
}

/// "Log in with the Lifosy console": hides the overlay so the browser can be used, then logs in
/// exactly as `lifosy-palette login` does.
#[tauri::command]
async fn console_login(app: AppHandle) -> Result<String, String> {
    hide(&app);
    let outcome = async {
        let grant = tauri::async_runtime::spawn_blocking(console_grant)
            .await
            .map_err(|error| error.to_string())??;
        store_login(grant.token, None, grant.repo).await
    }
    .await;
    notify(match &outcome {
        Ok(message) | Err(message) => message,
    });
    outcome
}

/// Copies with `wl-copy`, which stays behind to serve the clipboard once the overlay is hidden —
/// the webview's own clipboard goes away with its focus.
#[tauri::command]
fn copy_text(text: String) -> Result<(), String> {
    let mut child = std::process::Command::new("wl-copy")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .spawn()
        .map_err(|error| format!("Could not run wl-copy ({error}) — is wl-clipboard installed?"))?;
    let written = child
        .stdin
        .take()
        .map(|mut stdin| stdin.write_all(text.as_bytes()));
    // Reaped in the background, like xdg-open, so the palette can close at once.
    std::thread::spawn(move || child.wait());
    match written {
        Some(Ok(())) => Ok(()),
        _ => Err("Could not hand the text to wl-copy".into()),
    }
}

/// The palette closed itself (Esc, a click outside, or after opening something).
#[tauri::command]
fn hide_palette(app: AppHandle) {
    if let Some(window) = palette(&app) {
        let _ = window.hide();
    }
}

/// The daemon's own first command, until the page it is for can listen: a show that arrived
/// before the webview did.
struct Pending(Mutex<Option<Command>>);

impl Pending {
    /// Takes the command if `page` is the one it waits for.
    fn take_for(&self, page: fn(Command) -> bool) -> Option<Command> {
        let mut slot = self.0.lock().ok()?;
        slot.filter(|command| page(*command))
            .and_then(|_| slot.take())
    }
}

#[tauri::command]
fn webview_ready(app: AppHandle, pending: tauri::State<Pending>) {
    if pending
        .take_for(|command| matches!(command, Command::Toggle | Command::Show))
        .is_some()
    {
        show(&app);
    }
}

#[tauri::command]
fn braindump_ready(app: AppHandle, pending: tauri::State<Pending>) {
    if pending
        .take_for(|command| command == Command::Braindump)
        .is_some()
    {
        open_braindump(&app, None);
    }
}

/// The braindump window hid itself (Esc, or after copying).
#[tauri::command]
fn hide_braindump(app: AppHandle) {
    if let Some(window) = app.get_webview_window(BRAINDUMP) {
        let _ = window.hide();
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

/// A normal window, not a layer surface: while writing, other windows stay usable. It is created
/// hidden with the daemon, so opening it is only showing it.
fn build_braindump(app: &AppHandle) -> Result<WebviewWindow, Box<dyn std::error::Error>> {
    let window =
        WebviewWindowBuilder::new(app, BRAINDUMP, WebviewUrl::App("braindump.html".into()))
            .title(BRAINDUMP_TITLE)
            .inner_size(760.0, 520.0)
            .visible(false)
            .build()?;
    let for_events = window.clone();
    window.on_window_event(move |event| {
        // Closing only hides it; the page then saves and syncs.
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = for_events.hide();
            let _ = for_events.emit("braindump:hidden", ());
        }
    });
    Ok(window)
}

fn run_daemon(first: Command, listener: UnixListener) {
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            palette_request,
            console_login,
            copy_text,
            hide_palette,
            webview_ready,
            braindump_ready,
            hide_braindump
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            build_palette(&handle)?;
            build_braindump(&handle)?;
            handle.manage(Pending(Mutex::new(Some(first))));
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
        Cli::Login { repo, paste } => {
            if let Err(error) = login(repo, paste) {
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
        Cli::InstallNativeHost { extension_id } => {
            let installed = std::env::current_exe()
                .map_err(|error| format!("could not tell where this binary is: {error}"))
                .and_then(|binary| {
                    native_host::install(&config::config_home(), &binary, &extension_id)
                });
            match installed {
                Ok(files) => {
                    for file in files {
                        println!("Installed {}", file.display());
                    }
                    println!("Reload the extension to connect it.");
                }
                Err(error) => {
                    eprintln!("{error}");
                    std::process::exit(1);
                }
            }
            return;
        }
        Cli::NativeHost => {
            if let Err(error) = native_host::serve(&mut std::io::stdin(), &mut std::io::stdout()) {
                eprintln!("native messaging failed: {error}");
                std::process::exit(1);
            }
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
        assert_eq!(args(&["braindump"]), Ok(Cli::Palette(Command::Braindump)));
    }

    #[test]
    fn replays_the_first_command_only_to_the_page_it_is_for() {
        let pending = Pending(Mutex::new(Some(Command::Braindump)));
        let palette = |command| matches!(command, Command::Toggle | Command::Show);
        assert_eq!(pending.take_for(palette), None);
        assert_eq!(
            pending.take_for(|command| command == Command::Braindump),
            Some(Command::Braindump)
        );
        assert_eq!(
            pending.take_for(|command| command == Command::Braindump),
            None
        );
    }

    #[test]
    fn reads_login_with_an_optional_repository() {
        assert_eq!(
            args(&["login"]),
            Ok(Cli::Login {
                repo: None,
                paste: false
            })
        );
        assert_eq!(
            args(&["login", "--paste", "--repo", "o/r"]),
            Ok(Cli::Login {
                repo: Some("o/r".into()),
                paste: true
            })
        );
        assert!(args(&["login", "--repo"]).is_err());
        assert!(args(&["login", "--repo", "../x"]).is_err());
        assert_eq!(args(&["logout"]), Ok(Cli::Logout));
    }

    #[test]
    fn reads_the_native_host_commands() {
        assert_eq!(
            args(&["native-host", "install", "abc"]),
            Ok(Cli::InstallNativeHost {
                extension_id: "abc".into()
            })
        );
        assert!(args(&["native-host"]).is_err());
        // Chrome names the calling extension, and on Windows adds a window handle after it.
        assert_eq!(
            args(&["chrome-extension://abc/", "--parent-window=0"]),
            Ok(Cli::NativeHost)
        );
    }
}
