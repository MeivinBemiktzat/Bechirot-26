import { allocateMandates } from '../lib/mandates.js';
import { analyze } from '../lib/elections.js';

const SOURCES = {
  '25': 'https://media25.bechirot.gov.il/files/expc.csv',
  '26': 'https://media26.bechirot.gov.il/files/expc.csv'
};
const cache = new Map();
let requestCounter = 0;
function log(event, details = {}) {
  console.log(JSON.stringify({ service: 'bechirot-ivr', event, time: new Date().toISOString(), ...details }));
}
function num(n) { return 'n-' + Math.round(n); }
function say(s) {
  return 't-' + String(s).replace(/[.&,=\r\n*#]/g, ' ').replace(/\s+/g, ' ').trim();
}
const PARTY_NAMES_25 = { 'מחל':'הליכוד', 'פה':'יש עתיד', 'ט':'הציונות הדתית', 'כן':'המחנה הממלכתי', 'שס':'שס', 'ג':'יהדות התורה', 'ל':'ישראל ביתנו', 'עם':'רע״ם', 'ום':'חדש תעל', 'אמת':'העבודה', 'מרצ':'מרצ' };
function partyName(code, year) { return year === '25' ? (PARTY_NAMES_25[code] || 'רשימה באותיות ' + code) : 'רשימה באותיות ' + code; }
function menuPrompt() {
  return 'read=' + [say('ברוכים הבאים למערכת תוצאות הבחירות'), say('לחלוקת המנדטים הקישו 1'), say('למספר הקולות לכל רשימה הקישו 2'), say('לנתוני ההצבעה הכלליים הקישו 3'), say('לסיכום הכללי הקישו 4'), say('ליציאה הקישו 0')].join('.') + '=CHOICE,,1,1,8,NO,yes,no,,01234,,,,,no';
}
function message(parts) {
  return 'id_list_message=' + parts.join('.') + '&go_to_folder=/5';
}
function speak(data, menu, city, year) {
  const t = data.totals;
  if (menu === '1') {
    const allocation = allocateMandates(data.parties, t.valid, []);
    const parts = [say('חלוקת מנדטים מחושבת ללא הסכמי עודפים')];
    for (const p of allocation.parties) if (p.mandates) parts.push(say(partyName(p.letters, year)), num(p.mandates), say('מנדטים'));
    return message(parts);
  }
  if (menu === '2') {
    const parts = [say('תוצאות לפי אותיות הרשימות')];
    for (const p of data.parties.slice(0, 15)) parts.push(say('רשימה ' + p.letters), num(p.votes), say('קולות'));
    return message(parts);
  }
  if (menu === '3') return message([say('אחוז ההצבעה'), num(Math.floor(data.turnout)), say('אחוז'), say('מספר המצביעים'), num(t.voters), say('קולות כשרים'), num(t.valid), say('קולות פסולים'), num(t.invalid)]);
  if (menu === '4') {
    const found = data.cities.find(c => c.name === city);
    if (!city || !found) return message([say('היישוב המבוקש לא נמצא')]);
    return message([say('ביישוב ' + city + ' הצביעו'), num(found.voters), say('מצביעים'), num(found.valid), say('קולות כשרים')]);
  }
  return message([say('סיכום תוצאות הבחירות'), say('מספר המצביעים'), num(t.voters), say('אחוז ההצבעה'), num(Math.floor(data.turnout)), say('אחוז'), say('קולות כשרים'), num(t.valid), say('קולות פסולים'), num(t.invalid)]);
}
function getParams(req) {
  const raw = new URL(req.url, 'https://example.invalid');
  // Compatibility with legacy links containing ?year=25?ApiCallId=...
  const year = raw.searchParams.get('year')?.match(/^2[56]/)?.[0] || '25';
  return { year, menu: raw.searchParams.get('menu') || '0', city: raw.searchParams.get('city') || '' };
}
export default async function handler(req, res) {
  const id = (++requestCounter) + '-' + Date.now().toString(36);
  const started = Date.now();
  const { year, menu, city } = getParams(req);
  const requestUrl = new URL(req.url, 'https://example.invalid');
  const choice = requestUrl.searchParams.get('CHOICE');
  const selected = choice === '1' ? '1' : choice === '2' ? '2' : choice === '3' ? '3' : '0';
  // Deliberately never log full URL, headers, body or telephony identifiers.
  log('request_start', { id, method: req.method, year, menu, choice: /^[0-4]$/.test(choice || '') ? choice : null, cityRequested: Boolean(city) });
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (choice === null && menu === '0') { log('menu_prompt', { id }); return res.status(200).send(menuPrompt()); }
    if (choice === '0') return res.status(200).send('go_to_folder=..');
    const source = year === '26' ? (process.env.CSV_URL_26 || SOURCES['26']) : (process.env.CSV_URL_25 || SOURCES['25']);
    const previous = cache.get(source);
    let data = previous?.data;
    if (!previous || Date.now() - previous.at > 60000) {
      log('csv_fetch_start', { id, year, cachedFallback: Boolean(previous) });
      try {
        const fetchStart = Date.now();
        const response = await fetch(source, { signal: AbortSignal.timeout(12000) });
        log('csv_fetch_response', { id, status: response.status, durationMs: Date.now() - fetchStart, contentLength: response.headers.get('content-length') });
        if (!response.ok) throw new Error('SOURCE_HTTP_' + response.status);
        const csv = await response.text();
        log('csv_downloaded', { id, chars: csv.length });
        if (csv.length > 15000000) throw new Error('CSV_TOO_LARGE');
        const parseStart = Date.now();
        data = analyze(csv);
        cache.set(source, { at: Date.now(), data });
        log('csv_parsed', { id, durationMs: Date.now() - parseStart, rows: data.localityCount, parties: data.parties.length, voters: data.totals.voters, valid: data.totals.valid });
      } catch (err) {
        log('csv_fetch_error', { id, error: String(err?.message || err), fallback: Boolean(data) });
        if (!data) throw err;
      }
    } else log('cache_hit', { id, ageMs: Date.now() - previous.at });
    const result = speak(data, choice === '4' ? '0' : choice === null ? menu : selected, city, year);
    log('response_success', { id, durationMs: Date.now() - started, responseChars: result.length, responsePreview: result.slice(0, 250) });
    return res.status(200).send(result);
  } catch (err) {
    log('request_error', { id, durationMs: Date.now() - started, error: String(err?.message || err) });
    return res.status(200).send(message([say('נתוני הבחירות אינם זמינים כרגע נסו שוב מאוחר יותר')]));
  }
}
