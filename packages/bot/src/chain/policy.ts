// Client for the deployed mainnet program 2Z7xH99Z...RvS3Q.
//
// The program is a hand-rolled BPF entrypoint with no Anchor anywhere: it
// dispatches on a single leading byte and reads fixed offsets out of a
// 154-byte account. The vendored @veyro/sdk only speaks Anchor discriminators,
// so none of it applies here. Every offset below is taken from
// ../../veyro-protocol/programs/veyro-mainnet/src/lib.rs and must move with it.
//
// This gate is additive to veyro_claim_spend, never a replacement. The
// database remains the authority on limits.

import {PublicKey,TransactionInstruction} from '@solana/web3.js';

export const VEYRO_PROGRAM_ID=new PublicKey('2Z7xH99Z4YvG4U2Ew5PUZtVh8FE1VRhQ1Mo9dFvRvS3Q');

export const CREATE_POLICY=1;
export const REVOKE_POLICY=2;
export const CHECK_SPEND=3;
export const VERSION=1;
export const POLICY_LEN=154;
const TAG_LEN=16;

/** Offsets the program reads and writes. Named, so a change is obvious. */
const O={
 version:0,active:1,owner:2,agent:34,maxTrade:66,budget:74,
 spent:82,expiry:90,nonce:98,recipient:106,tag:138,
} as const;

const u64=(buf:Buffer,offset:number,value:bigint,what:string)=>{
 if(value<0n||value>0xffffffffffffffffn)throw Error('OUT_OF_RANGE: '+what);
 buf.writeBigUInt64LE(value,offset);
};

const tag16=(tag:Buffer):Buffer=>{
 if(tag.length!==TAG_LEN)throw Error('BAD_TAG_LENGTH: expected '+TAG_LEN+', got '+tag.length);
 return tag;
};

export type CreatePolicyArgs={
 agent:PublicKey;
 maxTradeLamports:bigint;
 budgetLamports:bigint;
 expiresAt:bigint;
 nonce:bigint;
 recipient:PublicKey;
 tag:Buffer;
};

/** 113 bytes. The program rejects any other length outright. */
export function encodeCreatePolicy(a:CreatePolicyArgs):Buffer{
 const d=Buffer.alloc(113);
 d[0]=CREATE_POLICY;
 a.agent.toBuffer().copy(d,1);
 u64(d,33,a.maxTradeLamports,'maxTradeLamports');
 u64(d,41,a.budgetLamports,'budgetLamports');
 u64(d,49,a.expiresAt,'expiresAt');
 u64(d,57,a.nonce,'nonce');
 a.recipient.toBuffer().copy(d,65);
 tag16(a.tag).copy(d,97);
 return d;
}

export const encodeRevokePolicy=():Buffer=>Buffer.from([REVOKE_POLICY]);

export type CheckSpendArgs={
 lamports:bigint;
 /** Compared against the policy expiry; the program rejects a later value. */
 now:bigint;
 recipient:PublicKey;
 tag:Buffer;
};

/** 65 bytes. */
export function encodeCheckSpend(a:CheckSpendArgs):Buffer{
 const d=Buffer.alloc(65);
 d[0]=CHECK_SPEND;
 u64(d,1,a.lamports,'lamports');
 u64(d,9,a.now,'now');
 a.recipient.toBuffer().copy(d,17);
 tag16(a.tag).copy(d,49);
 return d;
}

export type Policy={
 version:number;
 active:boolean;
 owner:PublicKey;
 agent:PublicKey;
 maxTradeLamports:bigint;
 budgetLamports:bigint;
 spentLamports:bigint;
 remainingLamports:bigint;
 expiresAt:bigint;
 nonce:bigint;
 recipient:PublicKey;
 tag:Buffer;
};

/** Null for anything this client does not recognise, rather than a guess. */
export function decodePolicy(raw:Buffer):Policy|null{
 if(raw.length<POLICY_LEN)return null;
 if(raw[O.version]!==VERSION)return null;
 const budget=raw.readBigUInt64LE(O.budget);
 const spent=raw.readBigUInt64LE(O.spent);
 return {
  version:raw[O.version],
  active:raw[O.active]===1,
  owner:new PublicKey(raw.subarray(O.owner,O.owner+32)),
  agent:new PublicKey(raw.subarray(O.agent,O.agent+32)),
  maxTradeLamports:raw.readBigUInt64LE(O.maxTrade),
  budgetLamports:budget,
  spentLamports:spent,
  remainingLamports:budget>spent?budget-spent:0n,
  expiresAt:raw.readBigUInt64LE(O.expiry),
  nonce:raw.readBigUInt64LE(O.nonce),
  recipient:new PublicKey(raw.subarray(O.recipient,O.recipient+32)),
  tag:Buffer.from(raw.subarray(O.tag,O.tag+TAG_LEN)),
 };
}

// ------------------------------------------------------------ instructions
//
// Account order is fixed by the program: [0] is the signer it checks, [1] is
// the policy account it writes. create and revoke are the owner's to sign;
// check_spend compares the signer against the policy's agent field.

export function createPolicyInstruction(
 a:CreatePolicyArgs&{programId:PublicKey;owner:PublicKey;policy:PublicKey},
):TransactionInstruction{
 return new TransactionInstruction({
  programId:a.programId,
  keys:[
   {pubkey:a.owner,isSigner:true,isWritable:false},
   {pubkey:a.policy,isSigner:false,isWritable:true},
  ],
  data:encodeCreatePolicy(a),
 });
}

export function revokePolicyInstruction(
 a:{programId:PublicKey;owner:PublicKey;policy:PublicKey},
):TransactionInstruction{
 return new TransactionInstruction({
  programId:a.programId,
  keys:[
   {pubkey:a.owner,isSigner:true,isWritable:false},
   {pubkey:a.policy,isSigner:false,isWritable:true},
  ],
  data:encodeRevokePolicy(),
 });
}

export function checkSpendInstruction(
 a:CheckSpendArgs&{programId:PublicKey;agent:PublicKey;policy:PublicKey},
):TransactionInstruction{
 return new TransactionInstruction({
  programId:a.programId,
  keys:[
   {pubkey:a.agent,isSigner:true,isWritable:false},
   {pubkey:a.policy,isSigner:false,isWritable:true},
  ],
  data:encodeCheckSpend(a),
 });
}
