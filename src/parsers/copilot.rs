use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

use anyhow::Result;
use chrono::{DateTime, TimeZone, Utc};
use serde::Deserialize;

use crate::models::token_record::TokenRecord;

#[derive(Debug, Deserialize)]
struct UsageEntry {
    #[serde(default)]
    timestamp: Option<String>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    prompt_tokens: u64,
    #[serde(default)]
    completion_tokens: u64,
    #[serde(default)]
    completions: u64,
}

pub fn scan() -> Result<Vec<TokenRecord>> {
    let Some(home) = dirs::home_dir() else {
        return Ok(Vec::new());
    };
    let candidates: Vec<PathBuf> = vec![
        home.join(".config/github-copilot/usage.json"),
        home.join(".config/github-copilot/usage.jsonl"),
        home.join("Library/Application Support/github-copilot/usage.json"),
    ];
    let mut out = Vec::new();
    for path in candidates {
        if !path.exists() {
            continue;
        }
        tracing::debug!("Copilot usage: {}", path.display());
        if path.extension().is_some_and(|e| e == "jsonl") {
            let reader = BufReader::new(File::open(&path)?);
            for line in reader.lines().map_while(Result::ok) {
                if let Ok(e) = serde_json::from_str::<UsageEntry>(&line) {
                    if let Some(r) = entry_to_record(e) {
                        out.push(r);
                    }
                }
            }
        } else {
            let txt = std::fs::read_to_string(&path)?;
            if let Ok(arr) = serde_json::from_str::<Vec<UsageEntry>>(&txt) {
                for e in arr {
                    if let Some(r) = entry_to_record(e) {
                        out.push(r);
                    }
                }
            } else if let Ok(e) = serde_json::from_str::<UsageEntry>(&txt) {
                if let Some(r) = entry_to_record(e) {
                    out.push(r);
                }
            }
        }
    }
    Ok(out)
}

fn entry_to_record(e: UsageEntry) -> Option<TokenRecord> {
    let ts = e
        .timestamp
        .as_deref()
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(|| Utc.timestamp_opt(0, 0).single().unwrap_or_else(Utc::now));
    // Fallback estimation when only `completions` count is present.
    let (input, output) = if e.prompt_tokens == 0 && e.completion_tokens == 0 && e.completions > 0 {
        (e.completions * 80, e.completions * 40)
    } else {
        (e.prompt_tokens, e.completion_tokens)
    };
    if input == 0 && output == 0 {
        return None;
    }
    Some(TokenRecord {
        timestamp: ts,
        provider: "github".into(),
        source: "copilot".into(),
        model: e.model.unwrap_or_else(|| "copilot-unknown".into()),
        input_tokens: input,
        output_tokens: output,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
        project: None,
        session_id: None,
        dedup_key: None,
    })
}
