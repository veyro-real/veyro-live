import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {getSecret,saveSecret} from './store';

type SecretBox={iv:string;tag:string;value:string};
export type CredentialName='xBearerToken'|'jupiterApiKey'|'mainnetRpcUrl';
export type CredentialStatus=Record<CredentialName,boolean>;
const names:CredentialName[]=['xBearerToken','jupiterApiKey','mainnetRpcUrl'];

function key(){
 const raw=process.env.VEYRO_CREDENTIALS_KEY||process.env.VEYRO_OPERATOR_TOKEN||'';
 if(raw.length<32)throw Error('CREDENTIALS_KEY_NOT_CONFIGURED');
 return createHash('sha256').update(raw).digest();
}
function encrypt(value:string):SecretBox{
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);
 const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 return {iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),value:encrypted.toString('base64')};
}
function decrypt(box:unknown):string|null{
 if(!box||typeof box!=='object')return null;
 const b=box as Partial<SecretBox>;
 if(!b.iv||!b.tag||!b.value)return null;
 const decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(b.iv,'base64'));
 decipher.setAuthTag(Buffer.from(b.tag,'base64'));
 return Buffer.concat([decipher.update(Buffer.from(b.value,'base64')),decipher.final()]).toString('utf8');
}
export async function setCredential(name:CredentialName,value:string){
 if(!names.includes(name))throw Error('INVALID_CREDENTIAL');
 const trimmed=value.trim();
 if(!trimmed)return;
 await saveSecret(name,encrypt(trimmed));
}
export async function credential(name:CredentialName):Promise<string|null>{
 if(name==='xBearerToken'&&process.env.X_BEARER_TOKEN)return process.env.X_BEARER_TOKEN;
 if(name==='mainnetRpcUrl'&&process.env.SOLANA_MAINNET_READ_RPC_URL)return process.env.SOLANA_MAINNET_READ_RPC_URL;
 if(name==='jupiterApiKey'&&process.env.JUPITER_API_KEY)return process.env.JUPITER_API_KEY;
 return decrypt(await getSecret(name));
}
export async function credentialStatus():Promise<CredentialStatus>{
 const entries=await Promise.all(names.map(async name=>[name,!!await credential(name)] as const));
 return Object.fromEntries(entries) as CredentialStatus;
}
