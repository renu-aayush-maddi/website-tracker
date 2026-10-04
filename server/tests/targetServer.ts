import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface TargetServer {
  url: string;
  port: number;
  hits: () => number;
  close: () => Promise<void>;
}

/**
 * A local HTTP server whose behaviour is chosen by path:
 *   /status/:code        respond with that status
 *   /slow/:ms            respond 200 after a delay
 *   /hang                never respond
 *   /redirect/:code      redirect to /status/200 using that 3xx code
 *   /loop                redirect to itself forever
 *   /redirect-to?url=    redirect to an arbitrary URL
 *   /reset               destroy the socket without a response
 */
export async function startTargetServer(): Promise<TargetServer> {
  let hits = 0;
  const server: Server = createServer((req, res) => {
    hits += 1;
    const url = new URL(req.url ?? '/', 'http://localhost');
    const [, action, arg] = url.pathname.split('/');
    switch (action) {
      case 'status':
        res.writeHead(Number(arg) || 200, { 'content-type': 'text/plain' }).end('ok');
        return;
      case 'slow':
        setTimeout(() => res.writeHead(200).end('slow'), Number(arg) || 100);
        return;
      case 'hang':
        return;
      case 'redirect':
        res.writeHead(Number(arg) || 302, { location: '/status/200' }).end();
        return;
      case 'loop':
        res.writeHead(302, { location: '/loop' }).end();
        return;
      case 'redirect-to':
        res.writeHead(302, { location: url.searchParams.get('url') ?? '/' }).end();
        return;
      case 'reset':
        req.socket.destroy();
        return;
      default:
        res.writeHead(200).end('ok');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    hits: () => hits,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** A port with nothing listening (for connection-refused tests). */
export async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}
