/// <reference types="node" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'windows/index.html'),
        widget: resolve(__dirname, 'windows/widget.html'),
        update: resolve(__dirname, 'windows/update.html'),
        lowBalanceAlert: resolve(__dirname, 'windows/low-balance-alert.html'),
        securityNotice: resolve(__dirname, 'windows/security-notice.html'),
      },
    },
  },
})
