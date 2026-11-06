const FINANCE = /\b(stock|shares?|earnings|revenue|profit|trading|invest|bullish|bearish|market|buy|sell|rally|price)\b/i;

export function mentionedTickers(text) {
  const tickers = new Set();
  for (const match of text.matchAll(/(?<![\w$])\$([A-Za-z]{1,5})\b/g)) tickers.add(match[1].toUpperCase());
  if (FINANCE.test(text)) for (const match of text.matchAll(/\b[A-Z]{1,5}\b/g)) tickers.add(match[0]);
  return tickers;
}
