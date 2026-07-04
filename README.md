# 🎯 PrankQR - Generatore di Scherzi con QR Code

Benvenuto in **PrankQR**! Questa è un'applicazione full-stack (React + Express) che ti permette di creare scherzi interattivi personalizzati collegati a un codice QR. Quando una vittima scansiona il QR code, visualizzerà una finta schermata d'errore, una finta chiamata WhatsApp o un finto banner di cookie GDPR che farà partire lo scherzo (con audio e immagini personalizzate). Nel frattempo, riceverai notifiche e dettagliate statistiche di tracciamento (dispositivo, geolocalizzazione IP, orario, ecc.).

---

## 🛑 IMPORTANTE: Risoluzione Errore 403 (Spiacenti...)

Se hai provato a scansionare il codice QR dal tuo cellulare all'interno di Google AI Studio e hai visualizzato una pagina con l'errore:
> **"Google 403. Errore. Spiacenti. Non disponi dell'autorizzazione necessaria..."**

**Non ti preoccupare! Questo NON è un errore del codice della tua app.**
Si tratta di una misura di sicurezza di Google AI Studio. L'indirizzo provvisorio di sviluppo (`ais-dev-...run.app` o `ais-pre-...run.app`) è protetto da un proxy privato che consente l'accesso solo al tuo account sviluppatore loggato. Di conseguenza, il tuo smartphone viene bloccato perché non è loggato con lo stesso account Google nel browser del telefono.

### Come risolvere al 100%?
* **In Sviluppo (Simulatore Integrato):** Abbiamo aggiunto un **Simulatore di Smartphone integrato direttamente nella dashboard** dell'applicazione! Ti basta cliccare su **"Testa nel Simulatore"** sotto lo scherzo per riprodurlo ed provarlo direttamente nel tuo browser, senza bisogno di un telefono.
* **In Produzione (Quando pubblichi il sito):** Una volta esportata l'app su GitHub e ospitata su una piattaforma pubblica (come Railway, Render o Heroku), **questo blocco di Google non esisterà più**. Chiunque scansionerà il QR code accederà istantaneamente allo scherzo su qualsiasi smartphone, senza alcun errore 403!

---

## 🛠️ Come Eseguire l'Applicazione in Locale

1. **Installa le dipendenze:**
   ```bash
   npm install
   ```

2. **Avvia in modalità di sviluppo:**
   ```bash
   npm run dev
   ```
   L'app sarà disponibile all'indirizzo `http://localhost:3000`.

3. **Crea la Build di Produzione:**
   ```bash
   npm run build
   ```

4. **Avvia la Build in Produzione:**
   ```bash
   npm run start
   ```

---

## 🚀 Come Pubblicare ed Esportare l'App (Hosting)

Poiché l'applicazione è **full-stack** (utilizza un server Express integrato per gestire l'API, il tracciamento degli IP e l'upload dei file audio/immagine), hai bisogno di una piattaforma di hosting che supporti Node.js e consenta di mantenere i file persistenti (per salvare le immagini caricate e i dati degli scherzi).

### 🖥️ Piattaforme Consigliate:

#### 1. Railway (Consigliatissimo ⭐)
Railway è la piattaforma più semplice per caricare applicazioni Node.js full-stack con cartelle persistenti.
1. Carica questo codice sul tuo repository **GitHub**.
2. Accedi a [Railway.app](https://railway.app/) e crea un nuovo progetto connesso al tuo repository GitHub.
3. Nelle impostazioni del servizio su Railway, aggiungi un **Volume Persistente** (Mount Volume) per preservare i file salvati nella cartella `/data` (dove risiede il database JSON degli scherzi) e `/uploads` (dove risiedono i file multimediali caricati).
   - Percorso del volume: `/app/data` e `/app/uploads`.
4. Railway rileverà automaticamente i comandi di build e start configurati nel `package.json` e metterà online l'applicazione con un dominio pubblico HTTPS.

#### 2. Render.com
Render è un'altra ottima piattaforma gratuita/economica per applicazioni Node.js.
1. Crea un **Web Service** su [Render](https://render.com/) e connetti il tuo repository GitHub.
2. Configura le impostazioni:
   - **Environment:** `Node`
   - **Build Command:** `npm run build`
   - **Start Command:** `npm run start`
3. Nella sezione **Disks** di Render, crea e monta un disco persistente per salvare i tuoi scherzi e file multimediali anche quando il server si riavvia.
   - Mount Path: `/app/data` e `/app/uploads`.

#### 3. VPS Personale (Docker / Node)
Se possiedi un server VPS (es. Aruba, DigitalOcean, Hetzner):
1. Installa Node.js e NPM sulla macchina.
2. Clona il repository GitHub.
3. Esegui `npm install`, poi `npm run build` e avvia il processo con un gestore di processi come `pm2`:
   ```bash
   pm2 start dist/server.cjs --name "prankqr"
   ```

---

## 📧 Configurazione Notifiche Email (Opzionale)

Se desideri ricevere notifiche istantanee via email quando una vittima scansiona il codice QR o viene catturata dallo scherzo, definisci le seguenti variabili d'ambiente sul tuo servizio di hosting (es. nei settings di Railway o Render):

```env
SMTP_HOST=smtp.iltuoprovider.com
SMTP_PORT=587
SMTP_USER=la_tua_email@esempio.com
SMTP_PASS=la_tua_password_o_app_password
SMTP_FROM="PrankQR Alerts" <la_tua_email@esempio.com>
```

Se non configuri queste variabili, l'applicazione utilizzerà un servizio di test gratuito (**Ethereal Email**), stampando nel log del server il link per visualizzare l'email generata in tempo reale.

Divertiti a fare scherzi ai tuoi amici! 😉
