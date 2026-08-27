import { defineConfig } from 'vite';

/** GitHub Pages project site lives under `/pole/`; local/dev stays `/`. */
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
});
