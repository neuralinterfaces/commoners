import { join } from 'node:path'

export default {
    build: {
        rollupOptions: { 

            // Equivalent to the Commoners pages configuration
            input: { 
                main: join(__dirname, './index.html'),
                services: join(__dirname, "./pages/services/index.html"),
                windows: join(__dirname, "./pages/windows/index.html"),
                serial: join(__dirname, "./pages/serial/index.html"),
                bluetooth: join(__dirname, "./pages/bluetooth/index.html") 
            } 
        }
    }
}