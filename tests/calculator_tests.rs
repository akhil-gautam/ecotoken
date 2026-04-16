use chrono::Utc;
use ecotoken::calculator::{carbon, energy, water};
use ecotoken::models::token_record::TokenRecord;

fn rec(model: &str, provider: &str, input: u64, output: u64) -> TokenRecord {
    TokenRecord {
        timestamp: Utc::now(),
        provider: provider.into(),
        source: "test".into(),
        model: model.into(),
        input_tokens: input,
        output_tokens: output,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
        project: None,
        session_id: None,
        dedup_key: None,
    }
}

#[test]
fn sonnet_short_query_energy_is_reasonable() {
    let r = rec("claude-sonnet-4-20250514", "anthropic", 100, 300);
    let e = energy::record_energy_wh(&r);
    assert!(e > 0.1 && e < 0.6, "short sonnet query ≈ 0.35 Wh, got {e}");
}

#[test]
fn anthropic_water_is_positive() {
    let w = water::water_ml(1.0, "anthropic");
    assert!(w > 0.0);
}

#[test]
fn anthropic_co2_is_positive() {
    let c = carbon::co2_g(1.0, "anthropic");
    assert!(c > 0.0);
}

#[test]
fn zero_tokens_means_zero_energy() {
    let r = rec("claude-sonnet", "anthropic", 0, 0);
    assert_eq!(energy::record_energy_wh(&r), 0.0);
}

#[test]
fn deepseek_has_more_water_than_anthropic_for_same_energy() {
    let a = water::water_ml(100.0, "anthropic");
    let d = water::water_ml(100.0, "deepseek");
    assert!(d > a, "deepseek WUE should exceed anthropic ({d} vs {a})");
}
