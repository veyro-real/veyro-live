// Text to a typed command. Pure: no network, no database, no side effects.
//
// Anything malformed becomes {kind:'usage'} rather than throwing, so the
// router can always answer with the correct syntax instead of an error.

/** Base58, 32 bytes. Rejects the characters base58 omits (0 O I l). */
const MINT=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LimitsInput={maxTradeSol:number;dailyCapSol:number;hours:number};

export type Command=
 |{kind:'start'}
 |{kind:'help'}
 |{kind:'tutorial'}
 |{kind:'mode';set:'paper'|'live'|null}
 |{kind:'connect'}
 |{kind:'wallet'}
 |{kind:'revoke'}
 |{kind:'limits';set:LimitsInput|null}
 |{kind:'edge';text:string|null}
 |{kind:'scan';limit:number}
 |{kind:'why';mint:string}
 |{kind:'buy';mint:string;sol:number}
 |{kind:'sell';positionId:string}
 |{kind:'positions';includeClosed:boolean}
 |{kind:'voice';on:boolean|null}
 |{kind:'chatid'}
 |{kind:'trending';limit:number}
 |{kind:'usage';command:string}
 |{kind:'unknown'};

const positive=(s:string|undefined):number|null=>{
 if(s===undefined||s.trim()==='')return null;
 const n=Number(s);
 return Number.isFinite(n)&&n>0?n:null;
};

const clamp=(n:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,n));

export function parseCommand(raw:string):Command{
 const text=raw.trim();
 if(!text.startsWith('/'))return {kind:'unknown'};

 const space=text.search(/\s/);
 const head=(space===-1?text:text.slice(0,space)).slice(1);
 const rest=space===-1?'':text.slice(space+1).trim();
 // /buy@VeyroTradingBot in a group chat is the same command.
 const command=head.split('@')[0].toLowerCase();
 const args=rest===''?[]:rest.split(/\s+/);
 const usage:Command={kind:'usage',command};

 switch(command){
  case 'start':return {kind:'start'};
  case 'help':return {kind:'help'};
  case 'tutorial':case 'guide':return {kind:'tutorial'};
  case 'paper':return {kind:'mode',set:'paper'};
  case 'live':return {kind:'mode',set:'live'};
  case 'mode':{
   if(args.length===0)return {kind:'mode',set:null};
   const want=args[0]!.toLowerCase();
   if(want==='paper'||want==='live')return {kind:'mode',set:want};
   return {kind:'usage',command:'mode'};
  }
  case 'connect':return {kind:'connect'};
  // One screen: it is the deposit address that funds the wallet, so asking
  // to add funds and asking where the wallet is are the same question.
  case 'wallet':case 'fund':case 'deposit':return {kind:'wallet'};
  case 'revoke':return {kind:'revoke'};
  // Lets a group tell you its own id, which is how alerts get configured.
  case 'chatid':return {kind:'chatid'};

  case 'limits':{
   if(args.length===0)return {kind:'limits',set:null};
   if(args.length!==3)return usage;
   const maxTradeSol=positive(args[0]),dailyCapSol=positive(args[1]),hours=positive(args[2]);
   if(maxTradeSol===null||dailyCapSol===null||hours===null)return usage;
   // A cap below the per-trade max is always a typo, and an expensive one.
   if(dailyCapSol<maxTradeSol)return usage;
   return {kind:'limits',set:{maxTradeSol,dailyCapSol,hours}};
  }

  case 'edge':return {kind:'edge',text:rest===''?null:rest};

  case 'trending':{
   if(args.length===0)return {kind:'trending',limit:5};
   const n=Number(args[0]);
   if(!Number.isFinite(n))return usage;
   return {kind:'trending',limit:clamp(Math.trunc(n),1,10)};
  }

  case 'scan':{
   if(args.length===0)return {kind:'scan',limit:10};
   const n=Number(args[0]);
   if(!Number.isFinite(n))return usage;
   return {kind:'scan',limit:clamp(Math.trunc(n),1,25)};
  }

  case 'why':{
   if(args.length!==1||!MINT.test(args[0]))return usage;
   return {kind:'why',mint:args[0]};
  }

  case 'buy':{
   if(args.length!==2||!MINT.test(args[0]))return usage;
   const sol=positive(args[1]);
   if(sol===null)return usage;
   return {kind:'buy',mint:args[0],sol};
  }

  case 'sell':{
   if(args.length!==1||!UUID.test(args[0]))return usage;
   return {kind:'sell',positionId:args[0]};
  }

  case 'positions':return {kind:'positions',includeClosed:args[0]?.toLowerCase()==='all'};

  case 'voice':{
   if(args.length===0)return {kind:'voice',on:null}; // toggle
   const word=args[0].toLowerCase();
   if(word==='on')return {kind:'voice',on:true};
   if(word==='off')return {kind:'voice',on:false};
   return usage;
  }

  default:return {kind:'unknown'};
 }
}
