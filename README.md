# progear-mcp-a2a

ProGear inventory MCP server. Consumes the T5 access token at the end of an Okta ID-JAG agent-to-agent (A2A) chain and exposes inventory tools to a downstream agent.

## Endpoints

- `GET /health` — liveness probe
- `GET /tools` — list available tools (no auth)
- `POST /tools/:toolName/invoke` — invoke a tool (requires Bearer token)

## Tools

- `inventory.check_stock(productId?)` — stock levels for one or all products
- `inventory.create_order(productId, quantity, customer)` — create a customer order
- `inventory.order_from_distributor(productId, quantity)` — replenish from supplier (FGA-gated)

## Auth

JWTs are validated against the Okta JWKS and must satisfy:
- `iss` matches `OKTA_ISSUER`
- `aud` matches `OKTA_AUDIENCE` (`https://progear.com/inventoryMCP-resource`)

The `act` chain and `sub` are surfaced to tool handlers for logging.

## Local dev

```bash
npm install
npm run dev
```

## Deploy

Render auto-deploys on push to `main`. See `render.yaml`.
