import {authorize} from '../../../lib/auth';
import {state} from '../../../lib/engine';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:Request){let session:string|undefined;try{session=authorize(req).session;}catch{}return Response.json(await state(session),{headers:{'Cache-Control':'no-store'}});}
