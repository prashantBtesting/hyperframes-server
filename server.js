import { startServer } from '@hyperframes/producer/server';

const port = parseInt(process.env.PORT || '8080');
console.log('[HyperFrames] Starting on port', port);
await startServer({ port });
console.log('[HyperFrames] Ready');
