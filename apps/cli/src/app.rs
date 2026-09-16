use crossterm::event::{self, Event, KeyCode, KeyEvent, KeyModifiers};
use ratatui::widgets::ListState;
use ratatui::{Terminal, backend::Backend};
use std::io;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tui_textarea::TextArea;

use crate::auth::AuthManager;
use crate::db::Cache;
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

// ── Main menu items (key, label) ──────────────────────────────────────────────

pub const MENU_ITEMS: &[(&str, &str)] = &[
    ("n", "New quick note"),
    ("s", "Select active repository"),
    ("a", "AI prompt  [Claude / Copilot / Gemini]"),
    ("f", "File browser"),
    ("d", "Dashboard config"),
    ("l", "Login"),
];

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

// ── Background sync status ────────────────────────────────────────────────────

pub enum SyncStatus {
    Idle,
    Syncing,
    Done {
        path: PathBuf,
        files: Vec<(String, bool)>,
    },
    Error(String),
}

// ── App ───────────────────────────────────────────────────────────────────────

pub struct App<'a> {
    pub current_screen: CurrentScreen,
    pub auth_manager: AuthManager,
    pub github_client: Option<GithubClient>,
    pub repos: Vec<Repository>,
    pub repo_list_state: ListState,
    pub note_textarea: TextArea<'a>,
    pub should_quit: bool,
    pub trigger_login: bool,
    pub active_repo: Option<String>,

    // Config dir + SQLite cache
    pub config_dir: PathBuf,
    pub cache: Cache,

    // Background git sync
    pub sync_status: Arc<Mutex<SyncStatus>>,

    // Local repo clone path
    pub local_repo_path: Option<PathBuf>,

    // Recently used files (relative to repo root)
    pub recent_files: Vec<String>,

    // Dashboard config
    pub dashboard_config: Option<DashboardConfig>,
    pub dashboard_config_path: String,

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

    // Main menu navigation
    pub menu_index: usize,

    // Status bar message
    pub status_message: String,

    // Background git commit+push
    pub push_pending: bool,
    pub push_result: Arc<Mutex<Option<Result<(), String>>>>,
}

impl<'a> App<'a> {
    pub fn new() -> anyhow::Result<Self> {
        let auth_manager = AuthManager::new()?;
        let config_dir = auth_manager.config_dir().to_path_buf();
        let active_repo = auth_manager.get_active_repo().unwrap_or(None);
        let recent_files = files::load_recent_files(&config_dir).files;
        let cache = Cache::open(&config_dir)?;

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
                .title("Prompt [Claude] (Tab: cycle provider | Enter: send | Esc: cancel)"),
        );

        let mut app = Self {
            current_screen: CurrentScreen::Main,
            auth_manager,
            github_client: None,
            repos: Vec::new(),
            repo_list_state: ListState::default(),
            note_textarea,
            should_quit: false,
            trigger_login: false,
            active_repo,
            config_dir,
            cache,
            sync_status: Arc::new(Mutex::new(SyncStatus::Idle)),
            local_repo_path: None,
            recent_files,
            dashboard_config: None,
            dashboard_config_path: String::new(),
            file_browser_items: Vec::new(),
            file_browser_state: ListState::default(),
            file_editor_textarea: TextArea::default(),
            file_editor_path: None,
            file_editor_from_dashboard: false,
            ai_prompt_textarea,
            ai_provider: AiProvider::Claude,
            ai_response: String::new(),
            ai_scroll: 0,
            ai_pending: false,
            menu_index: 0,
            status_message: String::new(),
            push_pending: false,
            push_result: Arc::new(Mutex::new(None)),
        };

