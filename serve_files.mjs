
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 8081;
const DIR = __dirname; // Serve from project root

const server = http.createServer((req, res) => {
    const filePath = path.join(DIR, req.url);
    console.log(`Request: ${req.url}`);

    if (!filePath.startsWith(DIR)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error(`Error reading ${filePath}: ${err.message}`);
            res.statusCode = 404;
            res.end('Not Found');
        } else {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'video/mp4');
            res.end(data);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log(`Serving files from ${DIR}`);
});
