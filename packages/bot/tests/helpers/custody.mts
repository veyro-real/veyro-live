import assert from 'node:assert/strict';

/**
 * AGENTS.md: the product must tell users in plain language that the service
 * holds their keys, before they deposit.
 *
 * Asserting one exact sentence made three separate tests fail whenever the
 * copy was reworded, and each failure pushed its test toward a looser regex.
 * This checks the four things the disclosure has to convey instead, so the
 * wording stays free to change and the substance does not.
 */
export function assertDisclosesCustody(text:string,where='the disclosure'):void{
 assert.match(text,/private key|your keys/i,
  `${where} never mentions the key`);
 assert.match(text,/this service|not by you|not with you|bot (holds|controls)/i,
  `${where} does not say who holds it`);
 assert.match(text,/compromised|stolen|gone/i,
  `${where} does not say what happens if it is compromised`);
 assert.match(text,/afford to lose/i,
  `${where} does not bound what to deposit`);
}
