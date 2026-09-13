export declare const PROGRAM_ID = "2Z7xH99Z4YvG4U2Ew5PUZtVh8FE1VRhQ1Mo9dFvRvS3Q";
export declare const SYSTEM = "11111111111111111111111111111111";
export declare const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export declare const INSTRUCTIONS = "Sysvar1nstructions1111111111111111111111111";
export declare const RENT = "SysvarRent111111111111111111111111111111111";
export type Key = {
    publicKey: string;
    secret: Uint8Array;
};
export type Meta = {
    address: string;
    signer?: boolean;
    writable?: boolean;
};
export type Instruction = {
    program: string;
    accounts: Meta[];
    data: Uint8Array;
};
export declare const concat: (...arrays: Uint8Array[]) => Uint8Array<ArrayBuffer>;
export declare const utf8: (s: string) => Uint8Array<ArrayBuffer>;
export declare function address(s: string): Uint8Array;
export declare function u64(value: bigint): Uint8Array;
export declare function i64(value: bigint): Uint8Array;
export declare function u32(value: number): Uint8Array;
export declare function keyFromSecret(secret: Uint8Array): Key;
export declare function generateKey(): Key;
export declare function exportKey(key: Key): number[];
export declare function pda(seeds: Uint8Array[], program?: string): [string, number];
export declare const policyAddress: (owner: string, agent: string, program?: string) => string;
export declare const poolAddress: (admin: string, mint: string, program?: string) => string;
export declare const discriminator: (name: string) => Uint8Array<ArrayBuffer>;
export declare const meta: (a: string, signer?: boolean, writable?: boolean) => Meta;
export declare function compile(payer: string, blockhash: string, instructions: Instruction[]): {
    message: Uint8Array;
    signers: string[];
};
export declare function signTransaction(compiled: ReturnType<typeof compile>, keys: Key[]): {
    bytes: Uint8Array;
    signature: string;
};
export declare class Rpc {
    endpoint: string;
    constructor(endpoint: string);
    call<T = any>(method: string, params?: unknown[]): Promise<T>;
    assertTestCluster(): Promise<string>;
    account(key: string): Promise<{
        owner: any;
        data: Uint8Array<ArrayBuffer>;
        lamports: any;
    } | null>;
    transaction(payer: Key, keys: Key[], ix: Instruction[]): Promise<{
        lastValidBlockHeight: any;
        bytes: Uint8Array;
        signature: string;
    }>;
    simulate(bytes: Uint8Array): Promise<any>;
    send(bytes: Uint8Array): Promise<string>;
    confirm(signature: string, timeout?: number): Promise<any>;
}
export declare const MAX_RECIPIENTS = 8, MAX_PROGRAMS = 4;
export type Policy = {
    version: 2;
    owner: string;
    agent: string;
    executor: string;
    pool: string;
    maxAmount: bigint;
    totalLimit: bigint;
    spent: bigint;
    expiresAt: bigint;
    nonce: bigint;
    minRate: bigint;
    active: boolean;
    bump: number;
    allowedRecipients: string[];
    allowedPrograms: string[];
};
export declare function decodePolicy(data: Uint8Array): Policy;
export type Evaluation = {
    decision: 'ALLOW' | 'DENY';
    reason: string;
    simulationSlot: number | null;
};
/** Evaluate signed bytes against current chain state. ALLOW is provisional; this never broadcasts. */
export declare function evaluateTransaction(rpc: Rpc, bytes: Uint8Array): Promise<Evaluation>;
export declare function createPoolIx(admin: string, quoteMint: string, outputMint: string, rate: bigint, program?: string): Instruction;
export declare function createPolicyIx(p: {
    owner: string;
    agent: string;
    executor: string;
    allowedRecipients: string[];
    pool: string;
    maxAmount: bigint;
    totalLimit: bigint;
    expiresAt: bigint;
    minRate: bigint;
    allowedPrograms?: string[];
}, program?: string): Instruction;
export type SwapAccounts = {
    agent: string;
    executor: string;
    policy: string;
    pool: string;
    vault: string;
    poolQuote: string;
    poolOutput: string;
    recipient: string;
};
export declare function swapIx(a: SwapAccounts, amount: bigint, minOutput: bigint, nonce: bigint, program?: string): Instruction;
export declare const revokeIx: (owner: string, policy: string, program?: string) => Instruction;
export declare function recoverIx(owner: string, policy: string, pool: string, vault: string, destination: string, amount: bigint, program?: string): Instruction;
export declare const systemCreate: (payer: string, newAccount: string, lamports: bigint, space: bigint, owner: string) => Instruction;
export declare const initializeMint: (mint: string, authority: string, decimals?: number) => Instruction;
export declare const initializeToken: (account: string, mint: string, owner: string) => Instruction;
export declare const mintTo: (mint: string, dest: string, authority: string, amount: bigint) => Instruction;
export declare function errorReason(logs: string[] | null, err: unknown): string;
export declare function explorer(signature: string): string;
