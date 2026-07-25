interface BadgeProps {
  label: string;
  color?: 'emerald' | 'blue' | 'amber' | 'red' | 'slate' | 'cyan' | 'violet';
}

const colorMap = {
  emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  blue:    'bg-blue-500/10 text-blue-400 border-blue-500/20',
  amber:   'bg-amber-500/10 text-amber-400 border-amber-500/20',
  red:     'bg-red-500/10 text-red-400 border-red-500/20',
  slate:   'bg-slate-500/10 text-slate-400 border-slate-500/20',
  cyan:    'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  violet:  'bg-violet-500/10 text-violet-400 border-violet-500/20',
};

export default function Badge({ label, color = 'slate' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${colorMap[color]}`}>
      {label}
    </span>
  );
}
