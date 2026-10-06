export interface PaymentRequest {
  orderNumber: string;
  amount: number;
  currency: string;
  customerId: string;
}

export interface PaymentResult {
  status: 'PAID' | 'PENDING' | 'FAILED';
  reference?: string;
}

export interface PaymentProvider {
  readonly name: string;
  charge(request: PaymentRequest): Promise<PaymentResult>;
}

const providers = new Map<string, PaymentProvider>();

// Cash on delivery needs no external provider; the order is created unpaid and collected on delivery.
export const CASH_ON_DELIVERY = 'CASH_ON_DELIVERY';

export function registerPaymentProvider(method: string, provider: PaymentProvider) {
  providers.set(method, provider);
}

export function getPaymentProvider(method: string): PaymentProvider | null {
  return providers.get(method) ?? null;
}

export function isPaymentMethodAvailable(method: string): boolean {
  return method === CASH_ON_DELIVERY || providers.has(method);
}

export function availablePaymentMethods(): string[] {
  return [CASH_ON_DELIVERY, ...providers.keys()];
}
