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
    pub trigger_login: bool,
    pub active_repo: Option<String>,
}

impl<'a> App<'a> {
    pub fn new() -> anyhow::Result<Self> {
        let auth_manager = AuthManager::new()?;
        let active_repo = auth_manager.get_active_repo().unwrap_or(None);
        let mut app = Self {
            current_screen: CurrentScreen::Main,
            auth_manager,
            github_client: None,
            repos: Vec::new(),
            repo_list_state: ListState::default(),
            note_textarea: TextArea::default(),
            selected_repo_index: None,
            should_quit: false,
            trigger_login: false,
            active_repo,
        };
        
        app.note_textarea.set_block(
            ratatui::widgets::Block::default()
            .borders(ratatui::widgets::Borders::ALL)
            .title("New Note (Enter to Submit, Esc to Cancel)")
        );

        if app.auth_manager.is_authenticated() {
            if let Ok(token) = app.auth_manager.get_token() {
                app.github_client = Some(GithubClient::new(token).unwrap());
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

            // Trigger automatic login if needed
            if self.trigger_login {
                self.trigger_login = false;
                if let Err(_e) = self.auth_manager.login().await {
                    // TODO: Handle login error
                } else {
                    if let Ok(token) = self.auth_manager.get_token() {
                        self.github_client = Some(GithubClient::new(token).unwrap());
                    }
                    self.active_repo = self.auth_manager.get_active_repo().unwrap_or(None);
                }
                self.current_screen = CurrentScreen::Main;
            }

            // Poll for events to allow for async updates if needed (e.g. a spinner)
            // For now, simple blocking read is fine because we await async actions immediately
            if event::poll(std::time::Duration::from_millis(100))? {
                if let Event::Key(key) = event::read()? {
                    if key.kind == event::KeyEventKind::Press {
                        if key.code == KeyCode::Char('c') && key.modifiers.contains(event::KeyModifiers::CONTROL) {
                            self.should_quit = true;
                            continue;
                        }

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
                     self.active_repo = self.auth_manager.get_active_repo().unwrap_or(None);
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
                         self.active_repo = self.auth_manager.get_active_repo().unwrap_or(None);
                     }
                     self.current_screen = CurrentScreen::Main;
                } else if self.active_repo.is_some() {
                     // Active repo already selected, jump straight to typing the note
                     if let Some(active_name) = &self.active_repo {
                         if let Some(idx) = self.repos.iter().position(|r| &r.full_name == active_name) {
                             self.selected_repo_index = Some(idx);
                             self.current_screen = CurrentScreen::NoteInput;
                             self.note_textarea = TextArea::default();
                             self.note_textarea.set_block(
                                 ratatui::widgets::Block::default()
                                 .borders(ratatui::widgets::Borders::ALL)
                                 .title(format!("Add Note to {}", self.repos[idx].name))
                             );
                             return Ok(());
                         }
                     }
                     
                     // Fallback if active_repo does not exist in local repos cache yet
                     if self.repos.is_empty() {
                         self.refresh_repos().await;
                     }
                     self.current_screen = CurrentScreen::RepoSelect;
                     self.repo_list_state.select(Some(0));
                } else {
                     if self.repos.is_empty() {
                         self.refresh_repos().await;
                     }
                     self.current_screen = CurrentScreen::RepoSelect;
                     self.repo_list_state.select(Some(0));
                }
            }
            KeyCode::Char('s') => {
                if self.github_client.is_none() {
                     // Not authenticated, do nothing or prompt login
                     self.current_screen = CurrentScreen::Login;
                     terminal.draw(|f| ui::ui(f, self))?;
                     
                     if let Err(_e) = self.auth_manager.login().await {
                         // Error
                     } else {
                         if let Ok(token) = self.auth_manager.get_token() {
                            self.github_client = Some(GithubClient::new(token).unwrap());
                         }
                         self.active_repo = self.auth_manager.get_active_repo().unwrap_or(None);
                     }
                     self.current_screen = CurrentScreen::Main;
                } else {
                     if self.repos.is_empty() {
                         self.refresh_repos().await;
                     }
                     self.current_screen = CurrentScreen::RepoSelect;
                     
                     let mut selected_idx = 0;
                     if let Some(ref active_repo) = self.active_repo {
                         if let Some(idx) = self.repos.iter().position(|r| &r.full_name == active_repo) {
                             selected_idx = idx;
                         }
                     }
                     self.repo_list_state.select(Some(selected_idx));
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
                    let selected_repo_name = self.repos[i].full_name.clone();
                    self.active_repo = Some(selected_repo_name.clone());
                    let _ = self.auth_manager.set_active_repo(Some(selected_repo_name));
                    
                    self.current_screen = CurrentScreen::Main;
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
                if let Some(client) = &self.github_client {
                    if let Some(ref active_repo) = self.active_repo {
                        let mut parts = active_repo.split('/');
                        let owner = parts.next().unwrap_or("unknown");
                        let repo = parts.next().unwrap_or("unknown");
                        
                        if let Err(e) = client.create_quicknote(owner, repo, &text).await {
                             // Fallback logging for errors
                             let _ = std::fs::write("error.log", format!("Error saving note: {:?}", e));
                        }
                    } else if let Some(idx) = self.selected_repo_index {
                        // Fallback logic if they bypassed Active Repo somehow and ran from the old reposelect
                        let repo = &self.repos[idx];
                        let owner = repo.full_name.split('/').next().unwrap_or("unknown");
                        
                        if let Err(e) = client.create_quicknote(owner, &repo.name, &text).await {
                             let _ = std::fs::write("error.log", format!("Error saving note: {:?}", e));
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

    async fn refresh_repos(&mut self) {
        if let Some(client) = &self.github_client {
            if let Ok(repos) = client.list_repos().await {
                self.repos = repos;
            }
        }
    }
}
