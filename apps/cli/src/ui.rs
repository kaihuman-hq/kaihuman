use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
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

    // Title
    let title = Paragraph::new("Lifosy CLI")
        .style(Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD))
        .block(Block::default().borders(Borders::ALL));
    f.render_widget(title, chunks[0]);

    // Main content
    match app.current_screen {
        CurrentScreen::Main => render_main(f, app, chunks[1]),
        CurrentScreen::Login => render_login(f, chunks[1]),
        CurrentScreen::RepoSelect => render_repo_select(f, app, chunks[1]),
        CurrentScreen::NoteInput => render_note_input(f, app, chunks[1]),
        CurrentScreen::AiPrompt => render_ai_prompt(f, app, chunks[1]),
        CurrentScreen::AiResponse => render_ai_response(f, app, chunks[1]),
        CurrentScreen::FileBrowser => render_file_browser(f, app, chunks[1]),
        CurrentScreen::FileEditor => render_file_editor(f, app, chunks[1]),
        CurrentScreen::DashboardView => render_dashboard_view(f, app, chunks[1]),
    }

    // Status bar
    let status_text = if !app.status_message.is_empty() {
        app.status_message.as_str()
    } else {
        match app.current_screen {
            CurrentScreen::Main => "q: Quit | n: Note | s: Repo | a: AI | f: Files | d: Dashboard | l: Login",
            CurrentScreen::Login => "Waiting for browser authentication…",
            CurrentScreen::RepoSelect => "Esc: Cancel | Enter: Select | ↑↓: Navigate",
            CurrentScreen::NoteInput => "Esc: Cancel | Enter: Save",
            CurrentScreen::AiPrompt => "Tab: Provider | Ctrl+Enter: Send | Esc: Back",
            CurrentScreen::AiResponse => "↑↓: Scroll | Esc/Enter: Back to prompt",
            CurrentScreen::FileBrowser => "Esc: Back | ↑↓: Navigate | Enter: Open",
            CurrentScreen::FileEditor => "Ctrl+S: Save | Esc: Close",
            CurrentScreen::DashboardView => "Esc: Back | ↑↓: Navigate | Enter: Open",
        }
    };

    let status = Paragraph::new(status_text)
        .style(Style::default().fg(Color::Gray))
        .block(Block::default().borders(Borders::ALL));
    f.render_widget(status, chunks[2]);
}

// ── Main ──────────────────────────────────────────────────────────────────────

fn render_main(f: &mut Frame, app: &App, area: Rect) {
    let mut lines = vec![Line::from("Welcome to Lifosy CLI"), Line::from("")];

    if app.github_client.is_some() {
        if let Some(ref repo) = app.active_repo {
            lines.push(
                Line::from(format!("Active repo: {}", repo))
                    .style(Style::default().fg(Color::Green)),
            );
        } else {
            lines.push(Line::from("Authenticated").style(Style::default().fg(Color::Green)));
        }
        lines.push(Line::from(""));
        lines.push(Line::from("n  New quick note"));
        lines.push(Line::from("s  Select active repository"));
        lines.push(Line::from("a  AI prompt (Claude / Copilot / Gemini)"));
        lines.push(Line::from("f  File browser  (syncs repo)"));
        lines.push(Line::from("d  Dashboard config  (syncs repo)"));
    } else {
        lines.push(Line::from("Not authenticated. Press 'l' to login."));
    }

    let p = Paragraph::new(lines).block(Block::default().title("Home").borders(Borders::ALL));
    f.render_widget(p, area);
}

// ── Login ─────────────────────────────────────────────────────────────────────

fn render_login(f: &mut Frame, area: Rect) {
    let text = vec![
        Line::from("Opening your browser to authenticate…"),
        Line::from(""),
        Line::from("If the browser did not open, visit:"),
        Line::from("https://app.kaihuman.com/auth/cli"),
    ];
    let p = Paragraph::new(text)
        .block(Block::default().title("Login").borders(Borders::ALL))
        .wrap(Wrap { trim: true });
    f.render_widget(p, area);
}

// ── Repo select ───────────────────────────────────────────────────────────────

fn render_repo_select(f: &mut Frame, app: &App, area: Rect) {
    let items: Vec<ListItem> = app.repos.iter().map(|r| ListItem::new(r.full_name.clone())).collect();
    let list = List::new(items)
        .block(Block::default().title("Select Repository").borders(Borders::ALL))
        .highlight_style(Style::default().add_modifier(Modifier::BOLD).fg(Color::Yellow))
        .highlight_symbol(">> ");
    f.render_stateful_widget(list, area, &mut app.repo_list_state.clone());
}

