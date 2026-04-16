use crate::data::provider_multipliers;

/// Returns water consumption in millilitres for a given energy draw (Wh).
/// Water_L = energy_kWh * (WUE_onsite/PUE + WUE_offsite)
pub fn water_ml(energy_wh: f64, provider: &str) -> f64 {
    if energy_wh <= 0.0 {
        return 0.0;
    }
    let m = provider_multipliers::lookup(provider);
    let energy_kwh = energy_wh / 1000.0;
    let wue_total = m.wue_onsite_l_per_kwh / m.pue.max(1.0) + m.wue_offsite_l_per_kwh;
    let litres = energy_kwh * wue_total;
    litres * 1000.0
}
