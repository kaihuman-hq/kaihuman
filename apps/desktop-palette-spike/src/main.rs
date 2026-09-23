//! Phase-0 spike: can a Tauri window be a palette that opens centered on the focused monitor,
//! above a tiled layout, with the keyboard in its input — on Hyprland?
//!
//! One resident daemon owns the (hidden) webview so opening is only a map, never a cold start.
//! Every other invocation is a thin client that writes one line to the daemon's Unix socket and
//! exits, so `lifosy-palette-spike toggle` is cheap enough to bind to a key. The line carries the
//! client's start time, which is how the palette can report key-to-pixels latency.

#[cfg(target_os = "linux")]
mod layer;

use std::io::{BufRead, BufReader};
use std::os::unix::net::UnixListener;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

use desktop_palette_spike::{Command, Delivery, now_ms, parse_request, send, socket_path};

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const LABEL: &str = "palette";
const WIDTH: f64 = 620.0;
const HEIGHT: f64 = 420.0;

/// The ways the spike can put the palette on screen; phase 0 exists to pick one.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
enum Mode {
    /// Layer surface covering the whole focused output; the card is centered by CSS and a click
    /// on the transparent rest dismisses it.
    Layer,
    /// Layer surface the size of the card, anchored to no edge, so the compositor centers it.
    LayerCard,
    /// Ordinary toplevel. Floating and centering are left to the user's compositor rules.
    Float,
}

impl Mode {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "layer" => Ok(Self::Layer),
            "layer-card" => Ok(Self::LayerCard),
            "float" => Ok(Self::Float),
            other => Err(format!(
                "unknown mode {other:?}; expected layer, layer-card or float"
            )),
        }
    }
}

#[derive(Debug)]
struct Options {
    command: Command,
    mode: Mode,
    force_commit: bool,
}

const USAGE: &str = "usage: lifosy-palette-spike [toggle|show|hide|quit|daemon] \
                     [--mode layer|layer-card|float] [--force-commit]";

fn parse_args(args: impl IntoIterator<Item = String>) -> Result<Options, String> {
    let mut options = Options {
        command: Command::Toggle,
        mode: Mode::Layer,
        force_commit: false,
    };
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--mode" => {
                let value = args.next().ok_or("--mode needs a value")?;
                options.mode = Mode::parse(&value)?;
            }
            "--force-commit" => options.force_commit = true,
            "-h" | "--help" => return Err(USAGE.to_string()),
            other => options.command = Command::parse(other)?,
        }
    }
    Ok(options)
}

/// What the daemon was started with; read by the webview and by `show`.
struct Settings {
    mode: Mode,
    force_commit: bool,
}

static SETTINGS: OnceLock<Settings> = OnceLock::new();

fn settings() -> &'static Settings {
    SETTINGS
        .get()
        .expect("settings are set before the app starts")
}

fn palette(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(LABEL)
}

fn show(app: &AppHandle, sent_at: u64) {
    let Some(window) = palette(app) else {
        eprintln!("palette window is missing");
        return;
    };
    if let Err(error) = window.show() {
        eprintln!("could not show the palette: {error}");
        return;
    }
    if let Err(error) = window.set_focus() {
        eprintln!("could not focus the palette: {error}");
    }
    #[cfg(target_os = "linux")]
    if settings().force_commit {
        let for_main_thread = window.clone();
        let _ = window.run_on_main_thread(move || {
            if let Ok(gtk_window) = for_main_thread.gtk_window() {
                layer::force_commit(&gtk_window);
            }
        });
    }
    // The webview answers with `painted` once a frame is on screen, which closes the timing.
    if let Err(error) = window.emit("palette:shown", sent_at) {
        eprintln!("could not notify the palette: {error}");
    }
}

fn hide(app: &AppHandle) {
    if let Some(window) = palette(app) {
        let _ = window.hide();
    }
}

fn toggle(app: &AppHandle, sent_at: u64) {
    let visible = palette(app)
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false);
    if visible {
        hide(app);
    } else {
        show(app, sent_at);
    }
}

fn dispatch(app: &AppHandle, command: Command, sent_at: u64) {
    match command {
        Command::Toggle => toggle(app, sent_at),
        Command::Show => show(app, sent_at),
        Command::Hide => hide(app),
        Command::Quit => {
            let _ = std::fs::remove_file(socket_path());
            app.exit(0);
        }
        Command::Daemon => {}
    }
}

