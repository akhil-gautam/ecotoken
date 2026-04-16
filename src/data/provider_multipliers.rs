#[derive(Debug, Clone, Copy)]
pub struct ProviderMultipliers {
    pub name: &'static str,
    pub pue: f64,
    pub wue_onsite_l_per_kwh: f64,
    pub wue_offsite_l_per_kwh: f64,
    pub cif_kgco2e_per_kwh: f64,
}

// Defaults from Jegham et al. (2025) and provider sustainability reports.
const TABLE: &[ProviderMultipliers] = &[
    ProviderMultipliers { name: "anthropic", pue: 1.14, wue_onsite_l_per_kwh: 0.18, wue_offsite_l_per_kwh: 5.11, cif_kgco2e_per_kwh: 0.287 },
    ProviderMultipliers { name: "openai",    pue: 1.12, wue_onsite_l_per_kwh: 0.30, wue_offsite_l_per_kwh: 4.35, cif_kgco2e_per_kwh: 0.350 },
    ProviderMultipliers { name: "google",    pue: 1.10, wue_onsite_l_per_kwh: 0.95, wue_offsite_l_per_kwh: 3.20, cif_kgco2e_per_kwh: 0.130 },
    ProviderMultipliers { name: "meta",      pue: 1.12, wue_onsite_l_per_kwh: 0.26, wue_offsite_l_per_kwh: 3.80, cif_kgco2e_per_kwh: 0.300 },
    ProviderMultipliers { name: "deepseek",  pue: 1.27, wue_onsite_l_per_kwh: 1.20, wue_offsite_l_per_kwh: 6.016, cif_kgco2e_per_kwh: 0.600 },
    ProviderMultipliers { name: "github",    pue: 1.18, wue_onsite_l_per_kwh: 0.30, wue_offsite_l_per_kwh: 4.35, cif_kgco2e_per_kwh: 0.350 },
    ProviderMultipliers { name: "unknown",   pue: 1.15, wue_onsite_l_per_kwh: 0.40, wue_offsite_l_per_kwh: 4.50, cif_kgco2e_per_kwh: 0.350 },
];

pub fn lookup(provider: &str) -> ProviderMultipliers {
    let lower = provider.to_lowercase();
    for entry in TABLE {
        if lower.contains(entry.name) {
            return *entry;
        }
    }
    *TABLE.last().unwrap()
}
