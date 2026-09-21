# Veyro development rules

Build this project independently. Do not import source, setup, contracts, architecture, branding or credentials from unrelated projects. Public platform documentation and normal open-source dependencies are allowed.

## Spending

The Telegram trading bot spends real funds on Solana mainnet. This is deliberate and supersedes the earlier rule that mainnet spending was never enabled. The constraints that replace it:

Every spend passes `veyro_claim_spend` before a transaction is built. That function is the only authority on per-trade and daily limits; never reimplement the check in application code, and never spend against a reservation you did not receive. Preserve budget, recipient, program, expiry, nonce and revocation enforcement everywhere they already exist.

Trading wallets are custodied by the service. Secret keys are encrypted with `VEYRO_CREDENTIALS_KEY` and stored in `veyro_secrets`; they are never logged, never returned over an API, and never written to disk. Custody is the trust boundary and the product must say so to users in plain language before they deposit.

The deployed mainnet program `2Z7xH99Z4YvG4U2Ew5PUZtVh8FE1VRhQ1Mo9dFvRvS3Q` validates limits and accounting but holds no tokens, so including its `check_spend` instruction gates a transaction atomically without taking custody. It is additive to the database check, never a replacement. The custodial program with `execute_route` and a program-owned vault is not deployed to mainnet; do not describe it as if it were.

The testnet rehearsal path stays intact and separate. Never use real funds as a fallback when test infrastructure fails.

## Errors

An error says what failed. Keep that all the way to whoever can act on it.

When you catch an error and raise your own, include the original message. A
bare code is not a diagnosis: `SUPABASE_STORE_ERROR` with the reason discarded
hid a not-null violation that broke every command except `/start`, and the
suite stayed green throughout. Name the operation too, so the message says
where it happened as well as what went wrong.

When a failure is genuinely survivable, say so in the value rather than
pretending it did not happen. A balance that could not be read is `null`, not
`0` — a user who has just deposited reads a zero as their money being gone.
Any "couldn't determine" case gets its own state, distinct from a real value
that happens to look like failure.

Swallowing an error is allowed only where losing it costs the caller nothing,
and every such place is listed in `tests/error-hygiene.test.mts` with its
reason. That test fails on a new silent catch, on a file that grows one, and
on an allowlist entry whose code is gone. Add a case to it whenever a dropped
error costs debugging time — that is how the rule gets stricter over time
instead of decaying.

Error text reaches users in Telegram. Include the diagnostic message; never
include row contents, query parameters or anything from the environment.

## Claims

Make only truthful claims about validation, deployment and financial outcomes. Do not describe engagement-ranked or launch-feed candidates as alpha, an edge, or a prediction. Say what was measured and what was rejected. Never commit keys, environment secrets, provider credentials or local runtime state.

The marketing page and live app are separate Railway services. The live app uses a monochrome Vercel-inspired design with Veyro branding.
