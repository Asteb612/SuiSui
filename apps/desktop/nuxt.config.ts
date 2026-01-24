export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',

  future: {
    compatibilityVersion: 4,
  },

  ssr: false,

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
    head: {
      title: 'SuiSui - BDD Test Builder',
      meta: [{ name: 'description', content: 'BDD Test Builder with Electron' }],
    },
  },

  experimental: {
    appManifest: false,
  },

  vite: {
    build: {
      target: 'esnext',
    },
  },
})
