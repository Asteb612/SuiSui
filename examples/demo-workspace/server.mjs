// Zero-dependency static server for the demo site (no framework, no install).
// Used by `npm run serve` (for the Recorder) and auto-started by Playwright's
// `webServer` config during `npm test`.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname, normalize, sep } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), 'site')
const port = Number(process.env.PORT) || 5173

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

const server = createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent((req.url || '/').split('?')[0])
    if (pathname === '/') pathname = '/index.html'

    const filePath = normalize(join(root, pathname))
    // Guard against path traversal outside the site root.
    if (filePath !== root && !filePath.startsWith(root + sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' }).end('Forbidden')
      return
    }

    const body = await readFile(filePath)
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    })
    res.end(body)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found')
  }
})

server.listen(port, () => {
  console.log(`Demo site running at http://localhost:${port}`)
})
