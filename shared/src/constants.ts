// Shared constants

export const DEFAULT_LOCALE = 'ar-SA';
export const DEFAULT_TIMEZONE = 'Asia/Baghdad';

export const OrderStatusLabels: Record<string, string> = {
  PENDING: 'انتظار',
  CONFIRMED: 'مؤكدة',
  PREPARING: 'جاري التحضير',
  READY: 'جاهزة',
  OUT_FOR_DELIVERY: 'عند الطريق',
  DELIVERED: 'تم التسليم',
  CANCELLED: 'ملغاة',
  RETURN_REQUESTED: 'طلب استرجاع',
  RETURNED: 'متم استرجاعها',
};

export const OrderStatusColors: Record<string, string> = {
  PENDING: 'warning',
  CONFIRMED: 'info',
  PREPARING: 'primary',
  READY: 'info',
  OUT_FOR_DELIVERY: 'primary',
  DELIVERED: 'success',
  CANCELLED: 'destructive',
  RETURN_REQUESTED: 'warning',
  RETURNED: 'default',
};

export const PaymentStatusLabels: Record<string, string> = {
  PENDING: 'معلقة',
  PAID: 'مدفوعة',
  FAILED: 'فشلت',
  REFUNDED: 'مستردة',
  PARTIALLY_REFUNDED: 'مستردة جزئياً',
};

export const PaymentMethodLabels: Record<string, string> = {
  CASH_ON_DELIVERY: 'الدفع عند الاستلام',
  ONLINE_PAYMENT: 'الدفع الإلكتروني',
  POS: 'نقطة البيع',
  WAREHOUSE: 'المخزن',
};

export const UserRoleLabels: Record<string, string> = {
  PLATFORM_ADMIN: 'مسؤول المنصة',
  STORE_OWNER: 'مالك المتجر',
  STORE_ADMIN: 'مسؤول المتجر',
  STAFF: 'موظف',
  CUSTOMER: 'عميل',
};

export const PaginationConfig = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

export const OrderStatusHistoryLabels: Record<string, string> = {
  PENDING: 'مطلوب',
  CONFIRMED: 'تم التأكيد',
  PREPARING: 'جاري التحضير',
  READY: 'جاهزة',
  OUT_FOR_DELIVERY: 'عند الطريق',
  DELIVERED: 'تم التسليم',
  CANCELLED: 'ملغاة',
};

export const CustomerPreferences = {
  DEFAULT_LANGUAGE: 'ar-SA',
  ALLOWED_LANGUAGES: ['ar-SA', 'en-US', 'fr-FR', 'de-DE'],
} as const;

export const MediaTypes = {
  IMAGE: 'image',
  VIDEO: 'video',
  DOCUMENT: 'document',
  AUDIO: 'audio',
} as const;

export const CURRENCY_SYMBOLS = {
  IQD: 'د.ع',
  USD: '$',
  EUR: '€',
  AED: 'د.إ',
  KWD: 'د.ك',
} as const;

// Socket event names
export const SocketEvents = {
  // Order events
  ORDER_CREATED: 'order:created',
  ORDER_UPDATED: 'order:updated',
  ORDER_STATUS_CHANGED: 'order:status_changed',
  
  // Cart events
  CART_UPDATED: 'cart:updated',
  
  // Admin events
  NEW_ORDER: 'new_order',
  ORDER_STATUS_UPDATE: 'order_status_update',
} as const;