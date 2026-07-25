import { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  color?: 'emerald' | 'blue' | 'amber' | 'red' | 'violet' | 'cyan';
  sub?: string;
}

const colorMap = {
  emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  blue:    'bg-blue-500/10 text-blue-400 border-blue-500/20',
  amber:   'bg-amber-500/10 text-amber-400 border-amber-500/20',
  red:     'bg-red-500/10 text-red-400 border-red-500/20',
  violet:  'bg-violet-500/10 text-violet-400 border-violet-500/20',
  cyan:    'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
};

export default function StatCard({ label, value, icon, color = 'emerald', sub }: StatCardProps) {
  return (
    <div className="bg-slate-900 border border-white/5 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-slate-400 text-sm font-medium">{label}</p>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${colorMap[color]}`}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}
