//! KH Capture — a native-sdk (Zig core) quick-capture overlay.
//!
//! SELF-CONTAINED: no `cli` dependency. It reuses the CLI's saved GitHub token
//! (reads `~/.config/cli/auth.json` via `fx.readFile`) and POSTs the note
//! straight to the GitHub contents API via `fx.fetch`. On a failed push it
//! writes the note as markdown into the CLI's spool dir, so the next
//! `cli capture` / overlay run flushes it — the two capture paths rescue each
//! other and no thought is lost.
//!
//! ── Provenance & confidence ──────────────────────────────────────────────────
//! Built from the published native-sdk docs (native-sdk.dev). NOT compiled
//! against a live toolchain while writing (no Zig/native CLI available there).
//! The plain-Zig std bits (env, base64, epoch date, string scanning) are
//! idiomatic; the native-sdk symbols are marked `VERIFY(api)` and tabulated in
//! the README with a one-command way to reconcile against a scaffolded template.
//! Treat this as a faithful sketch, not a guaranteed-compiling drop-in.

const std = @import("std");
const canvas = @import("canvas");

// VERIFY(api): `Effects` import path and the effect-key type (string assumed).
const Effects = canvas.Effects;
const auth_key = "auth";
const push_key = "push";
const spool_key = "spool";

// ── A tiny fixed-capacity string buffer (no allocator, model-owned lifetime) ──

fn Buf(comptime N: usize) type {
    return struct {
        data: [N]u8 = undefined,
        len: usize = 0,
        const Self = @This();

        pub fn set(self: *Self, s: []const u8) void {
            const n = @min(s.len, N);
            @memcpy(self.data[0..n], s[0..n]);
            self.len = n;
        }
        pub fn slice(self: *const Self) []const u8 {
            return self.data[0..self.len];
        }
    };
}

// ── Model ─────────────────────────────────────────────────────────────────────

const Model = struct {
    // VERIFY(api): `<input on-input>` pairs with `canvas.TextBuffer(N)` /
    // `canvas.TextInputEvent`.
    draft_buffer: canvas.TextBuffer(280) = .{},

    // Auth + config, resolved once at boot.
    config_dir: Buf(400) = .{}, //  ~/.config/cli
    token: Buf(200) = .{},
    repo: Buf(140) = .{}, //  owner/repo
    ready: bool = false,

    // The in-flight capture, kept so a failed push can be spooled verbatim.
    spool_name: Buf(160) = .{}, //  <ts>-<slug>.md
    md_body: Buf(1024) = .{}, //  the raw markdown file

    // Scratch that must outlive the async fetch (the descriptor slices point here).
    url: Buf(320) = .{},
    auth_hdr: Buf(320) = .{},
    json_body: Buf(2048) = .{},

    busy: bool = false,
    status: []const u8 = "loading auth…",

    /// Bound into markup as `{draft}`.
    pub fn draft(model: *const Model) []const u8 {
        return model.draft_buffer.text();
    }
};

// ── Messages ──────────────────────────────────────────────────────────────────

const Msg = union(enum) {
    draft_edit: canvas.TextInputEvent,
    auth_loaded: canvas.FileResult, // VERIFY(api): readFile result type
    submit,
    pushed: canvas.Response, // VERIFY(api): fetch response type
    spooled: canvas.FileResult, // VERIFY(api): writeFile result type
    dismiss,
};

// ── Boot: locate + read the CLI's auth.json ──────────────────────────────────

pub fn initEffects(model: *Model, fx: *Effects) void {
    // Resolve the CLI config dir the same way the `directories` crate does on
    // Linux: $XDG_CONFIG_HOME/cli, else ~/.config/cli. getenv needs no allocator.
    var tmp: [400]u8 = undefined;
    const dir = if (std.posix.getenv("XDG_CONFIG_HOME")) |x|
        std.fmt.bufPrint(&tmp, "{s}/cli", .{x}) catch return
    else if (std.posix.getenv("HOME")) |h|
        std.fmt.bufPrint(&tmp, "{s}/.config/cli", .{h}) catch return
    else
        return;
    model.config_dir.set(dir);

    var pbuf: [512]u8 = undefined;
    const auth_path = std.fmt.bufPrint(&pbuf, "{s}/auth.json", .{model.config_dir.slice()}) catch return;
    // The path slice must outlive the async effect — copy into a model buffer.
    // `url` is free until the first push, so borrow it here.
    model.url.set(auth_path);
    fx.readFile(.{
        .key = auth_key,
        .path = model.url.slice(),
        .on_result = Effects.fileMsg(.auth_loaded),
    });
}

