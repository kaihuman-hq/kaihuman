//! Logging in through the console, the way the CLI does (apps/cli/src/auth.rs).
//!
//! The console's `/auth/cli` page, once you are logged in there, redirects the browser to
//! `http://localhost:<port>/callback?token=…&state=…&repo=…`. The palette listens on that port on
//! the loopback interface only, for one grant carrying the `state` it sent, and gives up after a
//! few minutes.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::{Duration, Instant};

use crate::github::CONSOLE_URL;

/// How long the browser has to come back before `login` gives up.
pub const TIMEOUT: Duration = Duration::from_secs(300);

/// What the console hands over.
#[derive(Debug, PartialEq)]
pub struct Grant {
    pub token: String,
    /// The repository selected in the console, if any.
    pub repo: Option<String>,
}

/// A loopback listener waiting for one grant.
pub struct Pending {
    listener: TcpListener,
    state: String,
}

/// 128 random bits, hex: ties the callback to this login and no other.
fn random_state() -> Result<String, String> {
    let mut bytes = [0u8; 16];
    std::fs::File::open("/dev/urandom")
        .and_then(|mut source| source.read_exact(&mut bytes))
        .map_err(|error| format!("could not read randomness: {error}"))?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

impl Pending {
    pub fn start() -> Result<Self, String> {
        let listener = TcpListener::bind(("127.0.0.1", 0))
            .map_err(|error| format!("could not listen for the console: {error}"))?;
        Ok(Self {
            listener,
            state: random_state()?,
        })
    }

    /// The console page to open in the browser.
    pub fn authorize_url(&self) -> Result<String, String> {
        let port = self
            .listener
            .local_addr()
            .map_err(|error| error.to_string())?
            .port();
        Ok(format!(
            "{CONSOLE_URL}/auth/cli?port={port}&state={}",
            self.state
        ))
    }

    /// Serves requests until the grant arrives or `timeout` passes. Anything else — a favicon, a
    /// callback with another state — is answered and ignored.
    pub fn wait(self, timeout: Duration) -> Result<Grant, String> {
        let deadline = Instant::now() + timeout;
        self.listener
            .set_nonblocking(true)
            .map_err(|error| error.to_string())?;
        while Instant::now() < deadline {
            match self.listener.accept() {
                Ok((stream, _)) => {
                    if let Some(grant) = serve(stream, &self.state) {
                        return Ok(grant);
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(100));
                }
                Err(error) => return Err(format!("login listener failed: {error}")),
            }
        }
        Err("No answer from the console within five minutes — try again".into())
    }
}

/// Where a callback leads.
#[derive(Debug, PartialEq)]
enum Callback {
    Grant(Grant),
    WrongState,
    NoToken,
    Unrelated,
}

/// Reads `GET /callback?… HTTP/1.1`.
fn parse_request_line(line: &str, expected_state: &str) -> Callback {
    let Some(target) = line
        .strip_prefix("GET ")
        .and_then(|rest| rest.split(' ').next())
    else {
        return Callback::Unrelated;
    };
    let Some(query) = target.strip_prefix("/callback?") else {
        return Callback::Unrelated;
    };
    let (mut token, mut state, mut repo) = (None, None, None);
    for (key, value) in url::form_urlencoded::parse(query.as_bytes()) {
        match key.as_ref() {
            "token" => token = Some(value.into_owned()),
            "state" => state = Some(value.into_owned()),
            "repo" => repo = Some(value.into_owned()),
            _ => {}
        }
    }
    if state.as_deref() != Some(expected_state) {
        return Callback::WrongState;
    }
    match token.filter(|token| !token.is_empty()) {
        Some(token) => Callback::Grant(Grant {
            token,
            repo: repo.filter(|repo| !repo.is_empty()),
        }),
        None => Callback::NoToken,
    }
}

const PAGE: &str = "<!doctype html><meta charset=utf-8><title>lifosy-palette</title>\
<body style=\"font:16px monospace;background:#0d0d0d;color:#e6e6e6;display:grid;place-items:center;height:90vh\">";

fn respond(mut stream: TcpStream, status: &str, message: &str) {
    let body =
        format!("{PAGE}<p>{message}</p><script>setTimeout(() => window.close(), 1500)</script>");
    let _ = write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\n\
         Cache-Control: no-store\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
}

fn serve(stream: TcpStream, expected_state: &str) -> Option<Grant> {
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut line = String::new();
    BufReader::new(&stream).read_line(&mut line).ok()?;
    match parse_request_line(line.trim_end(), expected_state) {
        Callback::Grant(grant) => {
            respond(
                stream,
                "200 OK",
                "The desktop palette is logged in. You can close this tab.",
            );
            Some(grant)
        }
        Callback::WrongState => {
            respond(
                stream,
                "400 Bad Request",
                "This login link is not the one the palette opened.",
            );
            None
        }
        Callback::NoToken => {
            respond(
                stream,
                "400 Bad Request",
                "The console sent no token — are you logged in there?",
            );
            None
        }
        Callback::Unrelated => {
            respond(stream, "404 Not Found", "Nothing here.");
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_grant_the_console_redirects_with() {
        assert_eq!(
            parse_request_line(
                "GET /callback?token=gho_abc&state=s1&repo=o%2Fr HTTP/1.1",
                "s1"
            ),
            Callback::Grant(Grant {
                token: "gho_abc".into(),
                repo: Some("o/r".into()),
            })
        );
        assert_eq!(
            parse_request_line("GET /callback?token=t&state=s1&repo= HTTP/1.1", "s1"),
            Callback::Grant(Grant {
                token: "t".into(),
                repo: None,
            })
        );
    }

    #[test]
    fn refuses_a_callback_it_did_not_ask_for() {
        let line = "GET /callback?token=t&state=other HTTP/1.1";
        assert_eq!(parse_request_line(line, "s1"), Callback::WrongState);
        assert_eq!(
            parse_request_line("GET /callback?token=t HTTP/1.1", "s1"),
            Callback::WrongState
        );
        assert_eq!(
            parse_request_line("GET /callback?state=s1 HTTP/1.1", "s1"),
            Callback::NoToken
        );
        assert_eq!(
            parse_request_line("GET /favicon.ico HTTP/1.1", "s1"),
            Callback::Unrelated
        );
        assert_eq!(
            parse_request_line("POST /callback?token=t&state=s1 HTTP/1.1", "s1"),
            Callback::Unrelated
        );
    }

    #[test]
    fn states_are_random_and_long() {
        let (a, b) = (random_state().unwrap(), random_state().unwrap());
        assert_eq!(a.len(), 32);
        assert_ne!(a, b);
    }

    fn get(port: u16, path: &str) -> String {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        write!(stream, "GET {path} HTTP/1.1\r\nHost: localhost\r\n\r\n").unwrap();
        let mut response = String::new();
        stream.read_to_string(&mut response).unwrap();
        response
    }

    #[test]
    fn waits_past_stray_requests_for_the_matching_grant() {
        let pending = Pending::start().unwrap();
        let url = pending.authorize_url().unwrap();
        let port: u16 = url
            .split("port=")
            .nth(1)
            .unwrap()
            .split('&')
            .next()
            .unwrap()
            .parse()
            .unwrap();
        let state = url.split("state=").nth(1).unwrap().to_string();
        assert!(url.starts_with("https://app.kaihuman.com/auth/cli?port="));

        let browser = std::thread::spawn(move || {
            let stray = get(port, "/favicon.ico");
            let forged = get(port, "/callback?token=evil&state=nope");
            let real = get(
                port,
                &format!("/callback?token=good&state={state}&repo=o%2Fr"),
            );
            (stray, forged, real)
        });
        let grant = pending.wait(Duration::from_secs(10)).unwrap();
        let (stray, forged, real) = browser.join().unwrap();

        assert_eq!(
            grant,
            Grant {
                token: "good".into(),
                repo: Some("o/r".into())
            }
        );
        assert!(stray.starts_with("HTTP/1.1 404"));
        assert!(forged.starts_with("HTTP/1.1 400"));
        assert!(real.starts_with("HTTP/1.1 200"));
    }

    #[test]
    fn gives_up_after_the_timeout() {
        let error = Pending::start()
            .unwrap()
            .wait(Duration::from_millis(200))
            .unwrap_err();
        assert!(error.contains("No answer from the console"));
    }
}
