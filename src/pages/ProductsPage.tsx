import { useEffect, useState, useRef } from 'react';
import { supabase, Product, ProductCategory, StockHistory } from '@/lib/supabase';
import { PlusCircle, Package, ChevronDown, History, Trash2, Upload, Download } from 'lucide-react';
import Modal from '@/components/Modal';
import { useAuth } from '@/contexts/AuthContext';

export default function ProductsPage() {
  const [products, setProducts] = useState<(Product & { product_categories?: ProductCategory })[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [stockModal, setStockModal] = useState<string | null>(null);
  const [historyModal, setHistoryModal] = useState<string | null>(null);
  const [history, setHistory] = useState<StockHistory[]>([]);
  const [catModal, setCatModal] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { isAdmin } = useAuth();

  const [form, setForm] = useState({ name: '', category_id: '', cost_price: '', sell_price: '', unit: 'kg' });
  const [stockForm, setStockForm] = useState({ quantity: '', note: '' });
  const [catName, setCatName] = useState('');

  useEffect(() => {
    loadData();
    const channel = supabase.channel('products-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_categories' }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function loadData() {
    setLoading(true);
    const [prodRes, catRes] = await Promise.all([
      supabase.from('products').select('*, product_categories(*)').order('name'),
      supabase.from('product_categories').select('*').order('name'),
    ]);
    setProducts((prodRes.data ?? []) as (Product & { product_categories?: ProductCategory })[]);
    setCategories((catRes.data as ProductCategory[]) ?? []);
    setLoading(false);
  }

  async function addProduct() {
    if (!form.name.trim()) return;
    setSaving(true);
    await supabase.from('products').insert({
      name: form.name.trim(),
      category_id: form.category_id || null,
      cost_price: parseFloat(form.cost_price) || 0,
      sell_price: parseFloat(form.sell_price) || 0,
      unit: form.unit,
    });
    setSaving(false);
    setAddModal(false);
    setForm({ name: '', category_id: '', cost_price: '', sell_price: '', unit: 'kg' });
    loadData();
  }

  async function addStock(productId: string) {
    const qty = parseFloat(stockForm.quantity);
    if (!qty) return;
    setSaving(true);
    await Promise.all([
      supabase.from('stock_history').insert({ product_id: productId, quantity_added: qty, note: stockForm.note }),
      supabase.from('products').update({
        total_stock: (products.find(p => p.id === productId)?.total_stock ?? 0) + qty,
        updated_at: new Date().toISOString(),
      }).eq('id', productId),
    ]);
    setSaving(false);
    setStockModal(null);
    setStockForm({ quantity: '', note: '' });
    loadData();
  }

  async function showHistory(productId: string) {
    const { data } = await supabase.from('stock_history').select('*').eq('product_id', productId).order('created_at', { ascending: false });
    setHistory((data as StockHistory[]) ?? []);
    setHistoryModal(productId);
  }

  async function addCategory() {
    if (!catName.trim()) return;
    await supabase.from('product_categories').insert({ name: catName.trim() });
    setCatName('');
    setCatModal(false);
    loadData();
  }

  async function deleteProduct(id: string) {
    if (!confirm('Delete this product?')) return;
    await supabase.from('products').delete().eq('id', id);
    loadData();
  }

  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    const rows = lines.slice(1).map(l => {
      const cols = l.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      return {
        name: cols[0] ?? '',
        cost_price: parseFloat(cols[1]) || 0,
        sell_price: parseFloat(cols[2]) || 0,
        unit: cols[3] || 'kg',
        total_stock: parseFloat(cols[4]) || 0,
      };
    }).filter(r => r.name);
    if (rows.length) {
      await supabase.from('products').insert(rows);
    }
    setImportModal(false);
    loadData();
    if (fileRef.current) fileRef.current.value = '';
  }

  function exportCSV() {
    const rows = [['Name', 'Cost Price', 'Sell Price', 'Unit', 'Stock']];
    products.forEach(p => {
      rows.push([p.name, String(p.cost_price), String(p.sell_price), p.unit, String(p.total_stock)]);
    });
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv]));
    a.download = 'products.csv';
    a.click();
  }

  const byCategory = categories.map(cat => ({
    cat,
    items: products.filter(p => p.category_id === cat.id),
  }));
  const uncategorized = products.filter(p => !p.category_id);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Products & Price List</h1>
          <p className="text-slate-400 text-sm mt-1">{products.length} products across {categories.length} categories</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <button onClick={() => setImportModal(true)} className="flex items-center gap-2 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl border border-white/10 transition-colors">
                <Upload className="w-4 h-4" /> Import
              </button>
              <button onClick={exportCSV} className="flex items-center gap-2 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl border border-white/10 transition-colors">
                <Download className="w-4 h-4" /> Export
              </button>
            </>
          )}
          <button onClick={() => setCatModal(true)} className="flex items-center gap-2 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl border border-white/10 transition-colors">
            + Category
          </button>
          <button onClick={() => setAddModal(true)} className="flex items-center gap-2 text-sm bg-emerald-500 hover:bg-emerald-400 text-white px-3 py-2 rounded-xl transition-colors shadow-lg shadow-emerald-500/20">
            <PlusCircle className="w-4 h-4" /> Add Product
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {[...byCategory, ...(uncategorized.length > 0 ? [{ cat: { id: '__none__', name: 'Uncategorized', created_at: '' }, items: uncategorized }] : [])].map(({ cat, items }) => (
            <div key={cat.id} className="bg-slate-900 border border-white/5 rounded-2xl overflow-hidden">
              <button
                onClick={() => setExpandedCat(expandedCat === cat.id ? null : cat.id)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/2 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Package className="w-4 h-4 text-emerald-400" />
                  <span className="text-white font-semibold">{cat.name}</span>
                  <span className="text-slate-500 text-sm">({items.length})</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedCat === cat.id ? 'rotate-180' : ''}`} />
              </button>

              {(expandedCat === cat.id || expandedCat === null) && items.length > 0 && (
                <div className="border-t border-white/5">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/5 bg-slate-800/30">
                        <th className="text-left text-slate-400 text-xs font-medium px-5 py-2.5">Product</th>
                        <th className="text-right text-slate-400 text-xs font-medium px-5 py-2.5">Cost</th>
                        <th className="text-right text-slate-400 text-xs font-medium px-5 py-2.5">Sell</th>
                        <th className="text-right text-slate-400 text-xs font-medium px-5 py-2.5">Stock</th>
                        <th className="text-right text-slate-400 text-xs font-medium px-5 py-2.5">Unit</th>
                        <th className="text-right text-slate-400 text-xs font-medium px-5 py-2.5">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {items.map(p => (
                        <tr key={p.id} className="hover:bg-white/2 transition-colors">
                          <td className="px-5 py-3 text-white text-sm font-medium">{p.name}</td>
                          <td className="px-5 py-3 text-slate-400 text-sm text-right">৳{p.cost_price.toLocaleString()}</td>
                          <td className="px-5 py-3 text-emerald-400 text-sm text-right font-medium">৳{p.sell_price.toLocaleString()}</td>
                          <td className={`px-5 py-3 text-sm text-right font-medium ${p.total_stock < 5 ? 'text-red-400' : 'text-white'}`}>
                            {p.total_stock.toFixed(2)}
                          </td>
                          <td className="px-5 py-3 text-slate-500 text-sm text-right">{p.unit}</td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => { setStockModal(p.id); setStockForm({ quantity: '', note: '' }); }} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">+ Stock</button>
                              <button onClick={() => showHistory(p.id)} className="text-slate-500 hover:text-slate-300 transition-colors p-1">
                                <History className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteProduct(p.id)} className="text-slate-600 hover:text-red-400 transition-colors p-1">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          {products.length === 0 && (
            <div className="bg-slate-900 border border-white/5 rounded-2xl p-12 text-center">
              <Package className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500">No products yet. Add your first product.</p>
            </div>
          )}
        </div>
      )}

      {/* Add Product Modal */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add Product" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Category</label>
            <select value={form.category_id} onChange={e => setForm(p => ({ ...p, category_id: e.target.value }))} className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
              <option value="">No category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Product Name</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-300 mb-1.5">Cost Price (৳)</label>
              <input type="number" value={form.cost_price} onChange={e => setForm(p => ({ ...p, cost_price: e.target.value }))} className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1.5">Sell Price (৳)</label>
              <input type="number" value={form.sell_price} onChange={e => setForm(p => ({ ...p, sell_price: e.target.value }))} className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Unit</label>
            <select value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
              {['kg','g','pcs','ltr','box','pack'].map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setAddModal(false)} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">Cancel</button>
            <button onClick={addProduct} disabled={saving || !form.name.trim()} className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors">
              {saving ? 'Adding...' : 'Add Product'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Add Stock Modal */}
      <Modal open={!!stockModal} onClose={() => setStockModal(null)} title={`Add Stock — ${products.find(p => p.id === stockModal)?.name ?? ''}`} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Quantity ({products.find(p => p.id === stockModal)?.unit ?? 'units'})</label>
            <input type="number" value={stockForm.quantity} onChange={e => setStockForm(p => ({ ...p, quantity: e.target.value }))} className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Note (optional)</label>
            <input value={stockForm.note} onChange={e => setStockForm(p => ({ ...p, note: e.target.value }))} placeholder="e.g. Received from supplier" className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setStockModal(null)} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">Cancel</button>
            <button onClick={() => addStock(stockModal!)} disabled={saving || !stockForm.quantity} className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors">
              {saving ? 'Adding...' : 'Add Stock'}
            </button>
          </div>
        </div>
      </Modal>

      {/* History Modal */}
      <Modal open={!!historyModal} onClose={() => setHistoryModal(null)} title="Stock History" size="md">
        {history.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-6">No stock history</p>
        ) : (
          <div className="space-y-2">
            {history.map(h => (
              <div key={h.id} className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-3">
                <div>
                  <p className="text-white text-sm font-medium">+{h.quantity_added} units</p>
                  {h.note && <p className="text-slate-500 text-xs mt-0.5">{h.note}</p>}
                </div>
                <p className="text-slate-500 text-xs">{new Date(h.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Import Modal */}
      <Modal open={importModal} onClose={() => setImportModal(false)} title="Import Products (CSV)" size="sm">
        <div className="space-y-4">
          <p className="text-slate-400 text-sm">Upload a CSV file with columns: <span className="text-slate-300 font-mono text-xs">Name, Cost Price, Sell Price, Unit, Stock</span></p>
          <div className="bg-slate-800/50 rounded-xl p-3 text-xs text-slate-500 font-mono">
            Name,Cost Price,Sell Price,Unit,Stock<br/>
            "Basmati Rice",80,120,kg,50<br/>
            "Sunflower Oil",220,280,ltr,30
          </div>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleCSVImport} className="block w-full text-slate-400 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:bg-emerald-500/10 file:text-emerald-400 hover:file:bg-emerald-500/20" />
          <div className="flex gap-3 pt-2">
            <button onClick={() => setImportModal(false)} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Category Modal */}
      <Modal open={catModal} onClose={() => setCatModal(false)} title="Add Category" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Category Name</label>
            <input value={catName} onChange={e => setCatName(e.target.value)} className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setCatModal(false)} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">Cancel</button>
            <button onClick={addCategory} disabled={!catName.trim()} className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors">Save</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
