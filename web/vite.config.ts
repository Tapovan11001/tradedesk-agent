import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// SINGLE=1 inlines everything into one HTML file (used for offline sharing).
export default defineConfig({
  base: "./",
  plugins: process.env.SINGLE ? [viteSingleFile()] : [],
});
