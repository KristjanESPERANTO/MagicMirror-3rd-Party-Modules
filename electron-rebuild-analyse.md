# Electron-Rebuild Analyse

Analysiert am: 2026-11-25 (aktualisiert; ursprünglich 2025-12-17)

## Zusammenfassung

**Aktuell: 25 von 1.570 Modulen referenzieren `electron-rebuild` oder `@electron/rebuild`.**

- **11 Module** befinden sich inzwischen in der Outdated Section und sind für die weitere Betrachtung nicht mehr relevant
- **14 relevante Module** bleiben übrig: **9** mit einem Treffer in `package.json` und **5** nur in Shell- oder Installer-Dateien
- `MMM-Pir` kommt zusätzlich in Installer-Dateien vor, zählt aber nur einmal
- Lockfiles, Changelogs und Dokumentation wurden nicht als eigenständige Treffer gezählt

Der Bestand wurde direkt in `modules/` geprüft. Nur als Top-Level-Modul vorhandene, eindeutige Verzeichnisse wurden gezählt. Module mit dem Status `Outdated Section` bleiben zur Nachvollziehbarkeit in der Tabelle, werden aber bei der weiteren Bewertung ausgeschlossen.

## Ziel

Überprüfung, ob `electron-rebuild` bei jedem Modul entfernt werden kann. Ein bloßer Fund in einem Manifest bedeutet nicht automatisch, dass der Aufruf aktuell nötig oder in einem Install-Script verwendet wird.

## Häufige Gründe für electron-rebuild

- Native Node.js-Module mit C/C++-Bindings, die für die jeweilige Electron-Version gebaut werden müssen
- Veraltete Abhängigkeiten ohne kompatible vorgebaute Binärdateien
- GPIO-, I2C-, SPI- und Audio-Module
- Historisch eingetragene, aber inzwischen ungenutzte Abhängigkeiten

## Aktuelle Treffer

