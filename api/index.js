import { analyze } from '../lib/elections.js';
const DEFAULT_25 = 'https://media25.bechirot.gov.il/files/expc.csv';
const DEFAULT_26 = 'https://media26.bechirot.gov.il/files/expc.csv';
let cache = new Map();
const fmt = n => new Intl.NumberFormat('he-IL').format(n);
function speak(data, menu, city) {
 const t = data.totals;
 if (menu === '2') return 'תוצאות לפי אותיות הרשימות. ' + data.parties.slice(0,20).map(p=> 'רשימה '+p.letters+', '+fmt(p.votes)+' קולות').join('. ');
 if (menu === '3') return 'אחוז ההצבעה '+data.turnout+' אחוז. '+fmt(t.voters)+' מצביעים. '+fmt(t.valid)+' קולות כשרים. '+fmt(t.invalid)+' קולות פסולים.';
 if (menu === '4') {
   if (!city) return 'לא הוזן שם יישוב.';
   const c = data.cities.find(x=>x.name === city);
   return c ? 'ביישוב '+city+' הצביעו '+fmt(c.voters)+' מצביעים. '+fmt(c.valid)+' קולות כשרים.' : 'היישוב המבוקש לא נמצא.';
 }
 return 'סיכום תוצאות הבחירות. '+fmt(t.voters)+' מצביעים. אחוז ההצבעה '+data.turnout+' אחוז. '+fmt(t.valid)+' קולות כשרים. '+fmt(t.invalid)+' קולות פסולים.';
}
export default async function handler(req,res) {
 try {
  const url = new URL(req.url,'https://example.com');
  const year = url.searchParams.get('year') === '26' ? '26' : '25';
  const menu = url.searchParams.get('menu') || url.searchParams.get('ApiExtension') || '0';
  const city = url.searchParams.get('city') || '';
  const source = year === '26' ? (process.env.CSV_URL_26 || DEFAULT_26) : (process.env.CSV_URL_25 || DEFAULT_25);
  const now = Date.now(), cached = cache.get(source);
  let data = cached?.data;
  if (!data || now - cached.at > 60000) {
   try {
    const response = await fetch(source, {signal:AbortSignal.timeout(12000),headers:{'User-Agent':'Bechirot-IVR/1.0'}});
    if (!response.ok) throw new Error('SOURCE_HTTP_'+response.status);
    const csv = await response.text();
    if (csv.length > 15000000) throw new Error('CSV_TOO_LARGE');
    data = analyze(csv); cache.set(source,{at:now,data});
   } catch (err) { if (!data) throw err; }
  }
  const text = speak(data,menu,city).replace(/[\r\n]/g,' ');
  res.setHeader('Content-Type','text/plain; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  return res.status(200).send('id_list_message=t-'+text+'&go_to_folder=/');
 } catch (err) {
  console.error('Election data unavailable',err.message);
  res.setHeader('Content-Type','text/plain; charset=utf-8');
  return res.status(200).send('id_list_message=t-נתוני הבחירות אינם זמינים כרגע. נסו שוב מאוחר יותר.&go_to_folder=/');
 }
}
