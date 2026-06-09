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
  input_schema: Record<string, unknown>;
};

export const toolDescriptors: ToolDescriptor[] = [
  {
    name: 'inventory.check_stock',
    description: 'Check stock levels for one product (by id) or for the full catalog when productId is omitted.',
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
    description: 'Place a replenishment order with the distributor. FGA-gated: large orders require approval upstream.',
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

export type ToolResult = {
  ok: true;
  tool: string;
  result: unknown;
  caller: { sub: string; actChain: unknown[] };
} | {
  ok: false;
  tool: string;
  error: string;
  message?: string;
  caller: { sub: string; actChain: unknown[] };
};

function callerInfo(auth: AuthContext) {
  return { sub: auth.sub, actChain: auth.actChain };
}

export async function invokeTool(
  toolName: string,
  args: Record<string, unknown>,
  auth: AuthContext,
): Promise<ToolResult> {
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
          };
        }
        return { ok: true, tool: toolName, result: summarize(p), caller: callerInfo(auth) };
      }
      return {
        ok: true,
        tool: toolName,
        result: {
          totalProducts: catalog.length,
          items: catalog.map(summarize),
        },
        caller: callerInfo(auth),
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
        };
      }

      if (product.stock < quantity) {
        return {
          ok: false,
          tool: toolName,
          error: 'insufficient_stock',
          message: `Only ${product.stock} available; requested ${quantity}.`,
          caller: callerInfo(auth),
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
      };
    }

    default:
      return {
        ok: false,
        tool: toolName,
        error: 'unknown_tool',
        message: `No tool registered for ${toolName}`,
        caller: callerInfo(auth),
      };
  }
}
