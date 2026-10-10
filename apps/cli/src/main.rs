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
mod server;
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
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let cli = Cli::parse();

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
        None => {
            // Run the standard TUI app
            setup_and_run_tui().await
        }
    }
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
