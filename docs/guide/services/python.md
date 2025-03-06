
# Example Python Service
This is an example HTTP server written in Python.

```python
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

SECRET_VARIABLE = os.getenv('SECRET_VARIABLE', '')

class SimpleHTTPRequestHandler(BaseHTTPRequestHandler):
    def _set_default_headers(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'X-Requested-With,content-type')

    # Pass Secret
    def do_GET(self):
        self._set_default_headers()
        self.send_header('Content-type', 'text/plain')
        self.end_headers()
        self.wfile.write(SECRET_VARIABLE.encode())

    # Echo
    def do_POST(self):
        self._set_default_headers()
        self.send_header('Content-type', self.headers['Content-Type'])
        self.end_headers()

        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        self.wfile.write(post_data)

        

PORT = int(os.getenv('PORT', 8000))
HOST = os.getenv('HOST', '')

httpd = HTTPServer((HOST, PORT), SimpleHTTPRequestHandler)
httpd.serve_forever()
```
