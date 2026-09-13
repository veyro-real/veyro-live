export type ResearchCandidate = {
    symbol: string;
    name: string;
    mint: string | null;
    source: 'fixture' | 'x';
    sourceUrl: string | null;
    score: number;
    verifiedSolana: boolean;
    reason: string;
};
export type Intent = {
    text: string;
    budgetMicros: string;
    targetReturnIgnored: boolean;
};
export declare function parseIntent(text: string, budget: string): Intent;
export declare const FIXTURES: ResearchCandidate[];
export declare function pickCandidate(candidates: ResearchCandidate[]): ResearchCandidate;
export declare function previewPolicy(p: {
    active: boolean;
    expiresAt: number;
    maxAmount: string;
    totalLimit: string;
    spent: string;
    allowedRecipients: string[];
    allowedPrograms: string[];
}, r: {
    amount: string;
    recipient: string;
    program: string;
}, now?: number): "REVOKED" | "EXPIRED" | "PROGRAM_NOT_ALLOWED" | "RECIPIENT_NOT_ALLOWED" | "INVALID_AMOUNT" | "MAX_TRANSACTION_EXCEEDED" | "CUMULATIVE_LIMIT_EXCEEDED" | "POLICY_SATISFIED";
