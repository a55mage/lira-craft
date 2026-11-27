import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Using relative base './' ensures the app works seamlessly on GitHub Pages
// regardless of the repository name (e.g., username.github.io/spartito/ or custom domain).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
});
