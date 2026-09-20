import test from 'node:test';import assert from 'node:assert/strict';
const P=await import('../lib/chain/policy');
const {PublicKey}=await import('@solana/web3.js');

const OWNER=new PublicKey('4Nd1mRSpVtFvTvW1vBcLE2ZSDCWuVQKbSMU9ZSAgzKcf');
const AGENT=new PublicKey('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
const RECIPIENT=new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');
const TAG=Buffer.alloc(16,7);

const POLICY={
 agent:AGENT,maxTradeLamports:500_000_000n,budgetLamports:2_000_000_000n,
 expiresAt:1_800_000_000n,nonce:0n,recipient:RECIPIENT,tag:TAG,
};

test('create policy data is exactly the 113 bytes the program demands',()=>{
 const d=P.encodeCreatePolicy(POLICY);
 assert.equal(d.length,113);
 assert.equal(d[0],P.CREATE_POLICY);
});

test('create policy lays every field at the offset the program reads',()=>{
 const d=P.encodeCreatePolicy(POLICY);
 assert.deepEqual(d.subarray(1,33),AGENT.toBuffer());
 assert.equal(d.readBigUInt64LE(33),500_000_000n);
 assert.equal(d.readBigUInt64LE(41),2_000_000_000n);
 assert.equal(d.readBigUInt64LE(49),1_800_000_000n);
 assert.equal(d.readBigUInt64LE(57),0n);
 assert.deepEqual(d.subarray(65,97),RECIPIENT.toBuffer());
 assert.deepEqual(d.subarray(97,113),TAG);
});

test('revoke is a single tag byte',()=>{
 const d=P.encodeRevokePolicy();
 assert.equal(d.length,1);
 assert.equal(d[0],P.REVOKE_POLICY);
});

test('check spend is exactly 65 bytes with the amount first',()=>{
 const d=P.encodeCheckSpend({lamports:250_000_000n,now:1_700_000_000n,recipient:RECIPIENT,tag:TAG});
 assert.equal(d.length,65);
 assert.equal(d[0],P.CHECK_SPEND);
 assert.equal(d.readBigUInt64LE(1),250_000_000n);
 assert.equal(d.readBigUInt64LE(9),1_700_000_000n);
 assert.deepEqual(d.subarray(17,49),RECIPIENT.toBuffer());
 assert.deepEqual(d.subarray(49,65),TAG);
});

test('a tag that is not 16 bytes is refused rather than silently padded',()=>{
 assert.throws(()=>P.encodeCreatePolicy({...POLICY,tag:Buffer.alloc(8)}),/TAG/);
 assert.throws(()=>P.encodeCheckSpend({lamports:1n,now:1n,recipient:RECIPIENT,tag:Buffer.alloc(20)}),/TAG/);
});

test('amounts that cannot fit a u64 are refused, not truncated',()=>{
 assert.throws(()=>P.encodeCheckSpend({lamports:2n**64n,now:1n,recipient:RECIPIENT,tag:TAG}),/RANGE/);
 assert.throws(()=>P.encodeCheckSpend({lamports:-1n,now:1n,recipient:RECIPIENT,tag:TAG}),/RANGE/);
});

test('a policy account decodes at the offsets the program writes',()=>{
 const raw=Buffer.alloc(154);
 raw[0]=1;raw[1]=1;
 OWNER.toBuffer().copy(raw,2);
 AGENT.toBuffer().copy(raw,34);
 raw.writeBigUInt64LE(500_000_000n,66);
 raw.writeBigUInt64LE(2_000_000_000n,74);
 raw.writeBigUInt64LE(750_000_000n,82);
 raw.writeBigUInt64LE(1_800_000_000n,90);
 raw.writeBigUInt64LE(3n,98);
 RECIPIENT.toBuffer().copy(raw,106);
 TAG.copy(raw,138);

 const p=P.decodePolicy(raw)!;
 assert.equal(p.version,1);
 assert.equal(p.active,true);
 assert.equal(p.owner.toBase58(),OWNER.toBase58());
 assert.equal(p.agent.toBase58(),AGENT.toBase58());
 assert.equal(p.maxTradeLamports,500_000_000n);
 assert.equal(p.budgetLamports,2_000_000_000n);
 assert.equal(p.spentLamports,750_000_000n);
 assert.equal(p.remainingLamports,1_250_000_000n);
 assert.equal(p.expiresAt,1_800_000_000n);
 assert.equal(p.nonce,3n);
 assert.equal(p.recipient.toBase58(),RECIPIENT.toBase58());
});

test('a revoked policy decodes as inactive',()=>{
 const raw=Buffer.alloc(154);raw[0]=1;raw[1]=0;
 assert.equal(P.decodePolicy(raw)!.active,false);
});

test('a short buffer or wrong version decodes to null rather than garbage',()=>{
 assert.equal(P.decodePolicy(Buffer.alloc(100)),null);
 const wrong=Buffer.alloc(154);wrong[0]=9;
 assert.equal(P.decodePolicy(wrong),null);
});

test('check spend puts the agent first as signer and the policy writable',()=>{
 const ix=P.checkSpendInstruction({
  programId:P.VEYRO_PROGRAM_ID,agent:AGENT,policy:OWNER,
  lamports:1n,now:2n,recipient:RECIPIENT,tag:TAG,
 });
 assert.equal(ix.keys.length,2);
 assert.deepEqual(
  {s:ix.keys[0].isSigner,w:ix.keys[0].isWritable,k:ix.keys[0].pubkey.toBase58()},
  {s:true,w:false,k:AGENT.toBase58()});
 assert.equal(ix.keys[1].isWritable,true,'the program writes spent and nonce');
 assert.equal(ix.data.length,65);
});

test('create and revoke are signed by the owner, not the agent',()=>{
 for(const ix of [
  P.createPolicyInstruction({programId:P.VEYRO_PROGRAM_ID,owner:OWNER,policy:AGENT,...POLICY}),
  P.revokePolicyInstruction({programId:P.VEYRO_PROGRAM_ID,owner:OWNER,policy:AGENT}),
 ]){
  assert.equal(ix.keys[0].pubkey.toBase58(),OWNER.toBase58());
  assert.equal(ix.keys[0].isSigner,true);
  assert.equal(ix.keys[1].isWritable,true);
 }
});

test('the deployed program id is the one in AGENTS.md',()=>{
 assert.equal(P.VEYRO_PROGRAM_ID.toBase58(),'2Z7xH99Z4YvG4U2Ew5PUZtVh8FE1VRhQ1Mo9dFvRvS3Q');
});

test('POLICY_LEN matches the program constant',()=>{
 assert.equal(P.POLICY_LEN,154);
});
