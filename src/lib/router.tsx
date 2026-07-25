import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

const RouterContext = createContext<{
  path: string;
  navigate: (to: string) => void;
}>({ path: '/', navigate: () => {} });

export function Router({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const handler = () => setPath(window.location.pathname);
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  function navigate(to: string) {
    window.history.pushState({}, '', to);
    setPath(to);
  }

  return (
    <RouterContext.Provider value={{ path, navigate }}>
      {children}
    </RouterContext.Provider>
  );
}

export function useLocation() {
  return useContext(RouterContext).path;
}

export function useNavigate() {
  return useContext(RouterContext).navigate;
}

export function Link({ href, children, className, onClick }: {
  href: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const { navigate } = useContext(RouterContext);
  return (
    <a
      href={href}
      className={className}
      onClick={e => {
        e.preventDefault();
        navigate(href);
        onClick?.();
      }}
    >
      {children}
    </a>
  );
}

interface RouteProps {
  path: string;
  component: React.ComponentType;
  exact?: boolean;
}

export function Route({ path, component: Component, exact }: RouteProps) {
  const location = useLocation();
  const matches = exact
    ? location === path
    : location === path || location.startsWith(path + '/');
  if (!matches) return null;
  return <Component />;
}
