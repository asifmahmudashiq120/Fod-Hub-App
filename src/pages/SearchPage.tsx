import { useState, useEffect } from 'react';
import { supabase, Customer } from '@/lib/supabase';
import { Search, Phone, MapPin, ChevronRight } from 'lucide-react';
import { useNavigate } from '@/lib/router';
import Badge from '@/components/Badge';

const STATUS_LABELS: Record<string, string> = {
  call_me: 'Call Me', not_now: 'Not Now', pending: 'Pending', unreachable: 'Unreachable', ordered: 'Ordered',
};
const STATUS_COLORS: Record<string, 'cyan' | 'amber' | 'blue' | 'red' | 'emerald'> = {
  call_me: 'cyan', not_now: 'amber', pending: 'blue', unreachable: 'red', ordered: 'emerald',
};

export default function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!searched || !query.trim()) return;
    search();
  }, [searched]);

  // Real-time: refresh results when customers table changes
  useEffect(() => {
    if (!searched) return;
    const channel = supabase.channel('search-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => { if (query.trim()) search(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [searched, query]);

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    const { data } = await supabase
      .from('customers')
      .select('*')
      .or(`name.ilike.%${query}%,phone.ilike.%${query}%`)
      .order('name')
      .limit(50);
    setResults((data as Customer[]) ?? []);
    setLoading(false);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Search Customer</h1>
        <p className="text-slate-400 text-sm mt-1">Find customers by name or phone number</p>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="Enter name or phone number..."
            className="w-full pl-11 pr-4 py-3 bg-slate-900 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          />
        </div>
        <button
          onClick={search}
          disabled={loading || !query.trim()}
          className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-medium rounded-xl transition-colors"
        >
          {loading ? '...' : 'Search'}
        </button>
      </div>

      {searched && (
        loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : results.length === 0 ? (
          <div className="bg-slate-900 border border-white/5 rounded-2xl p-12 text-center">
            <Search className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500">No customers found for "{query}"</p>
          </div>
        ) : (
          <div>
            <p className="text-slate-400 text-sm mb-3">{results.length} result{results.length !== 1 ? 's' : ''} found</p>
            <div className="bg-slate-900 border border-white/5 rounded-2xl overflow-hidden">
              <div className="divide-y divide-white/5">
                {results.map(c => (
                  <div
                    key={c.id}
                    onClick={() => navigate(`/customers/${c.id}`)}
                    className="flex items-center justify-between px-5 py-4 hover:bg-white/2 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-slate-400 font-bold text-sm flex-shrink-0">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-white font-medium text-sm">{c.name}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                            <Phone className="w-3 h-3" /> {c.phone}
                          </div>
                          {c.address && (
                            <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                              <MapPin className="w-3 h-3" /> {c.address.slice(0, 40)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge label={STATUS_LABELS[c.status] ?? c.status} color={STATUS_COLORS[c.status] ?? 'slate'} />
                      <ChevronRight className="w-4 h-4 text-slate-600" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
