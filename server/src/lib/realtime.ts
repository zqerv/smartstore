import type { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { UserRole } from '@prisma/client';
import { config } from './config';
import { logger } from './logger';
import { verifyToken } from '../middleware/auth';
import { db } from '../services/_db';

let io: Server | null = null;

export const rooms = {
  store: (storeId: string) => `store:${storeId}`,
  storefront: (storeId: string) => `storefront:${storeId}`,
  customer: (customerId: string) => `customer:${customerId}`,
  platform: 'platform',
};

const MERCHANT_ROLES: UserRole[] = [UserRole.STORE_OWNER, UserRole.STORE_ADMIN, UserRole.STAFF];

export function initRealtime(server: HttpServer): Server {
  io = new Server(server, {
    cors: {
      origin: config.corsOrigin.split(',').map((origin) => origin.trim()),
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : '';
    const payload = token ? verifyToken(token) : null;
    if (!payload) {
      next(new Error('Authentication required'));
      return;
    }

    void db.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, storeId: true, isActive: true, tokenVersion: true },
    }).then((user) => {
      if (!user || !user.isActive || user.tokenVersion !== (payload.tokenVersion ?? 0)) {
        next(new Error('Authentication required'));
        return;
      }
      socket.data.user = user;
      next();
    }).catch(() => next(new Error('Authentication failed')));
  });

  io.on('connection', (socket: Socket) => {
    void joinRooms(socket).then(() => {
      socket.emit('realtime:ready', { role: socket.data.user.role });
    }).catch((error) => {
      logger.error('Realtime room join failed', { message: (error as Error).message });
      socket.disconnect(true);
    });
  });

  logger.info('Socket.IO realtime server initialised');
  return io;
}

async function joinRooms(socket: Socket) {
  const user = socket.data.user as { id: string; role: UserRole; storeId: string | null };

  if (user.role === UserRole.PLATFORM_ADMIN) {
    await socket.join(rooms.platform);
    return;
  }

  if (MERCHANT_ROLES.includes(user.role)) {
    const memberships = await db.storeAdmin.findMany({
      where: { userId: user.id },
      select: { storeId: true },
    });
    const storeIds = new Set(memberships.map((membership) => membership.storeId));
    if (user.storeId) storeIds.add(user.storeId);
    await socket.join([...storeIds].map(rooms.store));
    return;
  }

  const memberships = await db.customerStore.findMany({
    where: { userId: user.id },
    select: { storeId: true },
  });
  await socket.join([
    rooms.customer(user.id),
    ...memberships.map((membership) => rooms.storefront(membership.storeId)),
  ]);
}

function emitTo(targets: string[], event: string, payload: unknown) {
  if (!io || targets.length === 0) return;
  let emitter = io.to(targets[0]);
  for (const target of targets.slice(1)) emitter = emitter.to(target);
  emitter.emit(event, payload);
}

export const realtime = {
  toStore(storeId: string, event: string, payload: unknown) {
    emitTo([rooms.store(storeId)], event, payload);
  },
  toStoreAndStorefront(storeId: string, event: string, payload: unknown) {
    emitTo([rooms.store(storeId), rooms.storefront(storeId)], event, payload);
  },
  toCustomer(customerId: string, event: string, payload: unknown) {
    emitTo([rooms.customer(customerId)], event, payload);
  },
  toPlatform(event: string, payload: unknown) {
    emitTo([rooms.platform], event, payload);
  },
};
