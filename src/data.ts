export type Product = {
  id: string;
  name: string;
  category: string;
  stock: number;
  reorderThreshold: number;
  unitPrice: number;
  unit: string;
};

export const catalog: Product[] = [
  {
    id: 'TR-9-PRO',
    name: 'Pro Basketballs (TR-9 Trail Pack)',
    category: 'basketball',
    stock: 247,
    reorderThreshold: 50,
    unitPrice: 45,
    unit: 'ball',
  },
  {
    id: 'BB-STD',
    name: 'Standard Basketballs',
    category: 'basketball',
    stock: 89,
    reorderThreshold: 30,
    unitPrice: 25,
    unit: 'ball',
  },
  {
    id: 'HOOP-REG',
    name: 'Regulation Hoops',
    category: 'court',
    stock: 12,
    reorderThreshold: 5,
    unitPrice: 350,
    unit: 'hoop',
  },
  {
    id: 'CONE-20',
    name: 'Training Cones (20-pack)',
    category: 'training',
    stock: 340,
    reorderThreshold: 80,
    unitPrice: 30,
    unit: 'set',
  },
  {
    id: 'UNI-TEAM',
    name: 'Team Uniforms',
    category: 'apparel',
    stock: 56,
    reorderThreshold: 20,
    unitPrice: 85,
    unit: 'set',
  },
  {
    id: 'FLOOR-PNL',
    name: 'Court Flooring Panels',
    category: 'court',
    stock: 8,
    reorderThreshold: 4,
    unitPrice: 1200,
    unit: 'panel',
  },
  {
    id: 'JR-10',
    name: 'Jump Ropes (10-pack)',
    category: 'training',
    stock: 120,
    reorderThreshold: 40,
    unitPrice: 18,
    unit: 'pack',
  },
  {
    id: 'WL-001',
    name: 'Whistles & Lanyards',
    category: 'training',
    stock: 200,
    reorderThreshold: 50,
    unitPrice: 8,
    unit: 'unit',
  },
];

export type Order = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  customer: string;
  createdAt: string;
  createdBy: string;
};

export type DistributorOrder = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  status: 'submitted' | 'approved' | 'fulfilled';
  createdAt: string;
  createdBy: string;
};

export const orders: Order[] = [];
export const distributorOrders: DistributorOrder[] = [];

export function findProduct(productId: string): Product | undefined {
  const id = productId.toUpperCase();
  return catalog.find((p) => p.id.toUpperCase() === id);
}

export function nextOrderId(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}
