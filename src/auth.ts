import type { FastifyReply, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

const ISSUER = process.env.OKTA_ISSUER ?? 'https://bala-secures-ai.oktapreview.com/oauth2/auszam0ov23cgv2Kd1d7';
const AUDIENCE = process.env.OKTA_AUDIENCE ?? 'https://progear.com/inventoryMCP-resource';
const JWKS_URL = `${ISSUER}/v1/keys`;

const jwks = createRemoteJWKSet(new URL(JWKS_URL));

export type ActLink = {
  sub?: string;
  client_id?: string;
  [k: string]: unknown;
};

export type AuthContext = {
  sub: string;
  scope?: string;
  actChain: ActLink[];
  tokenPayload: JWTPayload;
};

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

function flattenActChain(act: unknown): ActLink[] {
  const chain: ActLink[] = [];
  let cursor: any = act;
  while (cursor && typeof cursor === 'object') {
    const { act: nested, ...rest } = cursor;
    chain.push(rest as ActLink);
    cursor = nested;
  }
  return chain;
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    reply.code(401).send({ error: 'missing_bearer_token' });
    return;
  }

  const token = header.slice(7).trim();
  if (!token) {
    reply.code(401).send({ error: 'empty_bearer_token' });
    return;
  }

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    if (typeof payload.sub !== 'string') {
      reply.code(401).send({ error: 'missing_sub_claim' });
      return;
    }

    request.auth = {
      sub: payload.sub,
      scope: typeof payload.scope === 'string' ? payload.scope : undefined,
      actChain: flattenActChain(payload.act),
      tokenPayload: payload,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid_token';
    request.log.warn({ err: message }, 'jwt verification failed');
    reply.code(401).send({ error: 'invalid_token', message });
  }
}

export function authConfig() {
  return { issuer: ISSUER, audience: AUDIENCE, jwksUrl: JWKS_URL };
}
