use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Deserialize;

use crate::models::token_record::TokenRecord;

#[derive(Debug, Deserialize)]
struct Line {
    #[serde(default)]
    timestamp: Option<DateTime<Utc>>,
    #[serde(default)]
    r#type: Option<String>,
    #[serde(default)]
    payload: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Default)]
struct TokenCountPayload {
    #[serde(default)]
    info: Option<TokenInfo>,
}

#[derive(Debug, Deserialize, Default)]
struct TokenInfo {
    #[serde(default)]
    last_token_usage: Option<TokenUsage>,
}

#[derive(Debug, Deserialize, Default)]
struct TokenUsage {
    #[serde(default)]
    input_tokens: u64,
    #[serde(default)]
    cached_input_tokens: u64,
    #[serde(default)]
    output_tokens: u64,
    #[serde(default)]
    reasoning_output_tokens: u64,
}

#[derive(Debug, Deserialize, Default)]
struct TurnContextPayload {
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    cwd: Option<String>,
}

pub fn scan() -> Result<Vec<TokenRecord>> {
    let Some(home) = dirs::home_dir() else {
        return Ok(Vec::new());
    };
    let root = home.join(".codex/sessions");
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in walkdir::WalkDir::new(&root).into_iter().filter_map(|e| e.ok()) {
        let p = entry.path();
        if p.is_file() && p.extension().map_or(false, |e| e == "jsonl") {
            if let Ok(mut recs) = parse_file(p) {
                out.append(&mut recs);
            }
        }
    }
    Ok(out)
}

fn parse_file(path: &Path) -> Result<Vec<TokenRecord>> {
    let reader = BufReader::new(File::open(path)?);
    let mut model = "gpt-unknown".to_string();
    let mut cwd: Option<String> = None;
    let mut out = Vec::new();

    // token_count events are cumulative; we only want the deltas. The
    // "last_token_usage" field already represents the latest turn.
    for line in reader.lines() {
        let Ok(line) = line else { continue };
        if line.trim().is_empty() {
            continue;
        }
        let parsed: Line = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let Some(ts) = parsed.timestamp else { continue };
        match parsed.r#type.as_deref() {
            Some("turn_context") => {
                if let Some(payload) = parsed.payload {
                    if let Ok(tc) = serde_json::from_value::<TurnContextPayload>(payload) {
                        if let Some(m) = tc.model {
                            model = m;
                        }
                        if let Some(c) = tc.cwd {
                            cwd = Some(c);
                        }
                    }
                }
            }
            Some("event_msg") => {
                let Some(payload) = parsed.payload else { continue };
                let Some(t) = payload.get("type").and_then(|v| v.as_str()) else { continue };
                if t != "token_count" {
                    continue;
                }
                let tc: TokenCountPayload = match serde_json::from_value(payload) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                let Some(info) = tc.info else { continue };
                let Some(last) = info.last_token_usage else { continue };
                if last.input_tokens == 0 && last.output_tokens == 0 {
                    continue;
                }
                out.push(TokenRecord {
                    timestamp: ts,
                    provider: "openai".into(),
                    source: "codex".into(),
                    model: model.clone(),
                    input_tokens: last.input_tokens.saturating_sub(last.cached_input_tokens),
                    output_tokens: last.output_tokens + last.reasoning_output_tokens,
                    cache_read_tokens: last.cached_input_tokens,
                    cache_creation_tokens: 0,
                    project: cwd.clone(),
                    session_id: None,
                    dedup_key: None,
                });
            }
            _ => {}
        }
    }
    Ok(out)
}
