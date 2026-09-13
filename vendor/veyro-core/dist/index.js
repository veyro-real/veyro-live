export function parseIntent(text, budget) { if (!text.trim() || text.length > 2000)
    throw Error('Enter an intent up to 2,000 characters.'); if (!/^\d{1,6}(\.\d{1,6})?$/.test(budget))
    throw Error('Enter a positive budget with up to six decimals.'); const [whole, frac = ''] = budget.split('.'); const micros = BigInt(whole) * 1000000n + BigInt(frac.padEnd(6, '0')); if (micros <= 0n || micros > 1000000000n)
    throw Error('The test demo permits budgets from 0.000001 to 1,000 test dollars.'); return { text: text.trim(), budgetMicros: micros.toString(), targetReturnIgnored: /million|profit|make me|money/i.test(text) }; }
export const FIXTURES = [{ symbol: 'BREAD', name: 'Bread With WiFi', mint: null, source: 'fixture', sourceUrl: null, score: 94, verifiedSolana: false, reason: 'Illustrative meme candidate. No claim of a real tradable token.' }, { symbol: 'MEOW', name: 'Cat Tax Department', mint: null, source: 'fixture', sourceUrl: null, score: 82, verifiedSolana: false, reason: 'Illustrative research fixture for the testnet workflow.' }, { symbol: 'NAP', name: 'Professional Napper', mint: null, source: 'fixture', sourceUrl: null, score: 76, verifiedSolana: false, reason: 'Illustrative research fixture; no real liquidity implied.' }];
export function pickCandidate(candidates) { const viable = candidates.filter(c => c.source === 'fixture' || c.verifiedSolana); if (!viable.length)
    throw Error('NO_VERIFIED_SOLANA_CANDIDATE'); return [...viable].sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol))[0]; }
export function previewPolicy(p, r, now = Math.floor(Date.now() / 1000)) { if (!p.active)
    return 'REVOKED'; if (now >= p.expiresAt)
    return 'EXPIRED'; if (p.recipient !== r.recipient)
    return 'RECIPIENT_NOT_ALLOWED'; let n; try {
    n = BigInt(r.amount);
}
catch {
    return 'INVALID_AMOUNT';
} if (n <= 0n)
    return 'INVALID_AMOUNT'; if (n > BigInt(p.maxAmount))
    return 'MAX_TRANSACTION_EXCEEDED'; if (n + BigInt(p.spent) > BigInt(p.totalLimit))
    return 'CUMULATIVE_LIMIT_EXCEEDED'; return 'POLICY_SATISFIED'; }
