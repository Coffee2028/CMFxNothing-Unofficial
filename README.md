<p align="center">
  <img src="resources/icon.png" width="128" alt="CMFxNothing app icon">
</p>

<h1 align="center">CMFxNothing (Unofficial)</h1>

<p align="center">
  A community-made Windows and Mac app for Nothing and CMF earbuds.<br>
  The name refers to the earbuds it works with; it is not a CMF or Nothing product.<br>
  <b>Not made by, affiliated with or endorsed by Nothing Technology.</b>
</p>

---

## Features

- **Fizzy battery** — live earbud battery shown as liquid, with four styles (Soda, Sparkling, Bubble Pop, Classic); fizzes faster while charging
- **Quick tiles** — switch noise control, EQ and game mode straight from the dashboard
- **Noise control** — noise cancellation (high / mid / low / adaptive), transparency, off
- **Equalizer** — presets plus an advanced mode
- **Bass enhance**, **low latency mode**, **in-ear detection**
- **Gestures** — both earbuds on one screen: pick what each pinch does from icon tiles, with an animated earbud showing the gesture
- **Themes** — seven accent colours
- **Live status** — shows when the earbuds disconnect, tap to reconnect
- **Ear tip fit test** — checks that each ear tip seals well
- **Find my earbuds** — make the left or right earbud chirp so you can find it
- **Automatic updates** — new versions install themselves on Windows
- **Preview mode** — try the app without earbuds

What changed in each version: see the **[changelog](CHANGELOG.md)** (the app also shows it after each update).

## Install

Get the latest version from the **[Releases](../../releases/latest)** page.

**Windows**

1. Download `CMFxNothing-Setup-x.y.z.exe` and run it.
2. If Windows shows *"Windows protected your PC"* (the app isn't code-signed), click **More info → Run anyway**.
3. After that the app **updates itself**: it downloads new versions in the background and asks you to restart.

**Mac**

1. Download `CMFxNothing-…-mac-arm64.dmg` for Apple Silicon (M1 and newer) or `…-mac-x64.dmg` for Intel Macs.
2. Open it and drag **CMFxNothing (Unofficial)** into **Applications**.
3. The first time, macOS says it can't verify the app (it isn't notarized by Apple): click **Done**, then go to **System Settings → Privacy & Security** and click **Open Anyway**. Allow Bluetooth when asked.
4. The app tells you when a new version is out; click **Download** to get it.

**Then:** pair your earbuds in your computer's Bluetooth settings, take them out of the case, open **CMFxNothing** and click **Initialize Link**.

## Compatibility

Tested with the **Nothing Ear / Ear (a)**. Other Nothing and CMF models that the original
[ear (web)](https://github.com/radiance-project/ear-web) project supports may work, but some
model-specific features might not yet.

## Help and bug reports

Found a bug or have an idea? [Open an issue](../../issues/new/choose); there's a short form for each.
In the app you can also go to **Settings → Report a bug**.

## Build from source

Needs [Node.js](https://nodejs.org/) 20 or newer.

```bash
npm install          # Electron + build tools (a few hundred MB)
npm start            # build the interface and open the app
npm run dist:win     # build the Windows installer into release/
npm run dist:mac     # build the Mac apps (on a Mac)
```

New releases are built automatically by GitHub Actions (`.github/workflows/build.yml`)
whenever `package.json` changes on `main`, e.g. after bumping `"version"`. You can also start a
build by hand: **Actions → Build CMFxNothing → Run workflow**.

To work on just the interface in a browser: run `start_app.bat` (or `npm --prefix web run dev`)
and open `http://localhost:5173` in Chrome or Edge. Add `?demo` to the address to preview without earbuds.

| Folder | What's in it |
| --- | --- |
| `web/` | The interface (Vite + plain JavaScript): `src/main.js`, `src/style.css`, `src/connection.js` (earbud protocol), `src/fizz.js` (battery animation) |
| `main.js`, `electron/` | The desktop wrapper (Electron) and the earbud picker window |
| `resources/` | App icons (Windows and Mac) |
| `.github/workflows/` | Automatic Windows + Mac builds and releases |

## Credits

Built on **[ear (web)](https://github.com/radiance-project/ear-web)** by **RapidZapper** (idea and backend work)
and **[Bendix](https://www.mrbrickstar.de/)** (frontend work), whose reverse-engineered protocol makes this possible.

Desktop app, redesign and new features by **[Coffee2028](https://github.com/Coffee2028)**.

Fonts: Italiana, Manrope, Space Mono and Doto, all under the SIL Open Font License (see `web/public/fonts/`).

## Legal

This application and code is published under the **GNU Affero General Public License v3.0** — see [LICENSE](LICENSE).

Nothing Technology Limited or any of its affiliates, subsidiaries, or related entities (collectively, “Nothing Technology”) is a valid licensee and can use this app for any purpose, including commercial purposes, without compensation to the developers of this app. Nothing Technology is not required to comply with the terms of the GNU Affero General Public License v3.0.

This app is not affiliated with, sponsored by, or endorsed by Nothing Technology. The developers of this app take no responsibility for the accuracy or completeness of the content and materials provided in this app. "Nothing" and related names and marks are the property of Nothing Technology Limited, 80 Cheapside, London EC2V 6EE, and are protected by copyright, trademark, and other intellectual property laws. Nothing Technology reserves all rights.
