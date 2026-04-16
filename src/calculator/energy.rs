use crate::data::model_energy::{self, ModelEnergy};
use crate::models::token_record::TokenRecord;

// Query size thresholds (total tokens). Based on Jegham et al.
const SHORT_TOKENS: f64 = 400.0;
const MEDIUM_TOKENS: f64 = 2000.0;
const LONG_TOKENS: f64 = 11_500.0;

pub fn query_count(total_tokens: u64) -> f64 {
    if total_tokens == 0 {
        return 0.0;
    }
    (total_tokens as f64 / SHORT_TOKENS).max(1.0)
}

pub fn record_queries(r: &TokenRecord) -> f64 {
    // Each record is one assistant turn → count as 1 query of the appropriate size.
    if r.total_tokens() == 0 { 0.0 } else { 1.0 }
}

fn interp(size_tokens: f64, m: &ModelEnergy) -> f64 {
    // Piecewise linear interp between short/medium/long anchors; extrapolate gently.
    if size_tokens <= SHORT_TOKENS {
        let ratio = (size_tokens / SHORT_TOKENS).max(0.1);
        m.short_wh * ratio
    } else if size_tokens <= MEDIUM_TOKENS {
        let t = (size_tokens - SHORT_TOKENS) / (MEDIUM_TOKENS - SHORT_TOKENS);
        m.short_wh + t * (m.medium_wh - m.short_wh)
    } else if size_tokens <= LONG_TOKENS {
        let t = (size_tokens - MEDIUM_TOKENS) / (LONG_TOKENS - MEDIUM_TOKENS);
        m.medium_wh + t * (m.long_wh - m.medium_wh)
    } else {
        // Beyond long, scale linearly with token ratio.
        let ratio = size_tokens / LONG_TOKENS;
        m.long_wh * ratio
    }
}

pub fn record_energy_wh(r: &TokenRecord) -> f64 {
    let m = model_energy::lookup(&r.model);
    // Weight cache reads at 10% of compute energy.
    let effective_tokens = r.input_tokens as f64
        + r.output_tokens as f64
        + r.cache_creation_tokens as f64
        + (r.cache_read_tokens as f64) * 0.10;
    if effective_tokens == 0.0 {
        return 0.0;
    }
    interp(effective_tokens, &m)
}
