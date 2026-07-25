import { useEffect, useState } from 'react';
import { supabase, Order } from '@/lib/supabase';
import { CheckSquare, Calendar, Package, Truck } from 'lucide-react';
import { useNavigate } from '@/lib/router';
import Modal from '@/components/Modal';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function ConfirmedOrdersPage() {
  const navigate = useNavigate();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [orders, setOrders] = useState<(Order & { customers?: { name: string; phone: string } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [courierModal, setCourierModal] = useState<string | null>(null);
  const [courierForm, setCourierForm] = useState({ courier_name: '', courier_tracking_id: '', courier_company: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
    const channel = supabase.channel('confirmed-orders-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [year, month]);

  async function loadData() {
    setLoading(true);
    const from = `${year}-${String(month).padStart(2,'0')}-01`;
    const to   = `${year}-${String(month).padStart(2,'0')}-31`;
    const { data } = await supabase
      .from('orders')
      .select('*, customers(name, phone), order_items(*)')
      .in('status', ['confirmed', 'delivered'])
      .gte('created_at', from)
      .lte('created_at', to + 'T23:59:59')
      .order('created_at', { ascending: false });
    setOrders((data ?? []) as (Order & { customers?: { name: string; phone: string } })[]);
    setLoading(false);
  }

  async function saveCourier() {
    if (!courierModal) return;
    setSaving(true);
    await supabase.from('orders').update({
      courier_name: courierForm.courier_name,
      courier_tracking_id: courierForm.courier_tracking_id,
      courier_company: courierForm.courier_company,
      status: 'delivered',
      delivered_at: new Date().toISOString(),
    }).eq('id', courierModal);
    setSaving(false);
    setCourierModal(null);
    setCourierForm({ courier_name: '', courier_tracking_id: '', courier_company: '' });
    loadData();
  }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  const totalAmount = orders.reduce((s, o) => s + o.total_amount, 0);
  const totalWeight = orders.reduce((s, o) => s + o.total_weight, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Confirmed Orders</h1>
          <p className="text-slate-400 text-sm mt-1">{orders.length} orders · ৳{totalAmount.toLocaleString()} · {totalWeight.toFixed(1)} kg</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={month} onChange={e => setMonth(+e.target.value)} className="bg-slate-800 border border-white/10 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(+e.target.value)} className="bg-slate-800 border border-white/10 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-slate-900 border border-white/5 rounded-2xl p-12 text-center">
          <CheckSquare className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500">No confirmed orders for this period</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-white/5 rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5 bg-slate-800/30">
                <th className="text-left text-slate-400 text-xs font-medium px-5 py-3">Customer</th>
                <th className="text-left text-slate-400 text-xs font-medium px-5 py-3">Products</th>
                <th className="text-right text-slate-400 text-xs font-medium px-5 py-3">Weight</th>
                <th className="text-right text-slate-400 text-xs font-medium px-5 py-3">Amount</th>
                <th className="text-left text-slate-400 text-xs font-medium px-5 py-3">Status</th>
                <th className="text-left text-slate-400 text-xs font-medium px-5 py-3">Date</th>
                <th className="text-left text-slate-400 text-xs font-medium px-5 py-3">Created By</th>
                <th className="text-right text-slate-400 text-xs font-medium px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {orders.map(order => (
                <tr key={order.id} className="hover:bg-white/2 transition-colors">
                  <td className="px-5 py-3">
                    <button onClick={() => navigate(`/customers/${order.customer_id}`)} className="text-left">
                      <p className="text-white text-sm font-medium hover:text-emerald-400 transition-colors">{order.customers?.name ?? '-'}</p>
                      <p className="text-slate-500 text-xs">{order.customers?.phone ?? '-'}</p>
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-slate-300 text-xs">{(order.order_items ?? []).map((i: { product_name: string }) => i.product_name).join(', ') || '-'}</p>
                  </td>
                  <td className="px-5 py-3 text-slate-300 text-sm text-right">{order.total_weight} kg</td>
                  <td className="px-5 py-3 text-emerald-400 text-sm text-right font-medium">৳{order.total_amount.toLocaleString()}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${
                      order.status === 'delivered' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    }`}>{order.status}</span>
                  </td>
                  <td className="px-5 py-3 text-slate-500 text-xs">{new Date(order.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-slate-400 text-xs">{order.created_by_name && `${order.created_by_name} (${order.created_by_source})`}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => { setCourierModal(order.id); setCourierForm({ courier_name: order.courier_name, courier_tracking_id: order.courier_tracking_id, courier_company: order.courier_company }); }}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1 justify-end"
                    >
                      <Truck className="w-3.5 h-3.5" /> Courier
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Courier Modal */}
      <Modal open={!!courierModal} onClose={() => setCourierModal(null)} title="Add Courier Details" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Courier Company</label>
            <select value={courierForm.courier_company} onChange={e => setCourierForm(p => ({ ...p, courier_company: e.target.value }))} className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
              <option value="">Select company...</option>
              {['Steadfast','RedX','Sundarban','Pathao','eCourier','Other'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Courier Name</label>
            <input value={courierForm.courier_name} onChange={e => setCourierForm(p => ({ ...p, courier_name: e.target.value }))} placeholder="e.g. Pathao, Redx" className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Tracking ID</label>
            <input value={courierForm.courier_tracking_id} onChange={e => setCourierForm(p => ({ ...p, courier_tracking_id: e.target.value }))} placeholder="Tracking number" className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setCourierModal(null)} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">Cancel</button>
            <button onClick={saveCourier} disabled={saving} className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors">
              {saving ? 'Saving...' : 'Save & Mark Delivered'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
