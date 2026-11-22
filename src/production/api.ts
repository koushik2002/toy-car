export interface StoreConfig {
  auth: { emailPassword: boolean };
  commerce: { checkoutEnabled: boolean; paymentMode: 'disabled' | 'test' | 'razorpay' };
  catalogue: { publicBrowsing: boolean };
}

export interface CatalogueProduct {
  id: string;
  sku: string;
  name: string;
  brand: string;
  series: string;
  manufactureYear: number | null;
  scale: string;
  condition: string;
  pricePaise: number;
  mrpPaise: number;
  available: number;
  lowStockThreshold: number;
  rare: boolean;
  description: string;
  offer: string | null;
  variantGroup: string;
  variantLabel: string;
  requiresReview?: boolean;
  images: { slot: number; url: string; alt: string }[];
  createdAt: string;
}

export interface CatalogueResult {
  items: CatalogueProduct[];
  nextCursor: string | null;
  total: number;
  facets: {
    brands: string[];
    series: string[];
    scales: string[];
    conditions: string[];
    years: number[];
    offers: string[];
  };
}

/** Menu and filter counts plus the active free-shipping threshold. */
export interface CatalogueOverview {
  brands: { name: string; total: number; series: string[] }[];
  scales: { name: string; total: number }[];
  rareCount: number;
  productCount: number;
  priceRangePaise: { min: number; max: number };
  shipping: { freeAbovePaise: number | null; basePaise: number } | null;
}

export interface CheckoutQuote {
  subtotalPaise: number;
  shippingPaise: number;
  freeShippingApplied: boolean;
  freeAbovePaise: number | null;
  shippingZone: string;
  voucherDiscountPaise: number;
  walletAppliedPaise: number;
  loyaltyAppliedPaise: number;
  discountPaise: number;
  totalPaise: number;
}

export interface Address {
  id: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  isDefault: boolean;
}
export type AddressInput = Omit<Address, 'id' | 'isDefault'> & { isDefault?: boolean };

export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'processing'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'refund_pending'
  | 'refunded';

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  channel: 'online' | 'offline';
  subtotalPaise: number;
  shippingPaise: number;
  taxPaise: number;
  discountPaise: number;
  totalPaise: number;
  createdAt: string;
  paidAt: string | null;
  deliveredAt: string | null;
  courier: string;
  trackingNumber: string;
  customerName: string | null;
  customerEmail: string | null;
  city: string;
  itemCount: number;
  firstItemName: string;
  previewImages: string[];
  latestRequest: { kind: 'cancel' | 'return'; status: 'open' | 'approved' | 'rejected' } | null;
}

export interface OrderRequest {
  id: string;
  kind: 'cancel' | 'return';
  reason: string;
  status: 'open' | 'approved' | 'rejected';
  refundPreference: 'source' | 'store_credit';
  resolutionNote: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface OrderDetail extends OrderSummary {
  address: Partial<{
    recipientName: string;
    phone: string;
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
  }>;
  deliveryRecipient: string;
  voucherDiscountPaise: number;
  walletAppliedPaise: number;
  loyaltyAppliedPaise: number;
  canCancel: boolean;
  canReturn: boolean;
  returnWindowDays: number;
  invoice: { id: string; invoiceNumber: string } | null;
  items: {
    productId: string;
    sku: string;
    name: string;
    brand: string;
    scale: string;
    image: string | null;
    quantity: number;
    unitPricePaise: number;
    lineTotalPaise: number;
  }[];
  timeline: { status: string; note: string; at: string }[];
  requests: OrderRequest[];
}

/** Invoice rows come straight from the database, so their keys are snake_case. */
export interface Invoice {
  id: string;
  invoice_number: string;
  order_id: string | null;
  channel: 'online' | 'offline';
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_address: string;
  payment_method: string;
  note: string;
  subtotal_paise: number;
  shipping_paise: number;
  discount_paise: number;
  tax_paise: number;
  total_paise: number;
  created_at: string;
  settings_snapshot: {
    legalName: string;
    gstin: string | null;
    invoicePrefix: string;
    defaultTaxBps: number;
  };
  corrections: {
    id: string;
    correction_number: string;
    kind: 'note' | 'credit_note' | 'void_notice';
    reason: string;
    amount_paise: number;
    created_by: string;
    created_at: string;
  }[];
  items: {
    product_id: string | null;
    sku: string;
    name: string;
    hsn: string;
    quantity: number;
    unit_price_paise: number;
    line_total_paise: number;
  }[];
}

export interface AccountUser {
  id: string;
  name: string;
  email: string;
  role: 'customer' | 'seller' | 'staff' | 'admin' | 'super_admin';
  emailVerified: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export interface SessionResult {
  user: AccountUser | null;
  csrfToken: string | null;
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...options,
      credentials: 'include',
      headers: { Accept: 'application/json', ...options.headers },
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiError(
      'We could not connect to the shop. Please check your connection and try again.',
      0,
      'CONNECTION_FAILED',
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(
      'The shop could not complete this request. Please try again shortly.',
      response.status,
      'INVALID_RESPONSE',
    );
  }
  if (!response.ok) {
    const body = payload as { error?: { code?: string; message?: string }; requestId?: string };
    throw new ApiError(
      body?.error?.message || 'Something went wrong. Please try again.',
      response.status,
      body?.error?.code || 'REQUEST_FAILED',
      body?.requestId,
    );
  }
  return payload as T;
}

/** Sends a JSON body with the CSRF header that every signed-in change requires. */
export async function send<T>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body: Record<string, unknown> | undefined,
  csrfToken?: string | null,
): Promise<T> {
  const result = await request<T>(path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (path === '/auth/login' || path === '/auth/logout') {
    window.dispatchEvent(new Event('tinykars-session-changed'));
  }
  return result;
}

export function mutate<T>(
  path: string,
  body: Record<string, unknown>,
  csrfToken?: string | null,
): Promise<T> {
  return send<T>('POST', path, body, csrfToken);
}

export function money(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: paise % 100 === 0 ? 0 : 2,
  }).format(paise / 100);
}

export const dateTime = (value: string) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));

export const date = (value: string) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));

export function imageUrl(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  if (value.startsWith('assets/')) return `${import.meta.env.BASE_URL}${value}`;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function catalogueQuery(params: URLSearchParams, limit = 24): string {
  const result = new URLSearchParams();
  const allowed = [
    'q',
    'brand',
    'series',
    'scale',
    'condition',
    'year',
    'minPrice',
    'maxPrice',
    'inStock',
    'rare',
    'offer',
    'sort',
    'cursor',
  ];
  for (const key of allowed) {
    const value = params.get(key);
    if (value) result.set(key, value);
  }
  result.set('limit', String(limit));
  return result.toString();
}

/** Plain-language wording for every order status and timeline event. */
export const statusWords: Record<string, string> = {
  pending_payment: 'Waiting for payment',
  paid: 'Payment confirmed',
  processing: 'Being packed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refund_pending: 'Refund in progress',
  refunded: 'Refunded',
  cancel_requested: 'Cancellation requested',
  return_requested: 'Return requested',
  cancel_approved: 'Cancellation approved',
  cancel_rejected: 'Cancellation declined',
  return_approved: 'Return approved',
  return_rejected: 'Return declined',
};
export const statusLabel = (status: string) => statusWords[status] || status.replaceAll('_', ' ');
