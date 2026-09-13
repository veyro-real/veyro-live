import {FIXTURES,type ResearchCandidate} from '@veyro/core';
import {Rpc,TOKEN,address} from '@veyro/sdk';
import {getState,saveState} from './store';
const QUERY='(memecoin OR "meme coin") (solana OR $SOL) -is:retweet lang:en';
export async function research(live:boolean):Promise<{candidates:ResearchCandidate[];source:string;cached:boolean}>{
 if(!live)return {candidates:FIXTURES,source:'Illustrative fixtures',cached:false};
 const token=process.env.X_BEARER_TOKEN;if(!token)throw Error('X_NOT_CONFIGURED');
 const cached=getState<{at:number;candidates:ResearchCandidate[]}>('x:cache');if(cached && Date.now()-cached.at<300_000)return {candidates:cached.candidates,source:'X recent search',cached:true};
 const key='x:requests:'+new Date().toISOString().slice(0,10);const count=getState<number>(key)||0;const cap=Math.min(50,Math.max(1,Number(process.env.X_MAX_REQUESTS_PER_DAY||10)));if(!Number.isFinite(cap)||count>=cap)throw Error('X_DAILY_REQUEST_CAP');
 saveState(key,count+1); // Count attempted requests even when upstream fails; no automatic retries.
 const u=new URL('https://api.x.com/2/tweets/search/recent');u.searchParams.set('query',QUERY);u.searchParams.set('max_results','20');u.searchParams.set('tweet.fields','public_metrics,created_at');
 const res=await fetch(u,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});if(!res.ok)throw Error('X_HTTP_'+res.status);const body=await res.json();
 const rpcUrl=process.env.SOLANA_MAINNET_READ_RPC_URL||'https://api.mainnet-beta.solana.com';const rpc=new Rpc(rpcUrl);
 const candidates:ResearchCandidate[]=[];const seen=new Set<string>();
 for(const post of body.data||[]){const mints=(String(post.text).match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g)||[]).slice(0,2);for(const mint of mints){if(seen.has(mint)||seen.size>=8)continue;seen.add(mint);try{address(mint);const acct=await rpc.account(mint);if(!acct||acct.owner!==TOKEN||acct.data.length!==82||acct.data[45]!==1)continue;const symbol=String(post.text).match(/\$([A-Za-z][A-Za-z0-9]{1,12})/)?.[1]||mint.slice(0,6);const metrics=post.public_metrics||{};const score=Math.min(99,Math.round(Math.log2(2+Number(metrics.like_count||0)+Number(metrics.retweet_count||0)*3)*8));candidates.push({symbol,name:symbol,mint,source:'x',sourceUrl:'https://x.com/i/status/'+encodeURIComponent(post.id),score,verifiedSolana:true,reason:'Classic SPL mint verified on mainnet; ranked by engagement only. Legitimacy and liquidity are not established.'});}catch{/* Invalid/unverifiable candidates are omitted, never promoted. */}}}
 if(!candidates.length)throw Error('NO_VERIFIED_SOLANA_CANDIDATE');saveState('x:cache',{at:Date.now(),candidates});return {candidates,source:'X recent search',cached:false};
}
