// Whether a user wants spoken replies. Off until they ask.
//
// Kept in veyro_state rather than a new column: it is a per-user preference
// with no bearing on money, and it does not deserve a migration.

import {getState,saveState} from '../store';

const key=(userId:string)=>'voice:'+userId;

export const voiceEnabled=async(userId:string):Promise<boolean>=>
 (await getState<boolean>(key(userId)))===true;

export const setVoiceEnabled=(userId:string,on:boolean):Promise<void>=>
 saveState(key(userId),on);
