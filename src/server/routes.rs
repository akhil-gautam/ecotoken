use std::sync::Arc;

use axum::{extract::State, routing::get, Json, Router};

use crate::models::impact;

use super::AppState;

pub fn api_routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/summary", get(summary))
        .route("/api/daily", get(daily))
        .route("/api/models", get(models))
        .route("/api/providers", get(providers))
        .route("/api/equivalents", get(equivalents))
        .route("/api/records", get(records))
        .with_state(state)
}

async fn summary(State(s): State<Arc<AppState>>) -> Json<impact::Summary> {
    Json(impact::summarize(&s.records))
}

async fn daily(State(s): State<Arc<AppState>>) -> Json<Vec<impact::DailyPoint>> {
    Json(impact::daily(&s.records))
}

async fn models(State(s): State<Arc<AppState>>) -> Json<Vec<impact::ModelBreakdown>> {
    Json(impact::model_breakdown(&s.records))
}

async fn providers(State(s): State<Arc<AppState>>) -> Json<Vec<impact::ProviderBreakdown>> {
    Json(impact::provider_breakdown(&s.records))
}

async fn equivalents(
    State(s): State<Arc<AppState>>,
) -> Json<crate::models::equivalents::Equivalents> {
    Json(impact::equivalents(&s.records))
}

async fn records(State(s): State<Arc<AppState>>) -> Json<usize> {
    Json(s.records.len())
}
