import { defineConfig } from "../../index"

export const name = 'Test App'

export default defineConfig({

    name,

    // Test ability to add plugins
    plugins: [
        {
            name: 'test-plugin',
            load: function () {
                return {
                    echo: (message) => this.sendSync('echo', message)
                }
            },
            desktop: {
                load: function () {
                    this.on('get', (ev, message) => ev.returnValue = message)
                },
                preload: () => {
                    console.log('preload')
                }
            }

        }
    ]
})