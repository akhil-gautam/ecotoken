use crate::data::provider_multipliers;

/// Returns CO2 emissions in grams for a given energy draw (Wh).
/// CO2_g = energy_kWh * PUE * CIF_kg_per_kWh * 1000
pub fn co2_g(energy_wh: f64, provider: &str) -> f64 {
    if energy_wh <= 0.0 {
        return 0.0;
    }
    let m = provider_multipliers::lookup(provider);
    let energy_kwh = energy_wh / 1000.0;
    energy_kwh * m.pue * m.cif_kgco2e_per_kwh * 1000.0
}
