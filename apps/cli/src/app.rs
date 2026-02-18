use crossterm::event::{self, Event, KeyCode, KeyEvent};
use ratatui::{backend::Backend, Terminal};
use std::io;
use tui_textarea::TextArea;
use ratatui::widgets::ListState;

use crate::auth::AuthManager;
use crate::github::{GithubClient, Repository};
use crate::ui;

pub enum CurrentScreen {
    Main,
    Login,
    RepoSelect,
    NoteInput,
}

pub struct App<'a> {
    pub current_screen: CurrentScreen,
    pub auth_manager: AuthManager,
    pub github_client: Option<GithubClient>,
    pub repos: Vec<Repository>,
    pub repo_list_state: ListState,
    pub note_textarea: TextArea<'a>,
    pub selected_repo_index: Option<usize>,
    pub should_quit: bool,
}

impl<'a> App<'a> {
    pub fn new() -> anyhow::Result<Self> {
        let auth_manager = AuthManager::new()?;
        let mut app = Self {
            current_screen: CurrentScreen::Main,
            auth_manager,
            github_client: None,
            repos: Vec::new(),
            repo_list_state: ListState::default(),
            note_textarea: TextArea::default(),
            selected_repo_index: None,
            should_quit: false,
        };
        
        app.note_textarea.set_block(
            ratatui::widgets::Block::default()
            .borders(ratatui::widgets::Borders::ALL)
            .title("New Note (Enter to Submit, Esc to Cancel)")
        );

        if let Ok(token) = app.auth_manager.get_token() {
             app.github_client = Some(GithubClient::new(token).unwrap());
        }

        Ok(app)
    }

    pub async fn run<B: Backend>(&mut self, terminal: &mut Terminal<B>) -> io::Result<()> {
        loop {
            terminal.draw(|f| ui::ui(f, self))?;

            // Poll for events to allow for async updates if needed (e.g. a spinner)
            // For now, simple blocking read is fine because we await async actions immediately
            if event::poll(std::time::Duration::from_millis(100))? {
                if let Event::Key(key) = event::read()? {
                    if key.kind == event::KeyEventKind::Press {
                        match self.current_screen {
                            CurrentScreen::Main => self.handle_main_input(terminal, key).await?,
                            CurrentScreen::Login => {}, // Login is blocking in handle_main_input currently
                            CurrentScreen::RepoSelect => self.handle_repo_select_input(key),
                            CurrentScreen::NoteInput => self.handle_note_input(key).await,
                        }
                    }
                }
            }

            if self.should_quit {
                return Ok(());
            }
        }
    }

    async fn handle_main_input<B: Backend>(&mut self, terminal: &mut Terminal<B>, key: KeyEvent) -> io::Result<()> {
        match key.code {
            KeyCode::Char('q') => self.should_quit = true,
            KeyCode::Char('l') => {
                self.current_screen = CurrentScreen::Login;
                terminal.draw(|f| ui::ui(f, self))?;
                
                // Perform Login
                if let Err(_e) = self.auth_manager.login().await {
                    // TODO: Show error state
                } else {
                     if let Ok(token) = self.auth_manager.get_token() {
                        self.github_client = Some(GithubClient::new(token).unwrap());
                     }
                }
                self.current_screen = CurrentScreen::Main;
            }
            KeyCode::Char('n') => {
                if self.github_client.is_none() {
                     self.current_screen = CurrentScreen::Login;
                     terminal.draw(|f| ui::ui(f, self))?;
                     
                     if let Err(_e) = self.auth_manager.login().await {
                         // Error
                     } else {
                         if let Ok(token) = self.auth_manager.get_token() {
                            self.github_client = Some(GithubClient::new(token).unwrap());
                         }
                     }
                     self.current_screen = CurrentScreen::Main;
                } else {
                     if self.repos.is_empty() {
                         self.refresh_repos().await;
                     }
                     self.current_screen = CurrentScreen::RepoSelect;
                     self.repo_list_state.select(Some(0));
                }
            }
            _ => {}
        }
        Ok(())
    }

    fn handle_repo_select_input(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc => self.current_screen = CurrentScreen::Main,
            KeyCode::Up => {
                if !self.repos.is_empty() {
                    let i = match self.repo_list_state.selected() {
                        Some(i) => if i == 0 { self.repos.len() - 1 } else { i - 1 },
                        None => 0,
                    };
                    self.repo_list_state.select(Some(i));
                }
            }
            KeyCode::Down => {
                if !self.repos.is_empty() {
                    let i = match self.repo_list_state.selected() {
                        Some(i) => if i >= self.repos.len() - 1 { 0 } else { i + 1 },
                        None => 0,
                    };
                    self.repo_list_state.select(Some(i));
                }
            }
            KeyCode::Enter => {
                if let Some(i) = self.repo_list_state.selected() {
                    self.selected_repo_index = Some(i);
                    self.current_screen = CurrentScreen::NoteInput;
                    self.note_textarea = TextArea::default();
                    self.note_textarea.set_block(
                        ratatui::widgets::Block::default()
                        .borders(ratatui::widgets::Borders::ALL)
                        .title(format!("Add Note to {}", self.repos[i].name))
                    );
                }
            }
            _ => {}
        }
    }

    async fn handle_note_input(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc => self.current_screen = CurrentScreen::Main,
            KeyCode::Enter => {
                let lines = self.note_textarea.lines();
                let text = lines.join("\n");
                // Allow empty notes? Maybe not.
                if text.trim().is_empty() {
                    return;
                }
                
                if let (Some(client), Some(idx)) = (&self.github_client, self.selected_repo_index) {
                    let repo = &self.repos[idx];
                    let owner = repo.full_name.split('/').next().unwrap_or("unknown");
                    
                    if let Err(_e) = client.append_to_inbox(owner, &repo.name, &text).await {
                         // TODO: Handle Error
                    }
                    self.current_screen = CurrentScreen::Main;
                }
            }
             _ => {
                 self.note_textarea.input(key);
             }
        }
    }

    async fn refresh_repos(&mut self) {
        if let Some(client) = &self.github_client {
            if let Ok(repos) = client.list_repos().await {
                self.repos = repos;
            }
        }
    }
}
