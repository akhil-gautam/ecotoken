// Energy-per-query estimates (Wh), by model class, from Jegham et al. (2025)
// "How Hungry is AI?" arXiv:2505.09598v5. Where a model isn't in the paper
// we pick the closest architectural analogue. Numbers are deliberately
// conservative.

#[derive(Debug, Clone, Copy)]
pub struct ModelEnergy {
    pub canonical: &'static str,
    pub provider: &'static str,
    pub short_wh: f64,
    pub medium_wh: f64,
    pub long_wh: f64,
}

const TABLE: &[ModelEnergy] = &[
    // Anthropic
    ModelEnergy { canonical: "claude-opus",    provider: "anthropic", short_wh: 1.20, medium_wh: 5.80, long_wh: 28.0 },
    ModelEnergy { canonical: "claude-sonnet",  provider: "anthropic", short_wh: 0.35, medium_wh: 1.80, long_wh: 11.5 },
    ModelEnergy { canonical: "claude-haiku",   provider: "anthropic", short_wh: 0.08, medium_wh: 0.45, long_wh: 3.10 },
    ModelEnergy { canonical: "claude",         provider: "anthropic", short_wh: 0.35, medium_wh: 1.80, long_wh: 11.5 },

    // OpenAI
    ModelEnergy { canonical: "gpt-4o",         provider: "openai",    short_wh: 0.42, medium_wh: 2.10, long_wh: 13.0 },
    ModelEnergy { canonical: "gpt-4.1",        provider: "openai",    short_wh: 0.36, medium_wh: 1.80, long_wh: 11.0 },
    ModelEnergy { canonical: "gpt-4.1-mini",   provider: "openai",    short_wh: 0.12, medium_wh: 0.62, long_wh: 4.0 },
    ModelEnergy { canonical: "gpt-4.1-nano",   provider: "openai",    short_wh: 0.07, medium_wh: 0.36, long_wh: 2.20 },
    ModelEnergy { canonical: "gpt-5",          provider: "openai",    short_wh: 0.55, medium_wh: 3.00, long_wh: 18.0 },
    ModelEnergy { canonical: "o3",             provider: "openai",    short_wh: 0.90, medium_wh: 6.50, long_wh: 33.0 },
    ModelEnergy { canonical: "o1",             provider: "openai",    short_wh: 0.85, medium_wh: 5.80, long_wh: 28.0 },
    ModelEnergy { canonical: "gpt-3.5",        provider: "openai",    short_wh: 0.20, medium_wh: 0.90, long_wh: 6.50 },
    ModelEnergy { canonical: "codex",          provider: "openai",    short_wh: 0.42, medium_wh: 2.10, long_wh: 13.0 },
    ModelEnergy { canonical: "gpt",            provider: "openai",    short_wh: 0.42, medium_wh: 2.10, long_wh: 13.0 },

    // Google
    ModelEnergy { canonical: "gemini-pro",     provider: "google",    short_wh: 0.38, medium_wh: 1.90, long_wh: 12.0 },
    ModelEnergy { canonical: "gemini-flash",   provider: "google",    short_wh: 0.10, medium_wh: 0.55, long_wh: 3.80 },
    ModelEnergy { canonical: "gemini",         provider: "google",    short_wh: 0.30, medium_wh: 1.50, long_wh: 9.0 },

    // Meta / open
    ModelEnergy { canonical: "llama-3.1-8b",   provider: "meta",      short_wh: 0.04, medium_wh: 0.22, long_wh: 1.80 },
    ModelEnergy { canonical: "llama-3.1-70b",  provider: "meta",      short_wh: 0.28, medium_wh: 1.40, long_wh: 9.0 },
    ModelEnergy { canonical: "llama",          provider: "meta",      short_wh: 0.20, medium_wh: 1.00, long_wh: 7.0 },

    // DeepSeek
    ModelEnergy { canonical: "deepseek-r1",    provider: "deepseek",  short_wh: 0.85, medium_wh: 6.20, long_wh: 33.5 },
    ModelEnergy { canonical: "deepseek",       provider: "deepseek",  short_wh: 0.45, medium_wh: 2.20, long_wh: 13.0 },

    // Fallback
    ModelEnergy { canonical: "unknown",        provider: "unknown",   short_wh: 0.35, medium_wh: 1.80, long_wh: 11.0 },
];

pub fn lookup(model: &str) -> ModelEnergy {
    let lower = model.to_lowercase();
    // longest-prefix match among canonical names
    let mut best: Option<&ModelEnergy> = None;
    let mut best_len = 0usize;
    for entry in TABLE {
        if lower.contains(entry.canonical) && entry.canonical.len() > best_len {
            best = Some(entry);
            best_len = entry.canonical.len();
        }
    }
    *best.unwrap_or(&TABLE[TABLE.len() - 1])
}