// ── Update ────────────────────────────────────────────────────────────────────

pub fn update(model: *Model, msg: Msg, fx: *Effects) void {
    switch (msg) {
        .draft_edit => |edit| model.draft_buffer.apply(edit),

        .auth_loaded => |result| {
            if (result.outcome == .ok) {
                if (extractJsonString(result.bytes, "token")) |t| model.token.set(t);
                if (extractJsonString(result.bytes, "active_repo")) |r| model.repo.set(r);
                if (model.token.len > 0 and model.repo.len > 0) {
                    model.ready = true;
                    model.status = "";
                } else {
                    model.status = "auth.json has no active repo — run `cli`, press s";
                }
            } else {
                model.status = "no auth — run `cli` to log in and select a repo";
            }
        },

        .submit => {
            const text = model.draft_buffer.text();
            if (model.busy or !model.ready or text.len == 0) return;
            model.busy = true;
            model.status = "saving…";
            buildCapture(model, text); // fills spool_name, md_body, json_body

            const authv = std.fmt.bufPrint(&model.auth_hdr.data, "Bearer {s}", .{model.token.slice()}) catch {
                model.busy = false;
                model.status = "token too long";
                return;
            };
            model.auth_hdr.len = authv.len;

            const url = std.fmt.bufPrint(&model.url.data, "https://api.github.com/repos/{s}/contents/.kh/raw/{s}", .{ model.repo.slice(), model.spool_name.slice() }) catch {
                model.busy = false;
                model.status = "path too long";
                return;
            };
            model.url.len = url.len;

            // VERIFY(api): `.method = .put`, header struct shape, response pairing.
            fx.fetch(.{
                .key = push_key,
                .url = model.url.slice(),
                .method = .put,
                .headers = &.{
                    .{ .name = "authorization", .value = model.auth_hdr.slice() },
                    .{ .name = "user-agent", .value = "kh-capture" },
                    .{ .name = "accept", .value = "application/vnd.github+json" },
                    .{ .name = "content-type", .value = "application/json" },
                },
                .body = model.json_body.slice(),
                .on_response = Effects.responseMsg(.pushed),
            });
        },

        .pushed => |response| {
            model.busy = false;
            const ok = response.outcome == .ok and (response.status == 201 or response.status == 200);
            if (ok) {
                model.draft_buffer = .{};
                model.status = "captured \u{2713}";
                fx.closeWindow("main");
            } else {
                // Never lose the note: spool the markdown into the CLI's spool dir
                // (writeFile creates missing parents). `cli capture` flushes it next
                // run. The fetch is done, so `url` is free to reuse for the path.
                const spath = std.fmt.bufPrint(&model.url.data, "{s}/spool/{s}", .{ model.config_dir.slice(), model.spool_name.slice() }) catch {
                    model.status = "push failed";
                    return;
                };
                model.url.len = spath.len;
                fx.writeFile(.{
                    .key = spool_key,
                    .path = model.url.slice(),
                    .bytes = model.md_body.slice(),
                    .on_result = Effects.fileMsg(.spooled),
                });
                model.status = "offline — saved locally, will sync via cli";
            }
        },

        .spooled => {}, // best-effort; nothing to do

        .dismiss => fx.closeWindow("main"),
    }
}

// ── Capture builders (plain Zig std — no native-sdk APIs) ─────────────────────