        if app.auth_manager.is_authenticated() {
            if let Ok(token) = app.auth_manager.get_token() {
                app.github_client = GithubClient::new(token).ok();
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

            // ── Automatic login on first launch ──────────────────────────────
            if self.trigger_login {
                self.trigger_login = false;
                if self.auth_manager.login().await.is_ok() {
                    if let Ok(token) = self.auth_manager.get_token() {
                        self.github_client = GithubClient::new(token).ok();
                    }
                    self.active_repo = self.auth_manager.get_active_repo().unwrap_or(None);
                }
                self.current_screen = CurrentScreen::Main;
                // Force immediate redraw so Login screen clears right away
                terminal.draw(|f| ui::ui(f, self))?;
            }

            // ── Execute pending AI request ────────────────────────────────────
            if self.ai_pending {
                self.ai_pending = false;
                let user_prompt = self.ai_prompt_textarea.lines().join("\n");
                if !user_prompt.trim().is_empty() {
                    self.status_message = format!("Asking {}…", self.ai_provider.name());
                    terminal.draw(|f| ui::ui(f, self))?;

                    // Build prompt with repo context as a leading system block
                    let full_prompt = self.build_ai_prompt(&user_prompt);

                    let cmd = self.ai_provider.command().to_string();
                    let repo_path = self.local_repo_path.clone();
                    let output = {
                        let mut c = tokio::process::Command::new(&cmd);
                        c.arg("-p")
                            .arg(&full_prompt)
                            .stdin(std::process::Stdio::null());
                        if let Some(ref p) = repo_path {
                            c.current_dir(p);
                        }
                        c.output().await
                    };

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

            // ── Kick off pending git commit+push ─────────────────────────────
            if self.push_pending {
                self.push_pending = false;
                if let (Some(path), Some(repo_dir)) =
                    (self.file_editor_path.clone(), self.local_repo_path.clone())
                {
                    let result_slot = Arc::clone(&self.push_result);
                    self.status_message = "↺ Pushing…".to_string();
                    tokio::spawn(async move {
                        let r = crate::git::commit_and_push(&repo_dir, &path)
                            .await
                            .map_err(|e| e.to_string());
                        *result_slot.lock().unwrap() = Some(r);
                    });
                }
            }

            // ── Poll git push result ──────────────────────────────────────────
            if let Some(r) = self.push_result.lock().unwrap().take() {
                self.status_message = match r {
                    Ok(()) => format!(
                        "Pushed {}",
                        self.file_editor_path.as_deref().unwrap_or("file")
                    ),
                    Err(e) => format!("Push failed: {}", e),
                };
            }

            // ── Check background sync result ──────────────────────────────────
            self.poll_sync_status();

            // ── Events ───────────────────────────────────────────────────────
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
                            CurrentScreen::Main => self.handle_main_input(terminal, key).await?,
                            CurrentScreen::Login => {}
                            CurrentScreen::RepoSelect => self.handle_repo_select_input(key),
                            CurrentScreen::NoteInput => self.handle_note_input(key).await,
                            CurrentScreen::AiPrompt => self.handle_ai_prompt_input(key),
                            CurrentScreen::AiResponse => self.handle_ai_response_input(key),
                            CurrentScreen::FileBrowser => self.handle_file_browser_input(key),
                            CurrentScreen::FileEditor => self.handle_file_editor_input(key),
                            CurrentScreen::DashboardView => self.handle_dashboard_view_input(key),
                        }
                    }
                }
            }

