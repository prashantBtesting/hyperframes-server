import { startServer } from '@hyperframes/producer/server';

const port = parseInt(process.env.PORT || '8080');
console.log('[HyperFrames] Starting on port', port);

try {
  await startServer({ port });
  console.log('[HyperFrames] Server ready');
} catch (err) {
  console.error('[HyperFrames] Failed to start:', err.message);
  process.exit(1);
}
