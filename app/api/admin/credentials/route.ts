import {authorize,readBody,validateOrigin} from '../../../../lib/auth';
import {credentialStatus,setCredential,type CredentialName} from '../../../../lib/credentials';
export const runtime='nodejs';export const dynamic='force-dynamic';
const allowed=new Set<CredentialName>(['xBearerToken','jupiterApiKey','mainnetRpcUrl']);
export async function GET(req:Request){
 try{authorize(req,true);return Response.json({credentials:await credentialStatus()},{headers:{'Cache-Control':'no-store'}});}
 catch(e){return Response.json({error:(e as Error).message},{status:401});}
}
export async function POST(req:Request){
 try{
  validateOrigin(req);authorize(req,true);
  const body=await readBody(req);
  for(const [name,value] of Object.entries(body.credentials||{})){
   if(allowed.has(name as CredentialName)&&typeof value==='string')await setCredential(name as CredentialName,value);
  }
  return Response.json({credentials:await credentialStatus()},{headers:{'Cache-Control':'no-store'}});
 }catch(e){const error=(e as Error).message;return Response.json({error},{status:error==='UNAUTHORIZED'?401:400});}
}
