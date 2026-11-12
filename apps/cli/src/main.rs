use anyhow::Result;
use clap::{Parser, Subcommand};
use crossterm::{
    event::{DisableMouseCapture, EnableMouseCapture},
    execute,
    terminal::{EnterAlternateScreen, LeaveAlternateScreen, disable_raw_mode, enable_raw_mode},
};
use ratatui::{Terminal, backend::CrosstermBackend};
use std::{error::Error, io};

mod app;
mod auth;
mod capture;
mod db;
mod files;
mod git;
mod github;
mod ideas;
mod ideas_cli;
mod server;
mod todos;
mod todos_cli;
mod todos_ticktick;
mod ui;

use app::App;

#[derive(Parser)]
#[command(name = "kaihuman", author, version, about, long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the local AI API server
    Server {
        /// Port to run the server on
        #[arg(short, long, default_value_t = 4000)]
        port: u16,
    },
    /// Capture a knowledge note to .kh/raw/ (offline-safe; flushes a local spool)
    Capture {
        /// Note text. If omitted, reads piped stdin, or opens $EDITOR when interactive.
        text: Vec<String>,
    },
    /// Capture a new idea to .kh/ideas/<slug>.md (first line = title, the rest = braindump)
    Idea(ideas_cli::IdeaArgs),
    /// List, read and update ideas in .kh/ideas/ (overview when no subcommand is given)
    Ideas(ideas_cli::IdeasArgs),
    /// Read and change todos (*.todos.md) by id; --json for agents
    Todo(todos_cli::TodoArgs),
    /// Install agent skills
    Skills {
        #[command(subcommand)]
        command: ideas_cli::SkillsCommand,
    },
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let cli = match Cli::try_parse() {
        Ok(cli) => cli,
        // `todo --json` promises JSON errors, usage errors included.
        Err(e) if e.use_stderr() && wants_todo_json() => {
            std::process::exit(todos_cli::report_usage_json(&e.to_string()))
        }
        Err(e) => e.exit(),
    };

    match cli.command {
        Some(Commands::Server { port }) => {
            println!("Starting LifeOS local AI server...");
            if let Err(e) = server::start_server(port).await {
                eprintln!("Server error: {}", e);
            }
            Ok(())
        }
        Some(Commands::Capture { text }) => {
            let inline = if text.is_empty() {
                None
            } else {
                Some(text.join(" "))
            };
            if let Err(e) = capture::run(inline).await {
                eprintln!("capture error: {}", e);
                std::process::exit(1);
            }
            Ok(())
        }
        Some(Commands::Idea(args)) => exit_on_error("idea", ideas_cli::run_idea(args).await),
        Some(Commands::Ideas(args)) => exit_on_error("ideas", ideas_cli::run_ideas(args).await),
        Some(Commands::Todo(args)) => match todos_cli::run(args).await {
            0 => Ok(()),
            code => std::process::exit(code),
        },
        Some(Commands::Skills { command }) => {
            exit_on_error("skills", ideas_cli::run_skills(command))
        }
        None => {
            // Run the standard TUI app
            setup_and_run_tui().await
        }
    }
}

fn wants_todo_json() -> bool {
    let args: Vec<String> = std::env::args().skip(1).collect();
    args.first().is_some_and(|a| a == "todo") && args.iter().any(|a| a == "--json")
}

/// Prints a subcommand's error and exits 1, like `capture` does.
fn exit_on_error(command: &str, result: Result<()>) -> Result<(), Box<dyn Error>> {
    if let Err(e) = result {
        eprintln!("{command} error: {e:#}");
        std::process::exit(1);
    }
    Ok(())
}

async fn setup_and_run_tui() -> Result<(), Box<dyn Error>> {
    // Setup terminal
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    // Create app
    let mut app = App::new()?;

    // Run app
    if let Err(e) = app.run(&mut terminal).await {
        println!("Error: {}", e);
    }

    // Restore terminal
    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen,
        DisableMouseCapture
    )?;
    terminal.show_cursor()?;

    Ok(())
}
