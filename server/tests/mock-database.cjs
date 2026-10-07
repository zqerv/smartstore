const unavailable = () => {
  throw new Error('Unexpected database access in database-free catalog tests');
};

globalThis.prisma = {
  ...Object.fromEntries(
    ['user', 'store', 'storeAdmin', 'customer', 'customerStore', 'category', 'product', 'productImage']
      .map((model) => [model, Object.fromEntries(
        ['findFirst', 'findFirstOrThrow', 'findUnique', 'findMany', 'count', 'upsert', 'create']
          .map((operation) => [operation, unavailable]),
      )]),
  ),
  $transaction: unavailable,
  $disconnect: async () => {},
};
