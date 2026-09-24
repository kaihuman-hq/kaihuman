//! The few GitHub REST calls the palette needs, mirroring the browser extension's service worker.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use percent_encoding::{AsciiSet, NON_ALPHANUMERIC, utf8_percent_encode};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};

/// The Lifosy console — where a repo file is opened, rather than on GitHub.
pub const CONSOLE_URL: &str = "https://app.kaihuman.com";

/// What `encodeURIComponent` leaves alone; the console decodes paths the way the browser encodes.
const COMPONENT: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'!')
    .remove(b'~')
    .remove(b'*')
    .remove(b'\'')
    .remove(b'(')
    .remove(b')');

/// `a b/c#1.md` → `a%20b/c%231.md`: each segment encoded, the slashes kept.
pub fn encode_path(path: &str) -> String {
    let encoded: Vec<String> = path
        .split('/')
        .map(|segment| utf8_percent_encode(segment, COMPONENT).to_string())
        .collect();
    encoded.join("/")
}

/// Deep link that opens a repo file in the console, like the extension's `consoleFileUrl`.
pub fn console_file_url(path: &str, repo: &str) -> String {
    let query = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("repo", repo)
        .finish();
    format!("{CONSOLE_URL}/files/{}?{query}", encode_path(path))
}

pub struct Client {
    http: reqwest::Client,
    api: String,
    token: String,
    repo: String,
}

/// A file read with `If-None-Match`.
pub enum Read {
    NotModified,
    Missing,
    Found {
        content: String,
        sha: String,
        etag: Option<String>,
    },
}

#[derive(Deserialize)]
struct ContentsResponse {
    #[serde(default)]
    content: String,
    sha: String,
}

#[derive(Deserialize)]
struct SearchResponse {
    #[serde(default)]
    items: Vec<SearchItem>,
}

#[derive(Deserialize)]
struct SearchItem {
    path: String,
    name: String,
}

#[derive(Deserialize)]
struct TreeResponse {
    #[serde(default)]
    tree: Vec<TreeEntry>,
}

/// One path in a recursive tree listing; `kind` is `blob` for a file.
#[derive(Debug, Deserialize)]
pub struct TreeEntry {
    pub path: String,
    #[serde(rename = "type")]
    pub kind: String,
}

/// A repository from `/user/repos`.
#[derive(Debug, Deserialize)]
pub struct UserRepo {
    pub full_name: String,
    #[serde(default)]
    pub description: Option<String>,
}

/// What `>w` searches; mirrors `GITHUB_WORK_QUERIES` in packages/palette/src/protocol.ts.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum WorkFilter {
    ReviewRequested,
    Assigned,
    Failing,
}

impl WorkFilter {
    pub fn query(self) -> &'static str {
        match self {
            Self::ReviewRequested => "is:open is:pr archived:false review-requested:@me",
            Self::Assigned => "is:open archived:false assignee:@me",
            Self::Failing => "is:open is:pr archived:false author:@me status:failure",
        }
    }
}

#[derive(Deserialize)]
struct IssueSearchResponse {
    #[serde(default)]
    items: Vec<IssueSearchItem>,
}

#[derive(Deserialize)]
struct IssueSearchItem {
    number: u64,
    title: String,
    html_url: String,
    repository_url: String,
    updated_at: String,
    /// Set only on pull requests.
    #[serde(default)]
    pull_request: Option<serde_json::Value>,
}

/// One issue or pull request, as `GithubWorkItem` in the palette's protocol.
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkItem {
    pub repo: String,
    pub number: u64,
    pub title: String,
    pub url: String,
    pub pull_request: bool,
    pub updated_at: String,
}

impl From<IssueSearchItem> for WorkItem {
    fn from(item: IssueSearchItem) -> Self {
        // `https://api.github.com/repos/owner/name` → `owner/name`.
        let parts: Vec<&str> = item.repository_url.rsplitn(3, '/').collect();
        let repo = match parts.as_slice() {
            [name, owner, _] => format!("{owner}/{name}"),
            _ => item.repository_url.clone(),
        };
        Self {
            repo,
            number: item.number,
            title: item.title,
            url: item.html_url,
            pull_request: item.pull_request.is_some(),
            updated_at: item.updated_at,
        }
    }
}

pub struct SearchHit {
    pub path: String,
    pub name: String,
    pub url: String,
}

impl Client {
    pub fn new(token: String, repo: String) -> Self {
        Self {
            http: reqwest::Client::new(),
            // Overridable so tests can point the palette at a local stand-in for GitHub.
            api: std::env::var("LIFOSY_GITHUB_API")
                .unwrap_or_else(|_| "https://api.github.com".into()),
            token,
            repo,
        }
    }

    pub fn repo(&self) -> &str {
        &self.repo
    }

