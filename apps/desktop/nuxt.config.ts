import Aura from '@primevue/themes/aura'

export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',

  future: {
    compatibilityVersion: 4,
  },

  ssr: false,

  // Applied only by `nuxt dev` (reliable, unlike process.env.NODE_ENV at
  // config-load time). Dev serves over http://localhost:3000 where Vite needs
  // an absolute base; the packaged build keeps the relative './' above.
  $development: {
    app: {
      baseURL: '/',
    },
    vite: {
      // Must equal app.baseURL ('/') + buildAssetsDir ('_nuxt/') so Vite's dev
      // middleware serves /_nuxt/@vite/client and the entry module as JS.
      base: '/_nuxt/',
    },
  },

  nitro: {
    preset: 'static',
  },

  modules: ['@primevue/nuxt-module', '@pinia/nuxt'],

  primevue: {
    options: {
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: false,
        },
      },
      ripple: true,
    },
  },

  css: ['primeicons/primeicons.css', 'primeflex/primeflex.css', '~/assets/css/main.css'],

  typescript: {
    strict: true,
    // Disabled due to vue-tsc 3.x compatibility issues with Nuxt 3.21
    // Run `pnpm typecheck` separately for type checking
    typeCheck: false,
  },

  devtools: { enabled: true },

  app: {
    // Relative base for the packaged app (loaded via the app:// protocol).
    // Overridden to '/' in dev via the $development key below — Vite's dev
    // server needs an absolute base to serve /_nuxt/* modules.
    baseURL: './',
    buildAssetsDir: '_nuxt/',
    head: {
      title: 'SuiSui - BDD Test Builder',
      meta: [{ name: 'description', content: 'BDD Test Builder with Electron' }],
    },
  },

  router: {
    options: {
      hashMode: true,
    },
  },

  experimental: {
    appManifest: false,
    // Required for SPA (ssr: false) dev with @nuxt/vite-builder 3.21.8 + Vite 7.
    // Without it, vite-builder's dev hook reads rollupOptions.input.server, which
    // is only registered under the Vite environment API — throwing
    // "No entry found in rollupOptions.input". Does NOT enable runtime SSR.
    viteEnvironmentApi: true,
  },

  vite: {
    // Relative base so the packaged app (app:// protocol) resolves assets
    // relative to index.html. Overridden to '/_nuxt/' in dev via $development —
    // Vite's dev middleware must mount at the same path as the asset URLs in
    // index.html (app.baseURL '/' + buildAssetsDir '_nuxt/'), otherwise
    // /_nuxt/@vite/client falls through to the SPA fallback (200 text/html) and
    // the renderer reports "Failed to load module script".
    base: './',
    build: {
      target: 'esnext',
    },
  },
})
