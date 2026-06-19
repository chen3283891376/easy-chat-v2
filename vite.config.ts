import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
    server: {
        proxy: {
            '/api': {
                target: loadEnv('development', process.cwd()).VITE_API_URL,
                changeOrigin: true,
                rewrite: path => path.replace(/^\/api/, ''),
            },
            '/xes/api': {
                target: 'https://code.xueersi.com/api',
                changeOrigin: true,
                rewrite: url => url.replace(/^\/xes\/api/, ''),
            },
        },
    },
});
