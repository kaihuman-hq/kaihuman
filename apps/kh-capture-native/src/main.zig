//! KH Capture — a native-sdk (Zig core) quick-capture overlay.
//!
//! This is a THIN GUI over the tested `cli capture` command: the window takes a
//! line of text and, on submit, spawns `cli capture <text>`. The Rust CLI owns
//! all the hard, tested logic — GitHub auth, the offline-safe local spool, and
//! retry/backoff — so this app inherits offline-safety for free and never
//! duplicates the push/auth code.
//!
//! ── Provenance & confidence ──────────────────────────────────────────────────
//! Built from the published native-sdk docs (native-sdk.dev). It was NOT compiled
//! against a live toolchain while writing (no Zig/native CLI available in that
//! environment). Lines marked `VERIFY(api)` are the spots where the public docs
//! were thin and the exact symbol is inferred; the README lists them with a
//! one-command way to reconcile against a freshly scaffolded template. Treat this
//! as a faithful, ~90%-there sketch, not a guaranteed-compiling drop-in.

const canvas = @import("canvas");

// VERIFY(api): the docs reference `fx: *Effects` and `Effects.exitMsg(...)`.
// Confirm whether `Effects` is `canvas.Effects` (assumed here) or a separate
// import.
const Effects = canvas.Effects;

// VERIFY(api): effect keys are shown as `.key = <something>` and are used with
// `fx.cancel(key)`. Their type isn't published; a string name is the most
// likely shape. Adjust if the SDK uses an int/enum key.
const capture_key = "capture";

// ── Model ─────────────────────────────────────────────────────────────────────

const Model = struct {
    // VERIFY(api): docs pair `<input on-input=...>` with `canvas.TextBuffer(N)`
    // in the model and `canvas.TextInputEvent` as the message payload.
    draft_buffer: canvas.TextBuffer(280) = .{},
    busy: bool = false,
    status: []const u8 = "",

    /// Bound into markup as `{draft}`.
    pub fn draft(model: *const Model) []const u8 {
        return model.draft_buffer.text();
    }
};

// ── Messages ──────────────────────────────────────────────────────────────────

const Msg = union(enum) {
    draft_edit: canvas.TextInputEvent,
    submit,
    /// stdout lines from `cli capture` (ignored; kept because the docs show
    /// `spawn` pairing `on_line` with `on_exit`).
    captured_line: []const u8,
    /// process exit. VERIFY(api): confirm the exit payload type/fields — docs
    /// describe "the exit delivers the code and optional stderr tail".
    captured: canvas.ProcessExit,
    dismiss,
};

// ── Update ────────────────────────────────────────────────────────────────────

pub fn update(model: *Model, msg: Msg, fx: *Effects) void {
    switch (msg) {
        .draft_edit => |edit| model.draft_buffer.apply(edit),

        .submit => {
            const text = model.draft_buffer.text();
            if (model.busy or text.len == 0) return;
            model.busy = true;
            model.status = "saving…";
            // Spawn the tested CLI. argv[0] resolves on PATH — install the `cli`
            // binary to ~/.local/bin (see README). Passing the note as a single
            // argv element preserves spaces and newlines.
            fx.spawn(.{
                .key = capture_key,
                .argv = &.{ "cli", "capture", text },
                .on_line = Effects.lineMsg(.captured_line),
                .on_exit = Effects.exitMsg(.captured),
            });
        },

        .captured_line => {}, // CLI prints a status line; we don't need it here.

        .captured => |exit| {
            model.busy = false;
            // VERIFY(api): field name for the exit code (`.code` assumed).
            if (exit.code == 0) {
                model.draft_buffer = .{};
                model.status = "captured \u{2713}";
                fx.closeWindow("main");
            } else {
                model.status = "failed — is `cli` on PATH and logged in?";
            }
        },

        .dismiss => fx.closeWindow("main"),
    }
}

// ── App entry ─────────────────────────────────────────────────────────────────
// The framework wires the entry point from this declaration; the window comes
// from app.zon and the view from src/app.native. VERIFY(api): field name for
// the effectful update (`.update_fx` per the docs).

pub const options = canvas.UiApp(Model, Msg){
    .update_fx = update,
};
