import { useState } from 'react';
import { supabase, Order, ReturnedParcel } from '@/lib/supabase';
import { Truck, Search, Package2, RotateCcw, CheckCircle2, Building2, XCircle, Phone } from 'lucide-react';

interface CompanyStat {
  company: string;
  total: number;
  delivered: number;
  returned: number;
  cancelled: number;
  successRate: number;
}

const PAGE_SIZE = 1000;

type OrderRow = Order & { customers?: { name: string; phone: string }; order_items?: { product_name: string }[] };

function normalizePhone(p: string): string {
  return p.replace(/[\s\-()]/g, '').replace(/^(\+880|880)/, '0');
}

export default function CourierHistoryPage() {
  const [phone, setPhone] = useState('');
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [returnedParcels, setReturnedParcels] = useState<ReturnedParcel[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function search() {
    const q = phone.trim();
    if (!q) return;
    setLoading(true);
    setSearched(true);
    setOrders([]);
    setReturnedParcels([]);

    const norm = normalizePhone(q);

    // Find matching customers by phone (partial, case-insensitive)
    const { data: customers } = await supabase
      .from('customers')
      .select('id, name, phone')
      .ilike('phone', `%${q}%`);
    const ids = (customers ?? []).map((c: { id: string }) => c.id);

    // Fetch all orders for matched customers (paginated to bypass 1000-row cap)
    const allOrders: OrderRow[] = [];
    if (ids.length > 0) {
      let from = 0;
      while (true) {
        const { data } = await supabase
          .from('orders')
          .select('*, customers(name, phone), order_items(*)')
          .in('customer_id', ids)
          .order('created_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (!data || data.length === 0) break;
        allOrders.push(...(data as OrderRow[]));
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
    }
    setOrders(allOrders);

    // Fetch returned_parcels: by customer_id match OR by phone match (covers parcels
    // logged without a linked customer record). Paginated, no cap.
    const allReturned: ReturnedParcel[] = [];
    if (ids.length > 0) {
      let rFrom = 0;
      while (true) {
        const { data } = await supabase
          .from('returned_parcels')
          .select('*')
          .in('customer_id', ids)
          .order('returned_at', { ascending: false })
          .range(rFrom, rFrom + PAGE_SIZE - 1);
        if (!data || data.length === 0) break;
        allReturned.push(...(data as ReturnedParcel[]));
        if (data.length < PAGE_SIZE) break;
        rFrom += PAGE_SIZE;
      }
    }
    // Also fetch returned_parcels matching the phone directly (may include entries
    // with no customer_id link). Merge, dedup by id.
    const { data: phoneReturns } = await supabase
      .from('returned_parcels')
      .select('*')
      .ilike('phone', `%${q}%`)
      .order('returned_at', { ascending: false });
    const seenIds = new Set(allReturned.map(r => r.id));
    (phoneReturns ?? []).forEach((r: ReturnedParcel) => {
      if (!seenIds.has(r.id)) {
        allReturned.push(r);
        seenIds.add(r.id);
      }
    });
    setReturnedParcels(allReturned);

    setLoading(false);
  }

  // Build a lookup from order_id -> courier_company so we can attribute
  // standalone returned_parcels to the correct courier platform.
  const orderCompanyById = new Map<string, string>();
  orders.forEach(o => {
    if (o.id) orderCompanyById.set(o.id, o.courier_company || o.courier_name || 'Unassigned');
  });

  // Count orders by status
  const delivered = orders.filter(o => o.status === 'delivered').length;
  const returnedFromOrders = orders.filter(o => o.status === 'returned').length;
  const cancelled = orders.filter(o => o.status === 'cancelled').length;
  const totalOrders = orders.length;

  // Returned parcels that are NOT already represented by an order with status='returned'.
  // These are standalone returns (no linked order, or linked order not marked returned).
  const standaloneReturns = returnedParcels.filter(r => {
    if (!r.order_id) return true;
    const linked = orders.find(o => o.id === r.order_id);
    return !linked || linked.status !== 'returned';
  });

  const totalReturned = returnedFromOrders + standaloneReturns.length;
  const total = totalOrders + standaloneReturns.length;
  const successRate = total > 0 ? Math.round((delivered / total) * 100) : 0;
  const returnRate  = total > 0 ? Math.round((totalReturned / total) * 100) : 0;
  const cancelRate  = total > 0 ? Math.round((cancelled / total) * 100) : 0;

  // Company-wise breakdown — from orders, plus standalone returns attributed
  // to their linked order's courier company (or "Unassigned").
  const companyMap: Record<string, CompanyStat> = {};
  orders.forEach(o => {
    const company = o.courier_company || o.courier_name || 'Unassigned';
    if (!companyMap[company]) companyMap[company] = { company, total: 0, delivered: 0, returned: 0, cancelled: 0, successRate: 0 };
    companyMap[company].total += 1;
    if (o.status === 'delivered') companyMap[company].delivered += 1;
    if (o.status === 'returned')  companyMap[company].returned += 1;
    if (o.status === 'cancelled') companyMap[company].cancelled += 1;
  });
  standaloneReturns.forEach(r => {
    const company = (r.order_id && orderCompanyById.get(r.order_id)) || 'Unassigned';
    if (!companyMap[company]) companyMap[company] = { company, total: 0, delivered: 0, returned: 0, cancelled: 0, successRate: 0 };
    companyMap[company].total += 1;
    companyMap[company].returned += 1;
  });
  const companyStats = Object.values(companyMap).map(c => {
    c.successRate = c.total > 0 ? Math.round((c.delivered / c.total) * 100) : 0;
    return c;
  }).sort((a, b) => b.total - a.total);

  const overallSuccess = total > 0 ? Math.round((delivered / total) * 100) : 0;
  const overallCancel  = total > 0 ? Math.round(((totalReturned + cancelled) / total) * 100) : 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Courier History</h1>
        <p className="text-slate-400 text-sm mt-1">Search by phone to view courier history across all companies (Pathao, Steadfast, RedX, etc.)</p>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Truck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
          <input
            type="text"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="Enter phone number..."
            className="w-full pl-11 pr-4 py-3 bg-slate-900 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          />
        </div>
        <button onClick={search} disabled={loading || !phone.trim()} className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-medium rounded-xl transition-colors">
          {loading ? '...' : 'Search'}
        </button>
      </div>

      {searched && !loading && (orders.length > 0 || returnedParcels.length > 0) && (
        <>
          {/* Overall stats */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-slate-900 border border-white/5 rounded-2xl p-5">
              <p className="text-slate-400 text-sm">Total Orders</p>
              <p className="text-2xl font-bold text-white mt-1">{total}</p>
            </div>
            <div className="bg-slate-900 border border-white/5 rounded-2xl p-5">
              <p className="text-slate-400 text-sm">Delivered</p>
              <p className="text-2xl font-bold text-blue-400 mt-1">{delivered}</p>
            </div>
            <div className="bg-slate-900 border border-white/5 rounded-2xl p-5">
              <p className="text-slate-400 text-sm">Returned</p>
              <p className="text-2xl font-bold text-red-400 mt-1">{totalReturned}</p>
              {standaloneReturns.length > 0 && (
                <p className="text-slate-500 text-xs mt-0.5">{standaloneReturns.length} from return log</p>
              )}
            </div>
            <div className="bg-slate-900 border border-white/5 rounded-2xl p-5">
              <p className="text-slate-400 text-sm">Cancelled</p>
              <p className="text-2xl font-bold text-amber-400 mt-1">{cancelled}</p>
            </div>
            <div className="bg-slate-900 border border-white/5 rounded-2xl p-5">
              <p className="text-slate-400 text-sm">Success Rate</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">{successRate}%</p>
              <p className="text-slate-500 text-xs mt-0.5">Return: {returnRate}% · Cancel: {cancelRate}%</p>
            </div>
          </div>

          {/* Company-wise breakdown */}
          {companyStats.length > 0 && (
            <div>
              <h2 className="text-white font-semibold text-lg mb-3 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-400" /> Company-wise Breakdown
              </h2>
              <div className="bg-slate-900 border border-white/5 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/5 bg-slate-800/30">
                        <th className="text-left text-slate-400 text-xs font-medium px-5 py-3">Courier Company</th>
                        <th className="text-right text-slate-400 text-xs font-medium px-5 py-3">Total</th>
                        <th className="text-right text-slate-400 text-xs font-medium px-5 py-3">Delivered</th>
                        <th className="text-right text-slate-400 text-xs font-medium px-5 py-3">Returned</th>
                        <th className="text-right text-slate-400 text-xs font-medium px-5 py-3">Cancelled</th>
                        <th className="text-right text-slate-400 text-xs font-medium px-5 py-3">Success %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {companyStats.map(c => (
                        <tr key={c.company} className="hover:bg-white/2 transition-colors">
                          <td className="px-5 py-3 text-white text-sm font-medium">{c.company}</td>
                          <td className="px-5 py-3 text-slate-300 text-sm text-right">{c.total}</td>
                          <td className="px-5 py-3 text-blue-400 text-sm text-right">{c.delivered}</td>
                          <td className="px-5 py-3 text-red-400 text-sm text-right">{c.returned}</td>
                          <td className="px-5 py-3 text-amber-400 text-sm text-right">{c.cancelled}</td>
                          <td className="px-5 py-3 text-emerald-400 text-sm text-right font-medium">{c.successRate}%</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-emerald-500/20 bg-emerald-500/5">
                        <td className="px-5 py-3 text-emerald-400 text-sm font-bold">OVERALL TOTAL</td>
                        <td className="px-5 py-3 text-white text-sm text-right font-bold">{total}</td>
                        <td className="px-5 py-3 text-white text-sm text-right font-bold">{delivered}</td>
                        <td className="px-5 py-3 text-white text-sm text-right font-bold">{totalReturned}</td>
                        <td className="px-5 py-3 text-white text-sm text-right font-bold">{cancelled}</td>
                        <td className="px-5 py-3 text-emerald-400 text-sm text-right font-bold">
                          {overallSuccess}% success · {overallCancel}% cancel
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Order list */}
      {searched && (
        loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : orders.length === 0 && returnedParcels.length === 0 ? (
          <div className="bg-slate-900 border border-white/5 rounded-2xl p-12 text-center">
            <Search className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500">No orders found for this number</p>
          </div>
        ) : (
          <div className="space-y-6">
            {orders.length > 0 && (
              <div>
                <h2 className="text-white font-semibold text-lg mb-3 flex items-center gap-2">
                  <Package2 className="w-5 h-5 text-emerald-400" /> Orders ({orders.length})
                </h2>
                <div className="bg-slate-900 border border-white/5 rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/5 bg-slate-800/30">
                          <th className="text-left text-slate-400 text-xs font-medium px-5 py-3">Customer</th>
                          <th className="text-left text-slate-400 text-xs font-medium px-5 py-3">Products</th>
                          <th className="text-right text-slate-400 text-xs font-medium px-5 py-3">Amount</th>
                          <th className="text-left text-slate-400 text-xs font-medium px-5 py-3">Courier</th>
                          <th className="text-left text-slate-400 text-xs font-medium px-5 py-3">Tracking</th>
                          <th className="text-left text-slate-400 text-xs font-medium px-5 py-3">Status</th>
                          <th className="text-left text-slate-400 text-xs font-medium px-5 py-3">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {orders.map(o => (
                          <tr key={o.id} className="hover:bg-white/2 transition-colors">
                            <td className="px-5 py-3">
                              <p className="text-white text-sm font-medium">{o.customers?.name ?? '-'}</p>
                              <p className="text-slate-500 text-xs">{o.customers?.phone ?? '-'}</p>
                            </td>
                            <td className="px-5 py-3 text-slate-300 text-xs">
                              {(o.order_items ?? []).map((i: { product_name: string }) => i.product_name).join(', ') || '-'}
                            </td>
                            <td className="px-5 py-3 text-emerald-400 text-sm text-right font-medium">৳{o.total_amount.toLocaleString()}</td>
                            <td className="px-5 py-3 text-slate-400 text-sm">{o.courier_company || o.courier_name || '-'}</td>
                            <td className="px-5 py-3 text-slate-400 text-sm font-mono text-xs">{o.courier_tracking_id || '-'}</td>
                            <td className="px-5 py-3">
                              <span className={`flex items-center gap-1 text-xs font-medium ${
                                o.status === 'delivered' ? 'text-blue-400' :
                                o.status === 'returned'  ? 'text-red-400' :
                                o.status === 'cancelled' ? 'text-amber-400' :
                                o.status === 'confirmed' ? 'text-emerald-400' :
                                'text-slate-400'
                              }`}>
                                {o.status === 'delivered' && <CheckCircle2 className="w-3.5 h-3.5" />}
                                {o.status === 'returned'  && <RotateCcw className="w-3.5 h-3.5" />}
                                {o.status === 'cancelled' && <XCircle className="w-3.5 h-3.5" />}
                                {o.status === 'confirmed' && <Package2 className="w-3.5 h-3.5" />}
                                {o.status}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-slate-500 text-xs">{new Date(o.created_at).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {standaloneReturns.length > 0 && (
              <div>
                <h2 className="text-white font-semibold text-lg mb-3 flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-red-400" /> Returned Parcels Log ({standaloneReturns.length})
                </h2>
                <div className="bg-slate-900 border border-white/5 rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/5 bg-slate-800/30">
                          <th className="text-left text-slate-400 text-xs font-medium px-5 py-3">Customer</th>
                          <th className="text-left text-slate-400 text-xs font-medium px-5 py-3">Phone</th>
                          <th className="text-left text-slate-400 text-xs font-medium px-5 py-3">Product</th>
                          <th className="text-right text-slate-400 text-xs font-medium px-5 py-3">Qty</th>
                          <th className="text-right text-slate-400 text-xs font-medium px-5 py-3">Amount</th>
                          <th className="text-left text-slate-400 text-xs font-medium px-5 py-3">Reason</th>
                          <th className="text-left text-slate-400 text-xs font-medium px-5 py-3">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {standaloneReturns.map(r => (
                          <tr key={r.id} className="hover:bg-white/2 transition-colors">
                            <td className="px-5 py-3 text-white text-sm font-medium">{r.customer_name}</td>
                            <td className="px-5 py-3 text-slate-400 text-xs flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-500" />{r.phone}
                            </td>
                            <td className="px-5 py-3 text-slate-300 text-sm">{r.product_name}</td>
                            <td className="px-5 py-3 text-slate-400 text-sm text-right">{r.quantity}</td>
                            <td className="px-5 py-3 text-red-400 text-sm text-right">৳{Number(r.amount).toLocaleString()}</td>
                            <td className="px-5 py-3 text-slate-500 text-xs">{r.reason || '-'}</td>
                            <td className="px-5 py-3 text-slate-500 text-xs">{new Date(r.returned_at).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}


export default CourierHistoryPage