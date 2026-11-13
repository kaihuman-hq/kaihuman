use anyhow::{Result, bail};
use base64::prelude::*;
use reqwest::header::{AUTHORIZATION, HeaderMap, HeaderValue, USER_AGENT};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct Repository {
    pub name: String,
    pub full_name: String,
    pub description: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ContentResponse {
    pub sha: String,
    pub content: String,
}

/// Build the `(filename, file-content)` for a knowledge capture. Frozen at call
/// time so an offline capture keeps its real timestamp and date when it is
/// finally pushed. The remote path is `.kh/raw/<filename>`.
pub fn build_kb_note(text: &str) -> (String, String) {
    let now = chrono::Utc::now();
    let timestamp = now.timestamp_millis();
    let date = now.format("%Y-%m-%d").to_string();

    let first_line = text
        .lines()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("note")
        .trim();
    let slug: String = {
        let s: String = first_line
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() {
                    c.to_ascii_lowercase()
                } else {
                    '-'
                }
            })
            .collect();
        let s = s.trim_matches('-').chars().take(40).collect::<String>();
        if s.is_empty() { "note".to_string() } else { s }
    };
    let title = first_line
        .replace('"', "'")
        .chars()
        .take(80)
        .collect::<String>();

    let filename = format!("{}-{}.md", timestamp, slug);
    let content = format!(
        "---\ntitle: \"{}\"\nurl: ''\ndate: {}\nprocessed: false\ntags: [general]\n---\n\n{}\n",
        title, date, text
    );
    (filename, content)
}

/// What a contents-API write did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PutOutcome {
    Written,
    /// The file changed since it was read, or a create found it already there.
    Conflict,
}

pub struct GithubClient {
    client: reqwest::Client,
}

impl GithubClient {
    pub fn new(token: String) -> Result<Self> {
        let mut headers = HeaderMap::new();
        let mut auth_value = HeaderValue::from_str(&format!("Bearer {}", token))?;
        auth_value.set_sensitive(true);
        headers.insert(AUTHORIZATION, auth_value);
        headers.insert(USER_AGENT, HeaderValue::from_static("kaihuman-cli"));

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .build()?;

        Ok(Self { client })
    }

    pub async fn list_repos(&self) -> Result<Vec<Repository>> {
        let url = "https://api.github.com/user/repos?sort=updated&per_page=20";
        let repos: Vec<Repository> = self.client.get(url).send().await?.json().await?;
        Ok(repos)
    }

    pub async fn create_quicknote(&self, owner: &str, repo: &str, text: &str) -> Result<()> {
        let now = chrono::Utc::now();
        // e.g. 2024-03-24T12-34-56Z handling colons that might not be great in file names
        let timestamp = now
            .to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
            .replace(':', "-");
        let path = format!(".lifeos/quicknotes/quicknote-{}.md", timestamp);
        let url = format!(
            "https://api.github.com/repos/{}/{}/contents/{}",
            owner, repo, path
        );

        let encoded_content = BASE64_STANDARD.encode(text);

        #[derive(Serialize)]
        struct PutBody {
            message: String,
            content: String,
        }

        let body = PutBody {
            message: "Add quicknote via CLI".to_string(),
            content: encoded_content,
        };

        let res = self.client.put(&url).json(&body).send().await?;

        if !res.status().is_success() {
            bail!("Failed to create quicknote: {}", res.status());
        }

        Ok(())
    }

    /// Create a file at `path` via the GitHub contents API (create-only, no SHA).
    pub async fn put_file(
        &self,
        owner: &str,
        repo: &str,
        path: &str,
        content: &str,
        message: &str,
    ) -> Result<()> {
        let url = format!(
            "https://api.github.com/repos/{}/{}/contents/{}",
            owner, repo, path
        );
        let encoded_content = BASE64_STANDARD.encode(content);

        #[derive(Serialize)]
        struct PutBody {
            message: String,
            content: String,
        }

        let body = PutBody {
            message: message.to_string(),
            content: encoded_content,
        };

        let res = self.client.put(&url).json(&body).send().await?;

        if !res.status().is_success() {
            bail!("PUT {} failed: {}", path, res.status());
        }

        Ok(())
    }

    /// Read a file and its blob sha through the contents API; `None` when it does not exist.
    pub async fn get_file(
        &self,
        owner: &str,
        repo: &str,
        path: &str,
    ) -> Result<Option<(String, String)>> {
        let url = contents_url(owner, repo, path);
        let res = self.client.get(&url).send().await?;
        if res.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if !res.status().is_success() {
            bail!("GET {} failed: {}", path, res.status());
        }
        let data: ContentResponse = res.json().await?;
        let decoded = BASE64_STANDARD.decode(data.content.replace('\n', ""))?;
        Ok(Some((String::from_utf8(decoded)?, data.sha)))
    }

    /// Create (`sha` is `None`, create-only) or update (`sha` of the version read) a file.
    /// GitHub answers 409 for a stale sha and 422 when a create finds the file already there;
    /// both come back as `PutOutcome::Conflict` so the caller can re-read or pick another name.
    pub async fn write_file(
        &self,
        owner: &str,
        repo: &str,
        path: &str,
        content: &str,
        message: &str,
        sha: Option<&str>,
    ) -> Result<PutOutcome> {
        let url = contents_url(owner, repo, path);

        #[derive(Serialize)]
        struct PutBody<'a> {
            message: &'a str,
            content: String,
            #[serde(skip_serializing_if = "Option::is_none")]
            sha: Option<&'a str>,
        }

