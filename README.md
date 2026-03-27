# CampSardegna – Aggiornamento automatico eventi Sardegna

Questo repository contiene uno script Node.js che gira su **GitHub Actions** ogni giorno alle **08:00 ora italiana**.

Lo script:
1. Legge i feed RSS dei principali siti di eventi in Sardegna
2. Filtra e deduplicata gli articoli
3. Aggiorna la pagina WordPress "eventi-manifestazioni" via **REST API**

Altervista blocca le chiamate HTTP in uscita da PHP, quindi il fetch viene fatto qui su GitHub (server esterno) e il risultato viene **inviato** a WordPress dall'esterno via REST API — che Altervista accetta senza problemi.

---

## Setup in 5 minuti

### 1. Crea un account GitHub (se non ce l'hai)
Vai su https://github.com e registrati gratuitamente.

### 2. Crea un nuovo repository
- Clicca su **New repository**
- Nome: `campsardegna-eventi` (o qualsiasi nome)
- Visibilità: **Public** (i repository pubblici hanno Actions illimitati)
- Clicca **Create repository**

### 3. Carica i file
Carica tutta la cartella di questo progetto nel repository:
- `.github/workflows/aggiorna-eventi.yml`
- `scripts/package.json`
- `scripts/fetch-eventi.js`

### 4. Crea una Application Password in WordPress
Vai su **WordPress Admin → Utenti → Il tuo profilo → Application Passwords** (in fondo alla pagina).
- Nome: `GitHub Actions`
- Clicca **Aggiungi Application Password**
- **Copia la password generata** (la vedrai una sola volta)

### 5. Trova l'ID della pagina eventi
Vai su **WordPress Admin → Pagine**, apri la tua pagina "eventi-manifestazioni".
Guarda l'URL: `https://sito.it/wp-admin/post.php?post=**123**&action=edit`
Il numero dopo `post=` è l'ID che ti serve.

### 6. Configura i GitHub Secrets
Nel tuo repository GitHub vai su **Settings → Secrets and variables → Actions → New repository secret**.

Aggiungi questi 4 segreti:

| Nome | Valore |
|------|--------|
| `WP_URL` | `https://campsardegna.altervista.org` |
| `WP_USER` | il tuo username WordPress (es. `admin`) |
| `WP_APP_PASS` | la password copiata al punto 4 (senza spazi) |
| `WP_PAGE_ID` | l'ID della pagina (es. `42`) |

### 7. Testa subito
Vai su **Actions → CampSardegna – Aggiorna Eventi Sardegna → Run workflow**.
Clicca **Run workflow** — dopo 1-2 minuti la pagina WordPress sarà aggiornata.

---

## Aggiungere o modificare feed RSS

Apri `scripts/fetch-eventi.js` e modifica l'array `FEEDS` all'inizio del file:

```javascript
const FEEDS = [
  {
    nome:   'Nome della fonte',
    url:    'https://sito.it/feed/',
    colore: '#ff6600',  // colore del badge nella pagina
    attivo: true,       // false per disattivare senza rimuovere
  },
  // ...
];
```

Qualsiasi sito WordPress ha automaticamente il feed su `/feed/`.

## Modificare i filtri keyword

Nel file `fetch-eventi.js` trovi:

```javascript
const KEYWORDS_INCLUDI = ['sardegna','sarda','cagliari', ...];
const KEYWORDS_ESCLUDI = []; // es. aggiungi 'calcio','politica'
```

Se `KEYWORDS_INCLUDI` è vuoto mostra tutto. Altrimenti mostra solo articoli
che contengono almeno una delle keyword elencate.

## Orario di esecuzione

Il cron è impostato alle 06:00 UTC = 08:00 ora italiana (CET).
In estate (CEST, UTC+2) corrisponde alle 08:00 CEST.

Per cambiare orario modifica in `.github/workflows/aggiorna-eventi.yml`:
```yaml
- cron: '0 6 * * *'   # 06:00 UTC = 08:00 CET
```

Usa https://crontab.guru per generare espressioni cron.

---

## Struttura file

```
.github/
  workflows/
    aggiorna-eventi.yml   ← definisce il cron GitHub Actions
scripts/
  package.json            ← dipendenze Node.js
  fetch-eventi.js         ← script principale
README.md
```
