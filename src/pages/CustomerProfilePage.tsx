import { useEffect, useState } from 'react';
import { supabase, Customer, Order, OrderItem, Product, CustomerCallHistory } from '@/lib/supabase';
import { useLocation, useNavigate } from '@/lib/router';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, Phone, MapPin, Trash2, RotateCcw, PlusCircle, MessageSquare, CreditCard as Edit3, History, User, X } from 'lucide-react';
import Badge from '@/components/Badge';
import Modal from '@/components/Modal';

const STATUS_OPTIONS = [
  { key: 'call_me',     label: 'Call Me',     color: 'cyan'    as const },
  { key: 'not_now',     label: 'Not Now',     color: 'amber'  as const },
  { key: 'pending',     label: 'Pending',     color: 'blue'   as const },
  { key: 'unreachable', label: 'Unreachable', color: 'red'    as const },
];
const STATUS_LABELS: Record<string, string> = {
  call_me: 'Call Me', not_now: 'Not Now', pending: 'Pending', unreachable: 'Unreachable', ordered: 'Ordered',
};
const STATUS_COLORS: Record<string, 'cyan' | 'amber' | 'blue' | 'red' | 'emerald'> = {
  call_me: 'cyan', not_now: 'amber', pending: 'blue', unreachable: 'red', ordered: 'emerald',
};

const RETURN_REASONS = [
  'Customer refused',
  'Wrong address',
  'Phone unreachable',
  'Product damaged',
  'Customer not available',
  'Wrong product delivered',
  'Price issue',
  'Other',
];

interface OrderFormItem { product_id: string; product_name: string; quantity: string; unit_price: string; unit: string }

