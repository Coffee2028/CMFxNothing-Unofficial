import { defineConfig } from 'vite'

// base './' makes the built app use relative paths, so it also works when the
// desktop (Electron) app loads it straight from disk instead of from a server.
export default defineConfig({
  base: './',
})
