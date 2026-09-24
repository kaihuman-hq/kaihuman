# `.commands.md` — command library format

A markdown file of shell commands you reach for often. Each command has a title, tags, and the
command itself, which may take parameters. The console lists them and copies them; the desktop
command palette (`>x`) also runs them.

````markdown
# Commands

## List a folder #files
With hidden files.
```sh
ls -la {{folder}}
```

## Free a port #network
```sh
sudo kill -9 `sudo lsof -t -i:{{port}}`
```

## Wi-Fi on #network
nmcli radio wifi on

## Top words in a column #text
```sh
awk '{print $1}' {{file}} | sort | uniq -c | sort -rn | head -{{count}}
```
````

## Grammar

It is the [`.prompts.md` grammar](prompts-format.md) — one `## Title #tags` heading per entry, the
entry running to the next `## ` — with one addition: **the command is the entry's first fenced
code block**. Any text around it is a note, shown in the console and searched, never run. An entry
without a code block is its text, whole. An entry with neither is skipped.

## Parameters

- `{{name}}` is a parameter, named by a letter or `_` followed by letters, digits, `_` or `-`;
  spaces inside the braces are allowed (`{{ port }}`). The palette asks for each by its name, in the
  order they first appear, and once per name — `cp {{file}} {{file}}.bak` asks for `file` once.
  The console gives each a field.
- Values go in **as typed**, like typing them in a terminal: `-la /tmp` for `ls {{folder}}` gives
  `ls -la /tmp`. Quote in the command (`"{{folder}}"`) when a value may contain spaces.
- Every `$` is the shell's: `$1`, `\$1`, `$HOME` and awk's `$1` run exactly as written.
- Braces that are not a name are left alone, so Go templates such as
  `docker inspect -f '{{.State.Status}}'` or `{{json .Names}}` need no escaping.
- Until 2026-09-23 parameters were `$1`…`$9`, with `\$1` as a literal `$1`. Those are plain shell
  now: rewrite `ls $1` as `ls {{folder}}`, and `\$1` as the `$1` it meant.

## In the apps

- **Console**: New File → Commands. Search, tag filter, a field per parameter with a live preview,
  and Copy (parameters not filled in stay `{{name}}`). **ADD COMMAND** appends one in a `sh` block.
  Implementation: `packages/formats/src/commands.ts` (shared by every app) and
  `packages/ui/src/LifeOS/Organisms/Widgets/CommandsWidget.tsx`.
- **Palette `>x`** (desktop and extension): every `.commands.md` in the repository, searched by
  title, tags, command and note. ⏎ asks for the parameters by name — the command is shown while you type —
  then offers **Copy** (first, so a hasty ⏎ never runs anything), **Run in terminal** and **Run in
  the background**, with the finished command listed in full below them. The extension only copies.
  Implementation: `packages/formats/src/commands.ts` and `packages/palette/src/actions.ts`; running is
  `apps/desktop-palette/src-tauri/src/commands.rs`.

## Running (desktop only)

Both ways run the command with `bash -c` from your home directory.

- **Terminal**: a `ghostty` window shows `$ <command>`, its output, and `[exit N]`, and stays open
  until a key is pressed.
- **Background**: detached; a notification says `✓ <command>` or `✗ <command> — exit N: <last line
  of stderr>`.

## Security

The file lives in your repository, so anyone who can push to it can change what a command does.
The palette never runs a command on selection: it always shows the exact, filled-in command and
waits for **Run** to be chosen. Only the desktop palette can run commands at all.
