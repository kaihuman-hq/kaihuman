# Lifosy CLI

Welcome to the Lifosy CLI! This is a terminal-based user interface (TUI) application designed to let you interact with your Lifosy console directly from your terminal.

## Prerequisites

- [Rust & Cargo](https://rustup.rs/) installed on your machine
- Access to the Lifosy Console (to authenticate with GitHub)

## Building the CLI

To compile the application, navigate to the `apps/cli` directory and run:

```bash
cargo build --release
```

## Running the CLI

You can run the CLI directly through Cargo or by executing the compiled binary from the `target/` directory.

### Using Cargo
```bash
cargo run
```

### Using the Compiled Binary
```bash
./target/debug/cli
```
*(Use `./target/release/cli` if you built with the `--release` flag)*

## Usage

When you launch the Lifosy CLI, it opens an interactive interface built with `ratatui`. Here are the keyboard shortcuts available:

| Key | Action | Description |
|---|---|---|
| `l` | **Login** | Opens your web browser to authenticate with the Lifosy Console. |
| `n` | **New Note** | Opens a text area to quickly jot down a note. `Enter` saves it as a new file, `.lifeos/quicknotes/quicknote-<UTC timestamp>.md`, in your currently active repository. |
| `q` | **Quit** | Exits the CLI application. |
| `Up / Down` | **Navigate** | Navigate the repository selection list (if you need to select a repository). |
| `Enter` | **Submit** | Submits your new note or confirms a repository selection. |
| `Esc` | **Cancel** | Cancels your current action (like abandoning a note) and returns to the home screen. |

## Authentication Workflow

When you press `l` to log in:
1. The CLI spawns a lightweight local HTTP callback server on `127.0.0.1`, and picks a random `state` for this login.
2. It automatically opens your default web browser to the Lifosy Console authentication page, with that `state` in the URL.
3. Once authorized, the web console posts a form to your local server carrying your GitHub token and active repository. It is a POST, so the token never appears in a URL or in the browser's history. The console sends the `state` back, and the CLI accepts only a callback carrying it. Any other website could post its own token to the waiting server; such a post is refused and the CLI keeps waiting for its own login. The server still accepts the query-string redirect that older console builds sent.
4. Your token and selected repository are saved locally in your system's configuration directory (`~/.config/cli/auth.json` on Linux, `~/Library/Application Support/com.lifosy.cli/auth.json` on macOS), keeping you logged in for future sessions!
