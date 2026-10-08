import {pwaBuild} from './pwa-build.mjs';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
import {findPackageJSON} from 'node:module';
import {dirname,resolve} from 'node:path';
// Resolve the installed package, whether npm installs here or pnpm installs
// dependencies at the repository root. Node 24 handles package exports here.
const animationCss=resolve(dirname(findPackageJSON('tw-animate-css',import.meta.url)),'dist/tw-animate.css');
const packages=['react','react-dom','radix-ui','lucide-react','sonner','class-variance-authority','clsx','tailwind-merge'];
export default defineConfig({
  plugins:[react(),pwaBuild()],
  publicDir:'../public',
  css:{postcss:{plugins:[tailwind()]}},
  resolve:{alias:[{find:'tailwindcss',replacement:fileURLToPath(import.meta.resolve('tailwindcss/index.css'))},{find:'tw-animate-css',replacement:animationCss},{find:'@',replacement:fileURLToPath(new URL('../',import.meta.url))},...packages.map(name=>({find:new RegExp('^'+name+'$'),replacement:fileURLToPath(import.meta.resolve(name))}))],dedupe:['react','react-dom']},
  server:{proxy:{'/api/cloud':{target:'http://127.0.0.1:10000',changeOrigin:false}}},
  build:{outDir:'dist',emptyOutDir:true},
});
