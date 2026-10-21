# Changelog

What changed in each version of CMFxNothing (Unofficial). The app shows the newest entry
the first time it opens after an update, and each GitHub release uses the matching section.

## 1.0.4 — 2026-10-20

### New
- **Find my earbuds** on the Controls page: make the left or right earbud chirp so you can find it. Tap again to stop; it also stops by itself after a minute.
- **New gestures screen** with both earbuds side by side. Pick actions from icon tiles instead of dropdowns, and see each gesture animated on a see-through earbud.
- **Gestures card** on the Controls page, so the gestures screen is easy to find.
- **What's new** window: opens once after each update to show what changed, and any time from Settings → What's new.

### Fixed
- Noise control, EQ and Bass enhance stopped responding in 1.0.3. They work again.
- Gestures sent the wrong codes to the earbuds, so some choices did nothing or did something else. They now use the codes Nothing Ear (a) expects, including for pinch & hold and double pinch & hold.
- Noise control on a gesture can now choose which modes it switches between (transparency, noise cancellation, off).

## 1.0.3 — 2026-10-20

### Fixed
- Reconnect didn't work after the earbuds disconnected and reconnected to Windows. The app now fully lets go of the old connection, so Reconnect works.
- Reconnecting right after Windows brings the earbuds back retries a few times instead of failing straight away.
- If the earbuds stop answering, the app switches to OFFLINE by itself so you can tap Reconnect.

## 1.0.2 — 2026-10-16

### New
- **Ear tip fit test** on the Controls page: checks the seal of each earbud and tells you what to adjust.
- **Automatic updates**: on Windows new versions download in the background and install on restart; on Mac the app tells you when a new version is out.
- **Report a bug** button and app version in Settings.

### Changed
- New name: CMFxNothing (Unofficial). Your settings carry over from the old "Nothing X" app.

## 1.0.1 — 2026-10-16

### New
- First desktop release for Windows and Mac, based on ear (web).
- Fizzy battery styles, quick tiles, live connection status, dot-matrix look, themes and a preview mode without earbuds.

### Fixed
- More reliable connecting, and the app notices when the earbuds disconnect.
- Works offline: fonts and animations are built into the app.
