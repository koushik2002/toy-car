export type Condition = 'New' | 'Pre-owned' | 'Card damaged';
export type OrderStatus =
  | 'Placed'
  | 'Confirmed'
  | 'Packed'
  | 'Shipped'
  | 'Out for delivery'
  | 'Delivered'
  | 'Cancelled'
  | 'Return requested'
  | 'Refunded';
export interface Product {
  id: string;
  sku: string;
  name: string;
  brand: string;
  series: string;
  scale: string;
  condition: Condition;
  price: number;
  mrp: number;
  stock: number;
  threshold: number;
  rare: boolean;
  image: string;
  color: string;
  description: string;
  arrival: number;
  sold: number;
  offer?: string;
}
export interface Address {
  id: string;
  name: string;
  phone: string;
  line: string;
  city: string;
  state: string;
  pin: string;
}
export interface User {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: 'customer' | 'admin';
  addresses: Address[];
}
export interface CartItem {
  productId: string;
  quantity: number;
}
export interface OrderItem {
  productId: string;
  name: string;
  sku: string;
  price: number;
  quantity: number;
  image: string;
}
export interface TimelineEvent {
  status: OrderStatus;
  at: string;
  note?: string;
}
export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  gst: number;
  status: OrderStatus;
  at: string;
  deliveredAt?: string;
  address: Address;
  payment: 'WhatsApp' | 'COD';
  gstRate?: number;
  billing?: Pick<CommerceSettings, 'sellerName' | 'sellerAddress' | 'gstin'>;
  paid: boolean;
  timeline: TimelineEvent[];
  tracking?: string;
  courier?: string;
  returnReason?: string;
  returnPhoto?: string;
  stockRestored?: boolean;
}
export interface Movement {
  id: string;
  productId: string;
  sku: string;
  before: number;
  after: number;
  reason: string;
  who: string;
  at: string;
}
export interface SyncJob {
  id: string;
  type: 'Sales Voucher' | 'Stock Adjustment' | 'Stock Pull';
  reference: string;
  productId?: string;
  stock?: number;
  snapshot?: Record<string, number>;
  status: 'pending' | 'success' | 'failed';
  attempts: number;
  error?: string;
  at: string;
  nextAt: number;
}
export interface Coupon {
  code: string;
  percent: number;
  min: number;
  enabled: boolean;
}
export interface Offer {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  rule?: 'bundle' | 'b2g1';
}
export interface CommerceSettings {
  whatsappNumber: string;
  sellerName: string;
  sellerAddress: string;
  gstEnabled: boolean;
  gstRate: number;
  gstin: string;
}
export interface BillLine {
  name: string;
  sku: string;
  quantity: number;
  price: number;
  hsn?: string;
}
export interface Bill {
  id: string;
  orderId?: string;
  at: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  sellerName: string;
  sellerAddress: string;
  gstin: string;
  gstEnabled: boolean;
  gstRate: number;
  items: BillLine[];
  subtotal: number;
  discount: number;
  shipping: number;
  gst: number;
  total: number;
  note: string;
}
export interface State {
  version: number;
  commerce: CommerceSettings;
  bills: Bill[];
  products: Product[];
  users: User[];
  cart: CartItem[];
  wishlist: string[];
  wishlistByUser?: Record<string, string[]>;
  notifications: string[];
  orders: Order[];
  movements: Movement[];
  jobs: SyncJob[];
  coupons: Coupon[];
  offers: Offer[];
  userId: string | null;
  role: 'customer' | 'admin';
  coupon: string;
  tally: {
    offline: boolean;
    failureRate: number;
    autoRetry: boolean;
    stock: Record<string, number>;
    mapping: Record<string, string>;
    lastSync: string | null;
    company: string;
  };
}
