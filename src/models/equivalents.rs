use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct Equivalents {
    pub water_glasses: f64,
    pub showers: f64,
    pub toilet_flushes: f64,
    pub car_km: f64,
    pub google_searches: f64,
    pub netflix_hours: f64,
    pub phone_charges: f64,
    pub led_hours: f64,
    pub trees_per_day: f64,
}

pub fn compute_equivalents(energy_wh: f64, water_ml: f64, co2_g: f64) -> Equivalents {
    // Water
    let glass_ml = 250.0;
    let shower_ml = 65_000.0; // avg 8-min shower
    let toilet_ml = 6_000.0;

    // CO2 — modern gasoline car ≈ 170 gCO2/km; 1 Google search ≈ 0.2 g; Netflix ≈ 36 g/hr.
    let car_g_per_km = 170.0;
    let search_g = 0.2;
    let netflix_g_per_hour = 36.0;

    // Energy
    let phone_wh = 18.5; // typical smartphone battery charge
    let led_wh_per_hour = 9.0;

    // Tree sequestration: ~22 kg CO2/year per mature tree → ~60 g/day.
    let tree_g_per_day = 60.0;

    Equivalents {
        water_glasses: water_ml / glass_ml,
        showers: water_ml / shower_ml,
        toilet_flushes: water_ml / toilet_ml,
        car_km: co2_g / car_g_per_km,
        google_searches: co2_g / search_g,
        netflix_hours: co2_g / netflix_g_per_hour,
        phone_charges: energy_wh / phone_wh,
        led_hours: energy_wh / led_wh_per_hour,
        trees_per_day: co2_g / tree_g_per_day,
    }
}
