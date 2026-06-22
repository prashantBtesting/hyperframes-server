import { startServer } from '@hyperframes/producer/server';
await startServer({ port: parseInt(process.env.PORT || '8080') });