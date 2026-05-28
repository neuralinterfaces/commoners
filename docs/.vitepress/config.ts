import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

// https://vitepress.dev/reference/site-config
export default withMermaid(
  defineConfig({
    title: 'Commoners',
    description: 'Cross-platform apps with backend services in any language',

    head: [['link', { rel: 'icon', href: '/logo-min.png' }]],

    themeConfig: {
      // https://vitepress.dev/reference/default-theme-config
      nav: [
        { text: 'Home', link: '/' },
        { text: 'Guide', link: '/getting-started' },
        { text: 'Plugins', link: '/packages/plugins' },
      ],

      footer: {
        message: `Released under the MIT License.`,
        copyright: 'Copyright © 2024 Garrett Flynn & Commoners Contributors',
      },

      sidebar: [
        { text: 'Getting Started', link: '/getting-started' },
        { text: 'Add to Existing Project', link: '/guide/migration' },
        { text: 'Why Commoners', link: '/why/' },
        { text: 'Choosing the Right Tool', link: '/guide/comparisons' },
        {
          text: 'Guide',
          items: [
            { text: 'Configuration', link: '/guide/config' },
            {
              text: 'Targets',
              items: [
                { text: 'Web', link: '/guide/targets/web' },
                { text: 'Desktop', link: '/guide/targets/desktop' },
                { text: 'Mobile', link: '/guide/targets/mobile' },
              ],
            },
            {
              text: 'Services',
              link: '/guide/services',
              items: [
                { text: 'Node', link: '/guide/services/node' },
                { text: 'Python', link: '/guide/services/python' },
                { text: 'C++', link: '/guide/services/cpp' },
                { text: 'Rust', link: '/guide/services/rust' },
              ],
            },
            { text: 'Plugins', link: '/guide/plugins' },
            { text: 'Platform Enhancement', link: '/guide/platform-enhancement' },
            { text: 'Testing', link: '/guide/testing' },
            { text: 'Architecture', link: '/guide/architecture' },
            { text: 'Build Automation', link: '/guide/build-automation' },
            { text: 'Troubleshooting', link: '/guide/troubleshooting' },
            {
              text: 'Walkthroughs',
              items: [
                { text: 'OpenAPI', link: '/guide/walkthroughs/openapi' },
                { text: 'Local Services', link: '/guide/walkthroughs/local-services' },
              ],
            },
          ],
        },
        {
          text: 'Packages',
          items: [{ text: 'Plugins', link: '/packages/plugins' }],
        },
        {
          text: 'Roadmap',
          items: [
            { text: 'Features', link: '/roadmap/features' },
            { text: 'Platform Enhancement', link: '/guide/platform-enhancement' },
            { text: 'Walkthroughs', link: '/guide/walkthroughs/openapi' },
          ],
        },
        {
          text: 'Reference',
          items: [
            { text: 'CLI', link: '/reference/cli' },
            { text: 'API', link: '/reference/api' },
          ],
        },
      ],

      socialLinks: [{ icon: 'github', link: 'https://github.com/neuralinterfaces/commoners' }],
    },
  })
)
