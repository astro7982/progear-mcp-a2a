import type { FastifyInstance } from 'fastify';
import { authConfig, requireAuth } from './auth.js';
import { invokeTool, toolDescriptors } from './tools.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'progear-mcp-a2a',
    time: new Date().toISOString(),
    auth: authConfig(),
  }));

  app.get('/tools', async () => ({
    tools: toolDescriptors,
  }));

  app.post<{
    Params: { toolName: string };
    Body: { input?: Record<string, unknown>; arguments?: Record<string, unknown> };
  }>('/tools/:toolName/invoke', { preHandler: requireAuth }, async (request, reply) => {
    if (!request.auth) {
      reply.code(401).send({ error: 'unauthenticated' });
      return;
    }

    const { toolName } = request.params;
    // Accept either `input` (preferred, matches chat route spec) or `arguments`
    // (back-compat for any earlier callers).
    const args = request.body?.input ?? request.body?.arguments ?? {};
    const result = await invokeTool(toolName, args, request.auth);

    if (!result.ok && result.error === 'unknown_tool') {
      reply.code(404).send(result);
      return;
    }
    if (!result.ok && (result.error === 'invalid_args' || result.error === 'insufficient_stock')) {
      reply.code(400).send(result);
      return;
    }
    if (!result.ok && result.error === 'product_not_found') {
      reply.code(404).send(result);
      return;
    }
    return result;
  });
}