export default function CustomerProfilePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const id = location.split('/').pop() as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [callHistory, setCallHistory] = useState<CustomerCallHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderModal, setOrderModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [noteModal, setNoteModal] = useState(false);
  const [historyModal, setHistoryModal] = useState(false);
  const [returnModal, setReturnModal] = useState<{ orderId: string; productName: string; quantity: number; amount: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const [orderForm, setOrderForm] = useState({
    delivery_charge: '', discount: '', comment: '',
    courier_company: '',
    items: [{ product_id: '', product_name: '', quantity: '1', unit_price: '', unit: 'kg' }] as OrderFormItem[],
  });
  const [editForm, setEditForm] = useState({ name: '', phone: '', address: '', notes: '' });
  const [note, setNote] = useState('');
  const [returnForm, setReturnForm] = useState({ reason: '', customReason: '' });

  useEffect(() => {
    loadData();
    // Real-time subscriptions
    const custChannel = supabase.channel(`customer-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers', filter: `id=eq.${id}` }, () => loadCustomer())
      .subscribe();
    const ordersChannel = supabase.channel(`orders-cust-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${id}` }, () => loadOrders())
      .subscribe();
    const callChannel = supabase.channel(`call-history-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_call_history', filter: `customer_id=eq.${id}` }, () => loadCallHistory())
      .subscribe();
    return () => {
      supabase.removeChannel(custChannel);
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(callChannel);
    };
  }, [id]);

  async function loadData() {
    setLoading(true);
    await Promise.all([loadCustomer(), loadOrders(), loadCallHistory(), loadProducts()]);
    setLoading(false);
  }

  async function loadCustomer() {
    const { data } = await supabase.from('customers').select('*').eq('id', id).maybeSingle();
    setCustomer(data as Customer);
  }

  async function loadOrders() {
    const { data } = await supabase.from('orders').select('*, order_items(*)').eq('customer_id', id).order('created_at', { ascending: false });
    setOrders((data as Order[]) ?? []);
  }

  async function loadCallHistory() {
    const { data } = await supabase.from('customer_call_history').select('*').eq('customer_id', id).order('changed_at', { ascending: false });
    setCallHistory((data as CustomerCallHistory[]) ?? []);
  }

  async function loadProducts() {
    const { data } = await supabase.from('products').select('*').order('name');
    setProducts((data as Product[]) ?? []);
  }

  async function updateStatus(status: string) {
    if (!customer) return;
    const oldStatus = customer.status;
    // Optimistic: update local state instantly
    setCustomer(prev => prev ? { ...prev, status: status as Customer['status'] } : prev);
    await supabase.from('customers').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    await supabase.from('customer_call_history').insert({
      customer_id: id,
      customer_name: customer.name,
      old_status: oldStatus,
      new_status: status,
      changed_by: profile?.name ?? '',
    });
    if (['unreachable', 'pending', 'not_now'].includes(status)) {
      await supabase.from('call_reports').insert({
        customer_id: id, customer_name: customer.name, phone: customer.phone, status, note: '',
      });
    }
  }

  async function saveNote() {
    await supabase.from('customers').update({ notes: note, updated_at: new Date().toISOString() }).eq('id', id);
    setNoteModal(false);
  }

  async function saveEdit() {
    await supabase.from('customers').update({
      name: editForm.name.trim(),
      phone: editForm.phone.trim(),
      address: editForm.address.trim(),
      notes: editForm.notes,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    setEditModal(false);
  }

  async function createOrder() {
    if (!customer) return;
    setSaving(true);
    const items = orderForm.items.filter(i => i.product_name.trim() && parseFloat(i.quantity) > 0);
    if (!items.length) { setSaving(false); return; }

    const totalWeight = items.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0);
    const totalItemsAmount = items.reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0), 0);
    const delivery = parseFloat(orderForm.delivery_charge) || 0;
    const discount = parseFloat(orderForm.discount) || 0;
    const totalAmount = totalItemsAmount + delivery - discount;

    const { data: order, error } = await supabase.from('orders').insert({
      customer_id: id,
      status: 'confirmed',
      total_weight: totalWeight,
      total_amount: totalAmount,
      delivery_charge: delivery,
      discount: discount,
      comment: orderForm.comment,
      courier_company: orderForm.courier_company,
      confirmed_at: new Date().toISOString(),
      created_by_name: profile?.name ?? '',
      created_by_source: profile?.role ?? 'staff',
    }).select().maybeSingle();

    if (!error && order) {
      const newOrder = {
        ...order as Order,
        order_items: items.map(i => ({
          id: crypto.randomUUID(),
          order_id: order.id,
          product_id: i.product_id || null,
          product_name: i.product_name,
          quantity: parseFloat(i.quantity),
          unit: i.unit,
          unit_price: parseFloat(i.unit_price) || 0,
          total_price: (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0),
          created_at: new Date().toISOString(),
        })) as OrderItem[],
      };
      setOrders(prev => [newOrder, ...prev]);
      setCustomer(prev => prev ? { ...prev, status: 'ordered', last_order_date: new Date().toISOString().slice(0, 10), last_order_amount: totalAmount, last_order_weight: totalWeight, last_order_product: items[0].product_name } : prev);
      await supabase.from('order_items').insert(
        items.map(i => ({
          order_id: order.id,
          product_id: i.product_id || null,
          product_name: i.product_name,
          quantity: parseFloat(i.quantity),
          unit: i.unit,
          unit_price: parseFloat(i.unit_price) || 0,
          total_price: (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0),
        }))
      );
      await supabase.from('call_reports').insert({
        customer_id: id, customer_name: customer.name, phone: customer.phone, status: 'ordered', note: orderForm.comment,
      });
      await supabase.from('customer_call_history').insert({
        customer_id: id, customer_name: customer.name, old_status: customer.status, new_status: 'ordered',
        note: 'Order confirmed', changed_by: profile?.name ?? '',
      });
      await supabase.from('customers').update({
        status: 'ordered',
        last_order_date: new Date().toISOString().slice(0, 10),
        last_order_amount: totalAmount,
        last_order_weight: totalWeight,
        last_order_product: items[0].product_name,
        updated_at: new Date().toISOString(),
      }).eq('id', id);
    }

    setSaving(false);
    setOrderModal(false);
    setOrderForm({ delivery_charge: '', discount: '', comment: '', courier_company: '', items: [{ product_id: '', product_name: '', quantity: '1', unit_price: '', unit: 'kg' }] });
  }

  async function deleteOrder(orderId: string) {
    if (!confirm('Delete this order?')) return;
    setOrders(prev => prev.filter(o => o.id !== orderId));
    await supabase.from('orders').delete().eq('id', orderId);
  }

  async function returnOrder() {
    if (!customer || !returnModal) return;
    setSaving(true);
    const reason = returnForm.reason === 'Other' ? returnForm.customReason : returnForm.reason;
    const finalReason = reason || returnForm.reason;
    // Optimistic: instantly move the order to returned status in local state
    setOrders(prev => prev.map(o => o.id === returnModal.orderId ? { ...o, status: 'returned' as const } : o));
    setReturnModal(null);
    setReturnForm({ reason: '', customReason: '' });
    await supabase.from('returned_parcels').insert({
      order_id: returnModal.orderId,
      customer_id: id,
      customer_name: customer.name,
      phone: customer.phone,
      product_name: returnModal.productName,
      quantity: returnModal.quantity,
      amount: returnModal.amount,
      reason: finalReason,
    });
    await supabase.from('orders').update({ status: 'returned' }).eq('id', returnModal.orderId);
    setSaving(false);
  }

  function addItem() {
    setOrderForm(p => ({ ...p, items: [...p.items, { product_id: '', product_name: '', quantity: '1', unit_price: '', unit: 'kg' }] }));
  }
  function removeItem(i: number) {
    setOrderForm(p => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));
  }
  function updateItem(i: number, field: keyof OrderFormItem, value: string) {
    setOrderForm(p => {
      const items = [...p.items];
      if (field === 'product_id') {
        const prod = products.find(p => p.id === value);
        items[i] = { ...items[i], product_id: value, product_name: prod?.name ?? '', unit_price: String(prod?.sell_price ?? ''), unit: prod?.unit ?? 'kg' };
      } else {
        items[i] = { ...items[i], [field]: value };
      }
      return { ...p, items };
    });
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!customer) return (
    <div className="p-6 text-slate-400">Customer not found. <button onClick={() => navigate('/customers')} className="text-emerald-400 underline">Go back</button></div>
  );

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Back + Header */}
      <div>
        <button onClick={() => navigate('/customers')} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Customers
        </button>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-400 font-bold text-xl">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{customer.name}</h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <div className="flex items-center gap-1.5 text-slate-400 text-sm"><Phone className="w-3.5 h-3.5" /> {customer.phone}</div>
                {customer.address && <div className="flex items-center gap-1.5 text-slate-400 text-sm"><MapPin className="w-3.5 h-3.5" /> {customer.address}</div>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setEditForm({ name: customer.name, phone: customer.phone, address: customer.address, notes: customer.notes }); setEditModal(true); }} className="flex items-center gap-2 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl border border-white/10 transition-colors">
              <Edit3 className="w-4 h-4" /> Edit Profile
            </button>
            <button onClick={() => { setNote(customer.notes ?? ''); setNoteModal(true); }} className="flex items-center gap-2 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl border border-white/10 transition-colors">
              <MessageSquare className="w-4 h-4" /> Notes
            </button>
            <button onClick={() => setHistoryModal(true)} className="flex items-center gap-2 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl border border-white/10 transition-colors">
              <History className="w-4 h-4" /> History
            </button>
          </div>
        </div>
      </div>

      {/* Current status badge */}
      <div className="flex items-center gap-2">
        <span className="text-slate-400 text-sm">Current status:</span>
        <Badge label={STATUS_LABELS[customer.status] ?? customer.status} color={STATUS_COLORS[customer.status] ?? 'slate'} />
      </div>

      {/* Quick status buttons */}
      <div>
        <p className="text-slate-400 text-sm font-medium mb-2">Quick Status Change</p>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map(opt => {
            const active = customer.status === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => updateStatus(opt.key)}
                disabled={active}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                  active
                    ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20 cursor-default'
                    : 'bg-slate-800 text-slate-300 border-white/10 hover:bg-slate-700 hover:border-white/20'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Last Order', value: customer.last_order_date ?? 'None' },
          { label: 'Last Product', value: customer.last_order_product ?? '-' },
          { label: 'Last Amount', value: customer.last_order_amount ? `৳${customer.last_order_amount.toLocaleString()}` : '-' },
          { label: 'Last Weight', value: customer.last_order_weight ? `${customer.last_order_weight} kg` : '-' },
        ].map(item => (
          <div key={item.label} className="bg-slate-900 border border-white/5 rounded-xl p-4">
            <p className="text-slate-500 text-xs">{item.label}</p>
            <p className="text-white text-sm font-medium mt-1">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Notes preview */}
      {customer.notes && (
        <div className="bg-slate-900 border border-white/5 rounded-2xl p-5">
          <p className="text-slate-400 text-sm font-medium mb-1">Notes</p>
          <p className="text-slate-300 text-sm">{customer.notes}</p>
        </div>
      )}

      {/* New Order button */}
      <div>
        <button onClick={() => setOrderModal(true)} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white text-sm px-4 py-2.5 rounded-xl transition-colors shadow-lg shadow-emerald-500/20">
          <PlusCircle className="w-4 h-4" /> New Order
        </button>
      </div>

      {/* Orders */}
      <div>
        <h2 className="text-white font-semibold mb-3">Order History ({orders.length})</h2>
        {orders.length === 0 ? (
          <div className="bg-slate-900 border border-white/5 rounded-2xl p-8 text-center">
            <p className="text-slate-500 text-sm">No orders yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map(order => (
              <div key={order.id} className="bg-slate-900 border border-white/5 rounded-2xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${
                        order.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        order.status === 'delivered' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                        order.status === 'returned'  ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                        'bg-slate-500/10 text-slate-400 border-slate-500/20'
                      }`}>{order.status}</span>
                      <span className="text-slate-500 text-xs">{new Date(order.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-emerald-400 font-semibold">৳{order.total_amount.toLocaleString()}</p>
                    <p className="text-slate-400 text-xs mt-0.5">{order.total_weight} kg · Delivery: ৳{order.delivery_charge} · Discount: ৳{order.discount}</p>
                    {order.created_by_name && (
                      <p className="text-slate-500 text-xs mt-0.5">Created by: {order.created_by_name} ({order.created_by_source})</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setReturnModal({
                          orderId: order.id,
                          productName: (order.order_items ?? []).map(i => i.product_name).join(', '),
                          quantity: order.total_weight,
                          amount: order.total_amount,
                        });
                        setReturnForm({ reason: '', customReason: '' });
                      }}
                      className="flex items-center gap-1.5 text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 px-3 py-1.5 rounded-lg border border-amber-500/20 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Return
                    </button>
                    <button onClick={() => deleteOrder(order.id)} className="text-slate-600 hover:text-red-400 transition-colors p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {(order.order_items ?? []).length > 0 && (
                  <div className="space-y-1.5 pt-3 border-t border-white/5">
                    {(order.order_items ?? []).map((item: OrderItem) => (
                      <div key={item.id} className="flex items-center justify-between text-sm">
                        <span className="text-slate-300">{item.product_name}</span>
                        <span className="text-slate-400">{item.quantity} {item.unit} × ৳{item.unit_price} = <span className="text-white font-medium">৳{item.total_price.toLocaleString()}</span></span>
                      </div>
                    ))}
                  </div>
                )}
                {order.comment && (
                  <div className="flex items-start gap-2 mt-3 pt-3 border-t border-white/5">
                    <MessageSquare className="w-3.5 h-3.5 text-slate-500 mt-0.5 flex-shrink-0" />
                    <p className="text-slate-500 text-xs">{order.comment}</p>
                  </div>
                )}
                {order.courier_tracking_id && (
                  <p className="text-slate-500 text-xs mt-2">{order.courier_company && `${order.courier_company} · `}{order.courier_tracking_id}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Order Modal */}
      <Modal open={orderModal} onClose={() => setOrderModal(false)} title="Create New Order" size="lg">
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-slate-300 text-sm font-medium">Products</p>
              <button onClick={addItem} className="text-emerald-400 text-xs hover:text-emerald-300 flex items-center gap-1 transition-colors">
                <PlusCircle className="w-3.5 h-3.5" /> Add Item
              </button>
            </div>
            <div className="space-y-2">
              {orderForm.items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    <select value={item.product_id} onChange={e => updateItem(i, 'product_id', e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50">
                      <option value="">Select product</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <input value={item.product_name} onChange={e => updateItem(i, 'product_name', e.target.value)} placeholder="Product name" className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50" />
                  </div>
                  <div className="col-span-2">
                    <input type="number" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} placeholder="Qty" className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50" />
                  </div>
                  <div className="col-span-2">
                    <input type="number" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)} placeholder="Price" className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50" />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {orderForm.items.length > 1 && (
                      <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-300 p-1"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-300 mb-1.5">Delivery Charge (৳)</label>
              <input type="number" value={orderForm.delivery_charge} onChange={e => setOrderForm(p => ({ ...p, delivery_charge: e.target.value }))} placeholder="0" className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1.5">Discount (৳)</label>
              <input type="number" value={orderForm.discount} onChange={e => setOrderForm(p => ({ ...p, discount: e.target.value }))} placeholder="0" className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Courier Company</label>
            <select value={orderForm.courier_company} onChange={e => setOrderForm(p => ({ ...p, courier_company: e.target.value }))} className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
              <option value="">Select company...</option>
              {['Steadfast','RedX','Sundarban','Pathao','eCourier','Other'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Comment</label>
            <textarea value={orderForm.comment} onChange={e => setOrderForm(p => ({ ...p, comment: e.target.value }))} rows={2} className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none" />
          </div>
          {orderForm.items.some(i => parseFloat(i.quantity) > 0 && parseFloat(i.unit_price) > 0) && (
            <div className="bg-slate-800 rounded-xl p-3 text-sm">
              <div className="flex justify-between text-slate-300"><span>Subtotal</span><span>৳{orderForm.items.reduce((s, i) => s + (parseFloat(i.quantity)||0)*(parseFloat(i.unit_price)||0), 0).toLocaleString()}</span></div>
              <div className="flex justify-between text-emerald-400 font-semibold mt-1"><span>Total</span><span>৳{(orderForm.items.reduce((s,i)=>s+(parseFloat(i.quantity)||0)*(parseFloat(i.unit_price)||0),0)+(parseFloat(orderForm.delivery_charge)||0)-(parseFloat(orderForm.discount)||0)).toLocaleString()}</span></div>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setOrderModal(false)} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">Cancel</button>
            <button onClick={createOrder} disabled={saving} className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors">
              {saving ? 'Creating...' : 'Confirm Order'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="Edit Customer Profile" size="md">
        <div className="space-y-4">
          {(['name', 'phone', 'address'] as const).map(f => (
            <div key={f}>
              <label className="block text-sm text-slate-300 mb-1.5 capitalize">{f}</label>
              <input value={editForm[f]} onChange={e => setEditForm(p => ({ ...p, [f]: e.target.value }))} className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
            </div>
          ))}
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Notes</label>
            <textarea value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} rows={3} className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setEditModal(false)} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">Cancel</button>
            <button onClick={saveEdit} className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-sm font-medium transition-colors">Save Changes</button>
          </div>
        </div>
      </Modal>

      {/* Return Modal */}
      <Modal open={!!returnModal} onClose={() => setReturnModal(null)} title="Return Parcel" size="sm">
        {returnModal && (
          <div className="space-y-4">
            <div className="bg-slate-800 rounded-xl p-3 text-sm">
              <p className="text-white font-medium">{returnModal.productName}</p>
              <p className="text-slate-400 text-xs mt-0.5">{returnModal.quantity} kg · ৳{returnModal.amount.toLocaleString()}</p>
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1.5">Reason</label>
              <select value={returnForm.reason} onChange={e => setReturnForm(p => ({ ...p, reason: e.target.value }))} className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
                <option value="">Select a reason...</option>
                {RETURN_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {returnForm.reason === 'Other' && (
              <div>
                <label className="block text-sm text-slate-300 mb-1.5">Custom Reason</label>
                <input value={returnForm.customReason} onChange={e => setReturnForm(p => ({ ...p, customReason: e.target.value }))} placeholder="Type the reason..." className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setReturnModal(null)} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">Cancel</button>
              <button onClick={returnOrder} disabled={saving} className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors">
                {saving ? 'Saving...' : 'Done'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Note Modal */}
      <Modal open={noteModal} onClose={() => setNoteModal(false)} title="Edit Notes" size="sm">
        <div className="space-y-4">
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={4} className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none" />
          <div className="flex gap-3">
            <button onClick={() => setNoteModal(false)} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">Cancel</button>
            <button onClick={saveNote} className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-sm font-medium transition-colors">Save</button>
          </div>
        </div>
      </Modal>

      {/* Call History Modal */}
      <Modal open={historyModal} onClose={() => setHistoryModal(false)} title="Status Change History" size="md">
        {callHistory.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-6">No status changes recorded</p>
        ) : (
          <div className="space-y-2">
            {callHistory.map(h => (
              <div key={h.id} className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    {h.old_status && <Badge label={STATUS_LABELS[h.old_status] ?? h.old_status} color={STATUS_COLORS[h.old_status] ?? 'slate'} />}
                    <span className="text-slate-500 text-xs">→</span>
                    <Badge label={STATUS_LABELS[h.new_status] ?? h.new_status} color={STATUS_COLORS[h.new_status] ?? 'slate'} />
                  </div>
                  {h.note && <p className="text-slate-500 text-xs mt-1">{h.note}</p>}
                  {h.changed_by && <p className="text-slate-600 text-xs mt-0.5">by {h.changed_by}</p>}
                </div>
                <p className="text-slate-500 text-xs whitespace-nowrap">{new Date(h.changed_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
