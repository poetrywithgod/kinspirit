import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  resolve: process.env.FAKE_LK ? { alias: { 'livekit-client': process.env.FAKE_LK } } : undefined,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: { importScripts: ['push-sw.js'] },
      includeAssets: ['logo-mark.png', 'logo-word.png', 'push-sw.js'],
      manifest: {
        name: 'Kinspirit',
        short_name: 'Kinspirit',
        description:
          'Chat as simple as WhatsApp, meetings as capable as Zoom, built for organizations and for low data.',
        theme_color: '#2C0107',
        background_color: '#2C0107',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
