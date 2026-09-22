import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {getSecret,saveSecret} from './store';

export type SecretBox={iv:string;tag:string;value:string};
export type CredentialName='xBearerToken'|'jupiterApiKey'|'mainnetRpcUrl';
export type CredentialStatus=Record<CredentialName,boolean>;
const names:CredentialName[]=['xBearerToken','jupiterApiKey','mainnetRpcUrl'];

function key(){
 const raw=process.env.VEYRO_CREDENTIALS_KEY||process.env.VEYRO_OPERATOR_TOKEN||'';
 if(raw.length<32)throw Error('CREDENTIALS_KEY_NOT_CONFIGURED');
 return createHash('sha256').update(raw).digest();
}
export function encryptSecret(value:string):SecretBox{
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);
 const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 return {iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),value:encrypted.toString('base64')};
}
export function decryptSecret(box:unknown):string|null{
 if(!box||typeof box!=='object')return null;
 const b=box as Partial<SecretBox>;
 if(!b.iv||!b.tag||!b.value)return null;
 try{
  const decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(b.iv,'base64'));
  decipher.setAuthTag(Buffer.from(b.tag,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(b.value,'base64')),decipher.final()]).toString('utf8');
 }catch{
  // GCM reports a wrong key and a tampered ciphertext identically, and Node
  // words it as "Unsupported state or unable to authenticate data" — which
  // reached a user verbatim and told them nothing. The overwhelmingly likely
  // cause is a secret written before VEYRO_CREDENTIALS_KEY was rotated.
  //
  // Not returning null: null already means "no secret stored", and a stored
  // secret that cannot be opened is a different situation with a different
  // answer. Conflating them would silently mint a replacement wallet and
  // hide whatever the old address holds.
  throw Error('CREDENTIALS_KEY_MISMATCH: a stored secret cannot be opened '+
   'with the current VEYRO_CREDENTIALS_KEY. It was written under a previous '+
   'key, so this service can no longer sign for it.');
 }
}
export async function setCredential(name:CredentialName,value:string){
 if(!names.includes(name))throw Error('INVALID_CREDENTIAL');
 const trimmed=value.trim();
 if(!trimmed)return;
 await saveSecret(name,encryptSecret(trimmed));
}
export async function credential(name:CredentialName):Promise<string|null>{
 if(name==='xBearerToken'&&process.env.X_BEARER_TOKEN)return process.env.X_BEARER_TOKEN;
 if(name==='mainnetRpcUrl'&&process.env.SOLANA_MAINNET_READ_RPC_URL)return process.env.SOLANA_MAINNET_READ_RPC_URL;
 if(name==='jupiterApiKey'&&process.env.JUPITER_API_KEY)return process.env.JUPITER_API_KEY;
 return decryptSecret(await getSecret(name));
}
export async function credentialStatus():Promise<CredentialStatus>{
 const entries=await Promise.all(names.map(async name=>[name,!!await credential(name)] as const));
 return Object.fromEntries(entries) as CredentialStatus;
}
