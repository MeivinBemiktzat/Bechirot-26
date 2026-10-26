import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze} from '../lib/elections.js';
test('sums localities and sorts party votes',()=>{
 const csv='שם ישוב,בזב,מצביעים,פסולים,כשרים,מחל,פה\nעיר א,100,80,2,78,40,38\nעיר ב,200,100,1,99,60,39\n';
 const result=analyze(csv);
 assert.equal(result.totals.voters,180);
 assert.equal(result.totals.valid,177);
 assert.equal(result.turnout,60);
 assert.equal(result.parties[0].votes,100);
});
