use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, ListState, Paragraph, Wrap},
    Frame,
};

use crate::app::{App, CurrentScreen, MENU_ITEMS};

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
    let title = Paragraph::new("kaihuman CLI")
        .style(Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD))
        .block(Block::default().borders(Borders::ALL));
    f.render_widget(title, chunks[0]);

    // Content
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
            CurrentScreen::Main => "↑↓: Navigate | Enter / letter key: Select | q: Quit",
            CurrentScreen::Login => "Waiting for browser authentication…",
            CurrentScreen::RepoSelect => "↑↓: Navigate | Enter: Select | Esc: Cancel",
            CurrentScreen::NoteInput => "Enter: Save | Esc: Cancel",
            CurrentScreen::AiPrompt => "Tab: cycle provider | Enter: send | Esc: back",
            CurrentScreen::AiResponse => "↑↓: Scroll | Esc / Enter: Back to prompt",
            CurrentScreen::FileBrowser => "↑↓: Navigate | Enter: Open | Esc: Back",
            CurrentScreen::FileEditor => "Ctrl+S: Save | Esc: Close",
            CurrentScreen::DashboardView => "↑↓: Navigate | Enter: Open | Esc: Back",
        }
    };

    let status = Paragraph::new(status_text)
        .style(Style::default().fg(Color::Gray))
        .block(Block::default().borders(Borders::ALL));
    f.render_widget(status, chunks[2]);
}

// ── Main — navigable menu ─────────────────────────────────────────────────────

fn render_main(f: &mut Frame, app: &App, area: Rect) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Length(3), Constraint::Min(1)])
        .split(area);

    // Info line
    let info = if let Some(ref repo) = app.active_repo {
        Paragraph::new(format!("Repo: {}", repo))
            .style(Style::default().fg(Color::Green))
            .block(Block::default().borders(Borders::ALL))
    } else {
        Paragraph::new("Not authenticated")
            .style(Style::default().fg(Color::Yellow))
            .block(Block::default().borders(Borders::ALL))
    };
    f.render_widget(info, chunks[0]);

    // Menu list
    let items: Vec<ListItem> = MENU_ITEMS
        .iter()
        .map(|(key, label)| {
            ListItem::new(Line::from(vec![
                Span::styled(format!(" [{}]  ", key), Style::default().fg(Color::DarkGray)),
                Span::raw(*label),
            ]))
        })
        .collect();

    let list = List::new(items)
        .block(Block::default().title("Menu").borders(Borders::ALL))
        .highlight_style(
            Style::default()
                .fg(Color::Black)
                .bg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        )
        .highlight_symbol("▶ ");

    let mut state = ListState::default();
    state.select(Some(app.menu_index));
    f.render_stateful_widget(list, chunks[1], &mut state);
}

// ── Login ─────────────────────────────────────────────────────────────────────

fn render_login(f: &mut Frame, area: Rect) {
    let text = vec![
        Line::from(""),
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
    let items: Vec<ListItem> =
        app.repos.iter().map(|r| ListItem::new(r.full_name.clone())).collect();
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
                .title(format!("{} — response (↑↓ scroll | Esc: back)", app.ai_provider.name()))
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
            let (icon, style) = if item.is_recent {
                ("★ ", Style::default().fg(Color::Yellow))
            } else if item.is_dir {
                ("▶ ", Style::default().fg(Color::Cyan))
            } else {
                ("  ", Style::default())
            };
            let label = if item.is_dir {
                format!("{}{}/", icon, item.path)
            } else {
                format!("{}{}", icon, item.path)
            };
            ListItem::new(label).style(style)
        })
        .collect();

    let title = if items.is_empty() {
        "Files — syncing…".to_string()
    } else {
        format!("Files — {} ({})", app.active_repo.as_deref().unwrap_or("?"), items.len())
    };

    let list = List::new(items)
        .block(Block::default().title(title).borders(Borders::ALL))
        .highlight_style(Style::default().add_modifier(Modifier::BOLD).fg(Color::White).bg(Color::DarkGray))
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
        let msg = if app.dashboard_config_path.is_empty() {
            "dashboard.config.json not found.\nLooked in: root, .kh/, .lifeos/".to_string()
        } else {
            format!("Loaded from: {}", app.dashboard_config_path)
        };
        let p = Paragraph::new(msg)
            .block(Block::default().title("Dashboard").borders(Borders::ALL))
            .wrap(Wrap { trim: true });
        f.render_widget(p, area);
        return;
    };

    let split = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Length(5), Constraint::Min(1)])
        .split(area);

    // Info panel
    let mut info_lines = vec![Line::from(Span::styled(
        format!("Config: {}", app.dashboard_config_path),
        Style::default().fg(Color::Cyan),
    ))];
    if let Some(ref ws) = cfg.dashboards {
        let names: Vec<&str> = ws.iter().map(|w| w.name.as_str()).collect();
        info_lines.push(Line::from(format!("Workspaces: {}", names.join(", "))));
    }
    if let Some(ref theme) = cfg.theme {
        info_lines.push(Line::from(format!("Theme: {}", theme)));
    }
    let info = Paragraph::new(info_lines)
        .block(Block::default().title("Dashboard Config").borders(Borders::ALL));
    f.render_widget(info, split[0]);

    // File list
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

    let file_list = List::new(items)
        .block(Block::default().title("Files (Enter to open)").borders(Borders::ALL))
        .highlight_style(Style::default().add_modifier(Modifier::BOLD).fg(Color::White).bg(Color::DarkGray))
        .highlight_symbol(">> ");
    f.render_stateful_widget(file_list, split[1], &mut app.file_browser_state.clone());
}