            if self.should_quit {
                return Ok(());
            }
        }
    }

    // ── Background sync polling ───────────────────────────────────────────────

    fn poll_sync_status(&mut self) {
        let maybe = {
            let mut guard = self.sync_status.lock().unwrap();
            match &*guard {
                SyncStatus::Syncing => {
                    if self.status_message.is_empty() {
                        self.status_message = "↻ Syncing…".to_string();
                    }
                    None
                }
                SyncStatus::Idle => None,
                _ => Some(std::mem::replace(&mut *guard, SyncStatus::Idle)),
            }
        };

        if let Some(status) = maybe {
            match status {
                SyncStatus::Done { path, files } => self.apply_sync_result(path, files),
                SyncStatus::Error(e) => {
                    self.status_message = format!("Sync failed: {}", e);
                }
                _ => {}
            }
        }
    }

    fn apply_sync_result(&mut self, path: PathBuf, files: Vec<(String, bool)>) {
        // Update SQLite cache
        if let Some(ref ar) = self.active_repo.clone() {
            let mut parts = ar.split('/');
            let owner = parts.next().unwrap_or("").to_string();
            let repo = parts.next().unwrap_or("").to_string();
            let _ = self.cache.set_files(&owner, &repo, &files);
        }

        self.local_repo_path = Some(path.clone());
        self.recent_files = files::load_recent_files(&self.config_dir).files;

        let (cfg, cfg_path) = files::load_dashboard_config(&path);
        self.dashboard_config = cfg;
        self.dashboard_config_path = cfg_path;

        // Refresh visible list based on current screen
        self.file_browser_items = match self.current_screen {
            CurrentScreen::DashboardView => {
                files::dashboard_items_from_raw(&files, &self.dashboard_config, &self.recent_files)
            }
            _ => files::files_from_raw(&files, &self.recent_files),
        };

        if self.status_message == "↻ Syncing…" {
            self.status_message = String::new();
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

            KeyCode::Up => {
                self.menu_index = (self.menu_index + MENU_ITEMS.len() - 1) % MENU_ITEMS.len();
            }
            KeyCode::Down => {
                self.menu_index = (self.menu_index + 1) % MENU_ITEMS.len();
            }
            KeyCode::Enter => {
                let idx = self.menu_index;
                self.activate_menu_item(terminal, idx).await?;
            }

            KeyCode::Char(c) => {
                if let Some(idx) = Self::menu_key_to_index(c) {
                    self.menu_index = idx;
                    self.activate_menu_item(terminal, idx).await?;
                }
            }

            _ => {}
        }
        Ok(())
    }

    fn menu_key_to_index(c: char) -> Option<usize> {
        MENU_ITEMS
            .iter()
            .position(|(k, _)| k.chars().next() == Some(c))
    }

    async fn activate_menu_item<B: Backend>(
        &mut self,
        terminal: &mut Terminal<B>,
        idx: usize,
    ) -> io::Result<()> {
        match idx {
            // n — New note
            0 => {
                if !self.ensure_authenticated(terminal).await? {
                    return Ok(());
                }
                self.open_note_input();
            }

            // s — Select repo
            1 => {
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

            // a — AI prompt
            2 => {
                self.current_screen = CurrentScreen::AiPrompt;
                self.update_ai_prompt_title();
            }

            // f — File browser
            3 => {
                if !self.ensure_authenticated(terminal).await? {
                    return Ok(());
                }
                self.open_browser(false);
            }

            // d — Dashboard
            4 => {
                if !self.ensure_authenticated(terminal).await? {
                    return Ok(());
                }
                self.open_browser(true);
            }

            // l — Login
            5 => {
                self.current_screen = CurrentScreen::Login;
                terminal.draw(|f| ui::ui(f, self))?;
                if self.auth_manager.login().await.is_ok() {
                    if let Ok(token) = self.auth_manager.get_token() {
                        self.github_client = GithubClient::new(token).ok();
                    }
                    self.active_repo = self.auth_manager.get_active_repo().unwrap_or(None);
                }
                self.current_screen = CurrentScreen::Main;
                terminal.draw(|f| ui::ui(f, self))?;
            }

            _ => {}
        }
        Ok(())
    }

    // ── Auth helper ───────────────────────────────────────────────────────────

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
        terminal.draw(|f| ui::ui(f, self))?;
        Ok(self.github_client.is_some())
    }

    // ── File browser entry — instant from cache, sync in background ───────────

    fn open_browser(&mut self, open_dashboard: bool) {
        let Some(ref ar) = self.active_repo.clone() else {
            self.status_message = "No active repo — press 's' to select one.".to_string();
            return;
        };
        let Ok(token) = self.auth_manager.get_token() else {
            return;
        };

        let mut parts = ar.split('/');
        let owner = parts.next().unwrap_or("").to_string();
        let repo_name = parts.next().unwrap_or("").to_string();

        // If the clone already exists on disk, set local_repo_path + dashboard config
        // immediately without waiting for the background sync to finish.
        let expected_path = self.config_dir.join("repos").join(&owner).join(&repo_name);
        if expected_path.join(".git").exists() {
            let (cfg, cfg_path) = files::load_dashboard_config(&expected_path);
            self.local_repo_path = Some(expected_path);
            self.dashboard_config = cfg;
            self.dashboard_config_path = cfg_path;
        }

        // Serve cached file list immediately
        if self.cache.has_cache(&owner, &repo_name) {
            let raw = self.cache.get_files(&owner, &repo_name);
            self.recent_files = files::load_recent_files(&self.config_dir).files;
            self.file_browser_items = if open_dashboard {
                files::dashboard_items_from_raw(&raw, &self.dashboard_config, &self.recent_files)
            } else {
                files::files_from_raw(&raw, &self.recent_files)
            };
        } else {
            self.file_browser_items = vec![];
        }
        self.file_browser_state.select(Some(0));

        if open_dashboard {
            self.current_screen = CurrentScreen::DashboardView;
        } else {
            self.current_screen = CurrentScreen::FileBrowser;
        }

        // Kick off background sync (non-blocking)
        *self.sync_status.lock().unwrap() = SyncStatus::Syncing;
        self.status_message = "↻ Syncing…".to_string();

        let status = Arc::clone(&self.sync_status);
        let config_dir = self.config_dir.clone();
        tokio::spawn(async move {
            match crate::git::sync_repo(&config_dir, &owner, &repo_name, &token).await {
                Ok(path) => {
                    let path_bg = path.clone();
                    let raw_files =
                        tokio::task::spawn_blocking(move || crate::files::walk_raw_files(&path_bg))
                            .await
                            .unwrap_or_default();
                    *status.lock().unwrap() = SyncStatus::Done {
                        path,
                        files: raw_files,
                    };
                }
                Err(e) => {
                    *status.lock().unwrap() = SyncStatus::Error(e.to_string());
                }
            }
        });
    }

    // ── Repo select ───────────────────────────────────────────────────────────

    fn handle_repo_select_input(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc => self.current_screen = CurrentScreen::Main,
            KeyCode::Up => {
                if !self.repos.is_empty() {
                    let i = self.repo_list_state.selected().unwrap_or(0);
                    let i = if i == 0 { self.repos.len() - 1 } else { i - 1 };
                    self.repo_list_state.select(Some(i));
                }
            }
            KeyCode::Down => {
                if !self.repos.is_empty() {
                    let i = self.repo_list_state.selected().unwrap_or(0);
                    let i = if i >= self.repos.len() - 1 { 0 } else { i + 1 };
                    self.repo_list_state.select(Some(i));
                }
            }
            KeyCode::Enter => {
                if let Some(i) = self.repo_list_state.selected() {
                    let name = self.repos[i].full_name.clone();
                    self.active_repo = Some(name.clone());
                    let _ = self.auth_manager.set_active_repo(Some(name));
                    // Clear local path so next open forces a fresh sync
                    self.local_repo_path = None;
                    self.current_screen = CurrentScreen::Main;
                }
            }
            _ => {}
        }
    }

    // ── Note input ────────────────────────────────────────────────────────────

    fn open_note_input(&mut self) {
        self.note_textarea = TextArea::default();
        self.note_textarea.set_block(
            ratatui::widgets::Block::default()
                .borders(ratatui::widgets::Borders::ALL)
                .title(format!(
                    "Note → {}  (Enter: save | Esc: cancel)",
                    self.active_repo.as_deref().unwrap_or("?")
                )),
        );
        self.current_screen = CurrentScreen::NoteInput;
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
                    if let Some(ref ar) = self.active_repo.clone() {
                        let mut parts = ar.split('/');
                        let owner = parts.next().unwrap_or("");
                        let repo = parts.next().unwrap_or("");
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
            (KeyCode::Esc, _) => self.current_screen = CurrentScreen::Main,
            (KeyCode::Tab, _) => {
                self.ai_provider = self.ai_provider.next();
                self.update_ai_prompt_title();
            }
            // Enter (any modifier combination) submits — Ctrl+Enter is unreliable
            // across terminals; plain Enter is the universal submit key here.
            (KeyCode::Enter, _) => {
                self.ai_pending = true;
            }
            _ => {
                self.ai_prompt_textarea.input(key);
            }
        }
    }

    /// Prepend repo + current-file context so the AI always knows where it's working.
    fn build_ai_prompt(&self, user_prompt: &str) -> String {
        let mut ctx = String::new();

        if let Some(ref ar) = self.active_repo {
            ctx.push_str(&format!("Repository: {}\n", ar));
        }

        if let Some(ref path) = self.local_repo_path {
            ctx.push_str(&format!("Local path: {}\n", path.display()));
        }

        // Include the file being edited if one is open
        if let Some(ref f) = self.file_editor_path {
            ctx.push_str(&format!("Current file: {}\n", f));
        }

        if ctx.is_empty() {
            user_prompt.to_string()
        } else {
            format!("{}\n{}", ctx.trim_end(), user_prompt.trim())
        }
    }

    fn update_ai_prompt_title(&mut self) {
        self.ai_prompt_textarea.set_block(
            ratatui::widgets::Block::default()
                .borders(ratatui::widgets::Borders::ALL)
                .title(format!(
                    "Prompt [{}] (Tab: cycle provider | Enter: send | Esc: back)",
                    self.ai_provider.name()
                )),
        );
    }

    // ── AI response ───────────────────────────────────────────────────────────

    fn handle_ai_response_input(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc | KeyCode::Enter => self.current_screen = CurrentScreen::AiPrompt,
            KeyCode::Up => self.ai_scroll = self.ai_scroll.saturating_sub(1),
            KeyCode::Down => self.ai_scroll = self.ai_scroll.saturating_add(1),
            _ => {}
        }
    }

    // ── File browser ──────────────────────────────────────────────────────────

    fn handle_file_browser_input(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc => self.current_screen = CurrentScreen::Main,
            KeyCode::Up => self.browser_nav(-1),
            KeyCode::Down => self.browser_nav(1),
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

    // ── Dashboard view ────────────────────────────────────────────────────────

    fn handle_dashboard_view_input(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc => self.current_screen = CurrentScreen::Main,
            KeyCode::Up => self.browser_nav(-1),
            KeyCode::Down => self.browser_nav(1),
            KeyCode::Enter => {
                if let Some(i) = self.file_browser_state.selected() {
                    let item = self.file_browser_items[i].clone();
                    if !item.is_dir {
                        self.open_file_editor(&item.path, true);
                    }
                }
            }
            _ => {}
        }
    }

    fn browser_nav(&mut self, delta: i32) {
        let n = self.file_browser_items.len();
        if n == 0 {
            return;
        }
        let cur = self.file_browser_state.selected().unwrap_or(0) as i32;
        let next = ((cur + delta).rem_euclid(n as i32)) as usize;
        self.file_browser_state.select(Some(next));
    }

    // ── File editor ───────────────────────────────────────────────────────────

    fn open_file_editor(&mut self, rel_path: &str, from_dashboard: bool) {
        let Some(ref repo_path) = self.local_repo_path.clone() else {
            self.status_message = "Repo not yet synced — please wait.".to_string();
            return;
        };
        let content = std::fs::read_to_string(repo_path.join(rel_path)).unwrap_or_default();
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
                self.current_screen = if self.file_editor_from_dashboard {
                    CurrentScreen::DashboardView
                } else {
                    CurrentScreen::FileBrowser
                };
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
        let content = self.file_editor_textarea.lines().join("\n");
        match std::fs::write(repo_path.join(path), content) {
            Ok(_) => {
                self.status_message = format!("Saved {} — committing…", path);
                self.push_pending = true;
            }
            Err(e) => self.status_message = format!("Save failed: {}", e),
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
