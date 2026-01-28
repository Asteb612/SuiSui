export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',

  future: {
    compatibilityVersion: 4,
  },

  ssr: false,

  nitro: {
    preset: 'static',
  },

  modules: ['@primevue/nuxt-module', '@pinia/nuxt'],

  primevue: {
    options: {
      theme: 'none',
      ripple: true,
    },
  },

  css: ['primeicons/primeicons.css', 'primeflex/primeflex.css', '~/assets/css/main.css'],

  typescript: {
    strict: true,
    typeCheck: process.env.NUXT_TYPECHECK !== 'false',
  },

  devtools: { enabled: true },

  app: {
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
  },

  vite: {
    base: './',
    build: {
      target: 'esnext',
    },
  },
})
