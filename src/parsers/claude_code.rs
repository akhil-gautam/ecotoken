use std::collections::HashMap;
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
    r#type: Option<String>,
    #[serde(default)]
    timestamp: Option<DateTime<Utc>>,
    #[serde(default)]
    message: Option<MessageField>,
    #[serde(default)]
    request_id: Option<String>,
    #[serde(rename = "requestId", default)]
    request_id_camel: Option<String>,
    #[serde(default)]
    session_id: Option<String>,
    #[serde(rename = "sessionId", default)]
    session_id_camel: Option<String>,
    #[serde(default)]
    cwd: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MessageField {
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    usage: Option<Usage>,
}

#[derive(Debug, Deserialize, Default)]
struct Usage {
    #[serde(default)]
    input_tokens: u64,
    #[serde(default)]
    output_tokens: u64,
    #[serde(default)]
    cache_creation_input_tokens: u64,
    #[serde(default)]
    cache_read_input_tokens: u64,
}

pub fn scan() -> Result<Vec<TokenRecord>> {
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Some(home) = dirs::home_dir() {
        roots.push(home.join(".claude/projects"));
        roots.push(home.join("Library/Developer/Xcode/CodingAssistant/ClaudeAgentConfig/projects"));
    }

    let mut records = Vec::new();
    for root in roots {
        if !root.exists() {
            continue;
        }
        tracing::debug!("scanning Claude Code root: {}", root.display());
        for entry in walkdir::WalkDir::new(&root)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if path.is_file() && path.extension().is_some_and(|e| e == "jsonl") {
                match parse_file(path) {
                    Ok(mut recs) => records.append(&mut recs),
                    Err(e) => tracing::warn!("skipping {}: {e}", path.display()),
                }
            }
        }
    }

    // Global streaming-dedup by (session, request_id, message_id):
    // keep the line with the highest output_tokens.
    let mut best: HashMap<String, TokenRecord> = HashMap::new();
    let mut keyless: Vec<TokenRecord> = Vec::new();
    for r in records {
        if let Some(k) = r.dedup_key.clone() {
            best.entry(k)
                .and_modify(|e| {
                    if r.output_tokens > e.output_tokens {
                        *e = r.clone();
                    }
                })
                .or_insert(r);
        } else {
            keyless.push(r);
        }
    }
    let mut out: Vec<TokenRecord> = best.into_values().collect();
    out.append(&mut keyless);
    Ok(out)
}

fn parse_file(path: &Path) -> Result<Vec<TokenRecord>> {
    let reader = BufReader::new(File::open(path)?);
    let mut out = Vec::new();

    let project = infer_project(path);
    for (i, line) in reader.lines().enumerate() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };
        if line.trim().is_empty() {
            continue;
        }
        let parsed: Line = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue, // skip malformed streaming entries
        };
        if parsed.r#type.as_deref() != Some("assistant") {
            continue;
        }
        let Some(msg) = parsed.message else { continue };
        let Some(usage) = msg.usage else { continue };
        if usage.input_tokens == 0
            && usage.output_tokens == 0
            && usage.cache_creation_input_tokens == 0
            && usage.cache_read_input_tokens == 0
        {
            continue;
        }
        let Some(ts) = parsed.timestamp else { continue };
        let model = msg.model.clone().unwrap_or_else(|| "unknown".into());
        let session = parsed.session_id_camel.or(parsed.session_id);
        let request = parsed.request_id_camel.or(parsed.request_id);
        let dedup_key = match (&session, &request, &msg.id) {
            (Some(s), Some(r), Some(m)) => Some(format!("{s}:{r}:{m}")),
            (Some(s), _, Some(m)) => Some(format!("{s}:_:{m}")),
            _ => None,
        };
        let _ = i;
        out.push(TokenRecord {
            timestamp: ts,
            provider: "anthropic".into(),
            source: "claude-code".into(),
            model,
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            cache_read_tokens: usage.cache_read_input_tokens,
            cache_creation_tokens: usage.cache_creation_input_tokens,
            project: project.clone().or_else(|| parsed.cwd.clone()),
            session_id: session,
            dedup_key,
        });
    }
    Ok(out)
}

fn infer_project(path: &Path) -> Option<String> {
    // The Claude Code convention encodes the cwd in the parent dir name
    // e.g. "-Users-akhilgautam-ecotoken" → "/Users/akhilgautam/ecotoken"
    let parent = path.parent()?;
    let name = parent.file_name()?.to_string_lossy().to_string();
    if name.starts_with('-') {
        let decoded = name.replacen('-', "/", 1).replace('-', "/");
        Some(decoded)
    } else {
        Some(parent.to_string_lossy().to_string())
    }
}