// ── Note input ────────────────────────────────────────────────────────────────

fn render_note_input(f: &mut Frame, app: &App, area: Rect) {
    f.render_widget(&app.note_textarea, area);
}

// ── AI prompt ─────────────────────────────────────────────────────────────────

fn render_ai_prompt(f: &mut Frame, app: &App, area: Rect) {
    f.render_widget(&app.ai_prompt_textarea, area);
}

// ── AI response ───────────────────────────────────────────────────────────────

fn render_ai_response(f: &mut Frame, app: &App, area: Rect) {
    let p = Paragraph::new(app.ai_response.as_str())
        .block(
            Block::default()
                .title(format!("{} response", app.ai_provider.name()))
                .borders(Borders::ALL),
        )
        .wrap(Wrap { trim: false })
        .scroll((app.ai_scroll, 0));
    f.render_widget(p, area);
}

// ── File browser ──────────────────────────────────────────────────────────────

fn render_file_browser(f: &mut Frame, app: &App, area: Rect) {
    let items: Vec<ListItem> = app
        .file_browser_items
        .iter()
        .map(|item| {
            let label = if item.is_recent {
                format!("★ {}", item.path)
            } else if item.is_dir {
                format!("▶ {}/", item.path)
            } else {
                format!("  {}", item.path)
            };
            let style = if item.is_recent {
                Style::default().fg(Color::Yellow)
            } else if item.is_dir {
                Style::default().fg(Color::Cyan)
            } else {
                Style::default()
            };
            ListItem::new(label).style(style)
        })
        .collect();

    let title = format!(
        "Files — {}",
        app.active_repo.as_deref().unwrap_or("no repo")
    );
    let list = List::new(items)
        .block(Block::default().title(title).borders(Borders::ALL))
        .highlight_style(Style::default().add_modifier(Modifier::BOLD).fg(Color::White))
        .highlight_symbol(">> ");
    f.render_stateful_widget(list, area, &mut app.file_browser_state.clone());
}

// ── File editor ───────────────────────────────────────────────────────────────

fn render_file_editor(f: &mut Frame, app: &App, area: Rect) {
    f.render_widget(&app.file_editor_textarea, area);
}

// ── Dashboard view ────────────────────────────────────────────────────────────

fn render_dashboard_view(f: &mut Frame, app: &App, area: Rect) {
    let Some(ref cfg) = app.dashboard_config else {
        let p = Paragraph::new("No dashboard.config.json found in repository.")
            .block(Block::default().title("Dashboard").borders(Borders::ALL));
        f.render_widget(p, area);
        return;
    };

    // Split into info panel (top) + file list (bottom)
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Length(6), Constraint::Min(1)])
        .split(area);

    // Info panel: workspaces + theme
    let mut info_lines = vec![Line::from(Span::styled(
        "dashboard.config.json",
        Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD),
    ))];

    if let Some(ref ws) = cfg.dashboards {
        let names: Vec<&str> = ws.iter().map(|w| w.name.as_str()).collect();
        info_lines.push(Line::from(format!("Workspaces: {}", names.join(", "))));
    }
    if let Some(ref theme) = cfg.theme {
        info_lines.push(Line::from(format!("Theme: {}", theme)));
    }

    let info = Paragraph::new(info_lines)
        .block(Block::default().title("Config").borders(Borders::ALL));
    f.render_widget(info, chunks[0]);

    // File list: primary files + entry paths (shared file_browser_items / state)
    let items: Vec<ListItem> = app
        .file_browser_items
        .iter()
        .map(|item| {
            let label = if item.is_recent {
                format!("★ {}", item.path)
            } else {
                format!("  {}", item.path)
            };
            let style = if item.is_recent {
                Style::default().fg(Color::Yellow)
            } else {
                Style::default()
            };
            ListItem::new(label).style(style)
        })
        .collect();

    let list = List::new(items)
        .block(Block::default().title("Files (Enter to open)").borders(Borders::ALL))
        .highlight_style(Style::default().add_modifier(Modifier::BOLD).fg(Color::White))
        .highlight_symbol(">> ");
    f.render_stateful_widget(list, chunks[1], &mut app.file_browser_state.clone());
}
