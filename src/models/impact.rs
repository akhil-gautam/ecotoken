use std::collections::BTreeMap;

use chrono::NaiveDate;
use serde::Serialize;

use crate::calculator;
use crate::models::equivalents::{compute_equivalents, Equivalents};
use crate::models::token_record::TokenRecord;

#[derive(Debug, Clone, Serialize)]
pub struct ImpactTotals {
    pub tokens: u64,
    pub energy_wh: f64,
    pub water_ml: f64,
    pub co2_g: f64,
}

impl ImpactTotals {
    pub fn add(&mut self, other: &ImpactTotals) {
        self.tokens += other.tokens;
        self.energy_wh += other.energy_wh;
        self.water_ml += other.water_ml;
        self.co2_g += other.co2_g;
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Summary {
    pub total_tokens: u64,
    pub total_energy_wh: f64,
    pub total_water_ml: f64,
    pub total_co2_g: f64,
    pub record_count: usize,
    pub period_start: Option<String>,
    pub period_end: Option<String>,
    pub providers: Vec<String>,
    pub models_used: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DailyPoint {
    pub date: String,
    pub tokens: u64,
    pub energy_wh: f64,
    pub water_ml: f64,
    pub co2_g: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModelBreakdown {
    pub model: String,
    pub provider: String,
    pub tokens: u64,
    pub energy_wh: f64,
    pub water_ml: f64,
    pub co2_g: f64,
    pub queries: f64,
    pub eco_efficiency_score: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProviderBreakdown {
    pub provider: String,
    pub tokens: u64,
    pub energy_wh: f64,
    pub water_ml: f64,
    pub co2_g: f64,
    pub pue: f64,
    pub wue_onsite_l_per_kwh: f64,
    pub wue_offsite_l_per_kwh: f64,
    pub cif_kgco2e_per_kwh: f64,
}

pub fn record_totals(r: &TokenRecord) -> ImpactTotals {
    let energy = calculator::energy::record_energy_wh(r);
    let water = calculator::water::water_ml(energy, &r.provider);
    let co2 = calculator::carbon::co2_g(energy, &r.provider);
    ImpactTotals {
        tokens: r.total_tokens(),
        energy_wh: energy,
        water_ml: water,
        co2_g: co2,
    }
}

pub fn summarize(records: &[TokenRecord]) -> Summary {
    let mut total = ImpactTotals {
        tokens: 0,
        energy_wh: 0.0,
        water_ml: 0.0,
        co2_g: 0.0,
    };
    let mut providers = std::collections::BTreeSet::new();
    let mut models = std::collections::BTreeSet::new();
    let mut min_ts = None;
    let mut max_ts = None;
    for r in records {
        let t = record_totals(r);
        total.add(&t);
        providers.insert(r.provider.clone());
        models.insert(r.model.clone());
        min_ts = Some(min_ts.map_or(r.timestamp, |m: chrono::DateTime<chrono::Utc>| m.min(r.timestamp)));
        max_ts = Some(max_ts.map_or(r.timestamp, |m: chrono::DateTime<chrono::Utc>| m.max(r.timestamp)));
    }
    Summary {
        total_tokens: total.tokens,
        total_energy_wh: total.energy_wh,
        total_water_ml: total.water_ml,
        total_co2_g: total.co2_g,
        record_count: records.len(),
        period_start: min_ts.map(|t| t.to_rfc3339()),
        period_end: max_ts.map(|t| t.to_rfc3339()),
        providers: providers.into_iter().collect(),
        models_used: models.into_iter().collect(),
    }
}

pub fn daily(records: &[TokenRecord]) -> Vec<DailyPoint> {
    let mut buckets: BTreeMap<NaiveDate, ImpactTotals> = BTreeMap::new();
    for r in records {
        let d = r.timestamp.date_naive();
        let t = record_totals(r);
        buckets
            .entry(d)
            .and_modify(|e| e.add(&t))
            .or_insert(t);
    }
    buckets
        .into_iter()
        .map(|(d, t)| DailyPoint {
            date: d.to_string(),
            tokens: t.tokens,
            energy_wh: t.energy_wh,
            water_ml: t.water_ml,
            co2_g: t.co2_g,
        })
        .collect()
}

pub fn model_breakdown(records: &[TokenRecord]) -> Vec<ModelBreakdown> {
    let mut buckets: BTreeMap<(String, String), (ImpactTotals, f64)> = BTreeMap::new();
    for r in records {
        let t = record_totals(r);
        let queries = calculator::energy::record_queries(r);
        let key = (r.model.clone(), r.provider.clone());
        buckets
            .entry(key)
            .and_modify(|(e, q)| {
                e.add(&t);
                *q += queries;
            })
            .or_insert((t, queries));
    }
    let mut out: Vec<_> = buckets
        .into_iter()
        .map(|((model, provider), (t, queries))| {
            // Eco-efficiency ≈ tokens-per-joule (higher = better). Scale 0..100.
            let joules = t.energy_wh * 3600.0;
            let score = if joules > 0.0 {
                (t.tokens as f64 / joules).min(1_000_000.0)
            } else {
                0.0
            };
            ModelBreakdown {
                model,
                provider,
                tokens: t.tokens,
                energy_wh: t.energy_wh,
                water_ml: t.water_ml,
                co2_g: t.co2_g,
                queries,
                eco_efficiency_score: score,
            }
        })
        .collect();
    // Normalize score to 0..100 based on max observed.
    let max_score = out.iter().map(|m| m.eco_efficiency_score).fold(0.0_f64, f64::max);
    if max_score > 0.0 {
        for m in &mut out {
            m.eco_efficiency_score = (m.eco_efficiency_score / max_score) * 100.0;
        }
    }
    out.sort_by(|a, b| b.energy_wh.partial_cmp(&a.energy_wh).unwrap_or(std::cmp::Ordering::Equal));
    out
}

pub fn provider_breakdown(records: &[TokenRecord]) -> Vec<ProviderBreakdown> {
    let mut buckets: BTreeMap<String, ImpactTotals> = BTreeMap::new();
    for r in records {
        let t = record_totals(r);
        buckets
            .entry(r.provider.clone())
            .and_modify(|e| e.add(&t))
            .or_insert(t);
    }
    buckets
        .into_iter()
        .map(|(provider, t)| {
            let m = crate::data::provider_multipliers::lookup(&provider);
            ProviderBreakdown {
                provider,
                tokens: t.tokens,
                energy_wh: t.energy_wh,
                water_ml: t.water_ml,
                co2_g: t.co2_g,
                pue: m.pue,
                wue_onsite_l_per_kwh: m.wue_onsite_l_per_kwh,
                wue_offsite_l_per_kwh: m.wue_offsite_l_per_kwh,
                cif_kgco2e_per_kwh: m.cif_kgco2e_per_kwh,
            }
        })
        .collect()
}

pub fn equivalents(records: &[TokenRecord]) -> Equivalents {
    let s = summarize(records);
    compute_equivalents(s.total_energy_wh, s.total_water_ml, s.total_co2_g)
}
