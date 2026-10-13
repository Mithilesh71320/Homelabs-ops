/**
 * demo-crashy — OOM-crash demonstration app for homelab-ops-mcp Module 9.
 *
 * This tiny HTTP server leaks off-heap memory on POST /leak using Buffer.alloc
 * every 200ms until the Linux OOM killer fires and sends SIGKILL (exit code 137).
 *
 * Endpoints:
 *   GET  /        -> 200 OK  {"status":"alive"}
 *   GET  /health  -> 200 OK  {"status":"alive"}
 *   POST /leak    -> starts the memory leak loop (run `npm run demo:crash` to trigger)
 */
const http = require('http');

const PORT = process.env.PORT || 3000;
const LEAK_CHUNK_MB = 8; // MB per allocation
const LEAK_INTERVAL_MS = 200; // ms between allocations

let leaking = false;
const leakedBuffers = [];

function startLeak() {
  if (leaking) return;
  leaking = true;
  console.log(`[demo-crashy] Memory leak STARTED — allocating ${LEAK_CHUNK_MB} MB every ${LEAK_INTERVAL_MS}ms until OOM kill`);
  setInterval(() => {
    const chunk = Buffer.alloc(LEAK_CHUNK_MB * 1024 * 1024, 0xff);
    leakedBuffers.push(chunk);
    const totalMB = (leakedBuffers.length * LEAK_CHUNK_MB).toFixed(0);
    console.log(`[demo-crashy] Allocated ${totalMB} MB so far...`);
  }, LEAK_INTERVAL_MS);
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'alive', leaking }));
  } else if (req.method === 'POST' && req.url === '/leak') {
    startLeak();
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'leak started', message: 'Memory leak is running — container will be OOM-killed shortly.' }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`[demo-crashy] HTTP server started on port ${PORT}`);
  console.log(`[demo-crashy] Memory limit: ${process.env.mem_limit || '64m (set by docker-compose)'}`);
  console.log(`[demo-crashy] POST /leak to trigger OOM kill`);
});

process.on('SIGTERM', () => {
  console.log('[demo-crashy] SIGTERM received — shutting down gracefully');
  server.close(() => process.exit(0));
});
