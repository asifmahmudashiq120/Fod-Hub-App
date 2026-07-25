import { useEffect, useState } from 'react';
import { supabase, Order, MonthlyTarget, ReturnedParcel } from '@/lib/supabase';
import {
  TrendingUp, TrendingDown, Package, RotateCcw,
  ShoppingCart, Settings, CheckCircle, X, Calendar
} from 'lucide-react';
import Modal from '@/components/Modal';
import { useNavigate } from '@/lib/router';

const MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];

interface DailySale { date: string; amount: number; weight: number; count: number }

export default function DashboardPage() {
  const navigate = useNavigate();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [orders, setOrders] = useState<Order[]>([]);
  const [target, setTarget] = useState<MonthlyTarget | null>(null);
  const [returned, setReturned] = useState<ReturnedParcel[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetModal, setTargetModal] = useState(false);
  const [targetKg, setTargetKg] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [returnDetail, setReturnDetail] = useState<ReturnedParcel | null>(null);

  useEffect(() => { loadData(); }, [year, month]);

  useEffect(() => {
    // Real-time: refresh when orders or returned_parcels change
    const ordersChannel = supabase.channel('dashboard-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadData())
      .subscribe();
    const returnedChannel = supabase.channel('dashboard-returned')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'returned_parcels' }, () => loadData())
      .subscribe();
    const targetChannel = supabase.channel('dashboard-target')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monthly_targets' }, () => loadData())
      .subscribe();
    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(returnedChannel);
      supabase.removeChannel(targetChannel);
    };
  }, [year, month]);

  async function loadData() {
    setLoading(true);
    const from = `${year}-${String(month).padStart(2,'0')}-01`;
    const to   = `${year}-${String(month).padStart(2,'0')}-31`;

    // Paginate orders in chunks of 1000 to bypass Supabase's default row cap
    const allOrders: Order[] = [];
    let oFrom = 0;
    while (true) {
      const { data: page } = await supabase.from('orders')
        .select('*, order_items(*)')
        .gte('created_at', from)
        .lte('created_at', to + 'T23:59:59')
        .in('status', ['confirmed','delivered'])
        .order('created_at', { ascending: false })
        .range(oFrom, oFrom + 999);
      if (!page || page.length === 0) break;
      allOrders.push(...(page as Order[]));
      if (page.length < 1000) break;
      oFrom += 1000;
    }

    const allReturned: ReturnedParcel[] = [];
    let rFrom = 0;
    while (true) {
      const { data: rPage } = await supabase.from('returned_parcels')
        .select('*')
        .gte('returned_at', from)
        .lte('returned_at', to + 'T23:59:59')
        .order('returned_at', { ascending: false })
        .range(rFrom, rFrom + 999);
      if (!rPage || rPage.length === 0) break;
      allReturned.push(...(rPage as ReturnedParcel[]));
      if (rPage.length < 1000) break;
      rFrom += 1000;
    }

    const targetRes = await supabase.from('monthly_targets')
      .select('*')
      .eq('year', year)
      .eq('month', month)
      .maybeSingle();

    setOrders(allOrders);
    setTarget(targetRes.data);
    setReturned(allReturned);
    if (targetRes.data) {
      setTargetKg(String(targetRes.data.target_kg));
      setTargetAmount(String(targetRes.data.target_amount));
    } else {
      setTargetKg('');
      setTargetAmount('');
    }
    setLoading(false);
  }

  async function saveTarget() {
    setSaving(true);
    if (target) {
      await supabase.from('monthly_targets').update({
        target_kg: parseFloat(targetKg) || 0,
        target_amount: parseFloat(targetAmount) || 0,
      }).eq('id', target.id);
    } else {
      await supabase.from('monthly_targets').insert({
        year, month,
        target_kg: parseFloat(targetKg) || 0,
        target_amount: parseFloat(targetAmount) || 0,
      });
    }
    setSaving(false);
    setTargetModal(false);
  }

  const totalSoldKg = orders.reduce((s, o) => s + (o.total_weight ?? 0), 0);
  const totalRevenue = orders.reduce((s, o) => s + (o.total_amount ?? 0), 0);
  const targetKgNum = target?.target_kg ?? 0;
  const targetAmtNum = target?.target_amount ?? 0;
  const kgDiff = totalSoldKg - targetKgNum;
  const isAhead = kgDiff >= 0;

  // Daily grouped data
  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyMap: Record<string, DailySale> = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    dailyMap[key] = { date: key, amount: 0, weight: 0, count: 0 };
  }
  orders.forEach(o => {
    const key = o.created_at.slice(0, 10);
    if (dailyMap[key]) {
      dailyMap[key].amount += o.total_amount ?? 0;
      dailyMap[key].weight += o.total_weight ?? 0;
      dailyMap[key].count += 1;
    }
  });
  const dailySales = Object.values(dailyMap);
  const maxAmount = Math.max(...dailySales.map(d => d.amount), 1);

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  // Product summary
  const productSummary: Record<string, { weight: number; amount: number; count: number }> = {};
  orders.forEach(o => {
    (o.order_items ?? []).forEach((item: { product_name: string; quantity: number; total_price: number }) => {
      if (!productSummary[item.product_name]) productSummary[item.product_name] = { weight: 0, amount: 0, count: 0 };
      productSummary[item.product_name].weight += item.quantity;
      productSummary[item.product_name].amount += item.total_price;
      productSummary[item.product_name].count += 1;
    });
  });

  const summaryTotals = Object.values(productSummary).reduce((acc, s) => {
    acc.weight += s.weight;
    acc.amount += s.amount;
    acc.count += s.count;
    return acc;
  }, { weight: 0, amount: 0, count: 0 });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">Overview of your business performance</p>
        </div>
        <div className="flex items-center gap-3">
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
      ) : (
        <>
          {/* Section 1: Monthly Target */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-semibold text-lg">Monthly Target — {MONTHS[month - 1]} {year}</h2>
              <button onClick={() => setTargetModal(true)} className="flex items-center gap-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg border border-white/10 transition-colors">
                <Settings className="w-3.5 h-3.5" /> Set Target
              </button>
            </div>

            <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl mb-4 border ${
              isAhead ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'
            }`}>
              {isAhead ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
              <span className="font-semibold">
                {isAhead ? 'AHEAD' : 'BEHIND'} by {Math.abs(kgDiff).toFixed(1)} kg
                {targetAmtNum > 0 && ` · ৳${Math.abs(totalRevenue - targetAmtNum).toLocaleString()} revenue`}
              </span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-white/5 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-slate-400 text-sm font-medium">Total Sold (kg)</p>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center border bg-emerald-500/10 text-emerald-400 border-emerald-500/20"><Package className="w-4 h-4" /></div>
                </div>
                <p className="text-2xl font-bold text-white">{totalSoldKg.toFixed(1)} kg</p>
                <p className="text-slate-500 text-xs mt-1">Target: {targetKgNum} kg</p>
              </div>
              <div className="bg-slate-900 border border-white/5 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-slate-400 text-sm font-medium">Revenue</p>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center border bg-blue-500/10 text-blue-400 border-blue-500/20"><ShoppingCart className="w-4 h-4" /></div>
                </div>
                <p className="text-2xl font-bold text-white">৳{totalRevenue.toLocaleString()}</p>
                <p className="text-slate-500 text-xs mt-1">Target: ৳{targetAmtNum.toLocaleString()}</p>
              </div>
              <div className="bg-slate-900 border border-white/5 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-slate-400 text-sm font-medium">Total Orders</p>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center border bg-cyan-500/10 text-cyan-400 border-cyan-500/20"><CheckCircle className="w-4 h-4" /></div>
                </div>
                <p className="text-2xl font-bold text-white">{orders.length}</p>
              </div>
              <div className="bg-slate-900 border border-white/5 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-slate-400 text-sm font-medium">Returned</p>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center border bg-amber-500/10 text-amber-400 border-amber-500/20"><RotateCcw className="w-4 h-4" /></div>
                </div>
                <p className="text-2xl font-bold text-white">{returned.length}</p>
              </div>
            </div>
          </section>

          {/* Section 2: Returned Parcels — clickable */}
          <section>
            <h2 className="text-white font-semibold text-lg mb-3">Returned Parcels</h2>
            {returned.length === 0 ? (
              <div className="bg-slate-900 border border-white/5 rounded-2xl p-8 text-center">
                <RotateCcw className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">No returned parcels this month</p>
              </div>
            ) : (
              <div className="bg-slate-900 border border-white/5 rounded-2xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/5">
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
                    {returned.map(r => (
                      <tr
                        key={r.id}
                        onClick={() => setReturnDetail(r)}
                        className="hover:bg-white/2 transition-colors cursor-pointer"
                      >
                        <td className="px-5 py-3 text-white text-sm">{r.customer_name}</td>
                        <td className="px-5 py-3 text-slate-400 text-sm">{r.phone}</td>
                        <td className="px-5 py-3 text-slate-300 text-sm">{r.product_name}</td>
                        <td className="px-5 py-3 text-slate-300 text-sm text-right">{r.quantity}</td>
                        <td className="px-5 py-3 text-slate-300 text-sm text-right">৳{r.amount.toLocaleString()}</td>
                        <td className="px-5 py-3 text-slate-500 text-sm">{r.reason || '-'}</td>
                        <td className="px-5 py-3 text-slate-500 text-sm">{new Date(r.returned_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Section 3: Vertical Bar Chart */}
          <section>
            <h2 className="text-white font-semibold text-lg mb-3">Daily Sales Chart</h2>
            <div className="bg-slate-900 border border-white/5 rounded-2xl p-5">
              <div className="flex items-end gap-1 h-56">
                {dailySales.map(d => {
                  const heightPct = maxAmount > 0 ? (d.amount / maxAmount) * 100 : 0;
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                      {/* Tooltip */}
                      {d.count > 0 && (
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-700 text-white text-xs rounded-lg px-2 py-1 whitespace-nowrap z-10 pointer-events-none">
                          Day {parseInt(d.date.slice(8))}: ৳{d.amount.toLocaleString()} ({d.weight.toFixed(1)}kg)
                        </div>
                      )}
                      <div className="w-full flex items-end justify-center" style={{ height: '180px' }}>
                        <div
                          className={`w-full rounded-t-sm transition-all duration-200 ${d.count > 0 ? 'bg-gradient-to-t from-emerald-600 to-emerald-400 hover:from-emerald-500 hover:to-emerald-300' : 'bg-slate-800'}`}
                          style={{ height: `${Math.max(heightPct, d.count > 0 ? 3 : 1)}%` }}
                        />
                      </div>
                      <span className="text-slate-600 text-xs">{parseInt(d.date.slice(8)) % 5 === 0 || parseInt(d.date.slice(8)) === 1 ? parseInt(d.date.slice(8)) : ''}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                <p className="text-slate-500 text-xs">Hover over bars to see daily details</p>
                <p className="text-slate-400 text-sm font-medium">Total: ৳{totalRevenue.toLocaleString()} · {totalSoldKg.toFixed(1)} kg</p>
              </div>
            </div>
          </section>

          {/* Section 4: Date-wise Sales Breakdown */}
          <section>
            <h2 className="text-white font-semibold text-lg mb-3">Date-wise Sales Breakdown</h2>
            {orders.length === 0 ? (
              <div className="bg-slate-900 border border-white/5 rounded-2xl p-8 text-center">
                <Calendar className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">No sales data for this month</p>
              </div>
            ) : (
              <div className="bg-slate-900 border border-white/5 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="text-left text-slate-400 text-xs font-medium px-5 py-3">Date</th>
                        <th className="text-right text-slate-400 text-xs font-medium px-5 py-3">Orders</th>
                        <th className="text-right text-slate-400 text-xs font-medium px-5 py-3">Quantity</th>
                        <th className="text-right text-slate-400 text-xs font-medium px-5 py-3">KG</th>
                        <th className="text-right text-slate-400 text-xs font-medium px-5 py-3">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {dailySales.filter(d => d.count > 0).map(d => {
                        const dayQty = orders
                          .filter(o => o.created_at.slice(0, 10) === d.date)
                          .reduce((s, o) => s + (o.order_items ?? []).reduce((q, i) => q + i.quantity, 0), 0);
                        return (
                          <tr key={d.date} className="hover:bg-white/2">
                            <td className="px-5 py-3 text-white text-sm font-medium">{new Date(d.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                            <td className="px-5 py-3 text-slate-300 text-sm text-right">{d.count}</td>
                            <td className="px-5 py-3 text-slate-300 text-sm text-right">{dayQty.toFixed(1)}</td>
                            <td className="px-5 py-3 text-slate-300 text-sm text-right">{d.weight.toFixed(1)} kg</td>
                            <td className="px-5 py-3 text-emerald-400 text-sm text-right font-medium">৳{d.amount.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-emerald-500/30 bg-emerald-500/5">
                        <td className="px-5 py-3 text-emerald-400 text-sm font-bold underline">TOTAL</td>
                        <td className="px-5 py-3 text-white text-sm text-right font-bold underline">{orders.length}</td>
                        <td className="px-5 py-3 text-white text-sm text-right font-bold underline">{orders.reduce((s, o) => s + (o.order_items ?? []).reduce((q, i) => q + i.quantity, 0), 0).toFixed(1)}</td>
                        <td className="px-5 py-3 text-white text-sm text-right font-bold underline">{totalSoldKg.toFixed(1)} kg</td>
                        <td className="px-5 py-3 text-emerald-400 text-sm text-right font-bold underline">৳{totalRevenue.toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* Section 5: Product Summary with footer totals */}
          <section>
            <h2 className="text-white font-semibold text-lg mb-3">Monthly Product Summary</h2>
            {Object.keys(productSummary).length === 0 ? (
              <div className="bg-slate-900 border border-white/5 rounded-2xl p-8 text-center">
                <Package className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">No sales data for this month</p>
              </div>
            ) : (
              <div className="bg-slate-900 border border-white/5 rounded-2xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="text-left text-slate-400 text-xs font-medium px-5 py-3">Product</th>
                      <th className="text-right text-slate-400 text-xs font-medium px-5 py-3">Quantity</th>
                      <th className="text-right text-slate-400 text-xs font-medium px-5 py-3">KG</th>
                      <th className="text-right text-slate-400 text-xs font-medium px-5 py-3">Orders</th>
                      <th className="text-right text-slate-400 text-xs font-medium px-5 py-3">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {Object.entries(productSummary).map(([name, s]) => (
                      <tr key={name} className="hover:bg-white/2">
                        <td className="px-5 py-3 text-white text-sm font-medium">{name}</td>
                        <td className="px-5 py-3 text-slate-300 text-sm text-right">{s.weight.toFixed(1)}</td>
                        <td className="px-5 py-3 text-slate-300 text-sm text-right">{s.weight.toFixed(1)} kg</td>
                        <td className="px-5 py-3 text-slate-300 text-sm text-right">{s.count}</td>
                        <td className="px-5 py-3 text-emerald-400 text-sm text-right font-medium">৳{s.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-emerald-500/20 bg-emerald-500/5">
                      <td className="px-5 py-3 text-emerald-400 text-sm font-bold">TOTAL</td>
                      <td className="px-5 py-3 text-white text-sm text-right font-bold">{summaryTotals.weight.toFixed(1)}</td>
                      <td className="px-5 py-3 text-white text-sm text-right font-bold">{summaryTotals.weight.toFixed(1)} kg</td>
                      <td className="px-5 py-3 text-white text-sm text-right font-bold">{summaryTotals.count}</td>
                      <td className="px-5 py-3 text-emerald-400 text-sm text-right font-bold">৳{summaryTotals.amount.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* Target Modal */}
      <Modal open={targetModal} onClose={() => setTargetModal(false)} title={`Set Target — ${MONTHS[month-1]} ${year}`} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Target (kg)</label>
            <input type="number" value={targetKg} onChange={e => setTargetKg(e.target.value)} placeholder="e.g. 500" className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Target Amount (৳)</label>
            <input type="number" value={targetAmount} onChange={e => setTargetAmount(e.target.value)} placeholder="e.g. 50000" className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setTargetModal(false)} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">Cancel</button>
            <button onClick={saveTarget} disabled={saving} className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors">
              {saving ? 'Saving...' : 'Save Target'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Return Detail Modal */}
      <Modal open={!!returnDetail} onClose={() => setReturnDetail(null)} title="Returned Parcel Details" size="sm">
        {returnDetail && (
          <div className="space-y-3">
            {[
              { label: 'Customer', value: returnDetail.customer_name },
              { label: 'Phone', value: returnDetail.phone },
              { label: 'Product', value: returnDetail.product_name },
              { label: 'Quantity', value: String(returnDetail.quantity) },
              { label: 'Amount', value: `৳${returnDetail.amount.toLocaleString()}` },
              { label: 'Reason', value: returnDetail.reason || 'No reason given' },
              { label: 'Date', value: new Date(returnDetail.returned_at).toLocaleString() },
            ].map(item => (
              <div key={item.label} className="flex justify-between items-center bg-slate-800 rounded-xl px-4 py-2.5">
                <span className="text-slate-400 text-sm">{item.label}</span>
                <span className="text-white text-sm font-medium">{item.value}</span>
              </div>
            ))}
            {returnDetail.customer_id && (
              <button onClick={() => { navigate(`/customers/${returnDetail.customer_id}`); setReturnDetail(null); }} className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-sm font-medium transition-colors mt-2">
                View Customer Profile
              </button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
