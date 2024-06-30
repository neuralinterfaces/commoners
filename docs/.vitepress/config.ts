import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Commoners",
  description: "Building Solidarity across Platforms",

  head: [['link', { rel: 'icon', href: '/logo.png' }]],

  themeConfig: {

    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Config', link: '/config/index' },
      { text: 'Plugins', link: '/plugins/index' },
      { text: 'Roadmap', link: '/roadmap/features' },
    ],

    footer: {
      message: `Released under the MIT License.`,
      copyright: 'Copyright © 2024 Garrett Flynn & Commoners Contributors',
    },

    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Why Commoners', link: '/guide/why' },
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Features', link: '/guide/features' },
            { text: 'CLI', link: '/guide/cli' },
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/neuralinterfaces/commoners' }
    ]
  }
})
