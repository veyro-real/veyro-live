import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import bs58 from 'bs58';
export const PROGRAM_ID = '2Z7xH99Z4YvG4U2Ew5PUZtVh8FE1VRhQ1Mo9dFvRvS3Q';
export const SYSTEM = '11111111111111111111111111111111';
export const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const INSTRUCTIONS = 'Sysvar1nstructions1111111111111111111111111';
export const RENT = 'SysvarRent111111111111111111111111111111111';
export const concat = (...arrays) => Uint8Array.from(arrays.flatMap(a => [...a]));
export const utf8 = (s) => new TextEncoder().encode(s);
export function address(s) { const a = bs58.decode(s); if (a.length !== 32)
    throw Error('INVALID_ADDRESS'); return a; }
export function u64(value) { if (value < 0n || value > 18446744073709551615n)
    throw Error('INVALID_U64'); const a = new Uint8Array(8); new DataView(a.buffer).setBigUint64(0, value, true); return a; }
export function i64(value) { const a = new Uint8Array(8); new DataView(a.buffer).setBigInt64(0, value, true); return a; }
export function u32(value) { const a = new Uint8Array(4); new DataView(a.buffer).setUint32(0, value, true); return a; }
export function keyFromSecret(secret) { if (secret.length !== 32 && secret.length !== 64)
    throw Error('INVALID_SECRET'); const seed = secret.slice(0, 32); const publicKey = bs58.encode(ed25519.getPublicKey(seed)); if (secret.length === 64 && publicKey !== bs58.encode(secret.slice(32)))
    throw Error('KEY_MISMATCH'); return { publicKey, secret: seed }; }
