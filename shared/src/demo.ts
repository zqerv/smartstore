export const DEMO_CREDENTIALS = {
  platformAdmin: {
    email: 'admin@smartstore.demo',
    password: 'Admin123!',
  },
  stores: [
    {
      slug: 'demo',
      name: 'SmartStore Demo',
      descriptor: 'General marketplace',
      owner: { email: 'owner@demo.com', password: 'Owner123!' },
    },
    {
      slug: 'veloura',
      name: 'Veloura Parfums',
      descriptor: 'Luxury fragrance',
      owner: { email: 'owner@veloura.demo', password: 'VelouraOwner123!' },
      staff: { email: 'staff@veloura.demo', password: 'VelouraStaff123!' },
    },
    {
      slug: 'maison-elan',
      name: 'Maison Élan',
      descriptor: 'Luxury fashion',
      owner: { email: 'owner@maison-elan.demo', password: 'MaisonOwner123!' },
      staff: { email: 'staff@maison-elan.demo', password: 'MaisonStaff123!' },
    },
  ],
  customer: {
    email: 'customer@demo.com',
    password: 'Customer123!',
  },
} as const;

export type DemoStoreDescriptor = typeof DEMO_CREDENTIALS.stores[number];
