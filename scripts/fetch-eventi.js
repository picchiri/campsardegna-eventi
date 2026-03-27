/**
 * CampSardegna – Fetcher eventi RSS
 * Gira su GitHub Actions ogni giorno alle 08:00 ora italiana.
 * Legge i feed RSS configurati, li filtra, costruisce l'HTML
 * e aggiorna la pagina WordPress via REST API.
 *
 * Author: Alessandro Picchiri <picchiri@gmail.com>
 */

import fetch  from 'node-fetch';
import Parser from 'rss-parser';

/* =========================================================
   CONFIGURAZIONE FEED RSS
   Aggiungi / rimuovi fonti qui. colore = badge fonte nella pagina.
   ========================================================= */
const FEEDS = [
  {
    nome:   'SardegnaEventi24',
    url:    'https://sardegnaeventi24.it/feed/',
    colore: '#1a6b8a',
    attivo: true,
  },
  {
    nome:   'EventiinSardegna.it',
    url:    'https://www.eventiinsardegna.it/feed/',
    colore: '#e07b1a',
    attivo: true,
  },
  {
    nome:   'Paradisola – Sagre & Feste',
    url:    'https://paradisola.it/feed/',
    colore: '#1a5c2a',
    attivo: true,
  },
  {
    nome:   'SardegnaTurismo (Regione)',
    url:    'https://www.sardegnaturismo.it/it/rss.xml',
    colore: '#6b1a5c',
    attivo: true,
  },
  {
    nome:   'Unione Sarda – Sardegna',
    url:    'https://www.unionesarda.it/rss/sardegna.xml',
    colore: '#8a1a1a',
    attivo: true,
  },
  {
    nome:   'Unione Sarda – Cultura',
    url:    'https://www.unionesarda.it/rss/cultura.xml',
    colore: '#5c4a1a',
    attivo: false, // disattivato di default, cambia in true per abilitare
  },
];

/* =========================================================
   FILTRI
   ========================================================= */
const KEYWORDS_INCLUDI = [
  'sardegna','sarda','sardo','cagliari','sassari','nuoro',
  'oristano','ogliastra','gallura','barbagia','sulcis',
  'campidano','marmilla','planargia','goceano',
];
const KEYWORDS_ESCLUDI = [
  // aggiungi parole da escludere, es: 'calcio','serie a','politica'
];

const MAX_PER_FEED  = 15;  // max items per feed
const MAX_TOTALE    = 60;  // max items totali nella pagina

/* =========================================================
   CONFIGURAZIONE WORDPRESS (da GitHub Secrets)
   ========================================================= */
const WP_URL      = process.env.WP_URL;      // es. https://campsardegna.altervista.org
const WP_USER     = process.env.WP_USER;     // username WordPress
const WP_APP_PASS = process.env.WP_APP_PASS; // Application Password (senza spazi)
const WP_PAGE_ID  = process.env.WP_PAGE_ID;  // ID della pagina eventi

if (!WP_URL || !WP_USER || !WP_APP_PASS || !WP_PAGE_ID) {
  console.error('❌ Variabili d\'ambiente mancanti. Configura i GitHub Secrets:');
  console.error('   WP_URL, WP_USER, WP_APP_PASS, WP_PAGE_ID');
  process.exit(1);
}

/* =========================================================
   FUNZIONI HELPER
   ========================================================= */
function contienKeyword(testo, keywords) {
  const t = testo.toLowerCase();
  return keywords.some(kw => kw && t.includes(kw.toLowerCase()));
}

function stripHtml(html) {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(str, n) {
  if (!str || str.length <= n) return str || '';
  return str.slice(0, n).trim() + '...';
}

function meseLabelIT(date) {
  const mesi = [
    'Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
    'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre',
  ];
  return mesi[date.getMonth()] + ' ' + date.getFullYear();
}

function trovaImmagine(item) {
  // 1. enclosure
  if (item.enclosure?.url && item.enclosure?.type?.includes('image')) {
    return item.enclosure.url;
  }
  // 2. media:content
  if (item['media:content']?.['$']?.url) return item['media:content']['$'].url;
  // 3. <img> nel contenuto
  const raw = item['content:encoded'] || item.content || item.summary || '';
  const m = raw.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m) return m[1];
  return '';
}

/* =========================================================
   FETCH DEI FEED
   ========================================================= */
