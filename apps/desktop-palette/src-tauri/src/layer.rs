//! Turning the palette's GTK window into a `wlr-layer-shell` overlay.
//!
//! A layer surface sits above the tiled layout, is never tiled itself, and is placed by the
//! compositor on the focused output — what launchers use on Hyprland, Sway, river, niri and KDE.
//! GNOME does not implement the protocol. Chosen in phase 0, where it passed every check on
//! Hyprland (doc/native-command-palette.md).

use gtk_layer_shell::{Edge, KeyboardMode, Layer, LayerShell};

/// Compositor layer rules match on this; the library's default is shared with every other tool.
const NAMESPACE: &str = "kaihuman-palette";

/// Whether the session offers layer-shell at all. Must run on the GTK main thread.
pub fn is_supported() -> bool {
    gtk_layer_shell::is_supported()
}

/// Must run before the window is first mapped. The surface covers the whole focused output; the
/// palette centers its panel on it, and a click on the dimmed rest closes it.
pub fn configure(window: &gtk::ApplicationWindow) {
    window.init_layer_shell();
    window.set_namespace(NAMESPACE);
    window.set_layer(Layer::Overlay);
    // On-demand keyboard mode was reported never to receive keys on Hyprland (hyprwm/Hyprland
    // #2264); exclusive does, and the surface gives the keyboard back when it hides.
    window.set_keyboard_mode(KeyboardMode::Exclusive);
    for edge in [Edge::Top, Edge::Bottom, Edge::Left, Edge::Right] {
        window.set_anchor(edge, true);
    }
    // Cover bars too, rather than being shrunk to the space they leave.
    window.set_exclusive_zone(-1);
}
