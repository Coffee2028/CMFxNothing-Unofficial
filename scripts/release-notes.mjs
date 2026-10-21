// Prints the GitHub release notes for one version: its section of CHANGELOG.md plus
// the install steps. Used by .github/workflows/build.yml:
//   node scripts/release-notes.mjs 1.0.4 > notes.md
import { readFileSync } from 'node:fs';

const version = process.argv[2];
if (!version) {
  console.error('Usage: node scripts/release-notes.mjs <version>');
  process.exit(1);
}

const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const lines = changelog.split('\n');
const start = lines.findIndex(l => l.startsWith(`## ${version} `) || l.trim() === `## ${version}`);
let changes = '';
if (start !== -1) {
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  if (end === -1) end = lines.length;
  changes = lines.slice(start + 1, end).join('\n').trim();
}

const notes = `Unofficial, community-made app for Nothing and CMF earbuds. Not affiliated with Nothing Technology.
Already installed? The app updates itself on Windows and tells you about new versions on Mac.
${changes ? `\n## What's new in ${version}\n\n${changes}\n` : ''}
## Install

### Windows
1. Download **CMFxNothing-Setup-${version}.exe** and run it.
2. If Windows shows *"Windows protected your PC"*, click **More info → Run anyway** (the app isn't code-signed).
3. From then on the app updates itself and keeps your settings.

### Mac
1. Download the right file:
   - **Apple Silicon** (M1, M2, M3, M4…): \`CMFxNothing-${version}-mac-arm64.dmg\`
   - **Intel Mac**: \`CMFxNothing-${version}-mac-x64.dmg\`
   - Not sure? Apple menu → About This Mac: "Chip: Apple…" means Apple Silicon.
2. Open the .dmg and drag **CMFxNothing (Unofficial)** into **Applications**.
3. The first time, macOS says it can't verify the app (it isn't notarized by Apple). Click **Done**, then open **System Settings → Privacy & Security**, scroll down and click **Open Anyway**.
4. Allow Bluetooth when asked.
5. If macOS ever says the app *"is damaged"*, open Terminal and run: \`xattr -cr "/Applications/CMFxNothing (Unofficial).app"\`

### Connecting
Pair your earbuds in your computer's Bluetooth settings first, take them out of the case, then click **Initialize Link**.

Full history: [CHANGELOG.md](https://github.com/Coffee2028/CMFxNothing-Unofficial/blob/main/CHANGELOG.md)
`;

process.stdout.write(notes);
