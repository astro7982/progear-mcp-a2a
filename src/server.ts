import cors from '@fastify/cors';
import Fastify from 'fastify';
import { registerRoutes } from './routes.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
});

await app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
});

await registerRoutes(app);

try {
  await app.listen({ port, host });
  app.log.info({ port, host }, 'progear-mcp-a2a listening');
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
