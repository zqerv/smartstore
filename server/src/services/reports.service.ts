import { db } from './_db';

const EXCLUDED = ['CANCELLED', 'REFUNDED'];
const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export const reportsService = {
  async storeReport(storeId: string, days: number) {
    const since = new Date(Date.now() - (days - 1) * DAY_MS);
    since.setUTCHours(0, 0, 0, 0);
    const rangeWhere = { storeId, createdAt: { gte: since } };

    const [orders, byStatus, topItems, customers, newCustomers, lowStock, byPayment] = await Promise.all([
      db.order.findMany({ where: rangeWhere, select: { createdAt: true, total: true, status: true } }),
      db.order.groupBy({ by: ['status'], where: rangeWhere, _count: true }),
      db.orderItem.groupBy({
        by: ['productId', 'productNameAr', 'productNameEn'],
        where: { order: { ...rangeWhere, status: { notIn: EXCLUDED } } },
        _sum: { quantity: true, total: true },
        orderBy: { _sum: { total: 'desc' } },
        take: 5,
      }),
      db.customerStore.count({ where: { storeId } }),
      db.customerStore.count({ where: { storeId, createdAt: { gte: since } } }),
      db.product.count({ where: { storeId, status: 'ACTIVE', stock: { lte: 5 } } }),
      db.order.groupBy({ by: ['paymentMethod'], where: { ...rangeWhere, status: { notIn: EXCLUDED } }, _count: true, _sum: { total: true } }),
    ]);

    const daily = new Map<string, { date: string; orders: number; revenue: number }>();
    for (let i = 0; i < days; i += 1) {
      const key = dayKey(new Date(since.getTime() + i * DAY_MS));
      daily.set(key, { date: key, orders: 0, revenue: 0 });
    }
    let revenue = 0;
    let counted = 0;
    for (const order of orders) {
      const bucket = daily.get(dayKey(order.createdAt));
      if (bucket) bucket.orders += 1;
      if (!EXCLUDED.includes(order.status)) {
        const total = Number(order.total);
        revenue += total;
        counted += 1;
        if (bucket) bucket.revenue += total;
      }
    }

    const statusCount = Object.fromEntries(byStatus.map((row) => [row.status, row._count]));
    return {
      range: { days, since: since.toISOString() },
      totals: {
        orders: orders.length,
        pending: statusCount.PENDING ?? 0,
        completed: statusCount.DELIVERED ?? 0,
        cancelled: (statusCount.CANCELLED ?? 0) + (statusCount.REFUNDED ?? 0),
        revenue,
        averageOrderValue: counted ? revenue / counted : 0,
        customers,
        newCustomers,
        lowStockProducts: lowStock,
      },
      ordersByStatus: statusCount,
      salesOverTime: [...daily.values()],
      topProducts: topItems.map((row) => ({
        productId: row.productId,
        nameAr: row.productNameAr,
        nameEn: row.productNameEn,
        quantity: row._sum.quantity ?? 0,
        revenue: Number(row._sum.total ?? 0),
      })),
      paymentMethods: byPayment.map((row) => ({ method: row.paymentMethod, orders: row._count, revenue: Number(row._sum.total ?? 0) })),
    };
  },

  async platformReport(days: number) {
    const since = new Date(Date.now() - (days - 1) * DAY_MS);
    since.setUTCHours(0, 0, 0, 0);
    const [stores, orders, customers] = await Promise.all([
      db.store.findMany({ select: { id: true, name: true, slug: true, status: true } }),
      db.order.groupBy({
        by: ['storeId'],
        where: { createdAt: { gte: since }, status: { notIn: EXCLUDED } },
        _count: true,
        _sum: { total: true },
      }),
      db.customerStore.groupBy({ by: ['storeId'], _count: true }),
    ]);
    const orderMap = new Map(orders.map((row) => [row.storeId, row]));
    const customerMap = new Map(customers.map((row) => [row.storeId, row._count]));
    const storePerformance = stores.map((store) => ({
      ...store,
      orders: orderMap.get(store.id)?._count ?? 0,
      revenue: Number(orderMap.get(store.id)?._sum.total ?? 0),
      customers: customerMap.get(store.id) ?? 0,
    })).sort((a, b) => b.revenue - a.revenue);
    return {
      range: { days, since: since.toISOString() },
      totals: {
        stores: stores.length,
        orders: storePerformance.reduce((sum, row) => sum + row.orders, 0),
        revenue: storePerformance.reduce((sum, row) => sum + row.revenue, 0),
      },
      storePerformance,
    };
  },
};
