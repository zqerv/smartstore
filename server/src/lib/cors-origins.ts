const PRODUCTION_FRONTEND_ORIGIN = 'https://vayron-store.vercel.app';

export function getCorsOrigins(configuredOrigins: string | undefined, nodeEnv: string | undefined): string[] {
  const origins = (configuredOrigins || (nodeEnv === 'production'
    ? PRODUCTION_FRONTEND_ORIGIN
    : 'http://localhost:5173'))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (nodeEnv === 'production') origins.push(PRODUCTION_FRONTEND_ORIGIN);
  return [...new Set(origins)];
}
