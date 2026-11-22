import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Generates the PNG app icons from public/icon.svg into public/. Run `npm run icons -w
// @steerarr/frontend` after changing the SVG, and commit the PNGs. Icons that get padded
// (maskable, iPhone home screen) get the night-sea background so they have no white edges.
const sea = '#0e1a24';

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: sea } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: sea } },
  },
  images: ['public/icon.svg'],
});
