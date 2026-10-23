import {DatabaseSync} from 'node:sqlite';
import {RefundJournalCore} from './journal-core.mjs';
export class RefundJournal extends RefundJournalCore {
  constructor(path=':memory:'){super(new DatabaseSync(path));}
}
