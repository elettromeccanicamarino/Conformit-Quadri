# Certificati Marino — Guida Deploy su Railway

## Struttura del progetto
```
marino-app/
├── server.js          ← il server
├── package.json       ← dipendenze
├── public/
│   └── index.html     ← l'app
└── data/              ← creata automaticamente, qui ci va il database
```

---

## PASSO 1 — Crea un account GitHub (se non ce l'hai)
1. Vai su https://github.com
2. Crea un account gratuito

---

## PASSO 2 — Carica il progetto su GitHub
1. Vai su https://github.com/new
2. Nome repository: `marino-certificati`
3. Clicca **Create repository**
4. Trascina tutti i file della cartella `marino-app` nella pagina GitHub
   (oppure usa il tasto "uploading an existing file")
5. Clicca **Commit changes**

---

## PASSO 3 — Deploy su Railway
1. Vai su https://railway.app
2. Clicca **Start a New Project**
3. Scegli **Deploy from GitHub repo**
4. Collega il tuo account GitHub e seleziona `marino-certificati`
5. Railway rileva automaticamente Node.js e avvia il deploy

---

## PASSO 4 — Imposta la password (IMPORTANTE)
1. Nella dashboard Railway, clicca sul tuo progetto
2. Vai su **Variables**
3. Aggiungi queste variabili:

| Nome              | Valore                    |
|-------------------|---------------------------|
| `APP_PASSWORD`    | la password che vuoi usare |
| `SESSION_SECRET`  | una parola a caso lunga   |

Esempio:
- `APP_PASSWORD` = `marino2026segreto`
- `SESSION_SECRET` = `kjhg87KJHGsecret2026`

---

## PASSO 5 — Ottieni il dominio
1. In Railway vai su **Settings → Networking**
2. Clicca **Generate Domain**
3. Ricevi un link tipo: `https://marino-certificati-production.up.railway.app`
4. Condividi quel link con il tuo collega — entrambi usate la stessa password

---

## Funzionamento
- I dati (certificati, registro, rubrica clienti) sono salvati nel database SQLite sul server
- Sia tu che il tuo collega vedete gli stessi dati in tempo reale
- La sessione dura 7 giorni (non devi reinserire la password ogni volta)
- Il tasto **Esporta** scarica un backup JSON completo
- Il tasto **Importa** carica i dati da un vecchio backup (utile per trasferire i dati esistenti)

---

## Costo
Railway ha un piano gratuito con 500 ore/mese di utilizzo.
Per uso leggero (2 utenti, uso lavorativo) è più che sufficiente.
Se servisse di più, il piano a pagamento è ~$5/mese.

---

## Problemi comuni
- **"Application failed to start"**: controlla che le variabili APP_PASSWORD e SESSION_SECRET siano impostate
- **Dati che spariscono dopo un po'**: Railway su piano gratuito può "dormire" il progetto — i dati nel database rimangono, si risveglia alla prima visita