async function fetchFeed(feedConfig) {
  const parser = new Parser({
    customFields: {
      item: [
        ['media:content',   'media:content',  { keepArray: false }],
        ['content:encoded', 'content:encoded'],
      ],
    },
    timeout: 15000,
    headers: {
      'User-Agent': 'CampSardegna/1.0 RSS Reader (campsardegna.altervista.org)',
      'Accept':     'application/rss+xml, application/xml, text/xml, */*',
    },
  });

  try {
    console.log(`  📡 Fetching: ${feedConfig.nome}`);
    const feed  = await parser.parseURL(feedConfig.url);
    const items = [];

    for (const item of feed.items) {
      if (items.length >= MAX_PER_FEED) break;

      const title = stripHtml(item.title || '');
      const link  = item.link || item.guid || '';
      const desc  = truncate(stripHtml(
        item['content:encoded'] || item.contentSnippet || item.summary || ''
      ), 300);
      const img       = trovaImmagine(item);
      const pubDate   = item.pubDate || item.isoDate || '';
      const timestamp = pubDate ? new Date(pubDate).getTime() : Date.now();

      if (!title || !link) continue;

      // Filtro keyword includi
      if (KEYWORDS_INCLUDI.length > 0) {
        if (!contienKeyword(title + ' ' + desc, KEYWORDS_INCLUDI)) continue;
      }

      // Filtro keyword escludi
      if (KEYWORDS_ESCLUDI.length > 0) {
        if (contienKeyword(title + ' ' + desc, KEYWORDS_ESCLUDI)) continue;
      }

      items.push({ title, link, desc, img, timestamp,
        source_nome:   feedConfig.nome,
        source_colore: feedConfig.colore,
      });
    }

    console.log(`  ✅ ${feedConfig.nome}: ${items.length} eventi`);
    return items;

  } catch (err) {
    console.error(`  ❌ ${feedConfig.nome}: ${err.message}`);
    return [];
  }
}

/* =========================================================
   COSTRUZIONE HTML PER LA PAGINA WORDPRESS
   ========================================================= */
