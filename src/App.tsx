import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { Router, useLocation } from '@/lib/router';
import Layout from '@/components/Layout';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import CustomerListPage from '@/pages/CustomerListPage';
import CustomerProfilePage from '@/pages/CustomerProfilePage';
import DailyReportPage from '@/pages/DailyReportPage';
import ProductsPage from '@/pages/ProductsPage';
import SearchPage from '@/pages/SearchPage';
import ConfirmedOrdersPage from '@/pages/ConfirmedOrdersPage';
import CourierHistoryPage from '@/pages/CourierHistoryPage';
import OrderTrackingPage from '@/pages/OrderTrackingPage';
import AdminPage from '@/pages/AdminPage';

function AppRoutes() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  const renderPage = () => {
    if (location === '/') return <DashboardPage />;
    if (location === '/customers') return <CustomerListPage />;
    if (location.startsWith('/customers/')) return <CustomerProfilePage />;
    if (location === '/daily-report') return <DailyReportPage />;
    if (location === '/products') return <ProductsPage />;
    if (location === '/search') return <SearchPage />;
    if (location === '/confirmed-orders') return <ConfirmedOrdersPage />;
    if (location === '/courier-history') return <CourierHistoryPage />;
    if (location === '/order-tracking') return <OrderTrackingPage />;
    if (location === '/admin') return <AdminPage />;
    return <DashboardPage />;
  };

  return (
    <Layout>
      {renderPage()}
    </Layout>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}
