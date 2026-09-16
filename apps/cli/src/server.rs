use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::process::Command;
use warp::Filter;

#[derive(Deserialize)]
pub struct ChatRequest {
    pub message: String,
    pub provider: Option<String>, // "copilot", "claude", or "gemini"
}

#[derive(Serialize)]
pub struct ChatResponse {
    pub response: String,
}

pub async fn start_server(port: u16) -> Result<()> {
    // CORS configuration to allow web app and extension to connect
    let cors = warp::cors()
        .allow_any_origin()
        .allow_headers(vec!["content-type"])
        .allow_methods(vec!["GET", "POST"]);

    // Health check endpoint
    let health = warp::path("health")
        .and(warp::get())
        .map(|| warp::reply::json(&"OK"));

    // Chat completion endpoint via CLI proxy
    let chat = warp::path("chat")
        .and(warp::post())
        .and(warp::body::json())
        .map(|req: ChatRequest| {
            let provider = req.provider.unwrap_or_else(|| "copilot".to_string());
            let (cmd, args) = match provider.as_str() {
                "claude" => ("claude", vec!["-p", &req.message]),
                "gemini" => ("gemini", vec!["-p", &req.message]),
                _ => ("copilot", vec!["-p", &req.message]), // Default to GitHub Copilot CLI
            };

            let output = Command::new(cmd).args(&args).output();

            let response_text = match output {
                Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).to_string(),
                Ok(out) => format!(
                    "Error connecting to {}: {}",
                    provider,
                    String::from_utf8_lossy(&out.stderr)
                ),
                Err(e) => format!("Failed to execute {} CLI: {}", provider, e),
            };

            warp::reply::json(&ChatResponse {
                response: response_text,
            })
        });

    let routes = health.or(chat).with(cors);

    println!("LifeOS AI Server running on http://127.0.0.1:{}", port);
    warp::serve(routes).run(([127, 0, 0, 1], port)).await;

    Ok(())
}
