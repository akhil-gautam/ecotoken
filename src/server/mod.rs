pub mod routes;
pub mod static_files;

use std::sync::Arc;

use axum::Router;
use tower_http::cors::CorsLayer;

use crate::models::token_record::TokenRecord;

pub struct AppState {
    pub records: Vec<TokenRecord>,
}

impl AppState {
    pub fn new(records: Vec<TokenRecord>) -> Self {
        Self { records }
    }
}

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .merge(routes::api_routes(state.clone()))
        .merge(static_files::router())
        .layer(CorsLayer::permissive())
}
