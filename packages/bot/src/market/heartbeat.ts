// Is the launch feed actually receiving anything?
//
// A websocket that reconnects forever without ever delivering data looks
// healthy to a process supervisor and is not. Railway will restart a crashed
// worker; it cannot tell that a connected socket has gone silent.
//
// Pure state machine so the alerting can be tested without waiting five
// minutes. It reports an edge, not a level: one message when the feed goes
// quiet, one when it comes back, and nothing in between. Alert fatigue is
// how a real outage gets ignored.

export type Alert={kind:'down'|'recovered';text:string};

export type Heartbeat={
 /** Call whenever a launch arrives. */
 seen(now:number):void;
 /** Returns an alert only on a change of state. */
 check(now:number):Alert|null;
};

const minutes=(ms:number)=>Math.round(ms/60_000);

export function createHeartbeat(opts:{quietMs?:number;startedAt?:number}={}):Heartbeat{
 const quietMs=opts.quietMs??300_000;
 // Before the first launch, silence is measured from process start.
 let lastSeen=opts.startedAt??Date.now();
 let down=false;

 return {
  seen(now){
   lastSeen=now;
  },
  check(now){
   const quiet=now-lastSeen;
   if(quiet>quietMs){
    if(down)return null; // Already reported; saying it again helps nobody.
    down=true;
    return {
     kind:'down',
     text:'Feed alert: no launches seen for '+minutes(quiet)+' minutes. '+
          'The worker may be connected but receiving nothing.',
    };
   }
   if(down){
    down=false;
    return {kind:'recovered',text:'Feed recovered: launches are arriving again.'};
   }
   return null;
  },
 };
}
