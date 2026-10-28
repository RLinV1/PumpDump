"""Feature names, as produced by the Java pipeline (Features.values). Version 1 has no social features."""

MARKET = ["return", "volume", "volumeRatio", "volatility"]
# More catalyst evidence must never raise the score, so these get monotone-decreasing constraints.
CATALYST = ["filings24h", "newsOutlets6h", "catalystPrecededMove"]
FEATURES = MARKET + CATALYST

# docs/rule-scorer.md (rules-v1): feature, "at least" threshold, points. Highest matching row per feature wins.
RULES = [
    ("mentionRatio", 3, 20), ("mentionRatio", 10, 35),
    ("distinctAuthors", 5, 5), ("distinctAuthors", 20, 10),
    ("return", 0.05, 20), ("return", 0.15, 35),
    ("volume", 100_000, 10), ("volume", 1_000_000, 20),
]
