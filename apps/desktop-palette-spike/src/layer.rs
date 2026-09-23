//! Turning the palette's GTK window into a `wlr-layer-shell` surface.
//!
//! A layer surface is what launchers use on wlroots-style compositors (Hyprland, Sway, river,
//! niri, KDE): it sits above the tiled layout, is never tiled itself, and is placed by the
//! compositor on the focused output. GNOME does not implement the protocol.

use gtk_layer_shell::{Edge, KeyboardMode, Layer, LayerShell};

/// A namespace of our own: compositor layer rules match on it, and the library's default
/// (`gtk-layer-shell`) is shared with every other tool built on it.
const NAMESPACE: &str = "lifosy-palette-spike";

/// Must run before the window is first mapped. `full_output` anchors all four edges so the surface
/// covers the output (the card is centered by CSS); otherwise no edge is anchored and the
/// compositor centers the card-sized surface itself.
pub fn configure(window: &gtk::ApplicationWindow, full_output: bool) -> Result<(), String> {
    if !gtk_layer_shell::is_supported() {
        return Err(
            "this compositor does not offer wlr-layer-shell (GNOME, X11?); run with --mode float"
                .into(),
        );
    }
    window.init_layer_shell();
    window.set_namespace(NAMESPACE);
    window.set_layer(Layer::Overlay);
    // On-demand keyboard mode was reported never to receive keys on Hyprland (hyprwm/Hyprland
    // #2264); exclusive does, at the price of the surface keeping the keyboard until it hides.
    window.set_keyboard_mode(KeyboardMode::Exclusive);
    for edge in [Edge::Top, Edge::Bottom, Edge::Left, Edge::Right] {
        window.set_anchor(edge, full_output);
    }
    if full_output {
        // Cover bars too, rather than being shrunk to the space they leave.
        window.set_exclusive_zone(-1);
    }
    Ok(())
}

type ForceCommitFn = unsafe extern "C" fn(*mut gtk::ffi::GtkWindow);

/// Works around surfaces that map but never paint (reported with gtk-layer-shell on Hyprland) by
/// forcing a commit. `gtk_layer_try_force_commit` is newer than the Rust bindings, so it is looked
/// up at runtime; without it this does nothing. Behind `--force-commit` so the spike can tell
/// whether it is needed at all.
pub fn force_commit(window: &gtk::ApplicationWindow) {
    use gtk::glib::translate::ToGlibPtr;
    let window: &gtk::Window = window.as_ref();
    if !window.is_layer_window() {
        return;
    }
    // SAFETY: the symbol, if present, has the C signature declared by ForceCommitFn, and the
    // pointer is a live GtkWindow for the duration of the call.
    unsafe {
        let this = libloading::os::unix::Library::this();
        let Ok(symbol) = this.get::<ForceCommitFn>(b"gtk_layer_try_force_commit\0") else {
            eprintln!("gtk_layer_try_force_commit is not in this gtk-layer-shell; skipping");
            return;
        };
        symbol(window.to_glib_none().0);
    }
}
