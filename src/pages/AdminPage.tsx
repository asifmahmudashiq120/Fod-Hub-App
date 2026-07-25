import { useEffect, useState } from 'react';
import { supabase, UserProfile } from '@/lib/supabase';
import { Users, UserPlus, Shield, User } from 'lucide-react';
import Modal from '@/components/Modal';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminPage() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteModal, setInviteModal] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', name: '', role: 'staff' as 'admin' | 'staff' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (isAdmin) loadUsers(); }, [isAdmin]);

  async function loadUsers() {
    setLoading(true);
    const { data } = await supabase.from('user_profiles').select('*').order('created_at');
    setUsers((data as UserProfile[]) ?? []);
    setLoading(false);
  }

  async function createUser() {
    if (!form.email.trim() || !form.password.trim() || !form.name.trim()) return;
    setSaving(true);
    setError('');
    const { data, error: signUpError } = await supabase.auth.signUp({ email: form.email, password: form.password });
    if (signUpError || !data.user) {
      setError(signUpError?.message ?? 'Failed to create user');
      setSaving(false);
      return;
    }
    await supabase.from('user_profiles').insert({ id: data.user.id, name: form.name, role: form.role });
    setSaving(false);
    setInviteModal(false);
    setForm({ email: '', password: '', name: '', role: 'staff' });
    loadUsers();
  }

  async function toggleRole(user: UserProfile) {
    const newRole = user.role === 'admin' ? 'staff' : 'admin';
    await supabase.from('user_profiles').update({ role: newRole }).eq('id', user.id);
    loadUsers();
  }

  if (!isAdmin) return (
    <div className="p-6 flex items-center justify-center h-64">
      <p className="text-slate-500">Admin access required.</p>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
          <p className="text-slate-400 text-sm mt-1">Manage users and roles</p>
        </div>
        <button onClick={() => setInviteModal(true)} className="flex items-center gap-2 text-sm bg-emerald-500 hover:bg-emerald-400 text-white px-3 py-2 rounded-xl transition-colors shadow-lg shadow-emerald-500/20">
          <UserPlus className="w-4 h-4" /> Add User
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-slate-900 border border-white/5 rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5 bg-slate-800/30">
                <th className="text-left text-slate-400 text-xs font-medium px-5 py-3">User</th>
                <th className="text-left text-slate-400 text-xs font-medium px-5 py-3">Role</th>
                <th className="text-left text-slate-400 text-xs font-medium px-5 py-3">Joined</th>
                <th className="text-right text-slate-400 text-xs font-medium px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-white/2 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center">
                        {u.role === 'admin' ? <Shield className="w-4 h-4 text-emerald-400" /> : <User className="w-4 h-4 text-slate-400" />}
                      </div>
                      <p className="text-white text-sm font-medium">{u.name || 'Unnamed'}</p>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${u.role === 'admin' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-500 text-sm">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => toggleRole(u)} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                      Make {u.role === 'admin' ? 'Staff' : 'Admin'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={inviteModal} onClose={() => setInviteModal(false)} title="Add New User" size="sm">
        <div className="space-y-4">
          {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">{error}</p>}
          {(['name', 'email', 'password'] as const).map(f => (
            <div key={f}>
              <label className="block text-sm text-slate-300 mb-1.5 capitalize">{f}</label>
              <input
                type={f === 'password' ? 'password' : f === 'email' ? 'email' : 'text'}
                value={form[f]}
                onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))}
                className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>
          ))}
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Role</label>
            <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value as 'admin' | 'staff' }))} className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setInviteModal(false)} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">Cancel</button>
            <button onClick={createUser} disabled={saving} className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors">
              {saving ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
