import http from 'node:http'
import path from 'node:path';
import url from 'node:url';

import { readFileSync, statSync } from 'node:fs';


export const createServer = ({ root }) => {

    return http.createServer(function (req, res) {
    
        // parse URL
        const parsedUrl = url.parse(req.url);
        
        // extract URL path
        let pathname = path.join(root, parsedUrl.pathname);

        // based on the URL path, extract the file extension. e.g. .js, .doc, ...
        const ext = path.parse(pathname).ext || '.html';

        // maps file extension to MIME typere
        const map = {
        '.ico': 'image/x-icon',
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.json': 'application/json',
        '.css': 'text/css',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.wav': 'audio/wav',
        '.mp3': 'audio/mpeg',
        '.svg': 'image/svg+xml',
        '.pdf': 'application/pdf',
        '.doc': 'application/msword'
        };
    
        if (statSync(pathname).isDirectory()) pathname += '/index' + ext;
    
        res.setHeader('Content-type', map[ext] || 'text/plain' );
        res.end(readFileSync(pathname));
    
    })

}
