# Reading the Pumpwatch risk score (plain English)

This is educational information, not investment advice. Pumpwatch is a non-commercial project.

## What the score is
Pumpwatch gives each tracked ticker a risk score from 0 to 100, computed by a transparent rule table called rules-v1.
It adds points for social signals (a surge in mentions, many distinct authors, new accounts, copied posts) and market
signals (a price jump, high traded volume, a volume surge). News coverage and filings that came before the move take
points away. A flag is raised when the score reaches a set level.

## The verdicts
A score of 65 or more is labelled Pump likely, 35 to 64 is Watch, and below 35 is Low risk. The label says how risky
the ticker looks, not which way the price will go. It is a risk signal about possible coordinated hype, never a price
prediction.

## What a catalyst check means
Pumpwatch looks for news or a company filing that came before the move. If one is found, the score is discounted,
because a real reason for the move makes manipulation less likely. If none is found, the move is unexplained, which is
what raises concern.

## Sentiment is separate context
The terminal also shows the tone of recent Bluesky posts, classified by FinTwitBERT.
It counts posts as positive, neutral or negative, with CardiffNLP possible irony reported separately.
Financial DistilRoBERTa is used for news headlines. Sentiment is shown next to the verdict as context only.
It is not part of the rules-v1 score, and there is no evidence that it predicts pump-and-dump events. In mock mode no
sentiment is collected, and the app says so instead of showing numbers.

## Mock and live data
Mock data is invented demo data and is labelled MOCK everywhere. Live data comes from real providers and is only used
on the owner's own machine.
