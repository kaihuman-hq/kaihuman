use crossterm::event::{self, Event, KeyCode, KeyEvent, KeyModifiers};
use ratatui::{backend::Backend, Terminal};
use std::io;
use std::path::PathBuf;
use tui_textarea::TextArea;
use ratatui::widgets::ListState;

use crate::auth::AuthManager;
use crate::files::{self, DashboardConfig, FileItem};
use crate::github::{GithubClient, Repository};
use crate::ui;

// ── Screens ───────────────────────────────────────────────────────────────────

#[derive(Clone)]
pub enum CurrentScreen {
    Main,
    Login,
    RepoSelect,
    NoteInput,
    AiPrompt,
    AiResponse,
    FileBrowser,
    FileEditor,
    DashboardView,
}

// ── AI provider ───────────────────────────────────────────────────────────────

#[derive(Clone, PartialEq)]
pub enum AiProvider {
    Claude,
    Copilot,
    Gemini,
}

impl AiProvider {
    pub fn name(&self) -> &str {
        match self {
            AiProvider::Claude => "Claude",
            AiProvider::Copilot => "Copilot",
            AiProvider::Gemini => "Gemini",
        }
    }

    pub fn next(&self) -> Self {
        match self {
            AiProvider::Claude => AiProvider::Copilot,
            AiProvider::Copilot => AiProvider::Gemini,
            AiProvider::Gemini => AiProvider::Claude,
        }
    }

    pub fn command(&self) -> &str {
        match self {
            AiProvider::Claude => "claude",
            AiProvider::Copilot => "copilot",
            AiProvider::Gemini => "gemini",
        }
    }
}

// ── App ───────────────────────────────────────────────────────────────────────

pub struct App<'a> {
    pub current_screen: CurrentScreen,
    pub auth_manager: AuthManager,
    pub github_client: Option<GithubClient>,
    pub repos: Vec<Repository>,
    pub repo_list_state: ListState,
    pub note_textarea: TextArea<'a>,
    pub selected_repo_index: Option<usize>,
    pub should_quit: bool,
    pub trigger_login: bool,
    pub active_repo: Option<String>,

    // Config / local repo
    pub config_dir: PathBuf,
    pub local_repo_path: Option<PathBuf>,

    // Recently used files (relative paths within the active repo)
    pub recent_files: Vec<String>,

    // Dashboard config parsed from local repo
    pub dashboard_config: Option<DashboardConfig>,

    // File browser
    pub file_browser_items: Vec<FileItem>,
    pub file_browser_state: ListState,

    // File editor (nano-like)
    pub file_editor_textarea: TextArea<'a>,
    pub file_editor_path: Option<String>,
    pub file_editor_from_dashboard: bool,

    // AI prompt
    pub ai_prompt_textarea: TextArea<'a>,
    pub ai_provider: AiProvider,
    pub ai_response: String,
    pub ai_scroll: u16,
    pub ai_pending: bool,

    // Status bar message (transient)
    pub status_message: String,
}

impl<'a> App<'a> {
    pub fn new() -> anyhow::Result<Self> {
        let auth_manager = AuthManager::new()?;
        let config_dir = auth_manager.config_dir().to_path_buf();
        let active_repo = auth_manager.get_active_repo().unwrap_or(None);
        let recent_files = files::load_recent_files(&config_dir).files;

        let mut note_textarea = TextArea::default();
        note_textarea.set_block(
            ratatui::widgets::Block::default()
                .borders(ratatui::widgets::Borders::ALL)
                .title("New Note (Enter: save | Esc: cancel)"),
        );

        let mut ai_prompt_textarea = TextArea::default();
        ai_prompt_textarea.set_block(
            ratatui::widgets::Block::default()
                .borders(ratatui::widgets::Borders::ALL)
                .title("Prompt (Tab: cycle provider | Ctrl+Enter: send | Esc: cancel)"),
        );

        let file_editor_textarea = TextArea::default();

        let mut app = Self {
            current_screen: CurrentScreen::Main,
            auth_manager,
            github_client: None,
            repos: Vec::new(),
            repo_list_state: ListState::default(),
            note_textarea,
            selected_repo_index: None,
            should_quit: false,
            trigger_login: false,
            active_repo,
            config_dir,
            local_repo_path: None,
            recent_files,
            dashboard_config: None,
            file_browser_items: Vec::new(),
            file_browser_state: ListState::default(),
            file_editor_textarea,
            file_editor_path: None,
            file_editor_from_dashboard: false,
            ai_prompt_textarea,
            ai_provider: AiProvider::Claude,
            ai_response: String::new(),
            ai_scroll: 0,
            ai_pending: false,
            status_message: String::new(),
        };

        if app.auth_manager.is_authenticated() {
            if let Ok(token) = app.auth_manager.get_token() {
                app.github_client = Some(GithubClient::new(token)?);
            }
        } else {
            app.current_screen = CurrentScreen::Login;
            app.trigger_login = true;
        }

        Ok(app)
    }

