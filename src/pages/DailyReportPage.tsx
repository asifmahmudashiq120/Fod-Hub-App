import { useEffect, useState } from 'react';
import { supabase, CallReport } from '@/lib/supabase';
import { Phone, AlertCircle, Clock, CheckCircle, XCircle, Calendar } from 'lucide-react';
import StatCard from '@/components/StatCard';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function DailyReportPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [reports, setReports] = useState<CallReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'day' | 'month'>('month');
  const [selectedDay, setSelectedDay] = useState(now.getDate());

  useEffect(() => {
    loadData();
    const channel = supabase.channel('daily-report-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'call_reports' }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [year, month]);

  async function loadData() {
    setLoading(true);
    const from = `${year}-${String(month).padStart(2,'0')}-01T00:00:00`;
    const to   = `${year}-${String(month).padStart(2,'0')}-31T23:59:59`;
    const { data } = await supabase.from('call_reports').select('*')
      .gte('called_at', from).lte('called_at', to)
      .order('called_at', { ascending: false });
    setReports((data as CallReport[]) ?? []);
    setLoading(false);
  }

  const filtered = viewMode === 'day'
    ? reports.filter(r => {
        const d = new Date(r.called_at).getDate();
        return d === selectedDay;
      })
    : reports;

  const counts = {
    total: filtered.length,
    unreachable: filtered.filter(r => r.status === 'unreachable').length,
    pending: filtered.filter(r => r.status === 'pending').length,
    ordered: filtered.filter(r => r.status === 'ordered').length,
    not_now: filtered.filter(r => r.status === 'not_now').length,
  };

  const daysInMonth = new Date(year, month, 0).getDate();
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Daily Work / Call Report</h1>
          <p className="text-slate-400 text-sm mt-1">Track your call activities and outcomes</p>
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

      {/* View toggle */}
      <div className="flex items-center gap-2 bg-slate-900 border border-white/5 rounded-xl p-1 w-fit">
        {(['month','day'] as const).map(m => (
          <button key={m} onClick={() => setViewMode(m)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode === m ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'}`}>
            {m === 'month' ? 'Monthly' : 'Daily'}
          </button>
        ))}
      </div>

      {/* Day picker when daily mode */}
      {viewMode === 'day' && (
        <div className="flex gap-1.5 flex-wrap">
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
            <button
              key={d}
              onClick={() => setSelectedDay(d)}
              className={`w-9 h-9 rounded-xl text-sm font-medium transition-all ${selectedDay === d ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Total Calls" value={counts.total} icon={<Phone className="w-4 h-4" />} color="cyan" />
        <StatCard label="Unreachable" value={counts.unreachable} icon={<AlertCircle className="w-4 h-4" />} color="red" />
        <StatCard label="Pending" value={counts.pending} icon={<Clock className="w-4 h-4" />} color="blue" />
        <StatCard label="Ordered" value={counts.ordered} icon={<CheckCircle className="w-4 h-4" />} color="emerald" />
        <StatCard label="Not Now" value={counts.not_now} icon={<XCircle className="w-4 h-4" />} color="amber" />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-900 border border-white/5 rounded-2xl p-12 text-center">
          <Calendar className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500">No call records for this period</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-white/5 rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left text-slate-400 text-xs font-medium px-5 py-3">Customer</th>
                <th className="text-left text-slate-400 text-xs font-medium px-5 py-3">Phone</th>
                <th className="text-left text-slate-400 text-xs font-medium px-5 py-3">Status</th>
                <th className="text-left text-slate-400 text-xs font-medium px-5 py-3">Note</th>
                <th className="text-left text-slate-400 text-xs font-medium px-5 py-3">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map(r => (
                <tr key={r.id} className="hover:bg-white/2 transition-colors">
                  <td className="px-5 py-3 text-white text-sm font-medium">{r.customer_name}</td>
                  <td className="px-5 py-3 text-slate-400 text-sm">{r.phone}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${
                      r.status === 'ordered'     ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      r.status === 'unreachable' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                      r.status === 'pending'     ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                      'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    }`}>
                      {r.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-500 text-sm">{r.note || '-'}</td>
                  <td className="px-5 py-3 text-slate-500 text-sm">{new Date(r.called_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
