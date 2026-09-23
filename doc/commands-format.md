# `.commands.md` — command library format

A markdown file of shell commands you reach for often. Each command has a title, tags, and the
command itself, which may take parameters. The console lists them and copies them; the desktop
command palette (`>x`) also runs them.

````markdown
# Commands

## List a folder #files
With hidden files.
```sh
ls -la $1
```

## Wi-Fi on #network
nmcli radio wifi on

## Top words in a column #text
```sh
awk '{print \$1}' $1 | sort | uniq -c | sort -rn | head -$2
```
````

## Grammar

It is the [`.prompts.md` grammar](prompts-format.md) — one `## Title #tags` heading per entry, the
entry running to the next `## ` — with one addition: **the command is the entry's first fenced
code block**. Any text around it is a note, shown in the console and searched, never run. An entry
without a code block is its text, whole. An entry with neither is skipped.

## Parameters

- `$1` … `$9` are parameters. The palette asks for each in turn (`Value for $1`, …), up to the
  highest one used — `echo $2` still asks for `$1`. The console gives each a field.
- Values go in **as typed**, like typing them in a terminal: `-la /tmp` for `ls $1` gives
  `ls -la /tmp`. Quote in the command (`"$1"`) when a value may contain spaces.
- `\$1` is a literal `$1` — for awk, shell functions and the like. It is not asked for, and the
  backslash is removed.
- `$0`, `$HOME` and every other `$` are left alone.

## In the apps

- **Console**: New File → Commands. Search, tag filter, a field per parameter with a live preview,
  and Copy (parameters not filled in stay `$n`). **ADD COMMAND** appends one in a `sh` block.
  Implementation: `packages/ui/src/LifeOS/Organisms/Widgets/CommandsLogic.ts` and
  `CommandsWidget.tsx`.
- **Palette `>x`** (desktop and extension): every `.commands.md` in the repository, searched by
  title, tags, command and note. ⏎ asks for the parameters — the command is shown while you type —
  then offers **Copy** (first, so a hasty ⏎ never runs anything), **Run in terminal** and **Run in
  the background**, with the finished command listed in full below them. The extension only copies.
  Implementation: `packages/palette/src/commands.ts`; running is
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