function buildHtml(items) {
  const now      = new Date();
  const dataOra  = now.toLocaleDateString('it-IT', {
    day:'2-digit', month:'2-digit', year:'numeric',
    hour:'2-digit', minute:'2-digit', timeZone:'Europe/Rome',
  });

  // Raggruppa per mese
  const gruppi = {};
  for (const item of items) {
    const d   = new Date(item.timestamp);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if (!gruppi[key]) gruppi[key] = { label: meseLabelIT(d), items: [] };
    gruppi[key].items.push(item);
  }

  let html = `<!-- cs_eventi_inizio -->
<div class="cs-eventi-wrap">
<p style="font-size:12px;color:#888;margin-bottom:20px">
  🔄 Aggiornato il ${dataOra} &middot; ${items.length} eventi trovati
</p>

<style>
.cs-eventi-wrap{font-family:Georgia,serif;color:#2c2c2c}
.cs-eventi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:16px;margin-bottom:24px}
.cs-ev-card{background:#fff;border:1px solid #e8e0d0;border-radius:8px;overflow:hidden;
  box-shadow:0 2px 8px rgba(0,0,0,.07);transition:transform .2s,box-shadow .2s;display:flex;flex-direction:column}
.cs-ev-card:hover{transform:translateY(-3px);box-shadow:0 6px 18px rgba(0,0,0,.12)}
.cs-ev-img{width:100%;height:160px;object-fit:cover;display:block;background:#f0ebe0}
.cs-ev-img-ph{width:100%;height:110px;background:linear-gradient(135deg,#1a5c2a,#1a6b8a);
  display:flex;align-items:center;justify-content:center;font-size:36px}
.cs-ev-body{padding:12px 14px 14px;flex:1;display:flex;flex-direction:column}
.cs-ev-source{display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;
  letter-spacing:.06em;color:#fff;padding:2px 8px;border-radius:3px;margin-bottom:6px}
.cs-ev-title{font-size:14px;font-weight:700;line-height:1.4;margin:0 0 6px;flex:1}
.cs-ev-title a{color:#1a5c2a;text-decoration:none}
.cs-ev-title a:hover{color:#e07b1a}
.cs-ev-date{font-size:11px;color:#888;margin-bottom:6px}
.cs-ev-desc{font-size:12px;color:#555;line-height:1.5;margin:0}
.cs-ev-h2{color:#1a5c2a;border-bottom:2px solid #e07b1a;padding-bottom:6px;
  margin-top:28px;margin-bottom:16px;font-size:1.3em}
@media(max-width:600px){.cs-eventi-grid{grid-template-columns:1fr}}
</style>\n`;

  for (const [key, gruppo] of Object.entries(gruppi)) {
    html += `<h2 class="cs-ev-h2">📅 ${gruppo.label}</h2>\n`;
    html += `<div class="cs-eventi-grid">\n`;

    for (const item of gruppo.items) {
      const title   = item.title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const desc    = item.desc.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const link    = item.link.replace(/"/g,'%22');
      const img     = item.img ? item.img.replace(/"/g,'%22') : '';
      const color   = item.source_colore;
      const source  = item.source_nome.replace(/&/g,'&amp;');
      const dateStr = new Date(item.timestamp).toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'});

      html += `<div class="cs-ev-card">
`;
      if (img) {
        html += `<img src="${img}" class="cs-ev-img" alt="${title}" loading="lazy">
`;
      } else {
        html += `<div class="cs-ev-img-ph">🎪</div>
`;
      }
      html += `<div class="cs-ev-body">
<span class="cs-ev-source" style="background:${color}">${source}</span>
<h3 class="cs-ev-title"><a href="${link}" target="_blank" rel="noopener">${title}</a></h3>
<div class="cs-ev-date">📅 ${dateStr}</div>
${desc ? `<p class="cs-ev-desc">${desc}</p>` : ''}
</div>
</div>
`;
    }
    html += `</div>\n`;
  }

  html += `</div><!-- /cs-eventi-wrap -->
<!-- cs_eventi_fine -->`;

  return html;
}

/* =========================================================
   AGGIORNA PAGINA WORDPRESS VIA REST API
   ========================================================= */
async function aggiornaWordPress(html) {
  const credentials = Buffer.from(`${WP_USER}:${WP_APP_PASS.replace(/\s/g,'')}`).toString('base64');
  const apiUrl      = `${WP_URL.replace(/\/$/, '')}/wp-json/wp/v2/pages/${WP_PAGE_ID}`;

  console.log(`\n🔄 Aggiornamento WordPress: ${apiUrl}`);

  const response = await fetch(apiUrl, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Basic ${credentials}`,
    },
    body: JSON.stringify({
      content: { raw: html },
      status:  'publish',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`WordPress REST API ${response.status}: ${body.slice(0,300)}`);
  }

  const data = await response.json();
  console.log(`✅ Pagina aggiornata! ID: ${data.id} — Link: ${data.link}`);
  return data;
}

/* =========================================================
   MAIN
   ========================================================= */
async function main() {
  console.log('🏕️ CampSardegna – Aggiornamento eventi Sardegna');
  console.log('=' .repeat(50));
  console.log(`📅 ${new Date().toISOString()}\n`);

  // Fetch di tutti i feed attivi in parallelo
  const feedAttivi = FEEDS.filter(f => f.attivo);
  console.log(`📡 Feed attivi: ${feedAttivi.length}`);

  const risultati = await Promise.allSettled(
    feedAttivi.map(f => fetchFeed(f))
  );

  let tuttiItems = [];
  for (const r of risultati) {
    if (r.status === 'fulfilled') tuttiItems.push(...r.value);
  }

  // Deduplicazione per titolo e URL
  const seen   = new Set();
  const seenUrl = new Set();
  tuttiItems   = tuttiItems.filter(item => {
    const key = item.title.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,40);
    if (seen.has(key) || seenUrl.has(item.link)) return false;
    seen.add(key);
    seenUrl.add(item.link);
    return true;
  });

  // Ordina per data discendente e limita
  tuttiItems.sort((a,b) => b.timestamp - a.timestamp);
  tuttiItems = tuttiItems.slice(0, MAX_TOTALE);

  console.log(`\n📊 Totale eventi (dopo dedup): ${tuttiItems.length}`);

  if (tuttiItems.length === 0) {
    console.warn('⚠️  Nessun evento trovato. La pagina non verrà aggiornata.');
    process.exit(0);
  }

  // Costruisce HTML e aggiorna WordPress
  const html = buildHtml(tuttiItems);
  await aggiornaWordPress(html);

  console.log('\n✅ Tutto completato!');
}

main().catch(err => {
  console.error('❌ Errore fatale:', err.message);
  process.exit(1);
});
