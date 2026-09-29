# Blink Cadeaukaart Configurator — Documentatie

**Opgeleverd:** 21 augustus 2026  
**Gebouwd door:** Trotse Ontwerpers / Bastiaan Leideritz, met Claude Code  
**Deployment:** Railway ([blink-configurator-production.up.railway.app](https://blink-configurator-production.up.railway.app))  
**Repository:** [github.com/leideritzb/blink-configurator](https://github.com/leideritzb/blink-configurator)

---

## Wat is de Blink Maker?

Een webapplicatie waarmee Blink-medewerkers zelf een cadeaukaart kunnen samenstellen en als drukklaar PDF downloaden. De gebruiker kiest kleuren, afbeeldingen en teksten, en krijgt direct een CMYK-PDF met snijkruisen en bleed — klaar voor de drukker.

De applicatie draait als een private URL (niet geïndexeerd, geen wachtwoord). Blink-medewerkers gebruiken hem via een directe link vanuit geefblink.nl.

---

## Architectuur

```
Browser ──POST /export-pdf──▶ Node.js server (server.js)
                                    │
                              Puppeteer (Chromium)
                              rendert HTML → RGB PDF
                                    │
                              Ghostscript
                              RGB → CMYK PDF
                                    │
                              Black snapping
                              rich-black → K=100
                                    │
                              pdf-lib
                              TrimBox + BleedBox + snijkruisen
                                    │
Browser ◀──GET /download/:token─── PDF-buffer
```

De applicatie is opgebouwd uit twee bestanden die samenwerken:

| Bestand | Rol |
|---|---|
| `server.js` | Node.js HTTP-server, PDF-generatie, stats |
| `cadeaukaart-configurator.html` | De volledige frontend (HTML + CSS + JS, één bestand) |

Er is geen framework, geen bundler, geen build-stap.

---

## server.js

### HTTP-endpoints

| Endpoint | Methode | Functie |
|---|---|---|
| `/` | GET | Serveert de HTML-applicatie |
| `/assets/**` | GET | Statische bestanden (afbeeldingen, SVG, fonts) |
| `/beeldbank` | GET | JSON-lijst van beschikbare foto's in `assets/beeldbank/` |
| `/export-pdf` | POST | Ontvangt `{ state, bleed }`, start PDF-generatie, geeft `{ token }` terug |
| `/download/:token` | GET | Haalt gegenereerde PDF op (one-shot, token vervalt na 5 min) |
| `/stats` | GET | Downloadstatistieken (Basic Auth vereist) |
| `/version` | GET | Git commit hash + servertijd |
| `/robots.txt` | GET | `Disallow: /` (zoekrobots buiten houden) |

### PDF Token Store

Na succesvolle PDF-generatie wordt de PDF-buffer tijdelijk in geheugen opgeslagen onder een willekeurig token (16 random bytes, hex). De browser downloadt de PDF daarna via `/download/:token`. Het token is eenmalig en vervalt automatisch na 5 minuten.

---

## PDF-generatie pipeline

Elke download doorloopt de volgende stappen:

### Stap 1 — Puppeteer rendert de kaart

Puppeteer start een headless Chromium-browser en laadt de eigen configurator-pagina op `http://localhost:8787/?print=1`. Dit activeert de `body.is-printing` CSS-class, waardoor de sidebar verdwijnt en de kaart op ware grootte gerenderd wordt.

Viewport: kaartbreedte + bleed + snijteken-marge, met `deviceScaleFactor: 3` zodat rasterafbeeldingen op ~288 dpi renderen.

### Stap 2 — State injecteren

De volledige staat van de configurator (`st`-object) wordt via `page.evaluate()` in de pagina geladen, waarna `window.render()` de kaart opbouwt.

Elementen die niet in de PDF thuishoren worden verborgen: adresvelden, logo-placeholder, hulplijnen, snijkruisen-overlay, gradient-handle.

### Stap 3 — Gradient als canvas PNG

**Dit is een cruciale stap.** CSS-gradiënten met `transparent` creëren zogenaamde *transparantiegroepen* in de PDF. Ghostscript verwijdert deze groepen bij de CMYK-conversie, waardoor de gradient onzichtbaar wordt in het eindbestand.

Oplossing: vlak vóór de PDF-generatie vervangt `applyGradAsPNG()` de CSS-gradient door een canvas-gegenereerde PNG als `background-image`. Ghostscript behandelt rasterafbeeldingen anders dan transparantiegroepen en converteert ze correct naar CMYK.

Dit geldt voor drie elementen:
- `#cadeauGrad` — gradient op de rug (buitenkant)
- `#binnenGradMid` — gradient op het middenpaneel (binnenkant)
- `#binnenGradRechts` — gradient op het rechterpaneel (binnenkant)

Bij bleed wordt de stop-positie gecorrigeerd met `bleedPx` zodat de gradient op de juiste hoogte valt.

### Stap 4 — Puppeteer genereert PDF

`page.pdf()` genereert een vector-PDF. Tekst blijft vector (ingesloten font), rasterafbeeldingen op 288 dpi. Paginamaat in millimeters inclusief bleed en snijteken-marge.

De binnenkant wordt als tweede pagina gegenereerd: `#spread` wordt verborgen, `#spreadBinnen` zichtbaar gemaakt, en het hele proces herhaald.

### Stap 5 — Ghostscript: RGB → CMYK

```
gs -dBATCH -dNOPAUSE -dSAFER -q
   -sDEVICE=pdfwrite
   -sColorConversionStrategy=CMYK
   -dProcessColorModel=/DeviceCMYK
   -dCompatibilityLevel=1.4
   -dCompressStreams=false
   -dCompressPages=false
   -sOutputFile=<uitvoer>
   <invoer>
```

`-dCompressStreams=false` en `-dCompressPages=false` zijn verplicht zodat de PDF-streams leesbaar (niet gecomprimeerd) zijn voor de volgende stap: black snapping.

⚠ **Lokaal testen met GS werkt anders dan op Railway.** Op macOS is GS standaard niet geïnstalleerd — de server valt dan terug op RGB (geen CMYK-conversie). Lokale tests zijn daardoor onbetrouwbaar voor CMYK-specifiek gedrag. Installeer GS via `brew install ghostscript` voor betrouwbare lokale tests, of test altijd op Railway.

### Stap 6 — Black snapping

Drukkers verwachten zuiver zwart (K=100) voor tekst en donkere vlakken, niet "rich black" (combinatie van C+M+Y+K). `snapBlackInPDF()` scant de CMYK PDF-buffer als latin1-tekst op kleuroperatoren:

- Operatoren: `k`, `K` (CMYK shorthand), `sc`, `SC`, `scn`, `SCN`
- Drempel: totale inkt C+M+Y+K > 2.0 (rich-black typisch ≈ 2.66)
- Vervanging: `0 0 0 1` met spatieopvulling zodat stream `/Length` intact blijft

### Stap 7 — pdf-lib: finishing

- `TrimBox` en `BleedBox` ingesteld per pagina
- 8 snijtekens getekend (0.5pt lijn, 2mm gap, 5mm lengte)
- Beide pagina's samengevoegd tot één PDF
- ICC-profiel embedded als `OutputIntent` bij RGB-fallback (sRGB IEC61966-2.1)

---

## Frontend (cadeaukaart-configurator.html)

### Kaartstructuur

De kaart is een drieluik (trifold). In de "spread"-weergave (plat uitgevouwen) zie je van links naar rechts:

| Panel | ID | Breedte | Inhoud |
|---|---|---|---|
| Rug / flap | `panelRug` | 50mm | Achterkant, zichtbaar als kaart dichtgevouwen is |
| Middenluik | `panelMid` | 140mm | Adresseerstrook, binnenzijde rug |
| Voorkant | `panelRight` | 140mm | Voorkant, naam, logo, foto (optioneel) |

De binnenkant (`#spreadBinnen`) heeft een eigen spread:

| Panel | ID | Breedte | Inhoud |
|---|---|---|---|
| Brief | `binnenLinks` | 140mm | Persoonlijke brief aan ontvanger |
| Instructies | `binnenMidden` | 140mm | Stappen: URL, code, wachtwoord |
| Smal | `binnenRechts` | 50mm | Adres, QR (toekomst) |

### State-object (`st`)

De volledige staat van de kaart wordt bewaard in één globaal `st`-object en gesynchroniseerd met `localStorage` (key: `cadeaukaart_v1`).

**Buitenkant:**

| Veld | Standaard | Betekenis |
|---|---|---|
| `bgKleur` | `#f2cc7a` | Achtergrondkleur (midden + voorkant) |
| `blinkMode` | `'kleur'` | Blinkertjes buitenkant: `kleur` / `wit` / `geen` |
| `blinkModeRug` | `'kleur'` | Blinkertjes rug apart instelbaar |
| `blinkOpacity` | `0.6` | Dekking blinkertjes (wit-modus) |
| `blinkKleur` | `#ffffff` | Kleur blinkertjes (wit-modus) |
| `cadeauKleur` | `#83b070` | Kleur "cadeau!"-tekst op rug |
| `gradTop` | `115.98` | Stop-positie witte gradient in px |
| `naam` | `'[naam]'` | Naam op voorkant (leeg in PDF) |
| `jbu` | `true` | "jij blinkt uit"-blok tonen |
| `jbuTekst` | `'jij blinkt uit'` | Instelbare tekst |
| `variant` | `'standaard'` | `'standaard'` of `'foto'` |
| `logoSrc` | `null` | Logo als base64 data-URL |
| `fotoSrc` | `null` | Foto als base64 data-URL |

**Binnenkant:**

| Veld | Standaard | Betekenis |
|---|---|---|
| `binnenHoofdKleur` | `#8cb16f` | Hoofdkleur (badge 1, heading, pijl) |
| `binnenKleur2` | `#76a5b8` | Kleur badge 2 + loginveld |
| `binnenKleur3` | `#f08889` | Kleur badge 3 + wachtwoordveld |
| `binnenBlinkMode` | `'kleur'` | Blinkertjes binnenkant |
| `binnenAanhefTonen` | `true` | "Beste [naam]," tonen (toggle) |
| `binnenNaam` | `'[naam]'` | Naam in aanhef |
| `binnenUrl` | `'jouwblink.nl/...'` | URL stap 1 (leeg in PDF, drukker vult in) |
| `binnenGeldig` | `'van ...'` | Geldigheidsperiode (leeg in PDF) |
| `binnenCode` | `'123456789'` | Logincode (leeg in PDF) |
| `binnenWachtwoord` | `'abcde'` | Wachtwoord (leeg in PDF) |

### Blinkertjes

De kleurrijke blinkertje-patronen zijn inline SVG's, gepreloaded bij opstarten:
- `blinkertjes-kleur-vector.svg` → `_svgKleur`
- `blinkertjes-wit-vector.svg` → `_svgWit` (fill herschreven naar `currentColor`)

Meerdere instanties van dezelfde SVG krijgen unieke ID-prefixes via `uniquifySvgClone()` om conflicten te voorkomen.

**Wit-modus:** opacity wordt ingesteld via CSS `color: rgba(R,G,B,opacity)` op de container (niet via CSS `opacity`). Reden: CSS `opacity` creëert een transparantielaag in de PDF die Ghostscript kan weggooien.

### Witte gradient

De witte gradient op de rug en binnenkant (visuele "overgang" tussen blinkertjes en witte tekstzone) werkt als volgt:

- In de browser: `linear-gradient(to bottom, transparent, #fff, transparent)` als CSS
- In de PDF: vervangen door een canvas-gegenereerde PNG (zie Stap 3 van de pipeline)

De stop-positie (`gradTop`) is een vaste waarde in pixels en niet instelbaar via de UI.

---

## Deployment (Railway)

### Dockerfile

```dockerfile
FROM node:20-slim
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
RUN apt-get install ghostscript chromium fonts-liberation fonts-noto
WORKDIR /app
COPY package*.json && npm ci
COPY .
EXPOSE 8787
CMD ["node", "server.js"]
```

Chromium en Ghostscript worden geïnstalleerd via `apt`. Puppeteer gebruikt de systeem-Chromium.

### Environment variabelen

| Naam | Standaard | Gebruik |
|---|---|---|
| `STATS_FILE` | `./stats.json` | Pad naar stats-bestand (zie Volume) |
| `STATS_PASSWORD` | `blink2026` | Wachtwoord voor `/stats` endpoint |
| `RAILWAY_GIT_COMMIT_SHA` | `'local'` | Git hash in `/version` response |

### Persistent Volume

Stats gaan verloren bij elke deploy als ze in de container opgeslagen worden. Railway Volume lost dit op: een persistent schijfvolume gemount op `/data`. Door `STATS_FILE=/data/stats.json` in te stellen blijven stats bewaard.

### Deployen

Elke push naar de `main` branch op GitHub triggert automatisch een nieuwe deploy op Railway. Er is geen handmatige stap nodig.

Server herstarten na een wijziging in `server.js` is bij Railway automatisch (nieuwe container). Lokaal moet de server handmatig gestopt en herstart worden (`node server.js`).

---

## Assets

```
assets/
├── beeldbank/          # Foto's beschikbaar in de foto-variant
│   ├── Sterretjes.jpg
│   ├── iStock-1280803702.jpg
│   ├── iStock-1285103047.jpg
│   ├── iStock-1434115461.jpg
│   └── kerstballen-paperAI.png
├── svg/
│   ├── blink-logo.svg               # Logo op binnenkant brief
│   ├── blinkertjes-kleur-vector.svg  # Kleur-variant blinkertjes (gepreload)
│   ├── blinkertjes-wit-vector.svg    # Wit-variant blinkertjes (gepreload)
│   ├── blinkertjes-tekst.svg        # Ster-icoontje na "jij blinkt uit"
│   └── witte-ronde-hoek.svg         # Witte afgeronde hoek rechtsonder voorkant
└── icc/                             # (optioneel) ICC-kleurprofiel voor PDF
```

Een nieuwe foto toevoegen aan de beeldbank: bestand in `assets/beeldbank/` plaatsen en pushen. De server pikt het automatisch op.

---

## Downloadstatistieken

Elke succesvolle PDF-generatie wordt gelogd als timestamp in `stats.json`.

Weergave via `/stats` (Basic Auth: gebruikersnaam `blink`, wachtwoord via `STATS_PASSWORD`-env):
- Totaal aantal downloads
- Per dag gesorteerd, nieuwste eerst
- Laatste 20 downloads met tijdstip (Amsterdam-tijd)

---

## Lessen voor toekomstige print-projecten

Deze sectie documenteert de belangrijkste technische inzichten die relevant zijn voor een volgend print-product met dezelfde stack.

### 1. CSS `transparent` verdwijnt in CMYK PDF

**Probleem:** `linear-gradient(..., transparent, ...)` of `rgba(0,0,0,0)` in CSS creëert *transparantiegroepen* in de PDF. Ghostscript verwijdert deze groepen bij de conversie van RGB naar CMYK.

**Oplossing:** Vervang CSS-gradiënten met transparantie door canvas-gegenereerde PNG's vlak vóór `page.pdf()`. Canvas-pixels worden als rasterafbeelding ingebed — GS converteert die correct naar CMYK.

**Let op:** Hetzelfde geldt voor `opacity` op elementen die transparantie vereisen. Gebruik `color: rgba(...)` op de container als alternatief (zie blinkertjes wit-modus).

### 2. Ghostscript vereist ongecomprimeerde streams voor black snapping

**Probleem:** GS comprimeert PDF-streams standaard. De regex-gebaseerde black snapping (zoeken op CMYK-operatoren in de PDF-tekst) werkt alleen op ongecomprimeerde streams.

**Oplossing:** `-dCompressStreams=false -dCompressPages=false` als GS-flag. Nadeel: grotere bestandsgrootte (~385KB vs ~150KB gecomprimeerd). Acceptabel voor printbestanden.

### 3. `CompatibilityLevel=1.3` rasteriseert tekst

**Waarschuwing voor toekomstige experimenten:** PDF 1.3 ondersteunt geen transparantie. GS met `-dCompatibilityLevel=1.3` *flatent* transparantie door alles in de buurt te rasteriseren — inclusief tekst. Bestandsgrootte springt van ~385KB naar ~2MB. Niet gebruiken.

### 4. Lokaal testen is onbetrouwbaar voor CMYK

Op macOS is Ghostscript niet standaard geïnstalleerd. De server valt dan terug op een RGB-PDF (zonder CMYK-conversie). De gradient en kleuren zien er dan correct uit, maar dat zegt niets over het gedrag op Railway (Debian Linux, GS wél geïnstalleerd).

**Aanbeveling:** Installeer GS lokaal via `brew install ghostscript` voor betrouwbare tests. Alternatief: altijd op Railway testen voor CMYK-specifiek gedrag.

### 5. Blinkertjes als inline SVG, niet als `<img>`

Externe SVG's via `<img>` of CSS `background-image: url(...)` worden door Puppeteer gerasteriseerd in de PDF. Inline SVG blijft vector. De blinkertjes worden daarom bij opstarten als text geladen, geparsed via `DOMParser`, en als DOM-element ingevoegd.

### 6. Meerdere SVG-instanties vereisen unieke IDs

Dezelfde SVG meerdere keren in één DOM? Dan conflicteren `id`-attributen en `clipPath`-referenties. `uniquifySvgClone(svg, prefix)` lost dit op door alle IDs en interne verwijzingen te prefixen.

### 7. Railway Volume voor persistente data

Railway-containers zijn ephemeral: alles wat buiten een Volume staat gaat verloren bij elke deploy. Stats, uploads, of andere persistente data moeten op een Volume staan. Kost een paar cent per maand.

### 8. `deviceScaleFactor: 3` voor rasterafbeeldingen op 288dpi

Puppeteer rendert standaard op 96dpi (1× schaal). Met `deviceScaleFactor: 3` worden rasterafbeeldingen op ~288dpi gerenderd — voldoende voor drukwerk (drukkers vragen vaak minimaal 300dpi, maar 288 is in de praktijk acceptabel voor foto's in dit formaat).

---

## Bekende beperkingen

- **Geen wachtwoordbeveiliging** op de configurator zelf — de URL is de enige toegangscontrole.
- **Foto's worden opgeslagen in `localStorage`** als base64 data-URL. Bij grote foto's kan de quota overschreden worden; de app slaat dan een versie zonder foto op.
- **Gradient-positie is vast** (`gradTop = 115.98px`) — niet instelbaar via de UI.
- **Lokale preview vs. PDF** kan afwijken: kleurweergave (RGB vs. CMYK), gradient-rendering, en fonts kunnen er in de browser anders uitzien dan in het eindbestand.

---

*Documentatie bijgehouden in de repository. Bij vragen of aanpassingen: bastiaan@denl.nl*
