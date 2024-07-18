import os
import json
import sys
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS, cross_origin

app = Flask(__name__)
cors = CORS(app)
app.config['CORS_HEADERS'] = 'Content-Type'

@app.route('/.commoners')
@cross_origin()
def openapi():
    return send_file('openapi.json')

@app.route('/version')
@cross_origin()
def version():
    print(f'Getting version: {sys.version}', flush=True) # Required to show in logs
    return jsonify(sys.version)

@app.route('/users')
@cross_origin()
def users():
    return jsonify([{}, {}, {}])

@app.route('/echo', methods=['POST'])
@cross_origin()
def post():
    data = json.loads(request.data) if request.data else {}
    return jsonify(data)

if __name__ == "__main__":
    env_port = os.getenv('PORT')
    PORT = int(env_port) if env_port else 8080
    HOST = os.getenv('HOST') or 'localhost'
    app.run(host=HOST, port = PORT)
