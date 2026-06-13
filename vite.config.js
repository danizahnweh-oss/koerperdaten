import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Build bündelt alles (JS, CSS, Fonts) in eine einzige dist/index.html,
// damit die App weiterhin per Doppelklick offline läuft.
export default defineConfig({
  base: "./",
  plugins: [viteSingleFile()],
  build: {
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 5_000,
  },
});
