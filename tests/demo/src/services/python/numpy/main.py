import os
from http.server import BaseHTTPRequestHandler, HTTPServer

class SimpleHTTPRequestHandler(BaseHTTPRequestHandler):
    def _set_default_headers(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'X-Requested-With,content-type')

    # Numpy
    def do_GET(self):
        import numpy as np
        self._set_default_headers()
        self.send_header('Content-type', 'text/plain')
        self.end_headers()

        arr1 = np.array([1, 2, 3])
        arr2 = np.array([4, 5, 6])

        # Basic operations
        addition = np.add(arr1, arr2)   # Element-wise addition
        subtraction = np.subtract(arr1, arr2)  # Element-wise subtraction
        multiplication = np.multiply(arr1, arr2)  # Element-wise multiplication
        division = np.divide(arr1, arr2)  # Element-wise division

        # Mean and dot product
        mean_arr1 = np.mean(arr1)
        dot_product = np.dot(arr1, arr2)

        # Creating a matrix and performing transpose
        matrix = np.array([[1, 2], [3, 4]])
        transpose = np.transpose(matrix)

        self.wfile.write(b"Finished numpy commands")

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

server_address = (HOST, PORT)
httpd = HTTPServer(server_address, SimpleHTTPRequestHandler)
httpd.serve_forever()