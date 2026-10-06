import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../../utils/errorHandler';
import { success, created, error } from '../../utils/response';
import {
  authenticate,
  hasStoreAccess,
  requireRole,
} from '../../middleware/auth';
import { db } from '../../services/_db';
import { realtime } from '../../lib/realtime';

const router = Router();

const tableCreateSchema = z
  .object({
    number: z.string().trim().min(1).max(20),
    label: z.string().trim().max(80).nullable().optional(),
  })
  .strict();

const tableUpdateSchema = z
  .object({
    number: z.string().trim().min(1).max(20).optional(),
    label: z.string().trim().max(80).nullable().optional(),
    isActive: z.boolean().optional(),
    regenerateQr: z.boolean().optional(),
  })
  .strict();

const changeTableSchema = z
  .object({
    tableId: z.string().cuid(),
  })
  .strict();

router.get(
  '/stores/:storeId/tables',
  authenticate,
  requireRole(
    'PLATFORM_ADMIN',
    'STORE_OWNER',
    'STORE_ADMIN',
    'STAFF'
  ),
  asyncHandler(async (req: Request, res: Response) => {
    if (
      !req.user ||
      !(await hasStoreAccess(req.user, req.params.storeId))
    ) {
      return error(res, 'Access denied', 403);
    }

    const page = Number(req.query.page);

    const limit = Math.min(
      Math.max(Number(req.query.limit) || 10, 1),
      100
    );

    const where = {
      storeId: req.params.storeId,
    };

    if (Number.isInteger(page) && page > 0) {
      const [tables, total] = await Promise.all([
        db.storeTable.findMany({
          where,
          orderBy: {
            number: 'asc',
          },
          skip: (page - 1) * limit,
          take: limit,
        }),

        db.storeTable.count({
          where,
        }),
      ]);

      return success(res, {
        tables,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    }

    const tables = await db.storeTable.findMany({
      where,
      orderBy: {
        number: 'asc',
      },
    });

    return success(res, {
      tables,
    });
  })
);

router.post(
  '/stores/:storeId/tables',
  authenticate,
  requireRole(
    'PLATFORM_ADMIN',
    'STORE_OWNER',
    'STORE_ADMIN'
  ),
  asyncHandler(async (req: Request, res: Response) => {
    if (
      !req.user ||
      !(await hasStoreAccess(req.user, req.params.storeId))
    ) {
      return error(res, 'Access denied', 403);
    }

    const input = tableCreateSchema.parse(req.body);

    const exists = await db.storeTable.findUnique({
      where: {
        storeId_number: {
          storeId: req.params.storeId,
          number: input.number,
        },
      },
      select: {
        id: true,
      },
    });

    if (exists) {
      throw new AppError(
        'A table with this number already exists',
        409
      );
    }

    const table = await db.storeTable.create({
      data: {
        storeId: req.params.storeId,
        number: input.number,
        label: input.label ?? null,
      },
    });

    return created(res, table);
  })
);

async function loadManagedTable(
  req: Request,
  res: Response
) {
  const table = await db.storeTable.findUnique({
    where: {
      id: req.params.tableId,
    },
  });

  if (!table) {
    error(res, 'Table not found', 404);
    return null;
  }

  if (
    !req.user ||
    !(await hasStoreAccess(req.user, table.storeId))
  ) {
    error(res, 'Access denied', 403);
    return null;
  }

  return table;
}

router.put(
  '/tables/:tableId',
  authenticate,
  requireRole(
    'PLATFORM_ADMIN',
    'STORE_OWNER',
    'STORE_ADMIN'
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const table = await loadManagedTable(req, res);

    if (!table) return;

    const {
      regenerateQr,
      ...input
    } = tableUpdateSchema.parse(req.body);

    if (
      input.number &&
      input.number !== table.number
    ) {
      const clash = await db.storeTable.findUnique({
        where: {
          storeId_number: {
            storeId: table.storeId,
            number: input.number,
          },
        },
        select: {
          id: true,
        },
      });

      if (clash) {
        throw new AppError(
          'A table with this number already exists',
          409
        );
      }
    }

    const updated = await db.storeTable.update({
      where: {
        id: table.id,
      },
      data: {
        ...input,
        ...(regenerateQr
          ? {
              qrCode: `${table.id}-${Date.now().toString(36)}`,
            }
          : {}),
      },
    });

    return success(res, updated);
  })
);

// Tables are archived rather than deleted so existing order history keeps its reference.
router.delete(
  '/tables/:tableId',
  authenticate,
  requireRole(
    'PLATFORM_ADMIN',
    'STORE_OWNER',
    'STORE_ADMIN'
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const table = await loadManagedTable(req, res);

    if (!table) return;

    const archived = await db.storeTable.update({
      where: {
        id: table.id,
      },
      data: {
        isActive: false,
      },
    });

    return success(res, archived);
  })
);