/// Fill `spool_name`, `md_body` (raw markdown), and `json_body` (the GitHub
/// contents PUT payload) for `text`. Timestamp/date are frozen here.
fn buildCapture(model: *Model, text: []const u8) void {
    const ms = std.time.milliTimestamp();

    var date_buf: [16]u8 = undefined;
    const date = civilDate(&date_buf, ms);

    const first = firstLine(text);
    var slug_buf: [48]u8 = undefined;
    const slug = slugify(&slug_buf, first);
    var title_buf: [96]u8 = undefined;
    const title = yamlTitle(&title_buf, first);

    var name_buf: [160]u8 = undefined;
    const name = std.fmt.bufPrint(&name_buf, "{d}-{s}.md", .{ ms, slug }) catch "note.md";
    model.spool_name.set(name);

    var md_buf: [1024]u8 = undefined;
    const md = std.fmt.bufPrint(
        &md_buf,
        "---\ntype: note\ntitle: \"{s}\"\nurl: ''\ndate: {s}\nprocessed: false\ntags: [general]\n---\n\n{s}\n",
        .{ title, date, text },
    ) catch text;
    model.md_body.set(md);

    // base64 the markdown (base64 output is JSON-safe, so no escaping needed).
    var b64_buf: [1600]u8 = undefined;
    const enc = std.base64.standard.Encoder;
    const b64 = enc.encode(b64_buf[0..enc.calcSize(md.len)], md);

    var body_buf: [2048]u8 = undefined;
    const body = std.fmt.bufPrint(
        &body_buf,
        "{{\"message\":\"note: capture via kh-capture\",\"content\":\"{s}\"}}",
        .{b64},
    ) catch "{}";
    model.json_body.set(body);
}

/// YYYY-MM-DD (UTC) from an epoch-milliseconds value, via std.time.epoch.
fn civilDate(buf: []u8, ms: i64) []const u8 {
    const secs: u64 = @intCast(@divFloor(@max(ms, 0), 1000));
    const es = std.time.epoch.EpochSeconds{ .secs = secs };
    const yd = es.getEpochDay().calculateYearDay();
    const md = yd.calculateMonthDay();
    // VERIFY(api): std.time.epoch field/method names across Zig versions.
    return std.fmt.bufPrint(buf, "{d:0>4}-{d:0>2}-{d:0>2}", .{
        yd.year,
        @intFromEnum(md.month),
        @as(u16, md.day_index) + 1,
    }) catch "1970-01-01";
}

/// First non-blank line, trimmed.
fn firstLine(s: []const u8) []const u8 {
    var start: usize = 0;
    while (start < s.len and (s[start] == '\n' or s[start] == '\r' or s[start] == ' ' or s[start] == '\t')) start += 1;
    var end = start;
    while (end < s.len and s[end] != '\n' and s[end] != '\r') end += 1;
    return std.mem.trim(u8, s[start..end], " \t");
}

/// Lowercase alphanumeric slug, `-` separators, max 40 chars.
fn slugify(buf: []u8, s: []const u8) []const u8 {
    var n: usize = 0;
    var prev_dash = false;
    for (s) |c| {
        if (n >= buf.len or n >= 40) break;
        if (std.ascii.isAlphanumeric(c)) {
            buf[n] = std.ascii.toLower(c);
            n += 1;
            prev_dash = false;
        } else if (!prev_dash and n > 0) {
            buf[n] = '-';
            n += 1;
            prev_dash = true;
        }
    }
    while (n > 0 and buf[n - 1] == '-') n -= 1;
    if (n == 0) {
        @memcpy(buf[0..4], "note");
        return buf[0..4];
    }
    return buf[0..n];
}

/// Title for YAML frontmatter: clamp to 80 chars, replace `"` with `'`.
fn yamlTitle(buf: []u8, s: []const u8) []const u8 {
    var n: usize = 0;
    for (s) |c| {
        if (n >= buf.len or n >= 80) break;
        buf[n] = if (c == '"') '\'' else c;
        n += 1;
    }
    return buf[0..n];
}

/// Extract a top-level JSON string value for `key` (no escape handling — the CLI
/// writes plain token/repo values). Returns a slice into `bytes`.
fn extractJsonString(bytes: []const u8, key: []const u8) ?[]const u8 {
    var pat_buf: [64]u8 = undefined;
    const pat = std.fmt.bufPrint(&pat_buf, "\"{s}\"", .{key}) catch return null;
    const ki = std.mem.indexOf(u8, bytes, pat) orelse return null;
    var i = ki + pat.len;
    while (i < bytes.len and bytes[i] != ':') : (i += 1) {}
    while (i < bytes.len and bytes[i] != '"') : (i += 1) {}
    if (i >= bytes.len) return null;
    i += 1;
    const start = i;
    while (i < bytes.len and bytes[i] != '"') : (i += 1) {}
    if (i >= bytes.len) return null;
    return bytes[start..i];
}

// ── App entry ─────────────────────────────────────────────────────────────────
// VERIFY(api): `.init_fx` / `.update_fx` fields on `canvas.UiApp`.

pub const options = canvas.UiApp(Model, Msg){
    .init_fx = initEffects,
    .update_fx = update,
};