        let body = PutBody {
            message,
            content: BASE64_STANDARD.encode(content),
            sha,
        };
        let res = self.client.put(&url).json(&body).send().await?;
        match res.status() {
            s if s.is_success() => Ok(PutOutcome::Written),
            reqwest::StatusCode::CONFLICT | reqwest::StatusCode::UNPROCESSABLE_ENTITY => {
                Ok(PutOutcome::Conflict)
            }
            s => bail!("PUT {} failed: {}", path, s),
        }
    }

    /// Write a knowledge capture to `.kh/raw/` as an immutable, OKF-aligned markdown
    /// file. Zero required structure — the whole text is the body; a title and slug
    /// are derived from the first line. `/kb-ingest` later folds it into the journal
    /// and wiki.
    pub async fn create_kb_note(&self, owner: &str, repo: &str, text: &str) -> Result<()> {
        let (filename, content) = build_kb_note(text);
        let path = format!(".kh/raw/{}", filename);
        self.put_file(
            owner,
            repo,
            &path,
            &content,
            "note: add knowledge capture via CLI",
        )
        .await
    }
    async fn get_json<T: serde::de::DeserializeOwned>(&self, url: &str) -> Result<T> {
        let res = self.client.get(url).send().await?;
        if !res.status().is_success() {
            bail!("GET {url} failed: {}", res.status());
        }
        Ok(res.json().await?)
    }

    async fn post_json<T: serde::de::DeserializeOwned>(
        &self,
        url: &str,
        body: &serde_json::Value,
    ) -> Result<T> {
        let res = self.client.post(url).json(body).send().await?;
        if !res.status().is_success() {
            bail!("POST {url} failed: {}", res.status());
        }
        Ok(res.json().await?)
    }

    /// The default branch and the sha of its head commit.
    pub async fn head(&self, owner: &str, repo: &str) -> Result<(String, String)> {
        #[derive(Deserialize)]
        struct Repo {
            default_branch: String,
        }
        #[derive(Deserialize)]
        struct Ref {
            object: Sha,
        }
        let base = format!("https://api.github.com/repos/{owner}/{repo}");
        let info: Repo = self.get_json(&base).await?;
        let branch = info.default_branch;
        let head: Ref = self
            .get_json(&format!("{base}/git/ref/heads/{branch}"))
            .await?;
        Ok((branch, head.object.sha))
    }

    /// Every blob in a commit's tree: (path, blob sha).
    pub async fn tree(
        &self,
        owner: &str,
        repo: &str,
        commit: &str,
    ) -> Result<Vec<(String, String)>> {
        #[derive(Deserialize)]
        struct Entry {
            path: String,
            #[serde(rename = "type")]
            kind: String,
            sha: String,
        }
        #[derive(Deserialize)]
        struct Tree {
            tree: Vec<Entry>,
            truncated: bool,
        }
        let url =
            format!("https://api.github.com/repos/{owner}/{repo}/git/trees/{commit}?recursive=1");
        let tree: Tree = self.get_json(&url).await?;
        if tree.truncated {
            bail!("{owner}/{repo} has too many files for GitHub's tree listing");
        }
        Ok(tree
            .tree
            .into_iter()
            .filter(|e| e.kind == "blob")
            .map(|e| (e.path, e.sha))
            .collect())
    }

    pub async fn blob(&self, owner: &str, repo: &str, sha: &str) -> Result<String> {
        let url = format!("https://api.github.com/repos/{owner}/{repo}/git/blobs/{sha}");
        let blob: ContentResponse = self.get_json(&url).await?;
        let decoded = BASE64_STANDARD.decode(blob.content.replace('\n', ""))?;
        Ok(String::from_utf8(decoded)?)
    }

    /// Writes several files in one commit on `branch`, whose head must still be `parent`;
    /// otherwise nothing is written and the outcome is `Conflict`.
    pub async fn commit_files(
        &self,
        owner: &str,
        repo: &str,
        branch: &str,
        parent: &str,
        files: &[(String, String)],
        message: &str,
    ) -> Result<PutOutcome> {
        #[derive(Deserialize)]
        struct Commit {
            tree: Sha,
        }
        let base = format!("https://api.github.com/repos/{owner}/{repo}/git");
        let parent_commit: Commit = self.get_json(&format!("{base}/commits/{parent}")).await?;
        let entries: Vec<_> = files
            .iter()
            .map(|(path, content)| {
                serde_json::json!({"path": path, "mode": "100644", "type": "blob", "content": content})
            })
            .collect();
        let tree: Sha = self
            .post_json(
                &format!("{base}/trees"),
                &serde_json::json!({"base_tree": parent_commit.tree.sha, "tree": entries}),
            )
            .await?;
        let commit: Sha = self
            .post_json(
                &format!("{base}/commits"),
                &serde_json::json!({"message": message, "tree": tree.sha, "parents": [parent]}),
            )
            .await?;
        let res = self
            .client
            .patch(format!("{base}/refs/heads/{branch}"))
            .json(&serde_json::json!({"sha": commit.sha, "force": false}))
            .send()
            .await?;
        match res.status() {
            s if s.is_success() => Ok(PutOutcome::Written),
            reqwest::StatusCode::CONFLICT | reqwest::StatusCode::UNPROCESSABLE_ENTITY => {
                Ok(PutOutcome::Conflict)
            }
            s => bail!("updating {branch} failed: {s}"),
        }
    }
}

#[derive(Deserialize)]
struct Sha {
    sha: String,
}

/// A contents-API URL with each path segment percent-encoded (todo list names may have spaces).
fn contents_url(owner: &str, repo: &str, path: &str) -> String {
    let mut url = reqwest::Url::parse("https://api.github.com/repos").expect("a valid base");
    url.path_segments_mut()
        .expect("an http URL")
        .extend([owner, repo, "contents"])
        .extend(path.split('/'));
    url.to_string()
}
