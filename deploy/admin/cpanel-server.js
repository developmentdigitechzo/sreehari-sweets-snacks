/**
 * Startup file for cPanel "Setup Node.js App" (Passenger). Serves the built admin panel.
 * Build first with:  NEXT_PUBLIC_BASE_PATH=/admin npm run build   (Windows PowerShell: $env:NEXT_PUBLIC_BASE_PATH='/admin')
 * Then set this file as the application startup file. Passenger supplies the port.
 */
const { createServer } = require('node:http');
const next = require('next');

const port = process.env.PORT || 3000;
const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(port, () => console.log(`Admin ready on ${port}`));
});
