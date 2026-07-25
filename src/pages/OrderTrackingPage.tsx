import { useState } from 'react';
import { supabase, Order } from '@/lib/supabase';
import { MapPin, Search, Package2, CheckCircle2, RotateCcw, Clock } from 'lucide-react';

export default function OrderTrackingPage() {
  const [trackingId, setTrackingId] = useState('');
  const [order, setOrder] = useState<(Order & { customers?: { name: string; phone: string; address: string } }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function search() {
    if (!trackingId.trim()) return;
    setLoading(true);
    setSearched(true);
    const { data } = await supabase
      .from('orders')
      .select('*, customers(name, phone, address), order_items(*)')
      .ilike('courier_tracking_id', `%${trackingId.trim()}%`)
      .maybeSingle();
    setOrder(data as (Order & { customers?: { name: string; phone: string; address: string } }) | null);
    setLoading(false);
  }

  const steps = [
    { key: 'pending',   label: 'Order Placed',  icon: Clock },
    { key: 'confirmed', label: 'Confirmed',      icon: Package2 },
    { key: 'delivered', label: 'Delivered',      icon: CheckCircle2 },
  ];

  const stepIndex = order
    ? order.status === 'returned'   ? -1
    : order.status === 'delivered'  ? 2
    : order.status === 'confirmed'  ? 1
    : 0
    : -1;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Order Tracking</h1>
        <p className="text-slate-400 text-sm mt-1">Track your order by courier tracking ID</p>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
          <input
            type="text"
            value={trackingId}
            onChange={e => setTrackingId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="Enter tracking ID..."
            className="w-full pl-11 pr-4 py-3 bg-slate-900 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          />
        </div>
        <button
          onClick={search}
          disabled={loading || !trackingId.trim()}
          className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-medium rounded-xl transition-colors"
        >
          {loading ? '...' : 'Track'}
        </button>
      </div>

      {searched && (
        loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !order ? (
          <div className="bg-slate-900 border border-white/5 rounded-2xl p-12 text-center">
            <Search className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500">No order found with this tracking ID</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Status stepper */}
            <div className="bg-slate-900 border border-white/5 rounded-2xl p-6">
              {order.status === 'returned' ? (
                <div className="flex items-center gap-3 text-red-400">
                  <RotateCcw className="w-6 h-6" />
                  <div>
                    <p className="font-semibold text-lg">Parcel Returned</p>
                    <p className="text-red-400/70 text-sm">This parcel has been returned to sender</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-0">
                  {steps.map((step, i) => {
                    const Icon = step.icon;
                    const active = i === stepIndex;
                    const done   = i < stepIndex;
                    return (
                      <div key={step.key} className="flex items-center flex-1">
                        <div className="flex flex-col items-center gap-2">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                            active ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400' :
                            done   ? 'border-emerald-500 bg-emerald-500 text-white' :
                            'border-slate-700 bg-slate-800 text-slate-600'
                          }`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <p className={`text-xs font-medium ${active || done ? 'text-white' : 'text-slate-600'}`}>{step.label}</p>
                        </div>
                        {i < steps.length - 1 && (
                          <div className={`flex-1 h-0.5 mx-2 mb-5 ${done ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Order details */}
            <div className="bg-slate-900 border border-white/5 rounded-2xl p-5 grid grid-cols-2 gap-4">
              <div>
                <p className="text-slate-500 text-xs">Customer</p>
                <p className="text-white text-sm font-medium mt-0.5">{order.customers?.name ?? '-'}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Phone</p>
                <p className="text-white text-sm font-medium mt-0.5">{order.customers?.phone ?? '-'}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Address</p>
                <p className="text-white text-sm mt-0.5">{order.customers?.address ?? '-'}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Courier</p>
                <p className="text-white text-sm font-medium mt-0.5">{order.courier_name || '-'}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Tracking ID</p>
                <p className="text-emerald-400 text-sm font-mono mt-0.5">{order.courier_tracking_id || '-'}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Order Date</p>
                <p className="text-white text-sm mt-0.5">{new Date(order.created_at).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Total Amount</p>
                <p className="text-emerald-400 text-lg font-bold mt-0.5">৳{order.total_amount.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Weight</p>
                <p className="text-white text-sm mt-0.5">{order.total_weight} kg</p>
              </div>
            </div>

            {/* Items */}
            {(order.order_items ?? []).length > 0 && (
              <div className="bg-slate-900 border border-white/5 rounded-2xl p-5">
                <p className="text-slate-400 text-sm font-medium mb-3">Order Items</p>
                <div className="space-y-2">
                  {(order.order_items ?? []).map((item: { id: string; product_name: string; quantity: number; unit: string; unit_price: number; total_price: number }) => (
                    <div key={item.id} className="flex items-center justify-between">
                      <span className="text-slate-300 text-sm">{item.product_name}</span>
                      <span className="text-slate-400 text-sm">{item.quantity} {item.unit} × ৳{item.unit_price} = <span className="text-white font-medium">৳{item.total_price.toLocaleString()}</span></span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
