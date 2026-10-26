// Bader-Ofer: threshold, initial quotas, highest averages, surplus agreements.
export const AGREEMENTS_25 = [['מחל','ט'],['פה','כן'],['שס','ג'],['אמת','מרצ']];
export const AGREEMENTS_26 = [['מחל','ט'],['שס','ג']]; // Extend only after confirming ballot letters.
export function allocateMandates(parties, validVotes, agreements = [], seats = 120) {
  if (!Number.isSafeInteger(validVotes) || validVotes <= 0) throw new Error('INVALID_VALID_VOTES');
  const seen = new Set();
  const eligible = parties.filter(p => {
    if (!Number.isSafeInteger(p.votes) || p.votes < 0 || !p.letters || seen.has(p.letters)) throw new Error('INVALID_PARTY');
    seen.add(p.letters);
    return p.votes * 400 >= validVotes * 13; // 3.25%
  }).map(p => ({...p, mandates:0}));
  if (!eligible.length) return {parties:[], thresholdVotes:Math.ceil(validVotes*13/400), allocated:0};
  const byCode = new Map(eligible.map(p=>[p.letters,p]));
  const used = new Set();
  const groups = [];
  for (const pair of agreements) {
    if (!Array.isArray(pair) || pair.length !== 2 || pair[0] === pair[1]) continue;
    if (pair.every(code=>byCode.has(code) && !used.has(code))) {
      pair.forEach(code=>used.add(code));
      groups.push(pair.map(code=>byCode.get(code)));
    }
  }
  for (const p of eligible) if (!used.has(p.letters)) groups.push([p]);
  const qualifyingVotes = eligible.reduce((s,p)=>s+p.votes,0);
  for (const p of eligible) p.mandates = Math.floor(p.votes * seats / qualifyingVotes);
  const groupSeats = groups.map(members=>({members, votes:members.reduce((s,p)=>s+p.votes,0), seats:members.reduce((s,p)=>s+p.mandates,0)}));
  let allocated = eligible.reduce((s,p)=>s+p.mandates,0);
  while (allocated < seats) {
    groupSeats.sort((a,b) => {
      const delta = BigInt(b.votes)*BigInt(a.seats+1)-BigInt(a.votes)*BigInt(b.seats+1);
      return delta > 0n ? 1 : delta < 0n ? -1 : a.members[0].letters.localeCompare(b.members[0].letters,'he');
    });
    groupSeats[0].seats++;
    allocated++;
  }
  // Reapportion each pair's combined seats using its internal quota and highest averages.
  for (const group of groupSeats) {
    if (group.members.length === 1) {group.members[0].mandates=group.seats; continue;}
    const [a,b]=group.members;
    a.mandates=Math.floor(a.votes*group.seats/group.votes);
    b.mandates=Math.floor(b.votes*group.seats/group.votes);
    while(a.mandates+b.mandates<group.seats) {
      const delta=BigInt(a.votes)*BigInt(b.mandates+1)-BigInt(b.votes)*BigInt(a.mandates+1);
      if(delta>=0n) a.mandates++; else b.mandates++;
    }
  }
  return { parties:eligible.sort((a,b)=>b.mandates-a.mandates || b.votes-a.votes), thresholdVotes:Math.ceil(validVotes*13/400), allocated };
}