/// Serves one line per connection: `<command> <client start in ms>`.
fn serve(listener: UnixListener, app: AppHandle) {
    for stream in listener.incoming() {
        let Ok(stream) = stream else { continue };
        let mut line = String::new();
        if BufReader::new(stream).read_line(&mut line).is_err() {
            continue;
        }
        match parse_request(&line) {
            Some((Ok(command), sent_at)) => {
                dispatch(&app, command, sent_at.unwrap_or_else(now_ms));
            }
            Some((Err(error), _)) => eprintln!("ignoring request: {error}"),
            None => {}
        }
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SpikeInfo {
    mode: Mode,
    gdk_backend: String,
}

#[tauri::command]
fn spike_info() -> SpikeInfo {
    SpikeInfo {
        mode: settings().mode,
        gdk_backend: gdk_backend(),
    }
}

/// Called by the webview two animation frames after `palette:shown`, i.e. once pixels are up.
#[tauri::command]
fn painted(sent_at: u64) -> u64 {
    let latency = now_ms().saturating_sub(sent_at);
    eprintln!("palette painted {latency} ms after the command was sent");
    latency
}

/// Called once the page has loaded and listens for `palette:shown`; runs a show that arrived
/// before that — the daemon's own first command.
#[tauri::command]
fn webview_ready(app: AppHandle, pending: tauri::State<PendingShow>) {
    let sent_at = pending.0.lock().ok().and_then(|mut slot| slot.take());
    if let Some(sent_at) = sent_at {
        show(&app, sent_at);
    }
}

#[tauri::command]
fn hide_palette(app: AppHandle) {
    hide(&app);
}

#[cfg(target_os = "linux")]
fn gdk_backend() -> String {
    use gtk::prelude::*;
    gtk::gdk::Display::default()
        .map(|display| display.type_().name().to_string())
        .unwrap_or_else(|| "no display".into())
}

#[cfg(not(target_os = "linux"))]
fn gdk_backend() -> String {
    "not GTK".into()
}

fn build_palette(app: &AppHandle, mode: Mode) -> Result<WebviewWindow, Box<dyn std::error::Error>> {
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("lifosy-palette-spike")
        .inner_size(WIDTH, HEIGHT)
        .decorations(false)
        .transparent(true)
        // Hyprland 0.56 was seen to lose transparency on resizable layer surfaces.
        .resizable(false)
        .skip_taskbar(true)
        // A layer surface has to be configured before it is first mapped, so it starts hidden.
        .visible(false)
        .build()?;

    #[cfg(target_os = "linux")]
    if mode != Mode::Float {
        let gtk_window = window.gtk_window()?;
        layer::configure(&gtk_window, mode == Mode::Layer)?;
    }

    let for_events = window.clone();
    window.on_window_event(move |event| match event {
        // The daemon keeps the webview warm: closing only hides it.
        tauri::WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            let _ = for_events.hide();
        }
        // A floating toplevel loses focus when the user clicks elsewhere; that dismisses it,
        // like any launcher. A layer surface with exclusive keyboard never loses focus.
        tauri::WindowEvent::Focused(focused) => {
            eprintln!(
                "palette {}",
                if *focused { "focused" } else { "lost focus" }
            );
            if !focused && mode == Mode::Float {
                let _ = for_events.hide();
            }
        }
        _ => {}
    });
    Ok(window)
}

fn run_daemon(options: Options, listener: UnixListener) {
    let started = Instant::now();
    let _ = SETTINGS.set(Settings {
        mode: options.mode,
        force_commit: options.force_commit,
    });
    let first = options.command;
    let first_sent_at = now_ms();

    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            spike_info,
            painted,
            webview_ready,
            hide_palette
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            build_palette(&handle, options.mode)?;
            eprintln!(
                "daemon ready in {} ms (mode {:?}, GDK backend {})",
                started.elapsed().as_millis(),
                options.mode,
                gdk_backend()
            );
            std::thread::spawn({
                let handle = handle.clone();
                move || serve(listener, handle)
            });
            // The webview has not loaded yet; it calls `webview_ready` once it has.
            let pending = matches!(first, Command::Toggle | Command::Show).then_some(first_sent_at);
            handle.manage(PendingShow(Mutex::new(pending)));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("could not build the palette app");

    app.run(|_, event| {
        if let tauri::RunEvent::Exit = event {
            let _ = std::fs::remove_file(socket_path());
        }
    });
}

/// A show requested before the webview could listen for it: the daemon's own first command.
struct PendingShow(Mutex<Option<u64>>);

fn main() {
    let options = match parse_args(std::env::args().skip(1)) {
        Ok(options) => options,
        Err(message) => {
            eprintln!("{message}");
            std::process::exit(2);
        }
    };

    // A daemon is running: hand it the command and get out of the way. This binary loads all of
    // WebKitGTK to do so; `lifosy-palette-toggle` is the cheap way in.
    match send(options.command, now_ms()) {
        Ok(Delivery::Sent) => return,
        Ok(Delivery::NoDaemon) if options.command.starts_daemon() => {}
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

    // WebKitGTK and GTK pick X11 when both are available; the spike is about Wayland, so it asks
    // for Wayland explicitly unless the user chose a backend themselves.
    if std::env::var_os("WAYLAND_DISPLAY").is_some() && std::env::var_os("GDK_BACKEND").is_none() {
        // SAFETY: no other thread exists yet.
        unsafe { std::env::set_var("GDK_BACKEND", "wayland") };
    }

    run_daemon(options, listener);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Result<Options, String> {
        parse_args(list.iter().map(|arg| arg.to_string()))
    }

    #[test]
    fn defaults_to_toggling_a_full_output_layer() {
        let options = args(&[]).unwrap();
        assert_eq!(options.command, Command::Toggle);
        assert_eq!(options.mode, Mode::Layer);
        assert!(!options.force_commit);
    }

    #[test]
    fn reads_command_mode_and_flags_in_any_order() {
        let options = args(&["--mode", "float", "show", "--force-commit"]).unwrap();
        assert_eq!(options.command, Command::Show);
        assert_eq!(options.mode, Mode::Float);
        assert!(options.force_commit);
    }

    #[test]
    fn rejects_unknown_input_with_the_accepted_values() {
        assert!(
            args(&["--mode", "tiled"])
                .unwrap_err()
                .contains("layer-card")
        );
        assert!(args(&["open"]).unwrap_err().contains("toggle"));
        assert!(args(&["--mode"]).is_err());
    }
}