    pub async fn run<B: Backend>(&mut self, terminal: &mut Terminal<B>) -> io::Result<()> {
        loop {
            terminal.draw(|f| ui::ui(f, self))?;

            // Automatic login on first launch
            if self.trigger_login {
                self.trigger_login = false;
                if let Err(_) = self.auth_manager.login().await {
                } else {
                    if let Ok(token) = self.auth_manager.get_token() {
                        self.github_client = GithubClient::new(token).ok();
                    }
                    self.active_repo = self.auth_manager.get_active_repo().unwrap_or(None);
                }
                self.current_screen = CurrentScreen::Main;
            }

            // Execute pending AI request
            if self.ai_pending {
                self.ai_pending = false;
                let prompt = self.ai_prompt_textarea.lines().join("\n");
                if !prompt.trim().is_empty() {
                    self.status_message = format!("Asking {}…", self.ai_provider.name());
                    terminal.draw(|f| ui::ui(f, self))?;

                    let cmd = self.ai_provider.command().to_string();
                    let output = tokio::process::Command::new(&cmd)
                        .arg("-p")
                        .arg(&prompt)
                        .output()
                        .await;

                    self.ai_response = match output {
                        Ok(out) if out.status.success() => {
                            String::from_utf8_lossy(&out.stdout).into_owned()
                        }
                        Ok(out) => format!("Error: {}", String::from_utf8_lossy(&out.stderr)),
                        Err(e) => format!("Failed to run `{}`: {}", cmd, e),
                    };
                    self.status_message = String::new();
                    self.ai_scroll = 0;
                    self.current_screen = CurrentScreen::AiResponse;
                }
            }

            if event::poll(std::time::Duration::from_millis(100))? {
                if let Event::Key(key) = event::read()? {
                    if key.kind == event::KeyEventKind::Press {
                        if key.code == KeyCode::Char('c')
                            && key.modifiers.contains(KeyModifiers::CONTROL)
                        {
                            self.should_quit = true;
                            continue;
                        }

                        match self.current_screen.clone() {
                            CurrentScreen::Main => {
                                self.handle_main_input(terminal, key).await?
                            }
                            CurrentScreen::Login => {}
                            CurrentScreen::RepoSelect => self.handle_repo_select_input(key),
                            CurrentScreen::NoteInput => self.handle_note_input(key).await,
                            CurrentScreen::AiPrompt => self.handle_ai_prompt_input(key),
                            CurrentScreen::AiResponse => self.handle_ai_response_input(key),
                            CurrentScreen::FileBrowser => {
                                self.handle_file_browser_input(key)
                            }
                            CurrentScreen::FileEditor => self.handle_file_editor_input(key),
                            CurrentScreen::DashboardView => {
                                self.handle_dashboard_view_input(key)
                            }
                        }
                    }
                }
            }

            if self.should_quit {
                return Ok(());
            }
        }
    }

    // ── Main screen ───────────────────────────────────────────────────────────

