export function parseCSV(text) {
  const rows = []; let row = [], field = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); if (row.some(x => x.trim())) rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (quoted) throw new Error('CSV_QUOTE_ERROR');
  const headers = rows.shift()?.map(s => s.trim()) || [];
  if (!headers.length) throw new Error('CSV_EMPTY');
  return rows.map(values => Object.fromEntries(headers.map((h,i) => [h, (values[i] || '').trim()])));
}
const aliases = {
  eligible: ['בזב','בעלי זכות בחירה'],
  voters: ['מצביעים','הצביעו'],
  invalid: ['פסולים','קולות פסולים'],
  valid: ['כשרים','קולות כשרים'],
  city: ['שם ישוב','שם יישוב','שם_ישוב','שם_יישוב']
};
const normalize = s => s.replace(/[\s_\-]/g,'').replace(/["']/g,'');
const pick = (headers, names) => headers.find(h => names.some(n => normalize(h) === normalize(n)));
const number = value => { const n = Number(String(value ?? '').replace(/,/g,'').trim()); return Number.isFinite(n) ? n : 0; };
export function analyze(csv) {
  const rows = parseCSV(csv);
  if (!rows.length) throw new Error('CSV_NO_ROWS');
  const headers = Object.keys(rows[0]);
  const cols = Object.fromEntries(Object.entries(aliases).map(([k,v]) => [k,pick(headers,v)]));
  if (!cols.valid || !cols.voters || !cols.eligible) throw new Error('CSV_MISSING_REQUIRED_COLUMNS');
  const reserved = new Set([ ...Object.values(cols).filter(Boolean), ...headers.filter(h => ['סמל ישוב','סמל יישוב','סמל ועדה','סמל_ישוב','ועדה','ברזל'].some(n => normalize(h) === normalize(n))) ]);
  const partyCols = headers.filter(h => !reserved.has(h) && /^[א-ת]{1,3}$/.test(h));
  const totals = { eligible:0, voters:0, valid:0, invalid:0 };
  const parties = Object.fromEntries(partyCols.map(p => [p,0]));
  const cities = [];
  for (const row of rows) {
    for (const k of Object.keys(totals)) if (cols[k]) totals[k] += number(row[cols[k]]);
    for (const p of partyCols) parties[p] += number(row[p]);
    cities.push({ name: cols.city ? row[cols.city] : '', voters: number(row[cols.voters]), valid: number(row[cols.valid]) });
  }
  return { totals, turnout: totals.eligible ? +(totals.voters / totals.eligible * 100).toFixed(2) : 0,
    parties: Object.entries(parties).map(([letters,votes]) => ({letters,votes})).sort((a,b)=>b.votes-a.votes),
    cities, localityCount: rows.length };
}
