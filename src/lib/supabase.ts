import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type UserRole = 'admin' | 'staff';

export interface UserProfile {
  id: string;
  name: string;
  role: UserRole;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  status: 'call_me' | 'not_now' | 'pending' | 'unreachable' | 'ordered';
  last_order_date: string | null;
  last_order_amount: number | null;
  last_order_weight: number | null;
  last_order_product: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  category_id: string | null;
  cost_price: number;
  sell_price: number;
  unit: string;
  total_stock: number;
  created_at: string;
  updated_at: string;
  product_categories?: ProductCategory;
}

export interface StockHistory {
  id: string;
  product_id: string;
  quantity_added: number;
  note: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  customer_id: string;
  status: 'pending' | 'confirmed' | 'delivered' | 'returned' | 'cancelled';
  total_amount: number;
  total_weight: number;
  delivery_charge: number;
  discount: number;
  comment: string;
  courier_tracking_id: string;
  courier_name: string;
  courier_company: string;
  created_by_name: string;
  created_by_source: 'admin' | 'staff' | 'customer';
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  delivered_at: string | null;
  customers?: Customer;
  order_items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  created_at: string;
}

export interface CallReport {
  id: string;
  customer_id: string | null;
  customer_name: string;
  phone: string;
  status: 'unreachable' | 'pending' | 'not_now' | 'ordered';
  note: string;
  called_at: string;
}

export interface MonthlyTarget {
  id: string;
  year: number;
  month: number;
  target_kg: number;
  target_amount: number;
}

export interface ReturnedParcel {
  id: string;
  order_id: string | null;
  customer_id: string | null;
  customer_name: string;
  phone: string;
  product_name: string;
  quantity: number;
  amount: number;
  reason: string;
  returned_at: string;
}

export interface CustomerCallHistory {
  id: string;
  customer_id: string | null;
  customer_name: string;
  old_status: string | null;
  new_status: string;
  note: string;
  changed_by: string;
  changed_at: string;
}