    fn request(&self, method: reqwest::Method, url: &str) -> reqwest::RequestBuilder {
        self.http
            .request(method, url)
            .bearer_auth(&self.token)
            .header("Accept", "application/vnd.github+json")
            // GitHub refuses requests without one; the browser sends its own.
            .header("User-Agent", "lifosy-palette")
    }

    fn contents_url(&self, path: &str) -> String {
        format!("{}/repos/{}/contents/{path}", self.api, self.repo)
    }

    pub async fn read(&self, path: &str, etag: Option<&str>) -> Result<Read, String> {
        let mut request = self.request(reqwest::Method::GET, &self.contents_url(path));
        if let Some(etag) = etag {
            request = request.header("If-None-Match", etag);
        }
        let response = request.send().await.map_err(network_error)?;
        match response.status() {
            StatusCode::NOT_MODIFIED => Ok(Read::NotModified),
            StatusCode::NOT_FOUND => Ok(Read::Missing),
            status if !status.is_success() => Err(format!("Failed to read {path}: {status}")),
            _ => {
                let etag = response
                    .headers()
                    .get("etag")
                    .and_then(|value| value.to_str().ok())
                    .map(str::to_string);
                let body: ContentsResponse = response.json().await.map_err(network_error)?;
                Ok(Read::Found {
                    content: decode_base64(&body.content)?,
                    sha: body.sha,
                    etag,
                })
            }
        }
    }

    /// Adds `lines` at the top or bottom of `path`, creating the file if it does not exist yet.
    pub async fn add_lines(&self, path: &str, lines: &str, at_top: bool) -> Result<(), String> {
        let (current, sha) = match self.read(path, None).await? {
            Read::Found { content, sha, .. } => (content, Some(sha)),
            Read::Missing | Read::NotModified => (String::new(), None),
        };
        self.write(
            path,
            &with_lines(&current, lines, at_top),
            sha.as_deref(),
            &format!("Append to {path} via the desktop palette"),
        )
        .await
    }

    /// Replaces `path` over the version `sha` names, or creates it when there is none.
    pub async fn write(
        &self,
        path: &str,
        content: &str,
        sha: Option<&str>,
        message: &str,
    ) -> Result<(), String> {
        let body = serde_json::json!({
            "message": message,
            "content": STANDARD.encode(content),
            "sha": sha,
        });
        let response = self
            .request(reqwest::Method::PUT, &self.contents_url(path))
            .json(&body)
            .send()
            .await
            .map_err(network_error)?;
        match response.status() {
            // GitHub's answer when `sha` is no longer the file's version.
            StatusCode::CONFLICT => Err(format!("{path} changed since it was read — try again")),
            status if !status.is_success() => Err(format!("Failed to update {path}: {status}")),
            _ => Ok(()),
        }
    }

    /// One code search. GitHub gives this endpoint its own small budget, so the palette only
    /// calls it when the user presses Tab.
    pub async fn search(&self, query: &str) -> Result<Vec<SearchHit>, String> {
        let q = format!("{query} repo:{}", self.repo);
        let response = self
            .request(reqwest::Method::GET, &format!("{}/search/code", self.api))
            .query(&[("q", q.as_str()), ("per_page", "10")])
            .send()
            .await
            .map_err(network_error)?;
        match response.status() {
            StatusCode::FORBIDDEN | StatusCode::TOO_MANY_REQUESTS => {
                Err("GitHub search is rate limited — try again in a minute".into())
            }
            status if !status.is_success() => Err(format!("GitHub search failed: {status}")),
            _ => {
                let body: SearchResponse = response.json().await.map_err(network_error)?;
                Ok(body
                    .items
                    .into_iter()
                    .map(|item| SearchHit {
                        url: console_file_url(&item.path, &self.repo),
                        path: item.path,
                        name: item.name,
                    })
                    .collect())
            }
        }
    }

    /// One issue search for `>w`, most recently updated first.
    pub async fn work(&self, filter: WorkFilter) -> Result<Vec<WorkItem>, String> {
        let response = self
            .request(reqwest::Method::GET, &format!("{}/search/issues", self.api))
            .query(&[
                ("q", filter.query()),
                ("sort", "updated"),
                ("order", "desc"),
                ("per_page", "30"),
            ])
            .send()
            .await
            .map_err(network_error)?;
        match response.status() {
            StatusCode::FORBIDDEN | StatusCode::TOO_MANY_REQUESTS => {
                Err("GitHub search is rate limited — try again in a minute".into())
            }
            status if !status.is_success() => Err(format!("GitHub search failed: {status}")),
            _ => {
                let body: IssueSearchResponse = response.json().await.map_err(network_error)?;
                Ok(body.items.into_iter().map(WorkItem::from).collect())
            }
        }
    }

