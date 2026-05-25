/**
 * rate-limiter.js — Issue #78
 *
 * Factory für limitRequests: IP-basierter Tages-Rate-Limiter für WebSocket-Verbindungen.
 * Extrahiert aus server.js.
 */

/**
 * Erstellt einen neuen Rate-Limiter.
 * Prüft MAX_REQUESTS aus der Umgebung; ohne MAX_REQUESTS kein Limit.
 *
 * @returns {(ws: object, req: object, message: any, next: Function) => void}
 */
export function createRateLimiter() {
  const requests = {};

  // Stale IP-Einträge täglich löschen (verhindert unbegrenztes Wachstum)
  setInterval(() => {
    const today = new Date().toISOString().slice(0, 10);
    for (const ip of Object.keys(requests)) {
      if (requests[ip].date !== today) delete requests[ip];
    }
  }, 24 * 60 * 60 * 1000);

  return function limitRequests(ws, req, message, next) {
    const ip = req.socket.remoteAddress;
    console.log('Client IP:', ip);

    if (!requests[ip]) {
      requests[ip] = { count: 0, date: '' };
    }

    const today = new Date().toISOString().slice(0, 10);

    if (requests[ip].date !== today) {
      requests[ip].count = 0;
      requests[ip].date = today;
    }

    requests[ip].count++;

    console.log('requests', JSON.stringify(requests[ip]));
    console.log('MAX_REQUESTS', process.env.MAX_REQUESTS);

    if (process.env.MAX_REQUESTS != undefined) {
      if (requests[ip].count > process.env.MAX_REQUESTS) {
        ws.send(JSON.stringify({ end: true, messages: 'Error: Too many requests from this IP' }));
        ws.close(1008, 'Rate limit exceeded');
        return;
      }
    }

    next();
  };
}
