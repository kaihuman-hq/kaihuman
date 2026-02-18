use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::Line,
    widgets::{Block, Borders, List, ListItem, Paragraph, Wrap},
    Frame,
};

use crate::app::{App, CurrentScreen};

pub fn ui(f: &mut Frame, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),
            Constraint::Min(1),
            Constraint::Length(3),
        ])
        .split(f.area());

    // Title Block
    let title = Paragraph::new("Lifosy CLI")
        .style(Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD))
        .block(Block::default().borders(Borders::ALL));
    f.render_widget(title, chunks[0]);

    // Main Content
    match app.current_screen {
        CurrentScreen::Main => render_main(f, app, chunks[1]),
        CurrentScreen::NoteInput => render_note_input(f, app, chunks[1]),
        CurrentScreen::RepoSelect => render_repo_select(f, app, chunks[1]),
        CurrentScreen::Login => render_login(f, app, chunks[1]),
    }

    // Footer/Status Bar
    let status_text = match app.current_screen {
        CurrentScreen::Main => "q: Quit | n: New Note | l: Login",
        CurrentScreen::NoteInput => "Esc: Cancel | Enter: Save",
        CurrentScreen::RepoSelect => "Esc: Cancel | Enter: Select | \u{2191}\u{2193}: Navigate",
        CurrentScreen::Login => "Waiting for authentication...",
    };
    
    let status = Paragraph::new(status_text)
        .style(Style::default().fg(Color::Gray))
        .block(Block::default().borders(Borders::ALL));
    f.render_widget(status, chunks[2]);
}

fn render_main(f: &mut Frame, _app: &App, area: Rect) {
    let text = vec![
        Line::from("Welcome to LifeOS CLI"),
        Line::from(""),
        Line::from("Press 'n' to add a quick note."),
    ];
    let p = Paragraph::new(text)
        .block(Block::default().title("Home").borders(Borders::ALL));
    f.render_widget(p, area);
}

fn render_login(f: &mut Frame, _app: &App, area: Rect) {
    let text = vec![
        Line::from("Please login via your browser."),
        Line::from(""),
        Line::from("If the browser did not open, visit:"),
        Line::from("http://localhost:5173/auth/cli"),
    ];
    let p = Paragraph::new(text)
        .block(Block::default().title("Login").borders(Borders::ALL))
        .wrap(Wrap { trim: true });
    f.render_widget(p, area);
}

fn render_repo_select(f: &mut Frame, app: &App, area: Rect) {
    let items: Vec<ListItem> = app.repos
        .iter()
        .map(|r| ListItem::new(r.full_name.clone()))
        .collect();

    let list = List::new(items)
        .block(Block::default().title("Select Repository").borders(Borders::ALL))
        .highlight_style(Style::default().add_modifier(Modifier::BOLD).fg(Color::Yellow))
        .highlight_symbol(">> ");

    f.render_stateful_widget(list, area, &mut app.repo_list_state.clone());
}

fn render_note_input(f: &mut Frame, app: &App, area: Rect) {
     f.render_widget(&app.note_textarea, area);
}
