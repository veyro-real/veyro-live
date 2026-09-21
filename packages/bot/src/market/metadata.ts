// Resolving a token's picture from its metadata uri.
//
// The uri and everything behind it is attacker-controlled: anyone can mint a
// token pointing at anything. So this never throws, never follows a scheme
// other than http(s), and returns null the moment anything is off. A missing
// image is a cosmetic loss; handing Telegram a file:// or data: uri from a
// stranger's token metadata is not.

const IPFS_GATEWAY='https://ipfs.io/ipfs/';
const TIMEOUT_MS=4000;

export function ipfsToHttps(uri:string):string|null{
 if(!uri)return null;
 if(uri.startsWith('ipfs://'))return IPFS_GATEWAY+uri.slice('ipfs://'.length);
 return uri;
}

const httpOnly=(url:string|null):string|null=>
 url&&/^https?:\/\//i.test(url)?url:null;

export async function resolveImage(
 uri:string|null,
 deps:{fetch?:typeof fetch}={},
):Promise<string|null>{
 if(!uri)return null;
 const metadataUrl=httpOnly(ipfsToHttps(uri));
 if(!metadataUrl)return null;

 const http=deps.fetch??fetch;
 try{
  const res=await http(metadataUrl,{signal:AbortSignal.timeout(TIMEOUT_MS)});
  if(!res.ok)return null;
  const body=await res.json() as {image?:unknown};
  if(typeof body?.image!=='string')return null;
  return httpOnly(ipfsToHttps(body.image));
 }catch{
  return null; // Unreachable, slow, or not JSON. Show the text instead.
 }
}
