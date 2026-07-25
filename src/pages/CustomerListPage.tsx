import { useEffect, useState, useRef } from 'react';
import { supabase, Customer } from '@/lib/supabase';
import { useNavigate } from '@/lib/router';
import { UserPlus, Upload, Download, Search, ChevronRight, Phone } from 'lucide-react';
import Badge from '@/components/Badge';
import Modal from '@/components/Modal';
import { useAuth } from '@/contexts/AuthContext';

const STATUS_LABELS: Record<string, string> = {
  call_me: 'Call Me', not_now: 'Not Now', pending: 'Pending', unreachable: 'Unreachable', ordered: 'Ordered',
};
const STATUS_COLORS: Record<string, 'cyan' | 'amber' | 'blue' | 'red' | 'emerald'> = {
  call_me: 'cyan', not_now: 'amber', pending: 'blue', unreachable: 'red', ordered: 'emerald',
};
const ALL_STATUSES = ['all', 'call_me', 'not_now', 'pending', 'unreachable', 'ordered'];

const PAGE_SIZE = 1000;

export default function CustomerListPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', address: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCustomers();
    const channel = supabase.channel('customers-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => {
        loadCustomers();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [filter]);

  async function loadCounts() {
    const c: Record<string, number> = { all: 0 };
    const { count: totalCount } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true });
    c.all = totalCount ?? 0;
    const statusCounts = await Promise.all(
      ALL_STATUSES.slice(1).map(async s => {
        const { count } = await supabase
          .from('customers')
          .select('*', { count: 'exact', head: true })
          .eq('status', s);
        return [s, count ?? 0] as const;
      })
    );
    statusCounts.forEach(([s, n]) => { c[s] = n; });
    setCounts(c);
  }

  async function loadCustomers() {
    setLoading(true);
    const allCustomers: Customer[] = [];
    let from = 0;
    while (true) {
      let q = supabase.from('customers')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (filter !== 'all') q = q.eq('status', filter);
      const { data } = await q;
      if (!data || data.length === 0) break;
      allCustomers.push(...(data as Customer[]));
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    setCustomers(allCustomers);
    await loadCounts();
    setLoading(false);
  }

  async function addCustomer() {
    if (!form.name.trim() || !form.phone.trim()) return;
    setSaving(true);
    await supabase.from('customers').insert({
      name: form.name.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      notes: form.notes.trim(),
      status: 'call_me',
    });
    setSaving(false);
    setAddModal(false);
    setForm({ name: '', phone: '', address: '', notes: '' });
  }

  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMsg('Processing...');
    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    const firstLine = lines[0]?.toLowerCase() ?? '';
    const hasHeader = firstLine.includes('name') || firstLine.includes('phone');
    const dataLines = hasHeader ? lines.slice(1) : lines;

    const rows = dataLines.map(l => {
      const cols = l.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      return {
        name: (cols[0] ?? '').trim() || 'Unknown',
        phone: (cols[1] ?? '').trim() || 'N/A',
        address: (cols[2] ?? '').trim() || '',
        status: 'call_me' as const,
        notes: (cols[3] ?? '').trim() || '',
      };
    }).filter(r => r.name || r.phone);

    if (rows.length === 0) {
      setImportMsg('No valid rows found.');
      setImporting(false);
      return;
    }

    const BATCH = 500;
    let inserted = 0;
    let failed = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { error } = await supabase.from('customers').insert(batch);
      if (!error) {
        inserted += batch.length;
      } else {
        failed += batch.length;
      }
      setImportMsg(`Importing... ${inserted + failed} of ${rows.length} processed`);
    }

    setImporting(false);
    if (failed > 0) {
      setImportMsg(`Imported ${inserted} customers. ${failed} rows failed.`);
    } else {
      setImportMsg(`Successfully imported all ${inserted} customers!`);
    }
    await loadCustomers();
    setTimeout(() => {
      setImportModal(false);
      setImportMsg('');
    }, 2500);
    if (fileRef.current) fileRef.current.value = '';
  }

  function exportCSV() {
    const rows = [['Name','Phone','Address','Status','Last Order Date','Last Order Product','Last Order Amount','Last Order Weight','Notes']];
    customers.forEach(c => {
      rows.push([c.name, c.phone, c.address, c.status, c.last_order_date ?? '', c.last_order_product ?? '', String(c.last_order_amount ?? ''), String(c.last_order_weight ?? ''), c.notes]);
    });
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv]));
    a.download = 'customers.csv'; a.click();
  }

  const filtered = customers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  );

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Customer List</h1>
          <p className="text-slate-400 text-sm mt-1">{counts.all ?? 0} total customers</p>
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
          <button onClick={() => setAddModal(true)} className="flex items-center gap-2 text-sm bg-emerald-500 hover:bg-emerald-400 text-white px-3 py-2 rounded-xl transition-colors shadow-lg shadow-emerald-500/20">
            <UserPlus className="w-4 h-4" /> Add Customer
          </button>
        </div>
      </div>

      {/* Filter bar with live counts */}
      <div className="flex items-center gap-2 flex-wrap">
        {ALL_STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
              filter === s
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-white/10'
            }`}
          >
            {s === 'all' ? 'All' : STATUS_LABELS[s]} {counts[s] !== undefined ? `(${counts[s]})` : ''}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
        <input
          type="text"
          placeholder="Search by name or phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-11 pr-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">No customers found</div>
      ) : (
        <div className="bg-slate-900 border border-white/5 rounded-2xl overflow-hidden">
          <div className="divide-y divide-white/5">
            {filtered.map(c => (
              <div key={c.id} onClick={() => navigate(`/customers/${c.id}`)} className="flex items-center justify-between px-5 py-4 hover:bg-white/2 cursor-pointer transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-slate-400 font-bold text-sm flex-shrink-0">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">{c.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Phone className="w-3 h-3 text-slate-500" />
                      <span className="text-slate-400 text-xs">{c.phone}</span>
                      {c.address && <span className="text-slate-600 text-xs hidden sm:block">· {c.address.slice(0, 30)}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {c.last_order_date && (
                    <div className="text-right hidden md:block">
                      <p className="text-slate-400 text-xs">{c.last_order_date}</p>
                      <p className="text-slate-500 text-xs">{c.last_order_product ?? ''}</p>
                    </div>
                  )}
                  <Badge label={STATUS_LABELS[c.status] ?? c.status} color={STATUS_COLORS[c.status] ?? 'slate'} />
                  <ChevronRight className="w-4 h-4 text-slate-600" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Modal */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add New Customer" size="sm">
        <div className="space-y-4">
          {(['name', 'phone', 'address'] as const).map(f => (
            <div key={f}>
              <label className="block text-sm text-slate-300 mb-1.5 capitalize">{f}</label>
              <input value={form[f]} onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))} placeholder={f === 'name' ? 'Full Name' : f === 'phone' ? '01XXXXXXXXX' : 'Full address'} className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
            </div>
          ))}
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setAddModal(false)} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">Cancel</button>
            <button onClick={addCustomer} disabled={saving || !form.name.trim() || !form.phone.trim()} className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors">
              {saving ? 'Adding...' : 'Add Customer'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Import Modal */}
      <Modal open={importModal} onClose={() => !importing && setImportModal(false)} title="Import Customers (CSV)" size="sm">
        <div className="space-y-4">
          <p className="text-slate-400 text-sm">Upload a CSV file with columns: <span className="text-slate-300 font-mono text-xs">Name, Phone, Address</span></p>
          <div className="bg-slate-800/50 rounded-xl p-3 text-xs text-slate-500 font-mono">
            Name,Phone,Address<br/>
            "Karim Ahmed","01712345678","Dhaka"<br/>
            "Rahim","01812345678","Chittagong"
          </div>
          <p className="text-slate-500 text-xs">No limit — import thousands of rows at once. Missing fields are filled with defaults so you can edit later.</p>
          {importMsg && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-2 text-emerald-400 text-sm">
              {importMsg}
            </div>
          )}
          <input ref={fileRef} type="file" accept=".csv" onChange={handleCSVImport} disabled={importing} className="block w-full text-slate-400 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:bg-emerald-500/10 file:text-emerald-400 hover:file:bg-emerald-500/20 disabled:opacity-50" />
          <div className="flex gap-3 pt-2">
            <button onClick={() => setImportModal(false)} disabled={importing} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-xl text-sm font-medium transition-colors">{importing ? 'Importing...' : 'Close'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