export function generateKey() { return keyFromSecret(ed25519.utils.randomPrivateKey()); }
export function exportKey(key) { return [...key.secret, ...address(key.publicKey)]; }
export function pda(seeds, program = PROGRAM_ID) {
    if (seeds.length > 15 || seeds.some(s => s.length > 32))
        throw Error('INVALID_SEEDS');
    for (let bump = 255; bump >= 0; bump--) {
        const hash = sha256(concat(...seeds, Uint8Array.of(bump), address(program), utf8('ProgramDerivedAddress')));
        let onCurve = true;
        try {
            ed25519.ExtendedPoint.fromHex(hash);
        }
        catch {
            onCurve = false;
        }
        if (!onCurve)
            return [bs58.encode(hash), bump];
    }
    throw Error('PDA_NOT_FOUND');
}
export const policyAddress = (owner, agent, program = PROGRAM_ID) => pda([utf8('policy'), address(owner), address(agent)], program)[0];
export const poolAddress = (admin, mint, program = PROGRAM_ID) => pda([utf8('pool'), address(admin), address(mint)], program)[0];
export const discriminator = (name) => sha256(utf8('global:' + name)).slice(0, 8);
export const meta = (a, signer = false, writable = false) => ({ address: a, signer, writable });
const short = (n) => { const out = []; do {
    let b = n & 127;
    n >>>= 7;
    if (n)
        b |= 128;
    out.push(b);
} while (n); return Uint8Array.from(out); };
export function compile(payer, blockhash, instructions) {
    const entries = new Map();
    entries.set(payer, meta(payer, true, true));
    for (const ix of instructions) {
        for (const a of [...ix.accounts, meta(ix.program)]) {
            const old = entries.get(a.address);
            entries.set(a.address, { ...a, signer: !!(old?.signer || a.signer), writable: !!(old?.writable || a.writable) });
        }
    }
    const keys = [...entries.values()].sort((a, b) => a.address === payer ? -1 : b.address === payer ? 1 : Number(!!b.signer) * 2 + Number(!!b.writable) - Number(!!a.signer) * 2 - Number(!!a.writable));
    if (keys.length > 256)
        throw Error('TOO_MANY_ACCOUNTS');
    const signers = keys.filter(k => k.signer).map(k => k.address), index = (a) => keys.findIndex(k => k.address === a);
    const header = Uint8Array.of(signers.length, keys.filter(k => k.signer && !k.writable).length, keys.filter(k => !k.signer && !k.writable).length);
    const wire = instructions.map(ix => concat(Uint8Array.of(index(ix.program)), short(ix.accounts.length), Uint8Array.from(ix.accounts.map(a => index(a.address))), short(ix.data.length), ix.data));
    return { message: concat(header, short(keys.length), ...keys.map(k => address(k.address)), address(blockhash), short(wire.length), ...wire), signers };
}
export function signTransaction(compiled, keys) {
    const signatures = compiled.signers.map(a => { const key = keys.find(k => k.publicKey === a); if (!key)
        throw Error('MISSING_SIGNER: ' + a); return ed25519.sign(compiled.message, key.secret); });
    const bytes = concat(short(signatures.length), ...signatures, compiled.message);
    if (bytes.length > 1232)
        throw Error('TRANSACTION_TOO_LARGE');
    return { bytes, signature: bs58.encode(signatures[0]) };
}
export class Rpc {
    endpoint;
    constructor(endpoint) {
        this.endpoint = endpoint;
        const u = new URL(endpoint);
        if (!['https:', 'http:'].includes(u.protocol))
            throw Error('INVALID_RPC');
    }
    async call(method, params = []) { const res = await fetch(this.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(20000) }); if (!res.ok)
        throw Error('RPC_HTTP_' + res.status); const json = await res.json(); if (json.error)
        throw Error(JSON.stringify(json.error)); return json.result; }
    async assertTestCluster() { const hash = await this.call('getGenesisHash'); if (hash === '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')
        throw Error('MAINNET_DISABLED'); const host = new URL(this.endpoint).hostname; if (hash !== '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY' && !['127.0.0.1', 'localhost', '::1'].includes(host))
        throw Error('EXPECTED_SOLANA_TESTNET'); return hash; }
    async account(key) { const value = (await this.call('getAccountInfo', [key, { encoding: 'base64', commitment: 'confirmed' }])).value; if (!value)
        return null; return { owner: value.owner, data: Uint8Array.from(Buffer.from(value.data[0], 'base64')), lamports: value.lamports }; }
    async transaction(payer, keys, ix) { await this.assertTestCluster(); const { blockhash, lastValidBlockHeight } = (await this.call('getLatestBlockhash', [{ commitment: 'confirmed' }])).value; return { ...signTransaction(compile(payer.publicKey, blockhash, ix), [payer, ...keys]), lastValidBlockHeight }; }
    async simulate(bytes) { return this.call('simulateTransaction', [Buffer.from(bytes).toString('base64'), { encoding: 'base64', sigVerify: true, commitment: 'confirmed' }]); }
    async send(bytes) { return this.call('sendTransaction', [Buffer.from(bytes).toString('base64'), { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed' }]); }
    async confirm(signature, timeout = 60000) { const until = Date.now() + timeout; while (Date.now() < until) {
        const s = (await this.call('getSignatureStatuses', [[signature], { searchTransactionHistory: true }])).value[0];
        if (s?.err)
            throw Error('TRANSACTION_FAILED: ' + JSON.stringify(s.err));
        if (s?.confirmationStatus === 'finalized')
            return s;
        await new Promise(r => setTimeout(r, 1200));
    } throw Error('CONFIRMATION_UNKNOWN'); }
}
export function decodePolicy(data) { const expected = sha256(utf8('account:Policy')).slice(0, 8); if (data.length < 250 || !expected.every((v, i) => v === data[i]))
    throw Error('INVALID_POLICY_ACCOUNT'); let at = 8; const key = () => { const k = bs58.encode(data.slice(at, at + 32)); at += 32; return k; }; const num = (signed = false) => { const view = new DataView(data.buffer, data.byteOffset + at, 8); at += 8; return signed ? view.getBigInt64(0, true) : view.getBigUint64(0, true); }; return { owner: key(), agent: key(), executor: key(), recipient: key(), pool: key(), allowedProgram: key(), maxAmount: num(), totalLimit: num(), spent: num(), expiresAt: num(true), nonce: num(), minRate: num(), active: !!data[at] }; }
export function createPoolIx(admin, quoteMint, outputMint, rate, program = PROGRAM_ID) { return { program, accounts: [meta(admin, true, true), meta(poolAddress(admin, outputMint, program), false, true), meta(SYSTEM)], data: concat(discriminator('create_pool'), address(quoteMint), address(outputMint), u64(rate)) }; }
export function createPolicyIx(p, program = PROGRAM_ID) { return { program, accounts: [meta(p.owner, true, true), meta(policyAddress(p.owner, p.agent, program), false, true), meta(p.pool), meta(SYSTEM)], data: concat(discriminator('create_policy'), address(p.agent), address(p.executor), address(p.recipient), u64(p.maxAmount), u64(p.totalLimit), i64(p.expiresAt), address(p.allowedProgram ?? TOKEN), u64(p.minRate)) }; }
export function swapIx(a, amount, minOutput, nonce, program = PROGRAM_ID) { return { program, accounts: [meta(a.agent, true), meta(a.executor, true), meta(a.policy, false, true), meta(a.pool), meta(a.vault, false, true), meta(a.poolQuote, false, true), meta(a.poolOutput, false, true), meta(a.recipient, false, true), meta(TOKEN), meta(INSTRUCTIONS)], data: concat(discriminator('execute_swap'), u64(amount), u64(minOutput), u64(nonce)) }; }
export const revokeIx = (owner, policy, program = PROGRAM_ID) => ({ program, accounts: [meta(owner, true), meta(policy, false, true)], data: discriminator('revoke') });
export function recoverIx(owner, policy, pool, vault, destination, amount, program = PROGRAM_ID) { return { program, accounts: [meta(owner, true), meta(policy), meta(pool), meta(vault, false, true), meta(destination, false, true), meta(TOKEN)], data: concat(discriminator('recover'), u64(amount)) }; }
export const systemCreate = (payer, newAccount, lamports, space, owner) => ({ program: SYSTEM, accounts: [meta(payer, true, true), meta(newAccount, true, true)], data: concat(u32(0), u64(lamports), u64(space), address(owner)) });
export const initializeMint = (mint, authority, decimals = 6) => ({ program: TOKEN, accounts: [meta(mint, false, true), meta(RENT)], data: concat(Uint8Array.of(0, decimals), address(authority), Uint8Array.of(0)) });
export const initializeToken = (account, mint, owner) => ({ program: TOKEN, accounts: [meta(account, false, true), meta(mint), meta(owner), meta(RENT)], data: Uint8Array.of(1) });
export const mintTo = (mint, dest, authority, amount) => ({ program: TOKEN, accounts: [meta(mint, false, true), meta(dest, false, true), meta(authority, true)], data: concat(Uint8Array.of(7), u64(amount)) });
export function errorReason(logs, err) { const known = logs?.map(l => l.match(/Error Message: ([A-Z_]+)/)?.[1]).find(Boolean); return known || (err ? 'EXECUTION_REJECTED' : 'POLICY_SATISFIED'); }
export function explorer(signature) { return 'https://explorer.solana.com/tx/' + encodeURIComponent(signature) + '?cluster=testnet'; }
