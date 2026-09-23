//! DeepL translations for the palette's `t:` mode, as the extension's service worker makes them.

use serde::{Deserialize, Serialize};

use crate::config::{read_json, translation_history_file, write_json};

/// `TRANSLATION_HISTORY_LIMIT` in packages/palette/src/translate.ts.
const HISTORY_LIMIT: usize = 20;

/// `Translation` in packages/palette/src/translate.ts.
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Translation {
    pub target: String,
    pub text: String,
    pub detected_source: String,
}

#[derive(Deserialize)]
struct Response {
    #[serde(default)]
    translations: Vec<Item>,
}

#[derive(Deserialize)]
struct Item {
    text: String,
    detected_source_language: String,
}

pub fn history() -> Vec<String> {
    read_json(&translation_history_file()).unwrap_or_default()
}

/// Newest first, each text once, capped — `withTranslationText` in the palette package.
pub fn with_text(history: Vec<String>, text: &str) -> Vec<String> {
    let text = text.trim();
    if text.is_empty() {
        return history;
    }
    std::iter::once(text.to_string())
        .chain(history.into_iter().filter(|earlier| earlier != text))
        .take(HISTORY_LIMIT)
        .collect()
}

pub fn remember(text: &str) -> Result<Vec<String>, String> {
    let texts = with_text(history(), text);
    write_json(&translation_history_file(), &texts)?;
    Ok(texts)
}

/// DeepL's free keys end in `:fx` and only work against the free endpoint.
pub fn endpoint(key: &str) -> &'static str {
    if key.ends_with(":fx") {
        "https://api-free.deepl.com/v2/translate"
    } else {
        "https://api.deepl.com/v2/translate"
    }
}

/// The same messages as the extension, so both palettes say the same thing.
fn status_error(status: u16) -> String {
    match status {
        403 => "DeepL rejected the API key — set it again with “Set the DeepL API key…”".into(),
        456 => "The DeepL quota for this month is used up".into(),
        429 => "DeepL is rate limiting — try again in a moment".into(),
        status => format!("DeepL answered {status}"),
    }
}

fn parse(target: &str, body: &str) -> Result<Translation, String> {
    let response: Response = serde_json::from_str(body)
        .map_err(|error| format!("DeepL sent an unreadable answer: {error}"))?;
    let item = response
        .translations
        .into_iter()
        .next()
        .ok_or("DeepL sent no translation back")?;
    Ok(Translation {
        target: target.to_string(),
        text: item.text,
        detected_source: item.detected_source_language,
    })
}

/// One request per target — DeepL takes a single target language per call.
pub async fn translate(
    key: &str,
    text: &str,
    targets: &[String],
) -> Result<Vec<Translation>, String> {
    let http = reqwest::Client::new();
    let mut translations = Vec::with_capacity(targets.len());
    for target in targets {
        let response = http
            .post(endpoint(key))
            .header("Authorization", format!("DeepL-Auth-Key {key}"))
            .json(&serde_json::json!({ "text": [text], "target_lang": target }))
            .send()
            .await
            .map_err(|error| format!("Could not reach DeepL: {error}"))?;
        let status = response.status();
        if !status.is_success() {
            return Err(status_error(status.as_u16()));
        }
        let body = response
            .text()
            .await
            .map_err(|error| format!("Could not reach DeepL: {error}"))?;
        translations.push(parse(target, &body)?);
    }
    Ok(translations)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_the_last_twenty_texts_newest_first_once_each() {
        let history = vec!["a".to_string(), "b".to_string()];
        assert_eq!(with_text(history.clone(), " b "), vec!["b", "a"]);
        assert_eq!(with_text(history, "  "), vec!["a", "b"]);

        let full: Vec<String> = (0..HISTORY_LIMIT).map(|i| format!("t{i}")).collect();
        let next = with_text(full, "new");
        assert_eq!(next.len(), 20);
        assert_eq!(next[0], "new");
        assert!(!next.contains(&"t19".to_string()));
    }

    #[test]
    fn sends_free_keys_to_the_free_endpoint() {
        assert_eq!(
            endpoint("abc:fx"),
            "https://api-free.deepl.com/v2/translate"
        );
        assert_eq!(endpoint("abc"), "https://api.deepl.com/v2/translate");
    }

    #[test]
    fn reads_the_first_translation_and_what_deepl_detected() {
        let body = r#"{"translations":[{"detected_source_language":"DE","text":"Hello"}]}"#;
        assert_eq!(
            parse("EN-US", body),
            Ok(Translation {
                target: "EN-US".into(),
                text: "Hello".into(),
                detected_source: "DE".into(),
            })
        );
        assert_eq!(
            parse("EN-US", r#"{"translations":[]}"#).unwrap_err(),
            "DeepL sent no translation back"
        );
    }

    #[test]
    fn explains_the_statuses_worth_acting_on() {
        assert!(status_error(403).contains("rejected the API key"));
        assert!(status_error(456).contains("quota"));
        assert_eq!(status_error(500), "DeepL answered 500");
    }
}
