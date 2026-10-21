// The changelog lives in CHANGELOG.md at the top of the project (also used for the
// GitHub release notes). Vite bundles it into the app as plain text.
import raw from '../../CHANGELOG.md?raw';

// [{ version, date, sections: [{ title, items: [html] }] }], newest first
export function parseChangelog(text) {
  const versions = [];
  let version = null;
  let section = null;
  for (const line of text.split(/\r?\n/)) {
    const v = line.match(/^##\s+(\d+\.\d+\.\d+)\s*(?:[—–-]\s*(.+))?$/);
    if (v) {
      version = { version: v[1], date: (v[2] || '').trim(), sections: [] };
      versions.push(version);
      section = null;
      continue;
    }
    if (!version) continue;
    const h = line.match(/^###\s+(.+)$/);
    if (h) {
      section = { title: h[1].trim(), items: [] };
      version.sections.push(section);
      continue;
    }
    const item = line.match(/^\s*[-*]\s+(.+)$/);
    if (item && section) section.items.push(inline(item[1]));
  }
  return versions;
}

// **bold** and `code`, everything else escaped
function inline(text) {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

export const CHANGELOG = parseChangelog(raw);

// Set by vite.config.js from package.json
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '';
