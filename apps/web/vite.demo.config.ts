import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Static, server-less build: the game service runs in the page (see demo/browser-server.ts). */
export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: { alias: { "node:events": fileURLToPath(new URL("./demo/events-shim.ts", import.meta.url)) } },
  build: {
    outDir: "dist-demo",
    emptyOutDir: true,
    rollupOptions: { input: fileURLToPath(new URL("./demo.html", import.meta.url)) },
  },
});