    async fn handle_main_input<B: Backend>(
        &mut self,
        terminal: &mut Terminal<B>,
        key: KeyEvent,
    ) -> io::Result<()> {
        match key.code {
            KeyCode::Char('q') => self.should_quit = true,

            KeyCode::Char('l') => {
                self.current_screen = CurrentScreen::Login;
                terminal.draw(|f| ui::ui(f, self))?;
                if self.auth_manager.login().await.is_ok() {
                    if let Ok(token) = self.auth_manager.get_token() {
                        self.github_client = GithubClient::new(token).ok();
                    }
                    self.active_repo = self.auth_manager.get_active_repo().unwrap_or(None);
                }
                self.current_screen = CurrentScreen::Main;
            }

            KeyCode::Char('n') => {
                if !self.ensure_authenticated(terminal).await? {
                    return Ok(());
                }
                self.open_note_input(terminal).await?;
            }

            KeyCode::Char('s') => {
                if !self.ensure_authenticated(terminal).await? {
                    return Ok(());
                }
                if self.repos.is_empty() {
                    self.refresh_repos().await;
                }
                let selected = self
                    .active_repo
                    .as_ref()
                    .and_then(|ar| self.repos.iter().position(|r| &r.full_name == ar))
                    .unwrap_or(0);
                self.repo_list_state.select(Some(selected));
                self.current_screen = CurrentScreen::RepoSelect;
            }

            // AI prompt
            KeyCode::Char('a') => {
                self.current_screen = CurrentScreen::AiPrompt;
                self.update_ai_prompt_title();
            }

            // File browser (syncs repo first)
            KeyCode::Char('f') => {
                if !self.ensure_authenticated(terminal).await? {
                    return Ok(());
                }
                self.sync_and_open_browser(terminal, false).await?;
            }

            // Dashboard view (syncs repo first)
            KeyCode::Char('d') => {
                if !self.ensure_authenticated(terminal).await? {
                    return Ok(());
                }
                self.sync_and_open_browser(terminal, true).await?;
            }

            _ => {}
        }
        Ok(())
    }

    // ── Auth helpers ──────────────────────────────────────────────────────────

    /// Returns true if already authenticated, otherwise triggers login flow.
    async fn ensure_authenticated<B: Backend>(
        &mut self,
        terminal: &mut Terminal<B>,
    ) -> io::Result<bool> {
        if self.github_client.is_some() {
            return Ok(true);
        }
        self.current_screen = CurrentScreen::Login;
        terminal.draw(|f| ui::ui(f, self))?;
        if self.auth_manager.login().await.is_ok() {
            if let Ok(token) = self.auth_manager.get_token() {
                self.github_client = GithubClient::new(token).ok();
            }
            self.active_repo = self.auth_manager.get_active_repo().unwrap_or(None);
        }
        self.current_screen = CurrentScreen::Main;
        Ok(self.github_client.is_some())
    }

    // ── Repo sync & file browser entry ───────────────────────────────────────

    async fn sync_and_open_browser<B: Backend>(
        &mut self,
        terminal: &mut Terminal<B>,
        open_dashboard: bool,
    ) -> io::Result<()> {
        let Some(ref active_repo) = self.active_repo.clone() else {
            self.status_message = "No active repo. Press 's' to select one.".to_string();
            return Ok(());
        };

        let Ok(token) = self.auth_manager.get_token() else {
            return Ok(());
        };

        let mut parts = active_repo.split('/');
        let owner = parts.next().unwrap_or("").to_string();
        let repo_name = parts.next().unwrap_or("").to_string();

        self.status_message = "Syncing repository…".to_string();
        terminal.draw(|f| ui::ui(f, self))?;

        match crate::git::sync_repo(&self.config_dir, &owner, &repo_name, &token).await {
            Ok(path) => {
                self.local_repo_path = Some(path.clone());
                self.dashboard_config = files::load_dashboard_config(&path);
                self.recent_files = files::load_recent_files(&self.config_dir).files;
                self.status_message = String::new();

                if open_dashboard {
                    self.file_browser_items =
                        files::list_dashboard_files(&path, &self.dashboard_config, &self.recent_files);
                    self.current_screen = CurrentScreen::DashboardView;
                } else {
                    self.file_browser_items =
                        files::list_repo_files(&path, &self.recent_files);
                    self.current_screen = CurrentScreen::FileBrowser;
                }
                self.file_browser_state.select(Some(0));
            }
            Err(e) => {
                self.status_message = format!("Sync failed: {}", e);
            }
        }

        Ok(())
    }

    // ── Repo select ───────────────────────────────────────────────────────────

