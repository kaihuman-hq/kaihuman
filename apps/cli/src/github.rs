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

pub struct GithubClient {
    client: reqwest::Client,
}

impl GithubClient {
    pub fn new(token: String) -> Result<Self> {
        let mut headers = HeaderMap::new();
        let mut auth_value = HeaderValue::from_str(&format!("Bearer {}", token))?;
        auth_value.set_sensitive(true);
        headers.insert(AUTHORIZATION, auth_value);
        headers.insert(USER_AGENT, HeaderValue::from_static("lifosy-cli"));

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

    pub async fn append_to_inbox(&self, owner: &str, repo: &str, text: &str) -> Result<()> {
        let path = "inbox.md";
        let url = format!(
            "https://api.github.com/repos/{}/{}/contents/{}",
            owner, repo, path
        );

        // 1. Try to get existing file
        let existing = self.get_file_content(owner, repo, path).await;

        let (content, sha) = match existing {
            Ok((c, s)) => (c, Some(s)),
            Err(_) => (String::new(), None),
        };

        // 2. Append new text
        let new_content = if content.is_empty() {
            format!("- {}\n", text)
        } else {
            format!("{}\n- {}\n", content.trim_end(), text)
        };

        // 3. Update/Create file
        let encoded_content = BASE64_STANDARD.encode(new_content);

        #[derive(Serialize)]
        struct PutBody {
            message: String,
            content: String,
            sha: Option<String>,
        }

        let body = PutBody {
            message: "Add note via CLI".to_string(),
            content: encoded_content,
            sha,
        };

        let res = self.client.put(&url).json(&body).send().await?;

        if !res.status().is_success() {
            bail!("Failed to save note: {}", res.status());
        }

        Ok(())
    }

    async fn get_file_content(
        &self,
        owner: &str,
        repo: &str,
        path: &str,
    ) -> Result<(String, String)> {
        let url = format!(
            "https://api.github.com/repos/{}/{}/contents/{}",
            owner, repo, path
        );
        let res = self.client.get(&url).send().await?;

        if !res.status().is_success() {
            bail!("File not found");
        }

        let data: ContentResponse = res.json().await?;
        // Github API returns content with newlines
        let cleaned = data.content.replace("\n", "");
        let decoded = BASE64_STANDARD.decode(cleaned)?;
        let content = String::from_utf8(decoded)?;

        Ok((content, data.sha))
    }
}