// Public lookup used when a customer scans a table QR code.
router.get(
  '/tables/qr/:qrCode',
  asyncHandler(async (req: Request, res: Response) => {
    const table = await db.storeTable.findUnique({
      where: {
        qrCode: req.params.qrCode,
      },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
          },
        },
      },
    });

    if (
      !table ||
      !table.isActive ||
      table.store.status !== 'ACTIVE'
    ) {
      return error(res, 'Table not found', 404);
    }

    return success(res, {
      table: {
        id: table.id,
        number: table.number,
        label: table.label,
      },
      store: {
        id: table.store.id,
        name: table.store.name,
        slug: table.store.slug,
      },
    });
  })
);

const finalStatuses = [
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
];

router.patch(
  '/orders/:orderId/table',
  authenticate,
  requireRole(
    'CUSTOMER',
    'PLATFORM_ADMIN',
    'STORE_OWNER',
    'STORE_ADMIN',
    'STAFF'
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const { tableId } =
      changeTableSchema.parse(req.body);

    const user = req.user;

    if (!user) {
      return error(
        res,
        'Authentication required',
        401
      );
    }

    const order = await db.order.findUnique({
      where: {
        id: req.params.orderId,
      },
    });

    if (!order) {
      return error(
        res,
        'Order not found',
        404
      );
    }

    if (user.role === 'CUSTOMER') {
      if (
        order.customerId !== user.customerId
      ) {
        return error(
          res,
          'Access denied',
          403
        );
      }
    } else if (
      !(await hasStoreAccess(
        user,
        order.storeId
      ))
    ) {
      return error(
        res,
        'Access denied',
        403
      );
    }

    if (
      finalStatuses.includes(order.status)
    ) {
      throw new AppError(
        `Cannot change the table of a ${order.status} order`,
        409
      );
    }

    const table =
      await db.storeTable.findFirst({
        where: {
          id: tableId,
          storeId: order.storeId,
          isActive: true,
        },
      });

    if (!table) {
      throw new AppError(
        'Table not found in this store',
        404
      );
    }

    const updated =
      await db.$transaction(async (tx) => {
        const result =
          await tx.order.update({
            where: {
              id: order.id,
            },
            data: {
              tableId: table.id,
            },
          });

        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: order.status,
            notes: `Table changed to ${table.number}`,
          },
        });

        return result;
      });

    const update = {
      id: updated.id,
      orderNumber: updated.orderNumber,
      storeId: updated.storeId,
      customerId: updated.customerId,
      status: updated.status,
      tableId: table.id,
      tableNumber: table.number,
    };

    realtime.toStore(
      updated.storeId,
      'order:updated',
      update
    );

    // customerId is nullable for guest orders
    if (updated.customerId) {
      realtime.toCustomer(
        updated.customerId,
        'order:updated',
        update
      );
    }

    return success(res, {
      ...updated,
      table: {
        id: table.id,
        number: table.number,
        label: table.label,
      },
    });
  })
);

export default router;