| Modul                    | Letzter Commit | Status           | Fundort                                      | Native Abhängigkeiten                    | Bewertung                                                                                                                   |
| ------------------------ | -------------- | ---------------- | -------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| MMM-Pins                 | 2019-07-03     | Relevant         | `package.json` + `postinstall`               | `onoff`                                  | ⌛ Wie `MMM-Buttons` auf gpiod umstellbar.                                                                                  |
| MMM-Swipe                | 2018-03-16     | Relevant         | `package.json` + `postinstall`               | `onoff`                                  | ⌛ Wie `MMM-Buttons` auf gpiod umstellbar.                                                                                  |
| MMM-ModuleToggleButton   | 2024-03-11     | Relevant         | `postinstall` im `package.json`              | `onoff`                                  | ⌛ Wie `MMM-Buttons` auf gpiod umstellbar.                                                                                  |
| MMM-Soliscloud           | 2025-12-19     | Relevant         | `postinstall` (Shell)                        | `onoff` optional                         | ⌛ Wie `MMM-Buttons` auf gpiod umstellbar.                                                                                  |
| MMM-Navigate             | 2023-05-02     | Relevant         | `postinstall` (Shell)                        | `onoff`                                  | ⌛ Wie `MMM-Buttons` auf gpiod umstellbar.                                                                                  |
| MMM-LKY-TIC              | 2025-01-07     | Relevant         | `package.json` + `postinstall`               | `serialport`, `@serialport/bindings-cpp` | ⌛ Für den reinen Lesepfad sind CLI-Alternativen möglich.                                                                   |
| MMM-Serial-Notifications | 2023-11-24     | Relevant         | `postinstall` (Shell)                        | `serialport`                             | ⌛ Für den reinen Lesepfad sind CLI-Alternativen möglich.                                                                   |
| MMM-Gestures             | 2022-12-17     | Relevant         | `postinstall` (Shell)                        | `serialport`                             | ⌛ Für den reinen Lesepfad sind CLI-Alternativen möglich.                                                                   |
| MMM-Linky                | 2025-04-12     | Relevant         | Installer (`installer/utils.js`)             | -                                        | 🟡 Neu erkannt; der generische Installer ruft `npx electron-rebuild` auf, benötigt aber prüfen, ob dieser Pfad aktiv ist.   |
| MMM-gvb                  | 2026-02-21     | Relevant         | `package.json` + `rebuild`-Script            | `better-sqlite3` transitiv über `gtfs`   | ⌛ Bedarf bleibt bis zum Wechsel von `gtfs` auf `node:sqlite` oder eine andere Datenbankschicht.                            |
| MMM-IT8951               | 2024-08-03     | Relevant         | `package.json` + `postinstall`               | `rpio`                                   | ⌛ Python-Refactoring möglich; SPI-Protokoll ist komplex.                                                                   |
| MMM-GoogleTTS            | 2023-11-27     | Relevant         | `package.json` (Dependency, kein Script)     | -                                        | 🟡 Neu erkannt; Abhängigkeit wirkt im aktuellen Manifest ungenutzt und kann nach einem Install-Test entfernt werden.        |
| MMM-Hotword2             | 2024-07-11     | Relevant         | `package.json` (Dev-Dependency, kein Script) | Picovoice-Pakete                         | 🟡 Neu erkannt; `@electron/rebuild` ist nur Dev-Dependency und offenbar nicht automatisiert. Runtime-Bedarf separat prüfen. |
| mmm-miami-transit        | 2021-04-04     | Relevant         | `package.json` (Dependency, kein Script)     | `node-expat` transitiv möglich           | 🟡 Bedarf nur mit tatsächlichem nativen Laufzeitpfad; XML-Parsing kann refaktoriert werden.                                 |
| MMM-MyMinecraft          | 2021-12-05     | Outdated Section | `package.json` (Dependency, kein Script)     | -                                        | 🔵 Nicht relevant; aus der weiteren Betrachtung ausgeschlossen.                                                             |
| MMM-MinecraftStatus      | 2018-10-08     | Outdated Section | `package.json` (Dependency, kein Script)     | -                                        | 🔵 Nicht relevant; aus der weiteren Betrachtung ausgeschlossen.                                                             |
| MMM-tns                  | 2019-12-31     | Outdated Section | `package.json` (Dependency)                  | -                                        | 🔵 Nicht relevant; aus der weiteren Betrachtung ausgeschlossen.                                                             |
| MMM-MySenseHat           | 2024-03-29     | Outdated Section | `package.json` (Dependency)                  | `node-sense-hat`                         | 🔵 Nicht relevant; aus der weiteren Betrachtung ausgeschlossen.                                                             |
| MMM-MPR121               | 2018-03-08     | Outdated Section | `package.json` + `postinstall`               | `adafruit-mpr121`                        | 🔵 Nicht relevant; aus der weiteren Betrachtung ausgeschlossen.                                                             |
| MMM-Pir                  | 2020-07-15     | Outdated Section | `package.json` + Installer                   | `nan`                                    | 🔵 Nicht relevant; aus der weiteren Betrachtung ausgeschlossen.                                                             |
| MMM-Button               | 2019-02-25     | Outdated Section | `package.json` + `postinstall`               | `onoff`                                  | 🔵 Nicht relevant; aus der weiteren Betrachtung ausgeschlossen.                                                             |
| MMM-Hover                | 2017-10-18     | Outdated Section | `package.json` (Dependency, kein Script)     | historisch I2C/GPIO                      | 🔵 Nicht relevant; aus der weiteren Betrachtung ausgeschlossen.                                                             |
| MMM-Simple-Swiper        | 2022-01-16     | Outdated Section | `package.json` (Dependency, kein Script)     | -                                        | 🔵 Nicht relevant; aus der weiteren Betrachtung ausgeschlossen.                                                             |
| MMM-Podcast              | 2019-12-19     | Outdated Section | `package.json` + `postinstall`               | -                                        | 🔵 Nicht relevant; aus der weiteren Betrachtung ausgeschlossen.                                                             |
| magic-mirror-voice       | 2016-09-13     | Outdated Section | `package.json` (Dependency, kein Script)     | -                                        | 🔵 Nicht relevant; aus der weiteren Betrachtung ausgeschlossen.                                                             |

## Seit dem vorherigen Stand entfernt

Diese Module enthalten im aktuellen Snapshot keinen produktiven electron-rebuild-Verweis mehr:

- `MMM-KeyBindings`
- `MMM-Buttons`
- `MMM-Nordic-Electrical-Spot-Prices`
- `MMM-MysqlQuery`
- `MMM-PresenceScreenControl`

## Prüfung wiederholen

Module nur mit einer `package.json`-Referenz finden:

```bash
rg --no-ignore -l -i 'electron-rebuild|@electron/rebuild' modules \
  -g 'package.json' -g '!package-lock.json' | sort
```

Zusätzliche Referenzen in Shell-/Installer-Dateien finden:

```bash
rg --no-ignore -l -i 'electron-rebuild|@electron/rebuild' modules \
  -g '!package.json' -g '!package-lock.json' -g '!CHANGELOG*' \
  -g '!README*' -g '!*.md' -g '!*.org' -g '!node_modules/**' | sort
```
