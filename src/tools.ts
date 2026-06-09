import {
  catalog,
  distributorOrders,
  findProduct,
  nextOrderId,
  orders,
  type Product,
} from './data.js';
import type { AuthContext } from './auth.js';

export type ToolDescriptor = {
  name: string;
  description: string;
  scopeRequired: string;
  fgaGated: boolean;
  input_schema: Record<string, unknown>;
};

export const toolDescriptors: ToolDescriptor[] = [
  {
    name: 'inventory.check_stock',
    description: 'Check stock levels for one product (by id) or for the full catalog when productId is omitted.',
    scopeRequired: 'inventory:read',
    fgaGated: false,
    input_schema: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'Optional product id (e.g. TR-9-PRO). If omitted, returns the full catalog snapshot.',
        },
      },
    },
  },
  {
    name: 'inventory.create_order',
    description: 'Create a customer order. Decrements stock and returns a confirmation.',
    scopeRequired: 'inventory:order',
    fgaGated: false,
    input_schema: {
      type: 'object',
      required: ['productId', 'quantity', 'customer'],
      properties: {
        productId: { type: 'string' },
        quantity: { type: 'integer', minimum: 1 },
        customer: { type: 'string', description: 'Customer name or account id' },
      },
    },
  },
  {
    name: 'inventory.order_from_distributor',
    description: 'Place a replenishment order with the distributor. FGA-gated upstream: orders > 50 units require approval before this tool is called.',
    scopeRequired: 'inventory:replenish',
    fgaGated: true,
    input_schema: {
      type: 'object',
      required: ['productId', 'quantity'],
      properties: {
        productId: { type: 'string' },
        quantity: { type: 'integer', minimum: 1 },
      },
    },
  },
];

export function findDescriptor(toolName: string): ToolDescriptor | undefined {
  return toolDescriptors.find((d) => d.name === toolName);
}

function summarize(p: Product) {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    stock: p.stock,
    reorderThreshold: p.reorderThreshold,
    needsReorder: p.stock <= p.reorderThreshold,
    unitPrice: p.unitPrice,
    unit: p.unit,
  };
}

export type ToolMetadata = {
  tool: string;
  scopeRequired: string;
  fgaGated: boolean;
  audience: string | undefined;
  issuer: string | undefined;
  requestId: string;
  latencyMs: number;
  invokedAt: string;
};

export type ToolResult = {
  ok: true;
  tool: string;
  result: unknown;
  caller: { sub: string; scope?: string; actChain: unknown[] };
  metadata: ToolMetadata;
} | {
  ok: false;
  tool: string;
  error: string;
  message?: string;
  caller: { sub: string; scope?: string; actChain: unknown[] };
  metadata: ToolMetadata;
};

function callerInfo(auth: AuthContext) {
  return { sub: auth.sub, scope: auth.scope, actChain: auth.actChain };
}

function newRequestId(): string {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildMetadata(
  toolName: string,
  auth: AuthContext,
  startedAt: number,
  requestId: string,
): ToolMetadata {
  const descriptor = findDescriptor(toolName);
  const payload = auth.tokenPayload;
  const audience = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
  return {
    tool: toolName,
    scopeRequired: descriptor?.scopeRequired ?? 'unknown',
    fgaGated: descriptor?.fgaGated ?? false,
    audience: typeof audience === 'string' ? audience : undefined,
    issuer: typeof payload.iss === 'string' ? payload.iss : undefined,
    requestId,
    latencyMs: Date.now() - startedAt,
    invokedAt: new Date(startedAt).toISOString(),
  };
}

export async function invokeTool(
  toolName: string,
  args: Record<string, unknown>,
  auth: AuthContext,
): Promise<ToolResult> {
  const startedAt = Date.now();
  const requestId = newRequestId();
  const meta = () => buildMetadata(toolName, auth, startedAt, requestId);

  switch (toolName) {
    case 'inventory.check_stock': {
      const productId = typeof args.productId === 'string' ? args.productId : undefined;
      if (productId) {
        const p = findProduct(productId);
        if (!p) {
          return {
            ok: false,
            tool: toolName,
            error: 'product_not_found',
            message: `No product with id ${productId}`,
            caller: callerInfo(auth),
            metadata: meta(),
          };
        }
        return {
          ok: true,
          tool: toolName,
          result: summarize(p),
          caller: callerInfo(auth),
          metadata: meta(),
        };
      }
      return {
        ok: true,
        tool: toolName,
        result: {
          totalProducts: catalog.length,
          items: catalog.map(summarize),
        },
        caller: callerInfo(auth),
        metadata: meta(),
      };
    }

    case 'inventory.create_order': {
      const productId = typeof args.productId === 'string' ? args.productId : '';
      const quantity = typeof args.quantity === 'number' ? Math.floor(args.quantity) : 0;
      const customer = typeof args.customer === 'string' ? args.customer : '';

      if (!productId || quantity <= 0 || !customer) {
        return {
          ok: false,
          tool: toolName,
          error: 'invalid_args',
          message: 'productId, positive quantity, and customer are required.',
          caller: callerInfo(auth),
          metadata: meta(),
        };
      }

      const product = findProduct(productId);
      if (!product) {
        return {
          ok: false,
          tool: toolName,
          error: 'product_not_found',
          message: `No product with id ${productId}`,
          caller: callerInfo(auth),
          metadata: meta(),
        };
      }

      if (product.stock < quantity) {
        return {
          ok: false,
          tool: toolName,
          error: 'insufficient_stock',
          message: `Only ${product.stock} available; requested ${quantity}.`,
          caller: callerInfo(auth),
          metadata: meta(),
        };
      }

      product.stock -= quantity;
      const order = {
        id: nextOrderId('ORD'),
        productId: product.id,
        productName: product.name,
        quantity,
        unitPrice: product.unitPrice,
        total: product.unitPrice * quantity,
        customer,
        createdAt: new Date().toISOString(),
        createdBy: auth.sub,
      };
      orders.push(order);

      return {
        ok: true,
        tool: toolName,
        result: {
          confirmation: order.id,
          order,
          remainingStock: product.stock,
        },
        caller: callerInfo(auth),
        metadata: meta(),
      };
    }

    case 'inventory.order_from_distributor': {
      const productId = typeof args.productId === 'string' ? args.productId : '';
      const quantity = typeof args.quantity === 'number' ? Math.floor(args.quantity) : 0;

      if (!productId || quantity <= 0) {
        return {
          ok: false,
          tool: toolName,
          error: 'invalid_args',
          message: 'productId and positive quantity are required.',
          caller: callerInfo(auth),
          metadata: meta(),
        };
      }

      const product = findProduct(productId);
      if (!product) {
        return {
          ok: false,
          tool: toolName,
          error: 'product_not_found',
          message: `No product with id ${productId}`,
          caller: callerInfo(auth),
          metadata: meta(),
        };
      }

      const replenishment = {
        id: nextOrderId('PO'),
        productId: product.id,
        productName: product.name,
        quantity,
        status: 'submitted' as const,
        createdAt: new Date().toISOString(),
        createdBy: auth.sub,
      };
      distributorOrders.push(replenishment);

      return {
        ok: true,
        tool: toolName,
        result: {
          confirmation: replenishment.id,
          purchaseOrder: replenishment,
          notice: 'Submitted to distributor. Fulfillment ETA 5-7 business days.',
        },
        caller: callerInfo(auth),
        metadata: meta(),
      };
    }

    default:
      return {
        ok: false,
        tool: toolName,
        error: 'unknown_tool',
        message: `No tool registered for ${toolName}`,
        caller: callerInfo(auth),
        metadata: meta(),
      };
  }
}
