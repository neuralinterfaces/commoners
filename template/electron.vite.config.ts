import { join } from 'path'
// import { defineConfig } from 'electron-vite'
// import solid from 'vite-plugin-solid'

const root = process.cwd() // Expect the index.html file to always exist at current working directry

export default {
  renderer: {
    root,
    build: {
      lib: { 
        entry: join(root, 'index.html')
      },
    },
  }
}
