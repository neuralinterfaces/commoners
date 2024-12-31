import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Commoners",
  description: "Building Solidarity across Platforms",

  head: [['link', { rel: 'icon', href: '/logo-min.png' }]],

  themeConfig: {

    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/getting-started' },
      { text: 'Plugins', link: '/packages/plugins' }
    ],

    footer: {
      message: `Released under the MIT License.`,
      copyright: 'Copyright © 2024 Garrett Flynn & Commoners Contributors',
    },

    sidebar: [
        { text: 'Getting Started', link: '/getting-started' },
        { text: 'Why Commoners', link: '/why/' },
        {
          text: 'Guide',
          items: [
            { text: 'Configuration', link: '/guide/config' },
            {
              text: 'Targets',
              items: [
                { text: 'Web', link: '/guide/targets/web' },
                { text: 'Desktop', link: '/guide/targets/desktop' },
                { text: 'Mobile', link: '/guide/targets/mobile' }
              ]
            },
            {
              text: 'Services',
              link: '/guide/services',
              items: [
                { text: 'Node', link: '/guide/services/node' },
                { text: 'Python', link: '/guide/services/python' },
                { text: 'C++', link: '/guide/services/cpp' }
              ]
            },
            { text: 'Services', link: '/guide/services' },
            { text: 'Plugins', link: '/guide/plugins' },
            { text: 'Testing', link: '/guide/testing' },
            { text: 'Release', link: '/guide/release' }
          ]
        },
        {
          text: "Packages",
          items: [
            { text: "Plugins", link: "/packages/plugins" },
          ]
        },
        {
          text: "Reference",
          items: [
            { text: 'CLI', link: '/reference/cli' },
          ]
        }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/neuralinterfaces/commoners' }
    ]
  }
})
