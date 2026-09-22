process.env.VEYRO_CREDENTIALS_KEY='a'.repeat(64);
import test from 'node:test';import assert from 'node:assert/strict';
import {encryptSecret,decryptSecret} from '../src/credentials';

test('a secret round trips under the same key',()=>{
 const box=encryptSecret('hello');
 assert.equal(decryptSecret(box),'hello');
});

test('an absent box is null, not an error',()=>{
 assert.equal(decryptSecret(null),null);
 assert.equal(decryptSecret({}),null);
});

// A wallet encrypted before a key rotation cannot be opened afterwards. Node
// throws "Unsupported state or unable to authenticate data" from the GCM auth
// tag, which reached the user verbatim and told them nothing.
test('a secret from a different key fails with a reason, not a crypto string',()=>{
 const box=encryptSecret('hello');
 process.env.VEYRO_CREDENTIALS_KEY='b'.repeat(64);
 try{
  assert.throws(()=>decryptSecret(box),(e:Error)=>{
   assert.match(e.message,/CREDENTIALS_KEY_MISMATCH/);
   assert.doesNotMatch(e.message,/Unsupported state|authenticate data/);
   return true;
  });
 }finally{
  process.env.VEYRO_CREDENTIALS_KEY='a'.repeat(64);
 }
});

test('a corrupt box fails the same way rather than crashing differently',()=>{
 const box=encryptSecret('hello');
 assert.throws(()=>decryptSecret({...box,value:Buffer.from('junk').toString('base64')}),
  /CREDENTIALS_KEY_MISMATCH/);
});
