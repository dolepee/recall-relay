import {RefundJournal} from './journal.mjs';
import {ClaimDeskCore} from './claims-core.mjs';
export {campaign} from './claims-core.mjs';
export class ClaimDesk extends ClaimDeskCore {
  constructor({path=':memory:',...options}){super({...options,journal:new RefundJournal(path)});}
}
