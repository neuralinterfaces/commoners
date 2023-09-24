import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Commoners",
  description: "Building Solidarity across Platforms",
  base: './', // Ensure asset links are routed properly

  head: [['link', { rel: 'icon', href: '/logo.png' }]],

  themeConfig: {

    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Getting Started', link: '/introduction/getting-started' }
    ],

    footer: {
      message: `Released under the AGPL License.`,
      copyright: 'Copyright © 2023 Garrett Flynn & Commoners Contributors',
    },

    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Getting Started', link: '/introduction/getting-started' },
          { text: 'Why Commoners', link: '/introduction/why' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/garrettmflynn/commoners' }
    ]
  }
})
