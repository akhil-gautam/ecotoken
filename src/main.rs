use anyhow::Result;
use chrono::NaiveDate;
use clap::{Parser, ValueEnum};
use std::net::SocketAddr;
use std::sync::Arc;
use tracing_subscriber::EnvFilter;

mod calculator;
mod data;
mod models;
mod parsers;
mod server;

use models::token_record::TokenRecord;

#[derive(Debug, Clone, ValueEnum)]
enum Source {
    All,
    ClaudeCode,
    Codex,
    Copilot,
}

#[derive(Parser, Debug)]
#[command(
    name = "ecotoken",
    version,
    about = "Environmental impact dashboard for AI coding assistants"
)]
struct Cli {
    /// Source to scan
    #[arg(long, value_enum, default_value_t = Source::All)]
    source: Source,

    /// Start date (inclusive), YYYY-MM-DD
    #[arg(long)]
    since: Option<NaiveDate>,

    /// End date (inclusive), YYYY-MM-DD
    #[arg(long)]
    until: Option<NaiveDate>,

    /// Filter by project substring
    #[arg(long)]
    project: Option<String>,

    /// HTTP port
    #[arg(long, default_value_t = 3777)]
    port: u16,

    /// Emit JSON summary to stdout and exit (no server)
    #[arg(long)]
    json: bool,

    /// Don't auto-open browser
    #[arg(long)]
    no_open: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "ecotoken=info".into()))
        .compact()
        .init();

    let cli = Cli::parse();

    let records = collect_records(&cli)?;
    tracing::info!("loaded {} token records", records.len());

    if cli.json {
        let summary = models::impact::summarize(&records);
        println!("{}", serde_json::to_string_pretty(&summary)?);
        return Ok(());
    }

    let state = Arc::new(server::AppState::new(records));
    let app = server::router(state);

    let addr: SocketAddr = ([127, 0, 0, 1], cli.port).into();
    let url = format!("http://{}", addr);
    tracing::info!("dashboard → {}", url);

    if !cli.no_open {
        let _ = open::that(&url);
    }

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

fn collect_records(cli: &Cli) -> Result<Vec<TokenRecord>> {
    let mut records: Vec<TokenRecord> = Vec::new();

    match cli.source {
        Source::All => {
            records.extend(parsers::claude_code::scan().unwrap_or_default());
            records.extend(parsers::codex::scan().unwrap_or_default());
            records.extend(parsers::copilot::scan().unwrap_or_default());
        }
        Source::ClaudeCode => records.extend(parsers::claude_code::scan().unwrap_or_default()),
        Source::Codex => records.extend(parsers::codex::scan().unwrap_or_default()),
        Source::Copilot => records.extend(parsers::copilot::scan().unwrap_or_default()),
    }

    if let Some(since) = cli.since {
        records.retain(|r| r.timestamp.date_naive() >= since);
    }
    if let Some(until) = cli.until {
        records.retain(|r| r.timestamp.date_naive() <= until);
    }
    if let Some(project) = &cli.project {
        let needle = project.to_lowercase();
        records.retain(|r| {
            r.project
                .as_deref()
                .map(|p| p.to_lowercase().contains(&needle))
                .unwrap_or(false)
        });
    }

    records.sort_by_key(|r| r.timestamp);
    Ok(records)
}
