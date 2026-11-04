import {defineConfig} from 'vite';
import tailwindcss from '@tailwindcss/vite';
import {studioCodeSplitting,studioPreload} from './scripts/studio-loading.mjs';
export default defineConfig({
  plugins:[tailwindcss(),studioPreload()],
  server:{host:'127.0.0.1'},
  build:{chunkSizeWarningLimit:2500,rolldownOptions:{output:{codeSplitting:studioCodeSplitting}}},
});
