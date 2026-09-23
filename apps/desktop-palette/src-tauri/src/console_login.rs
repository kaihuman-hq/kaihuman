//! Logging in through the console, the way the CLI does (apps/cli/src/auth.rs).
//!
//! The console's `/auth/cli` page, once you are logged in there, posts a form with `token`, `state`
//! and `repo` to `http://localhost:<port>/callback` — a POST, so the token stays out of the
//! browser's history. The palette listens on that port on the loopback interface only, for one
//! grant carrying the `state` it sent, and gives up after a few minutes. Older console builds
//! redirected with the same fields in the query; that is still read.

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

/// A posted form is small; anything bigger is not the console's.
const MAX_BODY: usize = 16 * 1024;

/// Reads the callback's fields: from the body of `POST /callback`, or from the query of
/// `GET /callback?…`.
fn parse_request(method: &str, target: &str, body: &[u8], expected_state: &str) -> Callback {
    let fields = match (method, target) {
        ("POST", "/callback") => body,
        ("GET", _) => match target.strip_prefix("/callback?") {
            Some(query) => query.as_bytes(),
            None => return Callback::Unrelated,
        },
        _ => return Callback::Unrelated,
    };
    let (mut token, mut state, mut repo) = (None, None, None);
    for (key, value) in url::form_urlencoded::parse(fields) {
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

/// The request line's method and target, the headers' `Content-Length`, then that many bytes.
fn read_request(stream: &TcpStream) -> Option<(String, String, Vec<u8>)> {
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader.read_line(&mut line).ok()?;
    let mut parts = line.split_whitespace();
    let (method, target) = (parts.next()?.to_string(), parts.next()?.to_string());

    let mut length = 0;
    loop {
        let mut header = String::new();
        if reader.read_line(&mut header).ok()? == 0 || header.trim_end().is_empty() {
            break;
        }
        if let Some((name, value)) = header.split_once(':')
            && name.eq_ignore_ascii_case("content-length")
        {
            length = value.trim().parse().ok()?;
        }
    }
    if length > MAX_BODY {
        return None;
    }
    let mut body = vec![0; length];
    reader.read_exact(&mut body).ok()?;
    Some((method, target, body))
}

fn serve(stream: TcpStream, expected_state: &str) -> Option<Grant> {
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let Some((method, target, body)) = read_request(&stream) else {
        respond(stream, "400 Bad Request", "That request could not be read.");
        return None;
    };
    match parse_request(&method, &target, &body, expected_state) {
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
            parse_request(
                "POST",
                "/callback",
                b"token=gho_abc&state=s1&repo=o%2Fr",
                "s1"
            ),
            Callback::Grant(Grant {
                token: "gho_abc".into(),
                repo: Some("o/r".into()),
            })
        );
        assert_eq!(
            parse_request("GET", "/callback?token=t&state=s1&repo=", b"", "s1"),
            Callback::Grant(Grant {
                token: "t".into(),
                repo: None,
            })
        );
    }

    #[test]
    fn refuses_a_callback_it_did_not_ask_for() {
        assert_eq!(
            parse_request("POST", "/callback", b"token=t&state=other", "s1"),
            Callback::WrongState
        );
        assert_eq!(
            parse_request("GET", "/callback?token=t", b"", "s1"),
            Callback::WrongState
        );
        assert_eq!(
            parse_request("POST", "/callback", b"state=s1", "s1"),
            Callback::NoToken
        );
        assert_eq!(
            parse_request("GET", "/favicon.ico", b"", "s1"),
            Callback::Unrelated
        );
        assert_eq!(
            parse_request("POST", "/elsewhere", b"token=t&state=s1", "s1"),
            Callback::Unrelated
        );
    }

    #[test]
    fn states_are_random_and_long() {
        let (a, b) = (random_state().unwrap(), random_state().unwrap());
        assert_eq!(a.len(), 32);
        assert_ne!(a, b);
    }

    fn exchange(port: u16, request: &str) -> String {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        stream.write_all(request.as_bytes()).unwrap();
        let mut response = String::new();
        stream.read_to_string(&mut response).unwrap();
        response
    }

    fn get(port: u16, path: &str) -> String {
        exchange(
            port,
            &format!("GET {path} HTTP/1.1\r\nHost: localhost\r\n\r\n"),
        )
    }

    /// What a browser sends when the console's form submits.
    fn post(port: u16, body: &str) -> String {
        exchange(
            port,
            &format!(
                "POST /callback HTTP/1.1\r\nHost: localhost:{port}\r\n\
                 Content-Type: application/x-www-form-urlencoded\r\n\
                 Content-Length: {}\r\n\r\n{body}",
                body.len()
            ),
        )
    }

    fn port_and_state(url: &str) -> (u16, String) {
        let port = url
            .split("port=")
            .nth(1)
            .unwrap()
            .split('&')
            .next()
            .unwrap();
        let state = url.split("state=").nth(1).unwrap();
        (port.parse().unwrap(), state.to_string())
    }

    #[test]
    fn still_takes_the_redirect_of_older_consoles() {
        let pending = Pending::start().unwrap();
        let (port, state) = port_and_state(&pending.authorize_url().unwrap());
        let browser =
            std::thread::spawn(move || get(port, &format!("/callback?token=t&state={state}")));
        let grant = pending.wait(Duration::from_secs(10)).unwrap();
        assert_eq!(
            grant,
            Grant {
                token: "t".into(),
                repo: None
            }
        );
        assert!(browser.join().unwrap().starts_with("HTTP/1.1 200"));
    }

    #[test]
    fn refuses_a_body_too_big_to_be_the_console_form() {
        let pending = Pending::start().unwrap();
        let (port, state) = port_and_state(&pending.authorize_url().unwrap());
        let browser = std::thread::spawn(move || {
            // Declared, not sent: the length alone must get it refused.
            let refused = exchange(
                port,
                &format!(
                    "POST /callback HTTP/1.1\r\nContent-Length: {}\r\n\r\ntoken=t",
                    MAX_BODY + 1
                ),
            );
            let accepted = post(port, &format!("token=t&state={state}"));
            (refused, accepted)
        });
        pending.wait(Duration::from_secs(10)).unwrap();
        let (refused, accepted) = browser.join().unwrap();
        assert!(refused.starts_with("HTTP/1.1 400"));
        assert!(accepted.starts_with("HTTP/1.1 200"));
    }

    #[test]
    fn waits_past_stray_requests_for_the_matching_grant() {
        let pending = Pending::start().unwrap();
        let url = pending.authorize_url().unwrap();
        let (port, state) = port_and_state(&url);
        assert!(url.starts_with("https://app.kaihuman.com/auth/cli?port="));

        let browser = std::thread::spawn(move || {
            let stray = get(port, "/favicon.ico");
            let forged = post(port, "token=evil&state=nope");
            let real = post(port, &format!("token=good&state={state}&repo=o%2Fr"));
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