    fn handle_repo_select_input(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc => self.current_screen = CurrentScreen::Main,
            KeyCode::Up => {
                if !self.repos.is_empty() {
                    let i = match self.repo_list_state.selected() {
                        Some(i) => {
                            if i == 0 {
                                self.repos.len() - 1
                            } else {
                                i - 1
                            }
                        }
                        None => 0,
                    };
                    self.repo_list_state.select(Some(i));
                }
            }
            KeyCode::Down => {
                if !self.repos.is_empty() {
                    let i = match self.repo_list_state.selected() {
                        Some(i) => {
                            if i >= self.repos.len() - 1 {
                                0
                            } else {
                                i + 1
                            }
                        }
                        None => 0,
                    };
                    self.repo_list_state.select(Some(i));
                }
            }
            KeyCode::Enter => {
                if let Some(i) = self.repo_list_state.selected() {
                    let name = self.repos[i].full_name.clone();
                    self.active_repo = Some(name.clone());
                    let _ = self.auth_manager.set_active_repo(Some(name));
                    // Clear local repo path so next sync fetches the new repo
                    self.local_repo_path = None;
                    self.current_screen = CurrentScreen::Main;
                }
            }
            _ => {}
        }
    }

    // ── Note input ────────────────────────────────────────────────────────────

    async fn open_note_input<B: Backend>(
        &mut self,
        terminal: &mut Terminal<B>,
    ) -> io::Result<()> {
        if self.active_repo.is_some() {
            // Pre-populate repos list if needed so we have the index
            if self.repos.is_empty() {
                self.refresh_repos().await;
            }
            self.note_textarea = TextArea::default();
            self.note_textarea.set_block(
                ratatui::widgets::Block::default()
                    .borders(ratatui::widgets::Borders::ALL)
                    .title(format!(
                        "Add Note to {} (Enter: save | Esc: cancel)",
                        self.active_repo.as_deref().unwrap_or("?")
                    )),
            );
            self.current_screen = CurrentScreen::NoteInput;
        } else {
            // No active repo — pick one first
            if self.repos.is_empty() {
                self.refresh_repos().await;
            }
            self.repo_list_state.select(Some(0));
            self.current_screen = CurrentScreen::RepoSelect;
        }
        let _ = terminal;
        Ok(())
    }

    async fn handle_note_input(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc => self.current_screen = CurrentScreen::Main,
            KeyCode::Enter => {
                let text = self.note_textarea.lines().join("\n");
                if text.trim().is_empty() {
                    return;
                }
                if let Some(client) = &self.github_client {
                    if let Some(ref active_repo) = self.active_repo.clone() {
                        let mut parts = active_repo.split('/');
                        let owner = parts.next().unwrap_or("unknown");
                        let repo = parts.next().unwrap_or("unknown");
                        if let Err(e) = client.create_quicknote(owner, repo, &text).await {
                            let _ =
                                std::fs::write("error.log", format!("Error saving note: {:?}", e));
                        }
                    }
                    self.current_screen = CurrentScreen::Main;
                }
            }
            _ => {
                self.note_textarea.input(key);
            }
        }
    }

    // ── AI prompt ─────────────────────────────────────────────────────────────

    fn handle_ai_prompt_input(&mut self, key: KeyEvent) {
        match (key.code, key.modifiers) {
            (KeyCode::Esc, _) => {
                self.current_screen = CurrentScreen::Main;
            }
            (KeyCode::Tab, _) => {
                self.ai_provider = self.ai_provider.next();
                self.update_ai_prompt_title();
            }
            // Ctrl+Enter submits
            (KeyCode::Enter, m) if m.contains(KeyModifiers::CONTROL) => {
                self.ai_pending = true;
            }
            _ => {
                self.ai_prompt_textarea.input(key);
            }
        }
    }

    fn update_ai_prompt_title(&mut self) {
        self.ai_prompt_textarea.set_block(
            ratatui::widgets::Block::default()
                .borders(ratatui::widgets::Borders::ALL)
                .title(format!(
                    "Prompt [{}] (Tab: cycle | Ctrl+Enter: send | Esc: back)",
                    self.ai_provider.name()
                )),
        );
    }

    // ── AI response ───────────────────────────────────────────────────────────

    fn handle_ai_response_input(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc | KeyCode::Enter => {
                self.current_screen = CurrentScreen::AiPrompt;
            }
            KeyCode::Up => {
                self.ai_scroll = self.ai_scroll.saturating_sub(1);
            }
            KeyCode::Down => {
                self.ai_scroll = self.ai_scroll.saturating_add(1);
            }
            _ => {}
        }
    }

    // ── File browser ──────────────────────────────────────────────────────────

    fn handle_file_browser_input(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc => self.current_screen = CurrentScreen::Main,
            KeyCode::Up => {
                if !self.file_browser_items.is_empty() {
                    let i = match self.file_browser_state.selected() {
                        Some(i) => {
                            if i == 0 {
                                self.file_browser_items.len() - 1
                            } else {
                                i - 1
                            }
                        }
                        None => 0,
                    };
                    self.file_browser_state.select(Some(i));
                }
            }
            KeyCode::Down => {
                if !self.file_browser_items.is_empty() {
                    let i = match self.file_browser_state.selected() {
                        Some(i) => {
                            if i >= self.file_browser_items.len() - 1 {
                                0
                            } else {
                                i + 1
                            }
                        }
                        None => 0,
                    };
                    self.file_browser_state.select(Some(i));
                }
            }
            KeyCode::Enter => {
                if let Some(i) = self.file_browser_state.selected() {
                    let item = self.file_browser_items[i].clone();
                    if !item.is_dir {
                        self.open_file_editor(&item.path, false);
                    }
                }
            }
            _ => {}
        }
    }

    // ── File editor ───────────────────────────────────────────────────────────

    fn open_file_editor(&mut self, rel_path: &str, from_dashboard: bool) {
        let Some(ref repo_path) = self.local_repo_path.clone() else {
            return;
        };
        let full_path = repo_path.join(rel_path);
        let content = std::fs::read_to_string(&full_path).unwrap_or_default();
        let lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();

        files::add_recent_file(&self.config_dir, rel_path);
        self.recent_files = files::load_recent_files(&self.config_dir).files;

        let mut ta = TextArea::from(lines);
        ta.set_block(
            ratatui::widgets::Block::default()
                .borders(ratatui::widgets::Borders::ALL)
                .title(format!("{} (Ctrl+S: save | Esc: close)", rel_path)),
        );
        self.file_editor_textarea = ta;
        self.file_editor_path = Some(rel_path.to_string());
        self.file_editor_from_dashboard = from_dashboard;
        self.current_screen = CurrentScreen::FileEditor;
    }

    fn handle_file_editor_input(&mut self, key: KeyEvent) {
        match (key.code, key.modifiers) {
            (KeyCode::Esc, _) => {
                if self.file_editor_from_dashboard {
                    self.current_screen = CurrentScreen::DashboardView;
                } else {
                    self.current_screen = CurrentScreen::FileBrowser;
                }
            }
            (KeyCode::Char('s'), m) if m.contains(KeyModifiers::CONTROL) => {
                self.save_current_file();
            }
            _ => {
                self.file_editor_textarea.input(key);
            }
        }
    }

    fn save_current_file(&mut self) {
        let Some(ref path) = self.file_editor_path.clone() else {
            return;
        };
        let Some(ref repo_path) = self.local_repo_path.clone() else {
            return;
        };
        let full_path = repo_path.join(path);
        let content = self.file_editor_textarea.lines().join("\n");
        match std::fs::write(&full_path, content) {
            Ok(_) => self.status_message = format!("Saved {}", path),
            Err(e) => self.status_message = format!("Save failed: {}", e),
        }
    }

    // ── Dashboard view ────────────────────────────────────────────────────────

    fn handle_dashboard_view_input(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc => self.current_screen = CurrentScreen::Main,
            KeyCode::Up => {
                if !self.file_browser_items.is_empty() {
                    let i = match self.file_browser_state.selected() {
                        Some(i) => {
                            if i == 0 {
                                self.file_browser_items.len() - 1
                            } else {
                                i - 1
                            }
                        }
                        None => 0,
                    };
                    self.file_browser_state.select(Some(i));
                }
            }
            KeyCode::Down => {
                if !self.file_browser_items.is_empty() {
                    let i = match self.file_browser_state.selected() {
                        Some(i) => {
                            if i >= self.file_browser_items.len() - 1 {
                                0
                            } else {
                                i + 1
                            }
                        }
                        None => 0,
                    };
                    self.file_browser_state.select(Some(i));
                }
            }
            KeyCode::Enter => {
                if let Some(i) = self.file_browser_state.selected() {
                    let path = self.file_browser_items[i].path.clone();
                    if !self.file_browser_items[i].is_dir {
                        self.open_file_editor(&path, true);
                    }
                }
            }
            _ => {}
        }
    }

    // ── Utilities ─────────────────────────────────────────────────────────────

    async fn refresh_repos(&mut self) {
        if let Some(client) = &self.github_client {
            if let Ok(repos) = client.list_repos().await {
                self.repos = repos;
            }
        }
    }
}
