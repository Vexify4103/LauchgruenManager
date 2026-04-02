# Turnier-Bot

Discord-Bot fuer genau einen Server mit zwei Slashcommands:

`/turnier_start roleliste:<text oder sourcebin-link>`
`/turnier_stop`

Die Commands duerfen nur von Mitgliedern mit `ManageGuild` oder `Administrator` genutzt werden. `turnier_start` liest eine Liste von User-IDs ein und vergibt an alle gefundenen Mitglieder die Turnierrolle. `turnier_stop` entfernt die Turnierrolle wieder von allen Mitgliedern, die sie aktuell tragen.

Beide Commands antworten sichtbar fuer alle im Channel und zeigen waehrend der Abarbeitung einen hellgruenen Fortschritts-Embed mit Progress-Bar.

Zwischen zwei Rollen-Aktionen wartet der Bot jeweils 1 Sekunde, damit groessere Laeufe bewusst langsamer und ratelimit-freundlicher abgearbeitet werden.

## Struktur

Die Struktur ist jetzt an den Discord.js-Guide angelehnt:

- `src/commands/admin/turnierstart.ts`
- `src/commands/admin/turnierstop.ts`
- `src/events/clientReady.ts`
- `src/events/interactionCreate.ts`
- `src/lib/deployCommands.ts`

Die Slashcommands werden beim Bot-Start automatisch fuer die konfigurierte Guild synchronisiert.

## Setup

1. Node.js 20+ installieren
2. `pnpm install`
3. `.env.example` nach `.env` kopieren und ausfuellen
4. Bot starten:
    - Entwicklung: `pnpm dev`
    - Produktion: `pnpm build && pnpm start`

## Discord-Berechtigungen

Der Bot braucht mindestens:

- `Manage Roles`
- `View Channels`

Ausserdem muss seine eigene Rolle ueber der Rolle `1476317147113193613` stehen.

## Format der Userliste

Akzeptiert werden:

- Direkt eingefuegter Text wie `123456789012345678, 234567890123456789`
- Mehrere IDs mit Leerzeichen oder Zeilenumbruechen
- Ein Link auf einen Paste-Dienst wie Sourcebin, wenn dort die IDs als Text stehen

Der Bot extrahiert alle 17- bis 20-stelligen Discord-User-IDs aus dem Inhalt.
