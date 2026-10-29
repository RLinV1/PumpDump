"""Feature names, as produced by the Java pipeline (Features.values). Version 1 has no social features."""

MARKET = ["return", "volume", "volumeRatio", "volatility"]
# More catalyst evidence must never raise the score, so these get monotone-decreasing constraints.
CATALYST = ["filings24h", "newsOutlets6h", "catalystPrecededMove"]
FEATURES = MARKET + CATALYST

# docs/rule-scorer.md (rules-v1): feature, "at least" threshold, points. Rows rise by threshold; the last match wins.
RULES = [
    ("mentionRatio", 3, 20), ("mentionRatio", 10, 35),
    ("distinctAuthors", 5, 5), ("distinctAuthors", 20, 10),
    ("newAccountShare", 0.3, 5), ("newAccountShare", 0.6, 10),
    ("duplicateShare", 0.3, 5), ("duplicateShare", 0.6, 10),
    ("return", 0.05, 20), ("return", 0.15, 35),
    ("volume", 100_000, 10), ("volume", 1_000_000, 20),
    ("volumeRatio", 5, 10), ("volumeRatio", 20, 20),
    ("newsOutlets6h", 1, -10), ("newsOutlets6h", 3, -20),
    ("filings24h", 1, -20),
    ("catalystPrecededMove", 1, -15),
]
