import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'

// The app version comes from the desktop app's package.json (one place to bump it)
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

// base './' makes the built app use relative paths, so it also works when the
// desktop (Electron) app loads it straight from disk instead of from a server.
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version)
  },
  server: {
    // CHANGELOG.md sits one folder up, next to package.json
    fs: { allow: ['..'] }
  }
})
