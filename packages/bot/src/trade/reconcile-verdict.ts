// What to do with a position whose transaction never confirmed.
//
// buy() deliberately holds the spend reservation when a send times out —
// the transaction may still land, and releasing it early would let someone
// spend past their daily cap. reconcile is supposed to decide later, but it
// could only ever confirm a success: a transaction that was dropped stayed
// UNKNOWN forever, and its reservation consumed the cap permanently.

/**
 * How long after opening a position an unseen signature is treated as dead.
 *
 * A Solana transaction can only land while its blockhash is current, roughly
 * 90 seconds. This is well past that, because being late costs a little
 * headroom for a while and being early releases a reservation for a trade
 * that then lands — which is spending past a limit the user set.
 */
export const DROP_GRACE_MS=10*60_000;

export type Unconfirmed={
 /** Whether the cluster knows the signature at all, history included. */
 seenOnChain:boolean;
 /** Since the position was opened. */
 ageMs:number;
};

export function verdictForUnconfirmed(u:Unconfirmed):'DROPPED'|'UNRESOLVED'{
 if(u.seenOnChain)return 'UNRESOLVED';
 return u.ageMs>DROP_GRACE_MS?'DROPPED':'UNRESOLVED';
}