    /// Every path on the default branch, in one recursive listing.
    pub async fn tree(&self) -> Result<Vec<TreeEntry>, String> {
        let url = format!(
            "{}/repos/{}/git/trees/HEAD?recursive=1",
            self.api, self.repo
        );
        let response = self
            .request(reqwest::Method::GET, &url)
            .send()
            .await
            .map_err(network_error)?;
        match response.status() {
            // An empty repository has no HEAD to list.
            StatusCode::NOT_FOUND | StatusCode::CONFLICT => Ok(Vec::new()),
            status if !status.is_success() => {
                Err(format!("Could not list {}: {status}", self.repo))
            }
            _ => Ok(response
                .json::<TreeResponse>()
                .await
                .map_err(network_error)?
                .tree),
        }
    }

    /// The repositories the token can see, most recently pushed first.
    pub async fn user_repos(&self) -> Result<Vec<UserRepo>, String> {
        let response = self
            .request(reqwest::Method::GET, &format!("{}/user/repos", self.api))
            .query(&[("per_page", "100"), ("sort", "pushed")])
            .send()
            .await
            .map_err(network_error)?;
        if !response.status().is_success() {
            return Err(format!(
                "Could not list your repositories: {}",
                response.status()
            ));
        }
        response.json().await.map_err(network_error)
    }

    /// Whether the token can read the repository — what `login` checks before storing it.
    pub async fn can_read_repo(&self) -> Result<(), String> {
        let url = format!("{}/repos/{}", self.api, self.repo);
        let response = self
            .request(reqwest::Method::GET, &url)
            .send()
            .await
            .map_err(network_error)?;
        match response.status() {
            status if status.is_success() => Ok(()),
            StatusCode::UNAUTHORIZED => Err("GitHub rejected the token".into()),
            StatusCode::NOT_FOUND => Err(format!(
                "{} does not exist or the token cannot see it",
                self.repo
            )),
            status => Err(format!("GitHub answered {status}")),
        }
    }
}

fn network_error(error: reqwest::Error) -> String {
    format!("Could not reach GitHub: {error}")
}

/// GitHub wraps base64 content at 60 columns.
fn decode_base64(value: &str) -> Result<String, String> {
    let compact: String = value.chars().filter(|c| !c.is_whitespace()).collect();
    let bytes = STANDARD
        .decode(compact)
        .map_err(|error| format!("GitHub sent unreadable content: {error}"))?;
    String::from_utf8(bytes).map_err(|_| "GitHub sent a file that is not UTF-8".into())
}

/// The extension's rule: new lines go at the top or bottom, a blank line away from what is there.
pub fn with_lines(current: &str, lines: &str, at_top: bool) -> String {
    match (current.is_empty(), at_top) {
        (true, _) => lines.to_string(),
        (false, true) => format!("{lines}\n\n{current}"),
        (false, false) => format!("{current}\n\n{lines}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn links_files_to_the_console_encoded_like_the_extension() {
        assert_eq!(
            console_file_url("notes/a b#1.md", "o/r"),
            "https://app.kaihuman.com/files/notes/a%20b%231.md?repo=o%2Fr"
        );
    }

    #[test]
    fn places_new_lines_a_blank_line_away() {
        assert_eq!(with_lines("", "- new", true), "- new");
        assert_eq!(with_lines("- old", "- new", true), "- new\n\n- old");
        assert_eq!(with_lines("- old", "- new", false), "- old\n\n- new");
    }

    #[test]
    fn reads_an_issue_search_hit_as_the_palette_expects() {
        let body: IssueSearchResponse = serde_json::from_value(serde_json::json!({
            "items": [
                {
                    "number": 7,
                    "title": "Fix the sync",
                    "html_url": "https://github.com/o/r/pull/7",
                    "repository_url": "https://api.github.com/repos/o/r",
                    "updated_at": "2026-09-24T08:00:00Z",
                    "pull_request": {}
                },
                {
                    "number": 8,
                    "title": "Crash",
                    "html_url": "https://github.com/o/r/issues/8",
                    "repository_url": "https://api.github.com/repos/o/r",
                    "updated_at": "2026-09-23T08:00:00Z"
                }
            ]
        }))
        .unwrap();
        let items: Vec<WorkItem> = body.items.into_iter().map(WorkItem::from).collect();
        assert_eq!(
            serde_json::to_value(&items).unwrap(),
            serde_json::json!([
                {
                    "repo": "o/r",
                    "number": 7,
                    "title": "Fix the sync",
                    "url": "https://github.com/o/r/pull/7",
                    "pullRequest": true,
                    "updatedAt": "2026-09-24T08:00:00Z"
                },
                {
                    "repo": "o/r",
                    "number": 8,
                    "title": "Crash",
                    "url": "https://github.com/o/r/issues/8",
                    "pullRequest": false,
                    "updatedAt": "2026-09-23T08:00:00Z"
                }
            ])
        );
    }

    #[test]
    fn decodes_wrapped_utf8_content() {
        let wrapped = "w6Rw\ncGxl\n";
        assert_eq!(decode_base64(wrapped).unwrap(), "äpple");
        assert!(decode_base64("//8=").is_err());
    }
}
