
export default {
    build: {
        rollupOptions: { 

            // Equivalent to the Commoners pages configuration
            input: { 
                main: './index.html',
                services: "./pages/services/index.html",
                windows: "./pages/windows/index.html",
                serial: "./pages/serial/index.html",
                bluetooth: "./pages/bluetooth/index.html" 
            } 
        }
    }
}