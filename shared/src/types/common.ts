// Common types and interfaces shared across the application

export enum UserRole {
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',
  STORE_OWNER = 'STORE_OWNER',
  STORE_ADMIN = 'STORE_ADMIN',
  STAFF = 'STAFF',
  CUSTOMER = 'CUSTOMER',
}

// Geo Location Type
export interface GeoLocation {
  latitude: number;
  longitude: number;
  address?: string;
  city?: string;
  country?: string;
}

// Language/Translation Content
export type LanguageContent = {
  ar: string;
  en: string;
  fr?: string;
  de?: string;
};

export type SupportedLocale = 'ar-SA' | 'en-US' | 'fr-FR' | 'de-DE';

// Pagination and filtering
export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface FilterParams {
  search?: string;
  categoryId?: string | string[];
  status?: string;
  inStock?: boolean;
  minPrice?: number;
  maxPrice?: number;
}

// Audit/Activity Log
export interface ActivityLog {
  id: string;
  userId: string;
  action: string;
  entity?: string;
  entityId?: string;
  details?: Record<string, any>;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
}

// Generic API Response
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: Array<{ path: string; message: string; code?: string }>;
  code?: string;
  message?: string;
}

// File Upload
export interface UploadedFile {
  filename: string;
  originalName: string;
  path: string;
  size: number;
  mimetype: string;
  url: string;
}

// API Version Info
export interface APIInfo {
  name: string;
  version: string;
  status: 'Operational' | 'Degraded' | 'Down';
  uptime: number;
  environment: string;
  features?: Record<string, string>;
}

// Request/Response metadata
export interface ApiResponseMetadata {
  requestId: string;
  timestamp: number;
  latency?: number;
}

// Rate Limit Info
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}

// Cache metadata
export interface CacheMetadata {
  key: string;
  value: any;
  ttl: number;
  createdAt: number;
  updatedAt: number;
}

// Entities
export interface Address {
  id: string;
  customerId: string;
  customerName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  district?: string;
  building?: string;
  floor?: string;
  apartment?: string;
  postalCode?: string;
  geoLocation?: GeoLocation;
  isDefault?: boolean;
}

export interface OrderAddress {
  customerName: string;
  phone: string;
  street: string;
  city: string;
  district?: string;
  building?: string;
  floor?: string;
  apartment?: string;
  postalCode?: string;
  geoLocation?: GeoLocation;
}

export interface ProductVariant {
  id: string;
  name: string;
  price: number;
  compareAtPrice?: number;
  stock: number;
  options: Record<string, string>;
  sku?: string;
}

export type Coupon = {
  id: string;
  code: string;
  type: 'PERCENTAGE' | 'FIXED';
  discount: number;
  minValue: number;
  maxDiscount?: number;
  usageLimit?: number;
  usedCount: number;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
};

// Export constants for re-export
export const Ordering = {
  OrderStatusLabels: {
    PENDING: 'انتظار',
    CONFIRMED: 'مؤكدة',
    PREPARING: 'جاري التحضير',
    READY: 'جاهزة',
    OUT_FOR_DELIVERY: 'عند الطريق',
    DELIVERED: 'تم التسليم',
    CANCELLED: 'ملغاة',
  },
  OrderStatusColors: {
    PENDING: 'warning',
    CONFIRMED: 'info',
    PREPARING: 'primary',
    READY: 'info',
    OUT_FOR_DELIVERY: 'primary',
    DELIVERED: 'success',
    CANCELLED: 'destructive',
  },
  PaymentStatusLabels: {
    PENDING: 'معلقة',
    PAID: 'مدفوعة',
    FAILED: 'فشلت',
    REFUNDED: 'مستردة',
  },
  PaymentMethodLabels: {
    CASH_ON_DELIVERY: 'الدفع عند الاستلام',
    ONLINE_PAYMENT: 'الدفع الإلكتروني',
    POS: 'نقطة البيع',
  },
  UserRoleLabels: {
    PLATFORM_ADMIN: 'مسؤول المنصة',
    STORE_OWNER: 'مالك المتجر',
    STORE_ADMIN: 'مسؤول المتجر',
    STAFF: 'موظف',
    CUSTOMER: 'عميل',
  },
  PaginationConfig: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
  },
  OrderStatusHistoryLabels: {
    PENDING: 'مطلوب',
    CONFIRMED: 'تم التأكيد',
    PREPARING: 'جاري التحضير',
    READY: 'جاهزة',
    OUT_FOR_DELIVERY: 'عند الطريق',
    DELIVERED: 'تم التسليم',
    CANCELLED: 'ملغاة',
  },
  CustomerPreferences: {
    DEFAULT_LANGUAGE: 'ar-SA',
    ALLOWED_LANGUAGES: ['ar-SA', 'en-US', 'fr-FR', 'de-DE'],
  },
  MediaTypes: {
    IMAGE: 'image',
    VIDEO: 'video',
    DOCUMENT: 'document',
    AUDIO: 'audio',
  },
  CURRENCY_SYMBOLS: {
    IQD: 'د.ع',
    USD: '$',
    EUR: '€',
    AED: 'د.إ',
    KWD: 'د.ك',
  },
  SocketEvents: {
    ORDER_CREATED: 'order:created',
    ORDER_UPDATED: 'order:updated',
    ORDER_STATUS_CHANGED: 'order:status_changed',
    CART_UPDATED: 'cart:updated',
    NEW_ORDER: 'new_order',
    ORDER_STATUS_UPDATE: 'order_status_update',
  },
};

export const DEFAULT_LOCALE = 'ar-SA';

export const DEFAULT_TIMEZONE = 'Asia/Baghdad';

export const DEFAULT_CURRENCY = 'IQD';

export const DEFAULT_LANGUAGE = 'ar-SA';

export type Price = number;