// Public dependency health. No auth: a status page has to be able to read it
// while signed out, and nothing here is sensitive -- lib/health scrubs every
// detail before it leaves.
import {probe} from '@veyro/bot/health';
import {db} from '@veyro/bot/db';

export const runtime='nodejs';export const dynamic='force-dynamic';

const ALLOWED=new Set(['https://status.veyro.wtf','https://veyro.wtf']);
function cors(req:Request):Record<string,string>{
 const origin=req.headers.get('origin');
 if(!origin||!ALLOWED.has(origin))return {};
 return {'Access-Control-Allow-Origin':origin,'Vary':'Origin'};
}

async function rpcSlot(){
 const url=process.env.SOLANA_MAINNET_READ_RPC_URL||process.env.SOLANA_MAINNET_RPC_URL;
 if(!url)throw Error('RPC_NOT_CONFIGURED');
 const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getSlot'}),cache:'no-store'});
 if(!r.ok)throw Error('RPC_HTTP_'+r.status);
 const j=await r.json() as {result?:number;error?:{message:string}};
 if(j.error)throw Error(j.error.message);
 return 'slot '+j.result;
}

async function supabase(){
 const {error}=await db().from('veyro_state').select('id').limit(1);
 if(error)throw Error(error.message);
 return 'query ok';
}

/** Feed liveness. The worker writes candidates; silence means it is not running. */
async function feed(){
 const {data,error}=await db().from('veyro_candidates')
  .select('first_seen').order('first_seen',{ascending:false}).limit(1);
 if(error)throw Error(error.message);
 if(!data?.length)return 'no launches recorded yet';
 const age=Math.round((Date.now()-new Date(data[0].first_seen as string).getTime())/1000);
 // The feed sees pump.fun launches constantly, so a long gap means the
 // worker is down even though the web service is fine.
 if(age>900)throw Error('stale: last launch '+age+'s ago');
 return 'last launch '+age+'s ago';
}

export async function GET(req:Request){
 const health=await probe({supabase,rpc:rpcSlot,feed});
 return Response.json(health,{
  status:health.ok?200:503,
  headers:{'Cache-Control':'no-store',...cors(req)},
 });
}

export async function OPTIONS(req:Request){
 return new Response(null,{status:204,
  headers:{...cors(req),'Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Max-Age':'86400'}});
}
