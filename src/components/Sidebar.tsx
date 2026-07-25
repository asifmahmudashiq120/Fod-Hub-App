import { useState } from 'react';
import { Link, useLocation } from '@/lib/router';
import {
  LayoutDashboard, Users, PhoneCall, Package, Search,
  CheckSquare, Truck, MapPin, LogOut, ShoppingBag, ChevronLeft, ChevronRight, Menu, X, ShieldCheck
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const navItems = [
  { path: '/',                  label: 'Dashboard',        icon: LayoutDashboard, adminOnly: false },
  { path: '/customers',         label: 'Customer List',    icon: Users,           adminOnly: false },
  { path: '/daily-report',      label: 'Daily Report',     icon: PhoneCall,       adminOnly: false },
  { path: '/products',          label: 'Products & Price', icon: Package,         adminOnly: false },
  { path: '/search',            label: 'Search Customer',  icon: Search,          adminOnly: false },
  { path: '/confirmed-orders',  label: 'Confirmed Orders', icon: CheckSquare,     adminOnly: false },
  { path: '/courier-history',   label: 'Courier History',  icon: Truck,           adminOnly: false },
  { path: '/order-tracking',    label: 'Order Tracking',   icon: MapPin,          adminOnly: false },
  { path: '/admin',             label: 'Admin Panel',      icon: ShieldCheck,     adminOnly: true },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const location = useLocation();
  const { signOut, profile } = useAuth();

  const { isAdmin } = useAuth();
  const visibleItems = navItems.filter(item => !item.adminOnly || isAdmin);

  const NavLink = ({ item }: { item: typeof navItems[0] }) => {
    const Icon = item.icon;
    const active = location === item.path || (item.path !== '/' && location.startsWith(item.path));
    return (
      <Link
        href={item.path}
        onClick={onMobileClose}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group relative
          ${active
            ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
            : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
      >
        <Icon className="w-5 h-5 flex-shrink-0" />
        {!collapsed && <span className="text-sm font-medium truncate">{item.label}</span>}
        {collapsed && (
          <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
            {item.label}
          </div>
        )}
      </Link>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 py-5 border-b border-white/5 ${collapsed ? 'justify-center' : ''}`}>
        <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-500/30">
          <ShoppingBag className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <div>
            <p className="text-white font-bold text-sm leading-none">FOOD HUB</p>
            <p className="text-slate-500 text-xs mt-0.5">Management</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visibleItems.map(item => <NavLink key={item.path} item={item} />)}
      </nav>

      {/* User + Logout */}
      <div className="px-3 py-4 border-t border-white/5 space-y-1">
        {!collapsed && profile && (
          <div className="px-3 py-2 mb-1">
            <p className="text-white text-sm font-medium truncate">{profile.name || 'User'}</p>
            <p className="text-slate-500 text-xs capitalize">{profile.role}</p>
          </div>
        )}
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/5 transition-all w-full group relative"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="text-sm font-medium">Log Out</span>}
          {collapsed && (
            <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
              Log Out
            </div>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className={`hidden lg:flex flex-col bg-slate-900 border-r border-white/5 transition-all duration-300 flex-shrink-0 ${collapsed ? 'w-16' : 'w-60'}`}>
        {sidebarContent}
        <button
          onClick={onToggle}
          className="absolute top-5 -right-3 w-6 h-6 bg-slate-700 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-600 transition-all shadow-md z-10"
          style={{ position: 'absolute', left: collapsed ? '52px' : '228px' }}
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onMobileClose} />
          <aside className="relative w-60 bg-slate-900 border-r border-white/5 flex flex-col z-10">
            <button onClick={onMobileClose} className="absolute top-4 right-4 text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
