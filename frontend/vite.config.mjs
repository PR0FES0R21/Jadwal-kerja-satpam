import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
const packages=['react','react-dom','radix-ui','lucide-react','sonner','class-variance-authority','clsx','tailwind-merge'];
export default defineConfig({
  plugins:[react()],
  publicDir:'../public',
  css:{postcss:{plugins:[tailwind()]}},
  resolve:{alias:[{find:'tailwindcss',replacement:fileURLToPath(import.meta.resolve('tailwindcss/index.css'))},{find:'tw-animate-css',replacement:fileURLToPath(new URL('./node_modules/tw-animate-css/dist/tw-animate.css',import.meta.url))},{find:'@',replacement:fileURLToPath(new URL('../',import.meta.url))},...packages.map(name=>({find:new RegExp('^'+name+'$'),replacement:fileURLToPath(import.meta.resolve(name))}))],dedupe:['react','react-dom']},
  server:{proxy:{'/api/cloud':{target:'http://127.0.0.1:10000',changeOrigin:false}}},
  build:{outDir:'dist',emptyOutDir:true},
});
