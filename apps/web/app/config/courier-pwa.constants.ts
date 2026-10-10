import type { MetadataRoute } from 'next';
export const COURIER_MANIFEST: MetadataRoute.Manifest = {
  id: '/courier-app',
  name: 'POS — Livrări',
  short_name: 'Livrări',
  description: 'Comenzile și livrările tale, cu confirmare online.',
  lang: 'ro',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#246b54',
  icons: [{ src: '/courier-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
};
