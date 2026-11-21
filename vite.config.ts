import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo-mark.png', 'logo-word.png'],
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
