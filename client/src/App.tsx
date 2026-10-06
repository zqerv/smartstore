import {
  Activity,
  QrCode,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgePercent,
  BarChart3,
  Bell,
  Box,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  ClipboardList,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  Facebook,
  Globe2,
  Headphones,
  Instagram,
  Info,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  Package,
  Palette,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Store,
  Truck,
  User,
  Users,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react';
import {
  createContext,
  FormEvent,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { UserRole } from '../../shared/src/types/common';
import { DEMO_CREDENTIALS } from '../../shared/src/demo';
import { apiPath, apiRequest, ApiError, API_URL, SOCKET_URL } from './lib/api';
import {
  addToGuestCart as persistAddToGuestCart,
  clearGuestCart as clearPersistedGuestCart,
  createGuestCart as createPersistedGuestCart,
  getGuestCart as fetchGuestCart,
  readGuestCart as readPersistedGuestCart,
  removeFromGuestCartItem as persistRemoveGuestCartItem,
  updateGuestCartItemQuantity as persistUpdateGuestCartItemQuantity,
  type GuestCart as GuestCartData,
} from './lib/guest-cart';
import { Pagination } from './components/Pagination';
import { QrDialog, QrThumb, tableEntryUrl } from './components/TableQr';
import { ProductImageUploader, assetUrl } from './components/ProductImageUploader';

type User = {
  id: string;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  role: UserRole;
  storeId?: string | null;
  customerId?: string;
};

type Locale = 'ar' | 'en';

type AppContextValue = {
  user: User | null;
  setUser: (user: User | null) => void;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  storeId: string;
  setStoreId: (storeId: string) => void;
  socketState: 'off' | 'connecting' | 'connected' | 'disconnected';
};

const AppContext = createContext<AppContextValue | null>(null);

function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('App context is missing');
  return value;
}

function App() {
  const [user, setUserState] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [locale, setLocaleState] = useState<Locale>(
    localStorage.getItem('smartstore.locale') === 'en' ? 'en' : 'ar',
  );
  const [storeId, setStoreIdState] = useState(
    localStorage.getItem('smartstore.storeId') || '',
  );
  const [socketState, setSocketState] = useState<AppContextValue['socketState']>('off');

  const setUser = useCallback((nextUser: User | null) => {
    setUserState(nextUser);
    if (!nextUser) {
      localStorage.removeItem('smartstore.token');
      localStorage.removeItem('smartstore.user');
      setSocketState('off');
      return;
    }
    localStorage.setItem('smartstore.user', JSON.stringify(nextUser));
    if (nextUser.storeId) {
      setStoreIdState(nextUser.storeId);
      localStorage.setItem('smartstore.storeId', nextUser.storeId);
    }
  }, []);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    localStorage.setItem('smartstore.locale', nextLocale);
  }, []);

  const setStoreId = useCallback((nextStoreId: string) => {
    const value = nextStoreId.trim();
    setStoreIdState(value);
    if (value) localStorage.setItem('smartstore.storeId', value);
    else localStorage.removeItem('smartstore.storeId');
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('smartstore.token');
    if (!token) {
      setAuthLoading(false);
      return;
    }
    apiRequest<User>('/auth/me')
      .then(setUser)
      .catch(() => {
        localStorage.removeItem('smartstore.token');
        localStorage.removeItem('smartstore.user');
        setUserState(null);
      })
      .finally(() => setAuthLoading(false));
  }, [setUser]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [locale]);

  useEffect(() => {
    if (!user || !localStorage.getItem('smartstore.token')) {
      setSocketState('off');
      return;
    }
    setSocketState('connecting');
    const socket: Socket = io(SOCKET_URL, {
      auth: { token: localStorage.getItem('smartstore.token') },
      transports: ['websocket'],
      reconnectionAttempts: 2,
      timeout: 3500,
    });
    socket.on('connect', () => setSocketState('connected'));
    socket.on('disconnect', () => setSocketState('disconnected'));
    socket.on('connect_error', () => setSocketState('disconnected'));
    const forwardOrderEvent = (detail: unknown) => {
      window.dispatchEvent(new CustomEvent('smartstore:order', { detail }));
    };
    socket.on('order:created', forwardOrderEvent);
    socket.on('order:updated', forwardOrderEvent);
    return () => {
      socket.off('order:created', forwardOrderEvent);
      socket.off('order:updated', forwardOrderEvent);
      socket.disconnect();
      setSocketState('off');
    };
  }, [user]);

  const context = useMemo<AppContextValue>(() => ({
    user,
    setUser,
    locale,
    setLocale,
    storeId,
    setStoreId,
    socketState,
  }), [user, setUser, locale, setLocale, storeId, setStoreId, socketState]);

  if (authLoading) return <FullLoader />;

  return (
    <AppContext.Provider value={context}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route path="/demo" element={<DemoHubPage />} />
        <Route path="/demo/access" element={<DemoAccessPage />} />
        <Route path="/" element={<ProtectedShell><DashboardPage /></ProtectedShell>} />
        <Route path="/platform/stores" element={<ProtectedShell allowedRoles={[UserRole.PLATFORM_ADMIN]}><PlatformStoresPage /></ProtectedShell>} />
        <Route path="/storefront" element={<StorefrontPage />} />
        <Route path="/store/:slug" element={<StorefrontPage />} />
        <Route path="/store/:slug/products/:productId" element={<ProductDetailsPage />} />
        <Route path="/store/:slug/cart" element={<CartPage />} />
        <Route path="/store/:slug/checkout" element={<CheckoutPage />} />
        <Route path="/platform/users" element={<ProtectedShell allowedRoles={[UserRole.PLATFORM_ADMIN]}><PlatformUsersPage /></ProtectedShell>} />
        <Route path="/platform/settings" element={<ProtectedShell allowedRoles={[UserRole.PLATFORM_ADMIN]}><SystemSettingsPage /></ProtectedShell>} />
        <Route path="/products/:productId" element={<ProductDetailsPage />} />
        <Route path="/products" element={<ProtectedShell allowedRoles={merchantRoles}><ResourcePage kind="products" /></ProtectedShell>} />
        <Route path="/categories" element={<ProtectedShell allowedRoles={merchantRoles}><ResourcePage kind="categories" /></ProtectedShell>} />
        <Route path="/customers" element={<ProtectedShell allowedRoles={merchantRoles}><ResourcePage kind="customers" /></ProtectedShell>} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/profile" element={<ProtectedShell allowedRoles={[UserRole.CUSTOMER]}><CustomerProfilePage /></ProtectedShell>} />
        <Route path="/orders" element={<ProtectedShell allowedRoles={[...merchantRoles, UserRole.CUSTOMER]}><ResourcePage kind="orders" /></ProtectedShell>} />
        <Route path="/staff" element={<ProtectedShell allowedRoles={storeAdministrators}><ResourcePage kind="staff" /></ProtectedShell>} />
        <Route path="/coupons" element={<ProtectedShell allowedRoles={merchantRoles}><ResourcePage kind="coupons" /></ProtectedShell>} />
        <Route path="/delivery" element={<ProtectedShell allowedRoles={merchantRoles}><ResourcePage kind="delivery" /></ProtectedShell>} />
        {TABLES_ENABLED && <Route path="/tables" element={<ProtectedShell allowedRoles={merchantRoles}><ResourcePage kind="tables" /></ProtectedShell>} />}
        <Route path="/reports" element={<ProtectedShell allowedRoles={merchantRoles}><ReportsPage /></ProtectedShell>} />
        <Route path="/settings" element={<ProtectedShell allowedRoles={storeAdministrators}><StoreProfilePage section="settings" /></ProtectedShell>} />
        <Route path="/branding" element={<ProtectedShell allowedRoles={storeAdministrators}><StoreProfilePage section="branding" /></ProtectedShell>} />
        <Route path="/support" element={<ProtectedShell><SupportPage /></ProtectedShell>} />
        <Route path="/track-order/:token" element={<TrackOrderPage />} />
        <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
      </Routes>
    </AppContext.Provider>
  );
}

function FullLoader() {
  return (
    <div className="full-loader" role="status" aria-label="Loading">
      <span className="brand-mark"><ShoppingBag size={25} /></span>
      <LoaderCircle className="spin" size={22} />
    </div>
  );
}

// Optional non-core table-ordering module; off unless VITE_ENABLE_TABLES=true.
const TABLES_ENABLED = import.meta.env.VITE_ENABLE_TABLES === 'true';
const PENDING_TABLE_KEY = 'smartstore.pendingTable';
const SAVED_TABLE_KEY = 'smartstore.table';
{
  const scanned = TABLES_ENABLED ? new URLSearchParams(window.location.search).get('table') : null;
  if (scanned) sessionStorage.setItem(PENDING_TABLE_KEY, scanned);
}

type NavItem = {
  label: string;
  en: string;
  path: string;
  icon: typeof Store;
  roles?: UserRole[];
};

const navigation: { title: string; en: string; items: NavItem[] }[] = [
  {
    title: 'الرئيسية',
    en: 'Workspace',
    items: [
      { label: 'نظرة عامة', en: 'Overview', path: '/', icon: LayoutDashboard },
      { label: 'واجهة المتجر', en: 'Storefront', path: '/storefront', icon: Store },
      { label: 'إدارة المتاجر', en: 'Platform stores', path: '/platform/stores', icon: Store, roles: [UserRole.PLATFORM_ADMIN] },
      { label: 'مستخدمو المنصة', en: 'Platform users', path: '/platform/users', icon: Users, roles: [UserRole.PLATFORM_ADMIN] },
      { label: 'إعدادات النظام', en: 'System settings', path: '/platform/settings', icon: Settings2, roles: [UserRole.PLATFORM_ADMIN] },
    ],
  },
  {
    title: 'التجارة',
    en: 'Commerce',
    items: [
      { label: 'المنتجات', en: 'Products', path: '/products', icon: Package },
      { label: 'التصنيفات', en: 'Categories', path: '/categories', icon: Box },
      { label: 'الطلبات', en: 'Orders', path: '/orders', icon: ClipboardList },
      { label: 'العملاء', en: 'Customers', path: '/customers', icon: Users, roles: [UserRole.PLATFORM_ADMIN, UserRole.STORE_OWNER, UserRole.STORE_ADMIN, UserRole.STAFF] },
      { label: 'الفريق', en: 'Staff', path: '/staff', icon: Users, roles: [UserRole.PLATFORM_ADMIN, UserRole.STORE_OWNER, UserRole.STORE_ADMIN] },
      { label: 'السلة والدفع', en: 'Cart & checkout', path: '/cart', icon: ShoppingCart, roles: [UserRole.CUSTOMER] },
      { label: 'حسابي', en: 'My profile', path: '/profile', icon: Users, roles: [UserRole.CUSTOMER] },
      { label: 'الكوبونات', en: 'Coupons', path: '/coupons', icon: BadgePercent, roles: [UserRole.PLATFORM_ADMIN, UserRole.STORE_OWNER, UserRole.STORE_ADMIN, UserRole.STAFF] },
      { label: 'التوصيل', en: 'Delivery', path: '/delivery', icon: Truck, roles: [UserRole.PLATFORM_ADMIN, UserRole.STORE_OWNER, UserRole.STORE_ADMIN, UserRole.STAFF] },
      ...(TABLES_ENABLED ? [{ label: 'الطاولات و QR', en: 'Tables & QR', path: '/tables', icon: QrCode, roles: [UserRole.PLATFORM_ADMIN, UserRole.STORE_OWNER, UserRole.STORE_ADMIN, UserRole.STAFF] }] : []),
      { label: 'التقارير', en: 'Reports', path: '/reports', icon: BarChart3, roles: [UserRole.PLATFORM_ADMIN, UserRole.STORE_OWNER, UserRole.STORE_ADMIN, UserRole.STAFF] },
    ],
  },
  {
    title: 'التخصيص',
    en: 'Customization',
    items: [
      { label: 'هوية المتجر', en: 'Branding', path: '/branding', icon: Palette, roles: [UserRole.PLATFORM_ADMIN, UserRole.STORE_OWNER, UserRole.STORE_ADMIN] },
      { label: 'الإعدادات', en: 'Settings', path: '/settings', icon: Settings2, roles: [UserRole.PLATFORM_ADMIN, UserRole.STORE_OWNER, UserRole.STORE_ADMIN] },
      { label: 'الدعم والتواصل', en: 'Contact & support', path: '/support', icon: Headphones },
    ],
  },
];

const roleTitle: Record<UserRole, [string, string]> = {
  [UserRole.PLATFORM_ADMIN]: ['مسؤول المنصة', 'Platform administrator'],
  [UserRole.STORE_OWNER]: ['مالك المتجر', 'Store owner'],
  [UserRole.STORE_ADMIN]: ['مدير المتجر', 'Store administrator'],
  [UserRole.STAFF]: ['فريق المتجر', 'Store staff'],
  [UserRole.CUSTOMER]: ['حساب العميل', 'Customer account'],
};

const merchantRoles = [
  UserRole.PLATFORM_ADMIN,
  UserRole.STORE_OWNER,
  UserRole.STORE_ADMIN,
  UserRole.STAFF,
];
const storeAdministrators = [
  UserRole.PLATFORM_ADMIN,
  UserRole.STORE_OWNER,
  UserRole.STORE_ADMIN,
];

function ProtectedShell({ children, allowedRoles }: { children: ReactNode; allowedRoles?: UserRole[] }) {
  const { user } = useApp();
  const location = useLocation();
  const { locale } = useApp();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/" replace />;

  return (
    <div className="app-shell">
      <button className="mobile-overlay" aria-label="إغلاق القائمة" hidden={!sidebarOpen} onClick={() => setSidebarOpen(false)} />
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <Link to="/" className="brand-lockup" onClick={() => setSidebarOpen(false)}>
          <span className="brand-mark"><ShoppingBag size={22} strokeWidth={2.4} /></span>
          <span><strong>سمارت ستور</strong><small>SMARTSTORE</small></span>
        </Link>
        <div className="workspace-switch">
          <span className="workspace-avatar">{user.role === UserRole.PLATFORM_ADMIN ? <Globe2 size={18} /> : <Store size={18} />}</span>
          <span className="workspace-name">
            <strong>{locale === 'ar' ? roleTitle[user.role][0] : roleTitle[user.role][1]}</strong>
            <small>{user.storeId ? 'SmartStore' : user.role === UserRole.PLATFORM_ADMIN ? 'Platform console' : 'مساحة العمل'}</small>
          </span>
          <ChevronDown size={16} className="muted-icon" />
        </div>
        <nav className="side-nav" aria-label={locale === 'ar' ? 'التنقل الرئيسي' : 'Main navigation'}>
          {navigation.map((group) => {
            const items = group.items.filter((item) => !item.roles || item.roles.includes(user.role));
            if (!items.length) return null;
            return (
              <div className="nav-group" key={group.title}>
                <p className="nav-heading">{locale === 'ar' ? group.title : group.en}</p>
                {items.map(({ label, en, path, icon: Icon }) => (
                  <Link
                    key={path}
                    to={path}
                    onClick={() => setSidebarOpen(false)}
                    className={`nav-link ${location.pathname === path ? 'nav-active' : ''}`}
                  >
                    <Icon size={18} strokeWidth={1.8} />
                    <span>{locale === 'ar' ? label : en}</span>
                    {path === '/orders' && <span className="nav-dot" />}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-icon"><CircleHelp size={18} /></span>
            <div><strong>{locale === 'ar' ? 'تحتاج إلى مساعدة؟' : 'Need a hand?'}</strong><p>{locale === 'ar' ? 'نحن هنا لمساعدتك' : 'We’re here to help'}</p></div>
            <Link to="/support" aria-label="الدعم"><ArrowLeft size={15} /></Link>
          </div>
          <div className="sidebar-user">
            <span className="user-avatar">{initials(user)}</span>
            <span className="user-meta"><strong>{user.firstName || user.email || user.phone || 'مستخدم SmartStore'}</strong><small>{locale === 'ar' ? roleTitle[user.role][0] : roleTitle[user.role][1]}</small></span>
            <SignOutButton compact />
          </div>
        </div>
      </aside>
      <div className="main-area">
        <TopBar onMenu={() => setSidebarOpen(true)} />
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { locale, setLocale, user, socketState } = useApp();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  return (
    <header className="topbar">
      <button className="icon-button menu-toggle" onClick={onMenu} aria-label="القائمة"><Menu size={20} /></button>
      <div className="breadcrumb"><span>SmartStore</span><ChevronLeft size={14} /><strong>{user ? roleTitle[user.role][locale === 'ar' ? 0 : 1] : ''}</strong></div>
      <div className="topbar-actions">
        <form className="top-search" onSubmit={(event) => { event.preventDefault(); if (query.trim()) navigate(`/products?search=${encodeURIComponent(query)}`); }}>
          <Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={locale === 'ar' ? 'ابحث في متجرك...' : 'Search your store...'} aria-label="بحث" /><kbd>⌘ K</kbd>
        </form>
        <span className={`socket-pill socket-${socketState}`} title={`Socket.IO: ${socketState}`}>
          <span className="pulse-dot" />{socketState === 'connected' ? (locale === 'ar' ? 'مباشر' : 'Live') : (locale === 'ar' ? 'غير متصل' : 'Offline')}
        </span>
        <button className="icon-button language-button" onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')} title="Switch language"><Globe2 size={18} /><span>{locale === 'ar' ? 'EN' : 'عربي'}</span></button>
        <button className="icon-button notification-button" aria-label={locale === 'ar' ? 'عرض الطلبات' : 'View orders'} title={locale === 'ar' ? 'عرض الطلبات' : 'View orders'} onClick={() => navigate('/orders')}><Bell size={18} /><i /></button>
        <span className="top-user-avatar">{initials(user)}</span>
      </div>
    </header>
  );
}

function SignOutButton({ compact = false }: { compact?: boolean }) {
  const { setUser, locale } = useApp();
  const navigate = useNavigate();
  return (
    <button className={compact ? 'signout-compact' : 'button button-quiet'} onClick={() => {
      void apiRequest('/auth/logout', { method: 'POST' }).catch(() => undefined).finally(() => {
        setUser(null);
        navigate('/login', { replace: true });
      });
    }} title={locale === 'ar' ? 'تسجيل الخروج' : 'Sign out'}>
      <LogOut size={compact ? 17 : 16} />{!compact && <span>{locale === 'ar' ? 'تسجيل الخروج' : 'Sign out'}</span>}
    </button>
  );
}

function LoginPage() {
  const { setUser, locale, setLocale } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [credential, setCredential] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [recovery, setRecovery] = useState(false);
  const [name, setName] = useState('');
  const [registrationPhone, setRegistrationPhone] = useState('');
  const [registrationEmail, setRegistrationEmail] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const isEmail = credential.includes('@');
    const payload: Record<string, string> = {
      [isEmail ? 'email' : 'phone']: credential.trim(),
      password,
    };
    try {
      let result: { user: User; token: string };
      try {
        result = await apiRequest(mode === 'login' ? '/auth/login' : '/auth/register', {
          method: 'POST',
          body: JSON.stringify(mode === 'register'
            ? {
                phone: registrationPhone.trim(),
                email: registrationEmail.trim() || undefined,
                password,
                firstName: name.trim(),
              }
            : payload),
        });
      } catch (firstError) {
        if (mode !== 'login' || !isEmail || !(firstError instanceof ApiError) || firstError.status !== 400) {
          throw firstError;
        }
        result = await apiRequest('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ phone: credential.trim(), email: credential.trim(), password }),
        });
      }
      localStorage.setItem('smartstore.token', result.token);
      setUser(result.user);
      const destination = (location.state as { from?: string } | null)?.from || '/';
      navigate(destination, { replace: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'تعذّر تسجيل الدخول.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <div className="login-visual">
        <div className="login-orb orb-one" /><div className="login-orb orb-two" />
        <Link to="/login" className="login-brand"><span className="brand-mark"><ShoppingBag size={23} /></span><span>سمارت ستور</span><i>SMARTSTORE</i></Link>
        <div className="visual-copy">
          <span className="eyebrow light-eyebrow"><Sparkles size={15} /> {locale === 'ar' ? 'مساحة واحدة لكل أعمالك' : 'Everything in one workspace'}</span>
          <h1>{locale === 'ar' ? <>تجارتك،<br /><em>بأسلوب أذكى.</em></> : <>Commerce,<br /><em>made smarter.</em></>}</h1>
          <p>{locale === 'ar' ? 'من أول منتج إلى آخر طلب، أدِر متجرك بثقة وبساطة.' : 'From your first product to your latest order, run your store with confidence.'}</p>
          <div className="visual-proof"><span className="proof-avatars"><i>س</i><i>م</i><i>ر</i></span><span>{locale === 'ar' ? 'تجربة عربية أولاً، جاهزة للنمو.' : 'Arabic-first, ready to grow.'}</span><Check size={15} /></div>
        </div>
        <div className="visual-foot"><span>© 2026 SmartStore</span><span>{locale === 'ar' ? 'مصمم للتجارة التي لا تتوقف' : 'Built for business in motion'}</span></div>
      </div>
      <div className="login-panel">
        <div className="login-top"><span>{locale === 'ar' ? 'ليس لديك حساب؟' : 'New to SmartStore?'}</span><button className="text-button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{locale === 'ar' ? (mode === 'login' ? 'إنشاء حساب' : 'تسجيل الدخول') : (mode === 'login' ? 'Create account' : 'Sign in')}</button></div>
        <div className="login-form-wrap">
          <span className="eyebrow">{locale === 'ar' ? 'مساحة عملك بانتظارك' : 'Your workspace is waiting'}</span>
          <h2>{locale === 'ar' ? (mode === 'login' ? 'أهلاً بعودتك' : 'ابدأ رحلتك') : (mode === 'login' ? 'Welcome back' : 'Get started')}</h2>
          <p className="login-subtitle">{locale === 'ar' ? 'سجّل الدخول للمتابعة إلى لوحة متجرك.' : 'Sign in to continue to your store workspace.'}</p>
          {recovery ? <RecoveryForm locale={locale} onDone={() => setRecovery(false)} /> : <form onSubmit={submit} className="login-form">
            {mode === 'register' && <>
              <label className="field-label">{locale === 'ar' ? 'الاسم الأول' : 'First name'}<input className="input-control" autoComplete="given-name" value={name} onChange={(event) => setName(event.target.value)} required /></label>
              <label className="field-label">{locale === 'ar' ? 'رقم الهاتف' : 'Phone number'}
                <span className="input-wrap"><Smartphone size={17} /><input className="input-control" type="tel" autoComplete="tel" value={registrationPhone} onChange={(event) => setRegistrationPhone(event.target.value)} minLength={5} required /></span>
              </label>
              <label className="field-label">{locale === 'ar' ? 'البريد الإلكتروني (اختياري)' : 'Email (optional)'}
                <span className="input-wrap"><Globe2 size={17} /><input className="input-control" type="email" autoComplete="email" value={registrationEmail} onChange={(event) => setRegistrationEmail(event.target.value)} /></span>
              </label>
            </>}
            {mode === 'login' && <label className="field-label">{locale === 'ar' ? 'البريد الإلكتروني أو رقم الهاتف' : 'Email or phone number'}
              <span className="input-wrap"><Smartphone size={17} /><input className="input-control" autoComplete="username" value={credential} onChange={(event) => setCredential(event.target.value)} placeholder={locale === 'ar' ? 'name@example.com أو 07...' : 'name@example.com or 07...'} required /></span>
            </label>}
            <label className="field-label">{locale === 'ar' ? 'كلمة المرور' : 'Password'}
              <span className="input-wrap"><ShieldCheck size={17} /><input className="input-control" type={visible ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={mode === 'register' ? 8 : 1} required /><button type="button" className="show-password" onClick={() => setVisible(!visible)} aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></span>
            </label>
            {mode === 'login' && <div className="login-aux"><label className="remember"><input type="checkbox" />{locale === 'ar' ? 'تذكرني' : 'Remember me'}</label><button type="button" className="text-button small-text" onClick={() => setRecovery(true)}>{locale === 'ar' ? 'نسيت كلمة المرور؟' : 'Forgot password?'}</button></div>}
            {error && <div className="alert alert-error" role="alert"><X size={17} />{error}</div>}
            <button className="button button-primary login-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <>{locale === 'ar' ? (mode === 'login' ? 'تسجيل الدخول' : 'إنشاء الحساب') : (mode === 'login' ? 'Sign in' : 'Create account')}<ArrowLeft size={17} /></>}</button>
          </form>}
          <div className="secure-note"><ShieldCheck size={15} />{locale === 'ar' ? 'اتصال آمن ومشفّر' : 'Secure, encrypted connection'}<span>·</span><span>{new URL(API_URL).host}</span></div>
        </div>
        <div className="login-bottom"><span>SmartStore SaaS</span><button className="text-button" onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}>{locale === 'ar' ? 'English' : 'العربية'}</button><a href="mailto:support@smartstore.local">{locale === 'ar' ? 'المساعدة' : 'Help'}</a></div>
      </div>
    </div>
  );
}

function RecoveryForm({ locale, onDone }: { locale: Locale; onDone: () => void }) {
  const ar = locale === 'ar';
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [identifier, setIdentifier] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function request(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest<{ message: string; deliveryConfigured: boolean }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ identifier: identifier.trim() }) });
      setNotice(result.deliveryConfigured
        ? (ar ? 'إذا كان الحساب موجوداً فقد أُرسل رمز الاستعادة.' : 'If the account exists, a recovery code was sent.')
        : (ar ? 'خدمة إرسال الرسائل غير مُهيأة (PROVIDER CONFIGURATION REQUIRED)؛ لم يتم إرسال أي رمز. تواصل مع مسؤول المنصة.' : 'Message delivery is not configured (PROVIDER CONFIGURATION REQUIRED); no code was sent. Contact the platform administrator.'));
      setStep('reset');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  }

  async function reset(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiRequest('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: token.trim(), newPassword }) });
      onDone();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Reset failed.');
    } finally {
      setBusy(false);
    }
  }

  return <form className="login-form" onSubmit={step === 'request' ? request : reset}>
    {step === 'request'
      ? <label className="field-label">{ar ? 'البريد الإلكتروني أو رقم الهاتف' : 'Email or phone number'}<input className="input-control" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required minLength={3} /></label>
      : <>
        <label className="field-label">{ar ? 'رمز الاستعادة' : 'Recovery code'}<input className="input-control" value={token} onChange={(event) => setToken(event.target.value)} required /></label>
        <label className="field-label">{ar ? 'كلمة المرور الجديدة' : 'New password'}<input className="input-control" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required /></label>
      </>}
    {notice && <div className="alert alert-info" role="status"><Check size={17} />{notice}</div>}
    {error && <div className="alert alert-error" role="alert"><X size={17} />{error}</div>}
    <button className="button button-primary login-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{step === 'request' ? (ar ? 'طلب رمز الاستعادة' : 'Request recovery code') : (ar ? 'تعيين كلمة المرور' : 'Set new password')}</button>
    <button type="button" className="text-button small-text" onClick={onDone}>{ar ? 'العودة لتسجيل الدخول' : 'Back to sign in'}</button>
  </form>;
}

function ReportsPage() {
  const { user, locale, storeId } = useApp();
  const ar = locale === 'ar';
  const activeStoreId = user?.storeId || storeId;
  const isPlatform = user?.role === UserRole.PLATFORM_ADMIN;
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<any>(null);
  const [platform, setPlatform] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (activeStoreId) setReport(await apiRequest(`/stores/${encodeURIComponent(activeStoreId)}/reports?days=${days}`));
      else setReport(null);
      if (isPlatform) setPlatform(await apiRequest(`/platform/reports?days=${days}`));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load reports.');
    } finally {
      setLoading(false);
    }
  }, [activeStoreId, days, isPlatform]);
  useEffect(() => { void load(); }, [load]);

  const totals = report?.totals;
  const series: Array<{ date: string; orders: number; revenue: number }> = report?.salesOverTime || [];
  const maxRevenue = Math.max(1, ...series.map((point) => point.revenue));
  const hasSales = series.some((point) => point.orders > 0);

  return <div className="resource-page">
    <div className="page-heading"><div><span className="eyebrow">{ar ? 'التحليلات' : 'Analytics'}</span><h1>{ar ? 'التقارير' : 'Reports'}</h1><p>{ar ? 'أرقام حقيقية من قاعدة البيانات.' : 'Live figures calculated from the database.'}</p></div>
      <div className="row-actions"><select className="input-control" aria-label={ar ? 'الفترة' : 'Range'} value={days} onChange={(event) => setDays(Number(event.target.value))}>{[7, 30, 90, 365].map((value) => <option key={value} value={value}>{ar ? `آخر ${value} يوم` : `Last ${value} days`}</option>)}</select>
        <button className="button button-outline" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} />{ar ? 'تحديث' : 'Refresh'}</button></div></div>
    {error && <div className="alert alert-error" role="alert"><CircleHelp size={17} />{error}</div>}
    {!activeStoreId && !isPlatform && <div className="alert alert-info"><Store size={17} />{ar ? 'لا يوجد متجر مرتبط بحسابك.' : 'No store is linked to your account.'}</div>}
    {loading && !report && <div className="table-state"><LoaderCircle className="spin" size={18} /></div>}
    {totals && <>
      <section className="stat-grid">
        <StatCard icon={ClipboardList} label={ar ? 'إجمالي الطلبات' : 'Total orders'} value={String(totals.orders)} detail={`${ar ? 'قيد الانتظار' : 'Pending'}: ${totals.pending}`} accent="mint" />
        <StatCard icon={Check} label={ar ? 'طلبات مكتملة' : 'Completed'} value={String(totals.completed)} detail={`${ar ? 'ملغاة' : 'Cancelled'}: ${totals.cancelled}`} accent="violet" />
        <StatCard icon={BarChart3} label={ar ? 'الإيرادات' : 'Revenue'} value={formatCurrency(totals.revenue, locale)} detail={`${ar ? 'متوسط الطلب' : 'Average order'}: ${formatCurrency(totals.averageOrderValue, locale)}`} accent="mint" />
        <StatCard icon={Users} label={ar ? 'العملاء' : 'Customers'} value={String(totals.customers)} detail={`${ar ? 'جدد' : 'New'}: ${totals.newCustomers}`} accent="violet" />
      </section>
      <section className="panel report-panel"><h3>{ar ? 'المبيعات عبر الزمن' : 'Sales over time'}</h3>
        {hasSales ? <div className="report-bars" role="img" aria-label={ar ? 'مخطط المبيعات' : 'Sales chart'}>{series.map((point) => <div key={point.date} className="report-bar" title={`${point.date}: ${point.orders} / ${formatCurrency(point.revenue, locale)}`}><i style={{ height: `${Math.max(2, (point.revenue / maxRevenue) * 100)}%` }} /></div>)}</div>
          : <div className="table-state">{ar ? 'لا توجد مبيعات في هذه الفترة.' : 'No sales in this period.'}</div>}</section>
      <section className="panel report-panel"><h3>{ar ? 'الأكثر مبيعاً' : 'Top products'}</h3>
        {report.topProducts.length ? <table className="records-table"><thead><tr><th>{ar ? 'المنتج' : 'Product'}</th><th>{ar ? 'الكمية' : 'Quantity'}</th><th>{ar ? 'الإيراد' : 'Revenue'}</th></tr></thead><tbody>{report.topProducts.map((row: any) => <tr key={row.productId}><td>{ar ? row.nameAr || row.nameEn : row.nameEn || row.nameAr}</td><td>{row.quantity}</td><td>{formatCurrency(row.revenue, locale)}</td></tr>)}</tbody></table>
          : <div className="table-state">{ar ? 'لا توجد بيانات بعد.' : 'No data yet.'}</div>}</section>
      <section className="panel report-panel"><h3>{ar ? 'الطلبات حسب الحالة' : 'Orders by status'}</h3>
        {Object.keys(report.ordersByStatus).length ? <div className="status-list">{Object.entries(report.ordersByStatus).map(([status, count]) => <span className="status-chip" key={status}>{status}: {String(count)}</span>)}</div> : <div className="table-state">{ar ? 'لا توجد طلبات.' : 'No orders.'}</div>}</section>
    </>}
    {isPlatform && platform && <section className="panel report-panel"><h3>{ar ? 'أداء المتاجر' : 'Store performance'}</h3>
      <table className="records-table"><thead><tr><th>{ar ? 'المتجر' : 'Store'}</th><th>{ar ? 'الحالة' : 'Status'}</th><th>{ar ? 'الطلبات' : 'Orders'}</th><th>{ar ? 'الإيراد' : 'Revenue'}</th><th>{ar ? 'العملاء' : 'Customers'}</th></tr></thead><tbody>{platform.storePerformance.map((row: any) => <tr key={row.id}><td>{row.name}</td><td>{row.status}</td><td>{row.orders}</td><td>{formatCurrency(row.revenue, locale)}</td><td>{row.customers}</td></tr>)}</tbody></table></section>}
  </div>;
}

function DashboardPage() {
  const { user, locale, storeId, setStoreId, socketState } = useApp();
  const [health, setHealth] = useState<{ status: string; uptime: number } | null>(null);
  const [apiInfo, setApiInfo] = useState<{ name?: string; status?: string; version?: string; endpoints?: Record<string, string> } | null>(null);
  const [platformApiAvailable, setPlatformApiAvailable] = useState(false);
  const [storesRouteAvailable, setStoresRouteAvailable] = useState(false);
  const [dashboardStats, setDashboardStats] = useState<Record<string, unknown> | null>(null);
  const [statsError, setStatsError] = useState('');
  const [probeError, setProbeError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [storeDraft, setStoreDraft] = useState(storeId);
  const [storeMessage, setStoreMessage] = useState('');

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setProbeError('');
    setStatsError('');
    const selectedStoreId = user?.storeId || storeId;
    const hasPlatformAccess = user?.role === UserRole.PLATFORM_ADMIN;
    const statsPath = user?.role === UserRole.PLATFORM_ADMIN
      ? '/platform/stats'
      : user?.role === UserRole.CUSTOMER
        ? `/customers/${encodeURIComponent(user.customerId || user.id)}/orders`
        : selectedStoreId ? `/stores/${encodeURIComponent(selectedStoreId)}/stats` : null;
    const [healthResult, infoResult, platformResult, storesResult, statsResult] = await Promise.allSettled([
      apiRequest<{ status: string; uptime: number }>('/../health'),
      apiRequest<{ name?: string; status?: string; version?: string; endpoints?: Record<string, string> }>('/info'),
      hasPlatformAccess ? apiRequest<unknown>('/platform') : Promise.resolve(null),
      hasPlatformAccess ? apiRequest<unknown>('/stores') : Promise.resolve(null),
      statsPath ? apiRequest<Record<string, unknown>>(statsPath) : Promise.resolve(null),
    ]);
    if (healthResult.status === 'fulfilled') setHealth(healthResult.value);
    else setProbeError(healthResult.reason instanceof Error ? healthResult.reason.message : 'تعذر الاتصال');
    if (infoResult.status === 'fulfilled') setApiInfo(infoResult.value);
    setPlatformApiAvailable(hasPlatformAccess && platformResult.status === 'fulfilled');
    setStoresRouteAvailable(hasPlatformAccess && storesResult.status === 'fulfilled');
    if (statsResult.status === 'fulfilled') setDashboardStats(statsResult.value);
    else {
      setDashboardStats(null);
      setStatsError(statsResult.reason instanceof Error ? statsResult.reason.message : 'Unable to load dashboard statistics.');
    }
    setRefreshing(false);
  }, [user, storeId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const isCustomer = user?.role === UserRole.CUSTOMER;
  const isPlatform = user?.role === UserRole.PLATFORM_ADMIN;
  const firstName = user?.firstName?.split(' ')[0] || (locale === 'ar' ? 'مرحباً' : 'Welcome');
  const roleName = user ? roleTitle[user.role][locale === 'ar' ? 0 : 1] : '';
  const userCounts = dashboardStats?.users && typeof dashboardStats.users === 'object'
    ? Object.values(dashboardStats.users as Record<string, unknown>).reduce<number>((sum, value) => sum + (Number(value) || 0), 0)
    : 0;
  const customerOrders = Array.isArray(dashboardStats?.orders) ? dashboardStats.orders.length : 0;

  return (
    <div className="dashboard-page">
      <div className="page-heading dashboard-heading">
        <div><span className="eyebrow">{locale === 'ar' ? 'الأحد، ٤ أكتوبر ٢٠٢٦' : 'Sunday, October 4, 2026'}</span><h1>{locale === 'ar' ? `أهلاً ${firstName} 👋` : `Good to see you, ${firstName} 👋`}</h1><p>{locale === 'ar' ? 'هذه لمحة سريعة عن مساحة عملك اليوم.' : 'Here is a quick look at your workspace today.'}</p></div>
        <button className="button button-outline" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}{locale === 'ar' ? 'تحديث البيانات' : 'Refresh data'}</button>
      </div>

      {probeError && <div className="alert alert-error"><Activity size={17} />{probeError}<button className="text-button" onClick={() => void refresh()}>{locale === 'ar' ? 'إعادة المحاولة' : 'Retry'}</button></div>}
      {statsError && <div className="alert alert-error"><BarChart3 size={17} />{statsError}</div>}

      <section className={`welcome-banner ${isCustomer ? 'customer-banner' : ''}`}>
        <div className="welcome-copy"><span className="welcome-pill"><Sparkles size={14} />{isPlatform ? (locale === 'ar' ? 'منصة سمارت ستور' : 'SmartStore platform') : roleName}</span><h2>{isCustomer ? (locale === 'ar' ? 'كل ما تحبه، في مكان واحد.' : 'Everything you love, in one place.') : (locale === 'ar' ? 'مساحة عملك جاهزة للنمو.' : 'Your workspace is ready to grow.')}</h2><p>{isCustomer ? (locale === 'ar' ? 'استكشف واجهة المتجر وتابع طلباتك.' : 'Explore the storefront and follow your orders.') : (locale === 'ar' ? 'تابع إعداد متجرك واستفد من أدواتك في مكان واحد.' : 'Keep your store on track with everything in one place.')}</p><Link className="banner-link" to={isCustomer ? '/storefront' : isPlatform ? '/platform/stores' : '/settings'}>{isCustomer ? (locale === 'ar' ? 'استكشف المتجر' : 'Explore storefront') : isPlatform ? (locale === 'ar' ? 'إدارة المتاجر' : 'Manage stores') : (locale === 'ar' ? 'إعداد مساحة العمل' : 'Set up workspace')}<ArrowLeft size={16} /></Link></div>
        <div className="welcome-art"><div className="art-ring ring-a" /><div className="art-ring ring-b" /><div className="art-card art-card-main"><span className="mini-card-icon"><ShoppingBag size={18} /></span><span><b>SmartStore</b><small>{locale === 'ar' ? 'متجرك، بطريقتك' : 'Store, your way'}</small></span><Sparkles size={16} className="art-sparkle" /></div><div className="art-float float-top"><span><Zap size={15} /></span><i /></div><div className="art-float float-bottom"><Check size={15} /></div></div>
      </section>

      {isCustomer && !storeId ? (
        <section className="tenant-card">
          <div className="tenant-icon"><Store size={19} /></div>
          <div className="tenant-copy"><strong>{locale === 'ar' ? 'ابدأ التسوق' : 'Start shopping'}</strong><span>{locale === 'ar' ? 'اكتشف المتاجر النشطة وانضم إليها من واجهة المتجر.' : 'Discover active stores and join one from the storefront.'}</span></div>
          <Link className="button button-small button-outline" to="/storefront">{locale === 'ar' ? 'اكتشف المتاجر' : 'Discover stores'}<ArrowLeft size={15} /></Link>
        </section>
      ) : !isCustomer && (
        <section className="tenant-card">
          <div className="tenant-icon"><Store size={19} /></div>
          <div className="tenant-copy"><strong>{locale === 'ar' ? 'مساحة المتجر' : 'Store workspace'}</strong><span>{user?.storeId ? (locale === 'ar' ? 'تم تحديد المتجر المرتبط بحسابك.' : 'Your account store is selected.') : (locale === 'ar' ? 'أدخل معرّف المتجر لتفعيل أدوات الإدارة المتصلة.' : 'Enter a store ID to enable connected management tools.')}</span></div>
          <form className="tenant-form" onSubmit={(event) => { event.preventDefault(); setStoreId(storeDraft); setStoreMessage(locale === 'ar' ? 'تم حفظ معرّف المتجر على هذا الجهاز.' : 'Store ID saved on this device.'); }}>
            <input value={storeDraft} onChange={(event) => setStoreDraft(event.target.value)} placeholder={locale === 'ar' ? 'معرّف المتجر' : 'Store ID'} aria-label="Store ID" />
            <button className="button button-small button-outline">{locale === 'ar' ? 'تطبيق' : 'Apply'}</button>
          </form>
          {storeMessage && <small className="tenant-message"><Check size={13} />{storeMessage}</small>}
        </section>
      )}

      <div className="section-title-row"><div><h2>{locale === 'ar' ? 'حالة مساحة العمل' : 'Workspace health'}</h2><p>{locale === 'ar' ? 'معلومات مباشرة من خادم SmartStore الحالي.' : 'Live information from the connected SmartStore API.'}</p></div><span className="live-label"><span className="pulse-dot" />{locale === 'ar' ? 'مباشر' : 'Live'}</span></div>

      <section className="stat-grid">
        {isPlatform && dashboardStats ? <>
          <StatCard icon={Store} label={locale === 'ar' ? 'إجمالي المتاجر' : 'Total stores'} value={String(dashboardStats.stores ?? 0)} detail={`${locale === 'ar' ? 'نشطة' : 'Active'}: ${String(dashboardStats.activeStores ?? 0)}`} accent="mint" />
          <StatCard icon={Users} label={locale === 'ar' ? 'الحسابات' : 'Accounts'} value={String(userCounts)} detail={locale === 'ar' ? 'جميع الأدوار' : 'All roles'} accent="violet" />
          <StatCard icon={ClipboardList} label={locale === 'ar' ? 'الطلبات' : 'Orders'} value={String(dashboardStats.orders ?? 0)} detail={locale === 'ar' ? 'عبر المنصة' : 'Across the platform'} accent="amber" />
          <StatCard icon={CreditCard} label={locale === 'ar' ? 'الإيرادات' : 'Revenue'} value={formatCurrency(dashboardStats.revenue, locale)} detail={locale === 'ar' ? 'من قاعدة البيانات' : 'From the database'} accent="blue" />
        </> : user?.role !== UserRole.CUSTOMER && dashboardStats ? <>
          <StatCard icon={Package} label={locale === 'ar' ? 'المنتجات' : 'Products'} value={String(dashboardStats.products ?? 0)} detail={`${locale === 'ar' ? 'نشطة' : 'Active'}: ${String(dashboardStats.activeProducts ?? 0)}`} accent="mint" />
          <StatCard icon={ClipboardList} label={locale === 'ar' ? 'الطلبات' : 'Orders'} value={String(dashboardStats.orders ?? 0)} detail={`${locale === 'ar' ? 'معلقة' : 'Pending'}: ${String(dashboardStats.pendingOrders ?? 0)}`} accent="violet" />
          <StatCard icon={Users} label={locale === 'ar' ? 'العملاء' : 'Customers'} value={String(dashboardStats.customers ?? 0)} detail={locale === 'ar' ? 'مرتبطون بالمتجر' : 'Joined this store'} accent="amber" />
          <StatCard icon={CreditCard} label={locale === 'ar' ? 'الإيرادات' : 'Revenue'} value={formatCurrency(dashboardStats.revenue, locale)} detail={locale === 'ar' ? 'من قاعدة البيانات' : 'From the database'} accent="blue" />
        </> : user?.role === UserRole.CUSTOMER && dashboardStats ? <>
          <StatCard icon={ClipboardList} label={locale === 'ar' ? 'طلباتي' : 'My orders'} value={String(dashboardStats.pagination && typeof dashboardStats.pagination === 'object' ? (dashboardStats.pagination as Record<string, unknown>).total ?? customerOrders : customerOrders)} detail={locale === 'ar' ? 'من سجل طلباتك' : 'In your order history'} accent="mint" />
          <StatCard icon={Activity} label={locale === 'ar' ? 'حالة الخادم' : 'API status'} value={health?.status === 'healthy' ? (locale === 'ar' ? 'يعمل' : 'Operational') : '—'} detail={API_URL} accent="violet" />
          <StatCard icon={Zap} label={locale === 'ar' ? 'مدة التشغيل' : 'Uptime'} value={health ? formatUptime(health.uptime) : '—'} detail={locale === 'ar' ? 'حسب الخادم' : 'Reported by API'} accent="amber" />
          <StatCard icon={WandSparkles} label="Socket.IO" value={socketState === 'connected' ? (locale === 'ar' ? 'متصل' : 'Connected') : (locale === 'ar' ? 'غير متصل' : 'Offline')} detail={locale === 'ar' ? 'الأحداث الفورية' : 'Realtime events'} accent="blue" />
        </> : <>
          <StatCard icon={Activity} label={locale === 'ar' ? 'حالة الخادم' : 'API status'} value={health?.status === 'healthy' ? (locale === 'ar' ? 'يعمل' : 'Operational') : health ? '—' : '...'} detail={API_URL} accent="mint" />
          <StatCard icon={Globe2} label={locale === 'ar' ? 'نسخة API' : 'API release'} value={apiInfo?.version || '1.0.0'} detail={apiInfo?.name || 'SmartStore API'} accent="violet" />
          <StatCard icon={Zap} label={locale === 'ar' ? 'مدة التشغيل' : 'Uptime'} value={health ? formatUptime(health.uptime) : '—'} detail={locale === 'ar' ? 'حسب الخادم' : 'Reported by API'} accent="amber" />
          <StatCard icon={WandSparkles} label="Socket.IO" value={socketState === 'connected' ? (locale === 'ar' ? 'متصل' : 'Connected') : (locale === 'ar' ? 'غير متصل' : 'Offline')} detail={locale === 'ar' ? 'الأحداث الفورية' : 'Realtime events'} accent="blue" />
        </>}
      </section>

      <section className="dashboard-lower">
        <div className="panel system-panel">
          <div className="panel-heading"><div><h3>{locale === 'ar' ? 'الاتصال بالخادم' : 'Backend connection'}</h3><p>{locale === 'ar' ? 'المسارات الفعلية التي استجاب لها API.' : 'Endpoints that answered on the running API.'}</p></div><span className={`status-chip ${health?.status === 'healthy' ? 'status-good' : 'status-wait'}`}><i />{health?.status === 'healthy' ? (locale === 'ar' ? 'متصل' : 'Online') : (locale === 'ar' ? 'غير معروف' : 'Unknown')}</span></div>
          <div className="connection-list">
            <ConnectionRow icon={Activity} label={locale === 'ar' ? 'فحص الصحة' : 'Health check'} endpoint="GET /health" active={!!health} />
            <ConnectionRow icon={Globe2} label={locale === 'ar' ? 'معلومات API' : 'API information'} endpoint="GET /api/info" active={!!apiInfo} />
            <ConnectionRow icon={ShieldCheck} label={locale === 'ar' ? 'تسجيل الدخول' : 'Authentication'} endpoint="POST /api/auth/login · /api/auth/me" active />
            {isPlatform && <ConnectionRow icon={Globe2} label={locale === 'ar' ? 'حالة واجهة المنصة' : 'Platform API status'} endpoint="GET /api/platform" active={platformApiAvailable} />}
            {isPlatform && <ConnectionRow icon={Store} label={locale === 'ar' ? 'مسار المتاجر' : 'Stores route'} endpoint="GET /api/stores" active={storesRouteAvailable} />}
            <ConnectionRow icon={WandSparkles} label={locale === 'ar' ? 'Socket.IO' : 'Socket.IO realtime'} endpoint={SOCKET_URL} active={socketState === 'connected'} />
          </div>
        </div>
        <div className="panel quick-panel">
          <div className="panel-heading"><div><h3>{locale === 'ar' ? 'وصول سريع' : 'Quick access'}</h3><p>{locale === 'ar' ? 'انتقل مباشرة إلى أدواتك.' : 'Jump straight into your tools.'}</p></div><span className="quick-grid-icon"><Zap size={17} /></span></div>
          <div className="quick-links">
            {(isCustomer
              ? [{ path: '/storefront', icon: Store, label: locale === 'ar' ? 'تصفّح المتجر' : 'Browse store', tone: 'blue' }, { path: '/cart', icon: ShoppingCart, label: locale === 'ar' ? 'سلة التسوق' : 'Shopping cart', tone: 'mint' }, { path: '/orders', icon: ClipboardList, label: locale === 'ar' ? 'طلباتي' : 'My orders', tone: 'amber' }]
              : [{ path: '/products', icon: Package, label: locale === 'ar' ? 'إدارة المنتجات' : 'Manage products', tone: 'blue' }, { path: '/orders', icon: ClipboardList, label: locale === 'ar' ? 'متابعة الطلبات' : 'Review orders', tone: 'mint' }, { path: '/settings', icon: Settings2, label: locale === 'ar' ? 'إعدادات المتجر' : 'Store settings', tone: 'violet' }]
            ).map(({ path, icon: Icon, label, tone }) => <Link to={path} className="quick-link" key={path}><span className={`quick-icon quick-${tone}`}><Icon size={18} /></span><strong>{label}</strong><ChevronLeft size={16} /></Link>)}
          </div>
          <div className="quick-footer"><span className="pulse-dot" />{locale === 'ar' ? 'بيانات النشاط التجاري تُحمّل مباشرة من API.' : 'Business data is always loaded from the API.'}</div>
        </div>
      </section>

      <section className="notice-strip"><span>{storeId || user?.storeId ? <Check size={17} /> : <CircleHelp size={17} />}</span><p>{storeId || user?.storeId
        ? (locale === 'ar' ? 'واجهات المنتجات والطلبات والعملاء والتوصيل متصلة ببيانات API. تُحدّث حالة الطلبات فورياً عبر Socket.IO.' : 'Products, orders, customers and delivery use live API data. Order updates are delivered through Socket.IO.')
        : (locale === 'ar' ? 'اختر مساحة متجر لعرض بيانات المنتجات والطلبات والتوصيل. بيانات المنصة متصلة بقاعدة البيانات.' : 'Select a store workspace to view product, order and delivery data. Platform data is connected to the database.')}
        </p><Link to={storeId || user?.storeId ? '/products' : '/storefront'}>{storeId || user?.storeId ? (locale === 'ar' ? 'إدارة المنتجات' : 'Manage products') : (locale === 'ar' ? 'اختيار متجر' : 'Choose a store')}<ArrowLeft size={14} /></Link></section>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, detail, accent }: { icon: typeof Activity; label: string; value: string; detail: string; accent: string }) {
  return <article className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon stat-${accent}`}><Icon size={18} /></span></div><strong className="stat-value">{value}</strong><small className="stat-detail">{detail}</small></article>;
}

function ConnectionRow({ icon: Icon, label, endpoint, active }: { icon: typeof Activity; label: string; endpoint: string; active: boolean }) {
  return <div className="connection-row"><span className="connection-icon"><Icon size={16} /></span><span className="connection-label">{label}<small>{endpoint}</small></span><span className={`connection-indicator ${active ? 'indicator-active' : ''}`} title={active ? 'Connected' : 'Not available'} /></div>;
}

function StoreProfilePage({ section }: { section: 'settings' | 'branding' }) {
  const { locale, storeId, user } = useApp();
  const activeStoreId = user?.storeId || storeId;
  const [store, setStore] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [uploaded, setUploaded] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState('');
  const isBranding = section === 'branding';
  const heading = isBranding
    ? (locale === 'ar' ? 'هوية المتجر' : 'Store branding')
    : (locale === 'ar' ? 'إعدادات المتجر' : 'Store settings');

  const load = useCallback(async () => {
    if (!activeStoreId) return;
    setLoading(true);
    setError('');
    try {
      setStore(await apiRequest<Record<string, unknown>>(`/stores/${encodeURIComponent(activeStoreId)}`));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load store settings.');
    } finally {
      setLoading(false);
    }
  }, [activeStoreId]);
  useEffect(() => { void load(); }, [load]);

  async function uploadImage(kind: string, file?: File) {
    if (!file || !activeStoreId) return;
    setError('');
    setMessage('');
    if (file.size > 2 * 1024 * 1024) {
      setError(locale === 'ar' ? 'حجم الصورة يجب ألا يتجاوز 2 ميغابايت.' : 'Image must be 2 MB or smaller.');
      return;
    }
    setUploading(kind);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(new Error('Unable to read the selected file.'));
        reader.readAsDataURL(file);
      });
      const result = await apiRequest<{ url: string }>(`/stores/${encodeURIComponent(activeStoreId)}/uploads`, {
        method: 'POST',
        body: JSON.stringify({ kind, dataBase64 }),
      });
      setUploaded((current) => ({ ...current, [kind]: `${SOCKET_URL}${result.url}` }));
      setMessage(locale === 'ar' ? 'تم رفع الصورة. اضغط حفظ لتطبيقها.' : 'Image uploaded. Press save to apply it.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Upload failed.');
    } finally {
      setUploading('');
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeStoreId) return;
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) || '').trim();
    const fields = isBranding
      ? { logo: value('logo') || null, favicon: value('favicon') || null, primaryColor: value('primaryColor'), secondaryColor: value('secondaryColor') }
      : {
          name: value('name'),
          description: value('description') || null,
          phone: value('phone') || null,
          whatsapp: value('whatsapp') || null,
          email: value('email') || null,
          address: value('address') || null,
          city: value('city') || null,
          latitude: value('latitude') ? Number(value('latitude')) : null,
          longitude: value('longitude') ? Number(value('longitude')) : null,
          mapUrl: value('mapUrl') || null,
          openingHours: form.get('hoursEnabled') === 'on'
            ? Object.fromEntries(WEEK_DAYS.map((day) => [day.key, {
                closed: form.get(`hours_${day.key}_closed`) === 'on',
                open: value(`hours_${day.key}_open`) || '09:00',
                close: value(`hours_${day.key}_close`) || '22:00',
              }]))
            : null,
          defaultCurrency: value('defaultCurrency').toUpperCase(),
          locale: value('locale'),
          dir: value('dir'),
        };
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await apiRequest(`/stores/${encodeURIComponent(activeStoreId)}/${section}`, {
        method: 'PUT',
        body: JSON.stringify(fields),
      });
      setMessage(locale === 'ar' ? 'تم حفظ التغييرات في قاعدة البيانات.' : 'Changes saved to the database.');
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save store settings.');
    } finally {
      setSaving(false);
    }
  }

  const fields: Array<[string, string, unknown, string]> = isBranding
    ? [
        ['logo', locale === 'ar' ? 'رابط الشعار' : 'Logo URL', store?.logo || '', 'url'],
        ['favicon', locale === 'ar' ? 'رابط الأيقونة' : 'Favicon URL', store?.favicon || '', 'url'],
        ['primaryColor', locale === 'ar' ? 'اللون الأساسي' : 'Primary color', store?.primaryColor || '#2563eb', 'color'],
        ['secondaryColor', locale === 'ar' ? 'اللون الثانوي' : 'Secondary color', store?.secondaryColor || '#1e40af', 'color'],
      ]
    : [
        ['name', locale === 'ar' ? 'اسم المتجر' : 'Store name', store?.name || '', 'text'],
        ['phone', locale === 'ar' ? 'الهاتف' : 'Phone', store?.phone || '', 'tel'],
        ['whatsapp', 'WhatsApp', store?.whatsapp || '', 'tel'],
        ['email', locale === 'ar' ? 'البريد الإلكتروني' : 'Email', store?.email || '', 'email'],
        ['address', locale === 'ar' ? 'العنوان' : 'Address', store?.address || '', 'text'],
        ['city', locale === 'ar' ? 'المدينة' : 'City', store?.city || '', 'text'],
        ['latitude', locale === 'ar' ? 'خط العرض' : 'Latitude', store?.latitude ?? '', 'number'],
        ['longitude', locale === 'ar' ? 'خط الطول' : 'Longitude', store?.longitude ?? '', 'number'],
        ['mapUrl', locale === 'ar' ? 'رابط الخريطة' : 'Map link', store?.mapUrl || '', 'url'],
        ['defaultCurrency', locale === 'ar' ? 'العملة' : 'Currency', store?.defaultCurrency || 'IQD',         'text'],
        ['locale', locale === 'ar' ? 'الإعداد المحلي' : 'Locale', store?.locale || 'ar-SA', 'text'],
      ];

  return <div className="resource-page">
    <div className="page-heading"><div><span className="eyebrow">{locale === 'ar' ? 'تخصيص المتجر' : 'Store customization'}</span><h1>{heading}</h1><p>{locale === 'ar' ? 'التغييرات تحفظ مباشرة في إعدادات المتجر.' : 'Changes are persisted to the store record through the API.'}</p></div><button className="button button-outline" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} />{locale === 'ar' ? 'تحديث' : 'Refresh'}</button></div>
    {!activeStoreId && <div className="alert alert-info"><Store size={17} />{locale === 'ar' ? 'اختر معرّف المتجر من لوحة المعلومات أولاً.' : 'Select a store ID on the dashboard first.'}<Link to="/">{locale === 'ar' ? 'لوحة المعلومات' : 'Dashboard'}</Link></div>}
    {error && <div className="alert alert-error" role="alert"><CircleHelp size={17} />{error}</div>}
    {message && <div className="alert alert-info" role="status"><Check size={17} />{message}</div>}
    {activeStoreId && <section className="panel profile-panel"><form key={String(store?.updatedAt || store?.id || activeStoreId)} className="modal-form profile-form" onSubmit={save}>
      {fields.map(([key, label, value, type]) => <label className="field-label" key={`${key}-${uploaded[key] || ''}`}>{label}<input className="input-control" name={key} type={type} step={type === 'number' ? 'any' : undefined} min={key === 'latitude' ? -90 : key === 'longitude' ? -180 : undefined} max={key === 'latitude' ? 90 : key === 'longitude' ? 180 : undefined} defaultValue={uploaded[key] ?? String(value)} required={key === 'name' || key === 'defaultCurrency' || key === 'locale' || key.includes('Color')} />
        {(key === 'logo' || key === 'favicon') && <span className="upload-row"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={uploading === key} onChange={(event) => { void uploadImage(key, event.target.files?.[0]); event.target.value = ''; }} />{uploading === key && <LoaderCircle className="spin" size={15} />}</span>}
      </label>)}
      {!isBranding && <><label className="field-label">{locale === 'ar' ? 'الوصف' : 'Description'}<textarea className="input-control" name="description" rows={3} defaultValue={String(store?.description || '')} /></label><label className="field-label">{locale === 'ar' ? 'اتجاه الواجهة' : 'Layout direction'}<select className="input-control" name="dir" defaultValue={String(store?.dir || 'rtl')}><option value="rtl">RTL</option><option value="ltr">LTR</option></select></label>{(() => { const saved = parseOpeningHours(store?.openingHours); return <fieldset className="hours-editor"><legend><Clock3 size={15} />{locale === 'ar' ? 'ساعات العمل' : 'Opening hours'}</legend><label className="checkbox-field"><input type="checkbox" name="hoursEnabled" defaultChecked={Boolean(saved)} />{locale === 'ar' ? 'عرض ساعات العمل للعملاء' : 'Show opening hours to customers'}</label>{WEEK_DAYS.map((day) => { const entry = saved?.[day.key] || { closed: false, open: '09:00', close: '22:00' }; return <div className="hours-row" key={day.key}><span className="hours-day">{locale === 'ar' ? day.ar : day.en}</span><input className="input-control" type="time" name={`hours_${day.key}_open`} defaultValue={entry.open} aria-label={`${day.en} open`} /><input className="input-control" type="time" name={`hours_${day.key}_close`} defaultValue={entry.close} aria-label={`${day.en} close`} /><label className="checkbox-field"><input type="checkbox" name={`hours_${day.key}_closed`} defaultChecked={entry.closed} />{locale === 'ar' ? 'مغلق' : 'Closed'}</label></div>; })}</fieldset>; })()}</>}
      <div className="row-actions"><button className="button button-primary" disabled={saving || loading}>{saving ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{locale === 'ar' ? 'حفظ التغييرات' : 'Save changes'}</button></div>
    </form></section>}
  </div>;
}

type CustomerAddress = {
  id: string;
  customerName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  district?: string | null;
  building?: string | null;
  floor?: string | null;
  apartment?: string | null;
  postalCode?: string | null;
  isDefault: boolean;
};

function CustomerProfilePage() {
  const { user, setUser, locale, storeId } = useApp();
  const customerId = user?.customerId || user?.id || '';
  const activeStoreId = user?.storeId || storeId;
  const [profile, setProfile] = useState<{ firstName?: string | null; lastName?: string | null; email?: string | null; phone?: string | null }>({});
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [editingAddress, setEditingAddress] = useState<CustomerAddress | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    setError('');
    try {
      const value = await apiRequest<Record<string, unknown>>(`/customers/${encodeURIComponent(customerId)}/profile`);
      setProfile({
        firstName: typeof value.firstName === 'string' ? value.firstName : '',
        lastName: typeof value.lastName === 'string' ? value.lastName : '',
        email: typeof value.email === 'string' ? value.email : '',
        phone: typeof value.phone === 'string' ? value.phone : '',
      });
      if (activeStoreId) {
        const result = await apiRequest<unknown>(`/customers/${encodeURIComponent(customerId)}/addresses?storeId=${encodeURIComponent(activeStoreId)}`);
        setAddresses(Array.isArray(result) ? result as CustomerAddress[] : []);
      } else {
        setAddresses([]);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load your profile.');
    } finally {
      setLoading(false);
    }
  }, [customerId, activeStoreId]);
  useEffect(() => { void load(); }, [load]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const updated = await apiRequest<Record<string, unknown>>(`/customers/${encodeURIComponent(customerId)}/profile`, {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: String(form.get('firstName') || '').trim(),
          lastName: String(form.get('lastName') || '').trim() || null,
          email: String(form.get('email') || '').trim() || null,
          phone: String(form.get('phone') || '').trim(),
        }),
      });
      setProfile({
        firstName: typeof updated.firstName === 'string' ? updated.firstName : '',
        lastName: typeof updated.lastName === 'string' ? updated.lastName : '',
        email: typeof updated.email === 'string' ? updated.email : '',
        phone: typeof updated.phone === 'string' ? updated.phone : '',
      });
      if (user) setUser({ ...user, firstName: String(updated.firstName || ''), lastName: String(updated.lastName || ''), email: String(updated.email || ''), phone: String(updated.phone || '') });
      setMessage(locale === 'ar' ? 'تم تحديث بيانات الحساب.' : 'Profile updated.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update your profile.');
    } finally {
      setSaving(false);
    }
  }

  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeStoreId) return;
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) || '').trim();
    setSaving(true);
    setError('');
    try {
      const payload = {
        storeId: activeStoreId,
        customerName: value('customerName'),
        phone: value('addressPhone'),
        addressLine1: value('addressLine1'),
        addressLine2: value('addressLine2') || undefined,
        city: value('city'),
        district: value('district') || undefined,
        building: value('building') || undefined,
        floor: value('floor') || undefined,
        apartment: value('apartment') || undefined,
        postalCode: value('postalCode') || undefined,
        isDefault: form.get('isDefault') === 'on',
      };
      await apiRequest(`/customers/${encodeURIComponent(customerId)}/addresses${editingAddress ? `/${encodeURIComponent(editingAddress.id)}` : ''}`, {
        method: editingAddress ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      setEditingAddress(null);
      setMessage(locale === 'ar' ? 'تم حفظ العنوان.' : 'Address saved.');
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save address.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteAddress(address: CustomerAddress) {
    if (!activeStoreId || !window.confirm(locale === 'ar' ? 'هل تريد حذف هذا العنوان؟' : 'Delete this address?')) return;
    try {
      await apiRequest(`/customers/${encodeURIComponent(customerId)}/addresses/${encodeURIComponent(address.id)}?storeId=${encodeURIComponent(activeStoreId)}`, { method: 'DELETE' });
      setMessage(locale === 'ar' ? 'تم حذف العنوان.' : 'Address deleted.');
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to delete address.');
    }
  }

  return <div className="resource-page">
    <div className="page-heading"><div><span className="eyebrow">{locale === 'ar' ? 'حساب العميل' : 'Customer account'}</span><h1>{locale === 'ar' ? 'ملفي الشخصي' : 'My profile'}</h1><p>{locale === 'ar' ? 'بيانات حسابك وعناوين التوصيل المحفوظة لهذا المتجر.' : 'Your account details and saved delivery addresses for this store.'}</p></div><button className="button button-outline" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} />{locale === 'ar' ? 'تحديث' : 'Refresh'}</button></div>
    {error && <div className="alert alert-error" role="alert"><CircleHelp size={17} />{error}</div>}
    {message && <div className="alert alert-info" role="status"><Check size={17} />{message}</div>}
    {!activeStoreId && <div className="alert alert-info"><Store size={17} />{locale === 'ar' ? 'اختر متجراً من واجهة المتجر لإدارة عناوينه.' : 'Choose a store from the storefront to manage its addresses.'}<Link to="/storefront">{locale === 'ar' ? 'اختيار متجر' : 'Choose a store'}</Link></div>}
    <section className="panel profile-panel"><div className="panel-heading"><div><h3>{locale === 'ar' ? 'بيانات الحساب' : 'Account details'}</h3><p>{locale === 'ar' ? 'يتم تحديث ملف العميل وحساب الدخول معاً.' : 'Customer and sign-in profile fields stay in sync.'}</p></div></div>
      <form key={`${profile.firstName || ''}:${profile.lastName || ''}:${profile.email || ''}:${profile.phone || ''}`} className="modal-form profile-form" onSubmit={saveProfile}>
        {([['firstName', locale === 'ar' ? 'الاسم الأول' : 'First name'], ['lastName', locale === 'ar' ? 'اسم العائلة' : 'Last name'], ['email', locale === 'ar' ? 'البريد الإلكتروني' : 'Email'], ['phone', locale === 'ar' ? 'رقم الهاتف' : 'Phone']]).map(([key, label]) => <label className="field-label" key={key}>{label}<input className="input-control" name={key} type={key === 'email' ? 'email' : 'text'} defaultValue={profile[key as keyof typeof profile] || ''} required={key === 'firstName' || key === 'phone'} /></label>)}
        <button className="button button-primary" disabled={saving || loading}>{saving ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{locale === 'ar' ? 'حفظ الملف' : 'Save profile'}</button>
      </form>
    </section>
    <section className="panel profile-panel"><div className="panel-heading"><div><h3>{locale === 'ar' ? 'عناوين التوصيل' : 'Delivery addresses'}</h3><p>{locale === 'ar' ? 'العناوين معزولة بحسب المتجر.' : 'Addresses are scoped to the selected store.'}</p></div></div>
      {activeStoreId ? <><div className="address-list">{addresses.map((address) => <article className="address-card" key={address.id}><div><strong>{address.customerName}</strong>{address.isDefault && <span className="status-chip status-good"><i />{locale === 'ar' ? 'افتراضي' : 'Default'}</span>}<p>{[address.addressLine1, address.addressLine2, address.district, address.city].filter(Boolean).join(', ')}</p><small>{address.phone}</small></div><div className="row-actions"><button className="button button-quiet button-small" onClick={() => setEditingAddress(address)}>{locale === 'ar' ? 'تعديل' : 'Edit'}</button><button className="button button-quiet button-small" onClick={() => void deleteAddress(address)}>{locale === 'ar' ? 'حذف' : 'Delete'}</button></div></article>)}{!addresses.length && <div className="table-state">{locale === 'ar' ? 'لا توجد عناوين محفوظة بعد.' : 'No saved addresses yet.'}</div>}</div>
      <form key={editingAddress?.id || 'new-address'} className="modal-form profile-form" onSubmit={saveAddress}>
        {([['customerName', locale === 'ar' ? 'اسم المستلم' : 'Recipient name', editingAddress?.customerName || `${profile.firstName || ''} ${profile.lastName || ''}`.trim()], ['addressPhone', locale === 'ar' ? 'هاتف المستلم' : 'Recipient phone', editingAddress?.phone || profile.phone || ''], ['addressLine1', locale === 'ar' ? 'العنوان' : 'Address line', editingAddress?.addressLine1 || ''], ['addressLine2', locale === 'ar' ? 'تفاصيل إضافية' : 'Address details', editingAddress?.addressLine2 || ''], ['city', locale === 'ar' ? 'المدينة' : 'City', editingAddress?.city || ''], ['district', locale === 'ar' ? 'المنطقة' : 'District', editingAddress?.district || ''], ['building', locale === 'ar' ? 'المبنى' : 'Building', editingAddress?.building || ''], ['floor', locale === 'ar' ? 'الطابق' : 'Floor', editingAddress?.floor || ''], ['apartment', locale === 'ar' ? 'الشقة' : 'Apartment', editingAddress?.apartment || ''], ['postalCode', locale === 'ar' ? 'الرمز البريدي' : 'Postal code', editingAddress?.postalCode || '']]).map(([key, label, value]) => <label className="field-label" key={key}>{label}<input className="input-control" name={key} defaultValue={value} required={key === 'customerName' || key === 'addressPhone' || key === 'addressLine1' || key === 'city'} /></label>)}
        <label className="remember"><input name="isDefault" type="checkbox" defaultChecked={editingAddress?.isDefault || false} />{locale === 'ar' ? 'اجعله العنوان الافتراضي' : 'Set as default address'}</label>
        <div className="row-actions"><button className="button button-primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{editingAddress ? (locale === 'ar' ? 'حفظ العنوان' : 'Save address') : (locale === 'ar' ? 'إضافة العنوان' : 'Add address')}</button>{editingAddress && <button type="button" className="button button-quiet" onClick={() => setEditingAddress(null)}>{locale === 'ar' ? 'إلغاء التعديل' : 'Cancel edit'}</button>}</div>
      </form></> : null}
    </section>
  </div>;
}

type ManagedStore = {
  id: string;
  name: string;
  slug: string;
  status: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  defaultCurrency?: string;
  _count?: { products?: number; orders?: number; customerStores?: number };
};

function PlatformStoresPage() {
  const { locale } = useApp();
  const [stores, setStores] = useState<ManagedStore[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalStores, setTotalStores] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedStore | null>(null);
  const [details, setDetails] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search.trim()) params.set('search', search.trim());
      const response = await apiRequest<{ stores: ManagedStore[]; pagination?: { totalPages?: number; total?: number } }>(`/platform/stores?${params.toString()}`);
      setStores(response.stores || []);
      setTotalPages(Math.max(1, response.pagination?.totalPages || 1));
      setTotalStores(response.pagination?.total ?? (response.stores || []).length);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load stores.');
      setStores([]);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { void load(); }, [load]);

  async function createStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const value = (key: string) => String(fields.get(key) || '').trim();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await apiRequest('/platform/stores', {
        method: 'POST',
        body: JSON.stringify({
          name: value('name'),
          slug: value('slug'),
          phone: value('phone') || undefined,
          address: value('address') || undefined,
          defaultCurrency: value('defaultCurrency') || undefined,
          owner: {
            firstName: value('ownerFirstName') || undefined,
            lastName: value('ownerLastName') || undefined,
            email: value('ownerEmail') || undefined,
            phone: value('ownerPhone'),
            password: value('ownerPassword'),
          },
        }),
      });
      setCreateOpen(false);
      setMessage(locale === 'ar' ? 'تم إنشاء المتجر وحساب المالك.' : 'Store and owner account created.');
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create store.');
    } finally {
      setSaving(false);
    }
  }

  async function saveStoreSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const fields = new FormData(event.currentTarget);
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/platform/stores/${encodeURIComponent(editing.id)}/settings`, {
        method: 'PUT',
        body: JSON.stringify({
          name: String(fields.get('name') || '').trim(),
          phone: String(fields.get('phone') || '').trim() || null,
          email: String(fields.get('email') || '').trim() || null,
          address: String(fields.get('address') || '').trim() || null,
          defaultCurrency: String(fields.get('defaultCurrency') || '').trim(),
        }),
      });
      setEditing(null);
      setMessage(locale === 'ar' ? 'تم تحديث إعدادات المتجر.' : 'Store settings updated.');
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update store.');
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(store: ManagedStore) {
    const status = store.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    if (!window.confirm(locale === 'ar' ? `هل تريد تغيير حالة ${store.name} إلى ${status}؟` : `Change ${store.name} status to ${status}?`)) return;
    setError('');
    setMessage('');
    try {
      await apiRequest(`/platform/stores/${encodeURIComponent(store.id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setMessage(locale === 'ar' ? 'تم تحديث حالة المتجر.' : 'Store status updated.');
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to change store status.');
    }
  }

  async function showDetails(store: ManagedStore) {
    setError('');
    try {
      const result = await apiRequest<Record<string, unknown>>(`/platform/stores/${encodeURIComponent(store.id)}`);
      setDetails(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load store details.');
    }
  }

  return (
    <div className="resource-page">
      <div className="page-heading">
        <div><span className="eyebrow">{locale === 'ar' ? 'إدارة المنصة' : 'Platform administration'}</span><h1>{locale === 'ar' ? 'المتاجر' : 'Stores'}</h1><p>{locale === 'ar' ? 'إدارة المستأجرين والمالكين من قاعدة البيانات.' : 'Manage store tenants and owner accounts using the live API.'}</p></div>
        <div className="heading-actions">
          <button className="button button-outline" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} />{locale === 'ar' ? 'تحديث' : 'Refresh'}</button>
          <button className="button button-primary" onClick={() => { setError(''); setCreateOpen(true); }}><Plus size={17} />{locale === 'ar' ? 'إنشاء متجر' : 'Create store'}</button>
        </div>
      </div>
      {error && <div className="alert alert-error" role="alert"><CircleHelp size={17} />{error}</div>}
      {message && <div className="alert alert-info" role="status"><Check size={17} />{message}</div>}
      {details && <section className="panel"><div className="panel-heading"><div><h3>{locale === 'ar' ? 'تفاصيل المتجر' : 'Store details'}</h3><p>{String(details.name || details.slug || '')}</p></div><button className="icon-button" onClick={() => setDetails(null)} aria-label={locale === 'ar' ? 'إغلاق' : 'Close'}><X size={17} /></button></div><pre className="details-json">{JSON.stringify(details, null, 2)}</pre></section>}
      <section className="panel data-panel">
        <div className="data-toolbar"><div className="data-title"><span className="resource-icon tone-products"><Store size={17} /></span><div><h3>{locale === 'ar' ? 'جميع المتاجر' : 'All stores'}</h3><p>{locale === 'ar' ? 'نتائج حية من API المنصة' : 'Live records from the platform API'}</p></div></div><label className="table-search"><Search size={15} /><input value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder={locale === 'ar' ? 'بحث بالاسم أو الرابط...' : 'Search name or slug...'} /></label></div>
        {loading ? <div className="table-state"><LoaderCircle size={24} className="spin" />{locale === 'ar' ? 'جارٍ تحميل المتاجر...' : 'Loading stores...'}</div>
          : stores.length === 0 ? <div className="table-state empty-state"><strong>{locale === 'ar' ? 'لا توجد متاجر مطابقة' : 'No matching stores'}</strong></div>
          : <div className="table-scroll"><table className="records-table"><thead><tr><th>{locale === 'ar' ? 'المتجر' : 'Store'}</th><th>{locale === 'ar' ? 'الحالة' : 'Status'}</th><th>{locale === 'ar' ? 'المنتجات' : 'Products'}</th><th>{locale === 'ar' ? 'الطلبات' : 'Orders'}</th><th>{locale === 'ar' ? 'العملاء' : 'Customers'}</th><th>{locale === 'ar' ? 'إجراءات' : 'Actions'}</th></tr></thead><tbody>
            {stores.map((store) => <tr key={store.id}><td><strong>{store.name}</strong><br /><small>{store.slug}</small></td><td><span className={`status-chip ${store.status === 'ACTIVE' ? 'status-good' : 'status-wait'}`}><i />{store.status}</span></td><td>{store._count?.products ?? 0}</td><td>{store._count?.orders ?? 0}</td><td>{store._count?.customerStores ?? 0}</td><td><div className="row-actions"><button className="button button-quiet button-small" onClick={() => void showDetails(store)}>{locale === 'ar' ? 'تفاصيل' : 'Details'}</button><button className="button button-quiet button-small" onClick={() => setEditing(store)}>{locale === 'ar' ? 'تعديل' : 'Edit'}</button><button className="button button-outline button-small" onClick={() => void changeStatus(store)}>{store.status === 'ACTIVE' ? (locale === 'ar' ? 'إيقاف' : 'Suspend') : (locale === 'ar' ? 'تفعيل' : 'Activate')}</button></div></td></tr>)}
          </tbody></table></div>}
        <Pagination page={page} totalPages={totalPages} total={totalStores} loading={loading} locale={locale} onChange={setPage} />
      </section>
      {createOpen && <div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true"><div className="modal-heading"><div><span className="eyebrow">{locale === 'ar' ? 'مستأجر جديد' : 'New tenant'}</span><h2>{locale === 'ar' ? 'إنشاء متجر ومالك' : 'Create store and owner'}</h2></div><button className="icon-button" onClick={() => setCreateOpen(false)}><X size={18} /></button></div>
        <form className="modal-form" onSubmit={createStore}>
          {[['name', 'Store name', true], ['slug', 'Store slug', true], ['phone', 'Store phone', false], ['address', 'Address', false], ['defaultCurrency', 'Currency (e.g. IQD)', false], ['ownerFirstName', 'Owner first name', false], ['ownerLastName', 'Owner last name', false], ['ownerEmail', 'Owner email', false], ['ownerPhone', 'Owner phone', true], ['ownerPassword', 'Owner password (8+)', true]].map(([key, label, required]) => <label className="field-label" key={String(key)}>{locale === 'ar' ? String(label) : String(label)}<input className="input-control" name={String(key)} type={key === 'ownerPassword' ? 'password' : key === 'ownerEmail' ? 'email' : 'text'} minLength={key === 'ownerPassword' ? 8 : undefined} required={Boolean(required)} /></label>)}
          {error && <div className="alert alert-error">{error}</div>}
          <div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setCreateOpen(false)}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</button><button className="button button-primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{locale === 'ar' ? 'إنشاء' : 'Create'}</button></div>
        </form>
      </section></div>}
      {editing && <div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true"><div className="modal-heading"><div><span className="eyebrow">{locale === 'ar' ? 'بيانات المتجر' : 'Store profile'}</span><h2>{editing.name}</h2></div><button className="icon-button" onClick={() => setEditing(null)}><X size={18} /></button></div>
        <form className="modal-form" onSubmit={saveStoreSettings}>
          {([['name', editing.name], ['phone', editing.phone || ''], ['email', editing.email || ''], ['address', editing.address || ''], ['defaultCurrency', editing.defaultCurrency || 'IQD']] as const).map(([key, value]) => <label className="field-label" key={key}>{key}<input className="input-control" name={key} type={key === 'email' ? 'email' : 'text'} defaultValue={value} required={key === 'name' || key === 'defaultCurrency'} /></label>)}
          <div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setEditing(null)}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</button><button className="button button-primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{locale === 'ar' ? 'حفظ التغييرات' : 'Save changes'}</button></div>
        </form>
      </section></div>}
    </div>
  );
}

type ResourceKind = 'products' | 'categories' | 'customers' | 'orders' | 'coupons' | 'delivery' | 'staff' | 'tables' | 'settings' | 'branding';

type ResourceDefinition = {
  title: string;
  en: string;
  description: string;
  descriptionEn: string;
  icon: typeof Package;
  path: (storeId: string, customerId: string) => string | null;
  createPath?: (storeId: string) => string | null;
  fields?: Array<{ key: string; label: string; type?: string; required?: boolean; options?: string[] }>;
  collection?: string;
  enabled: boolean;
  customerVisible?: boolean;
};

type EditableField = {
  key: string;
  label: string;
  type?: 'number' | 'select' | 'checkbox';
  options?: string[];
  sourceKey?: string;
};

const resourceDefinitions: Record<ResourceKind, ResourceDefinition> = {
  products: {
    title: 'المنتجات', en: 'Products', description: 'كتالوج المنتجات والمخزون', descriptionEn: 'Product catalog and inventory',
    icon: Package, path: (storeId) => apiPath('stores', storeId, 'products'),
    createPath: (storeId) => apiPath('stores', storeId, 'products'),
    fields: [
      { key: 'nameAr', label: 'الاسم بالعربية', required: true }, { key: 'nameEn', label: 'الاسم بالإنجليزية', required: true },
      { key: 'categoryId', label: 'معرّف التصنيف', required: true }, { key: 'price', label: 'السعر', type: 'number', required: true },
      { key: 'quantity', label: 'الكمية المتوفرة', type: 'number' }, { key: 'sku', label: 'رمز SKU' },
    ], collection: 'products', enabled: true, customerVisible: true,
  },
  categories: {
    title: 'التصنيفات', en: 'Categories', description: 'تنظيم أقسام المتجر', descriptionEn: 'Organize your store catalog',
    icon: Box, path: (storeId) => apiPath('stores', storeId, 'categories'),
    createPath: (storeId) => apiPath('stores', storeId, 'categories'),
    fields: [{ key: 'nameAr', label: 'الاسم بالعربية', required: true }, { key: 'nameEn', label: 'الاسم بالإنجليزية', required: true }, { key: 'parentId', label: 'معرّف التصنيف الأب' }],
    collection: 'categories', enabled: true,
  },
  customers: {
    title: 'العملاء', en: 'Customers', description: 'ملفات العملاء وعلاقات المتجر', descriptionEn: 'Customer profiles and store relationships',
    icon: Users, path: (storeId) => apiPath('stores', storeId, 'customers'), collection: 'customers', enabled: true,
  },
  orders: {
    title: 'الطلبات', en: 'Orders', description: 'متابعة الطلبات وحالات التجهيز', descriptionEn: 'Track orders and fulfillment',
    icon: ClipboardList, path: (storeId, customerId) => customerId
      ? apiPath('customers', customerId, 'orders')
      : apiPath('stores', storeId, 'orders'),
    collection: 'orders', enabled: true, customerVisible: true,
  },
  coupons: {
    title: 'الكوبونات', en: 'Coupons', description: 'إدارة العروض ورموز الخصم', descriptionEn: 'Manage promotions and discount codes',
    icon: BadgePercent, path: (storeId) => apiPath('stores', storeId, 'coupons'),
    createPath: (storeId) => apiPath('stores', storeId, 'coupons'),
    fields: [{ key: 'code', label: 'رمز الكوبون (٨ أحرف)', required: true }, { key: 'type', label: 'النوع', type: 'select', required: true, options: ['PERCENTAGE', 'FIXED'] }, { key: 'value', label: 'قيمة الخصم', type: 'number', required: true }, { key: 'minOrderValue', label: 'الحد الأدنى للطلب', type: 'number' }, { key: 'maxUses', label: 'عدد الاستخدامات', type: 'number' }],
    collection: 'coupons', enabled: true,
  },
  delivery: {
    title: 'التوصيل', en: 'Delivery', description: 'مناطق التغطية ورسوم التوصيل', descriptionEn: 'Delivery coverage and fees',
    icon: Truck, path: (storeId) => apiPath('stores', storeId, 'zones'),
    createPath: (storeId) => apiPath('stores', storeId, 'zones'),
    fields: [{ key: 'city', label: 'المدينة', required: true }, { key: 'area', label: 'المنطقة', required: true }, { key: 'deliveryFee', label: 'رسوم التوصيل', type: 'number', required: true }, { key: 'minimumOrder', label: 'الحد الأدنى للطلب', type: 'number', required: true }, { key: 'estDeliveryDays', label: 'أيام التوصيل (1–7)', type: 'number' }],
    collection: 'zones', enabled: true,
  },
  staff: {
    title: 'الفريق', en: 'Staff', description: 'إدارة موظفي المتجر وصلاحياتهم', descriptionEn: 'Manage store staff and account status',
    icon: Users, path: (storeId) => apiPath('stores', storeId, 'staff'),
    createPath: (storeId) => apiPath('stores', storeId, 'staff'),
    fields: [
      { key: 'role', label: 'الدور', type: 'select', required: true, options: ['STORE_ADMIN', 'STAFF'] },
      { key: 'phone', label: 'رقم الهاتف', required: true },
      { key: 'password', label: 'كلمة المرور', required: true },
      { key: 'email', label: 'البريد الإلكتروني' },
      { key: 'firstName', label: 'الاسم الأول' },
      { key: 'lastName', label: 'اسم العائلة' },
    ],
    collection: 'staff', enabled: true,
  },
  tables: {
    title: 'الطاولات', en: 'Tables & QR', description: 'طاولات المتجر ورموز QR للطلب من الطاولة', descriptionEn: 'Store tables and QR codes for table ordering',
    icon: QrCode, path: (storeId) => apiPath('stores', storeId, 'tables'),
    createPath: (storeId) => apiPath('stores', storeId, 'tables'),
    fields: [{ key: 'number', label: 'رقم الطاولة', required: true }, { key: 'label', label: 'الوصف' }],
    collection: 'tables', enabled: true,
  },
  settings: {
    title: 'الإعدادات', en: 'Store settings', description: 'إعدادات المتجر والمنطقة والعملة', descriptionEn: 'Store profile, locale and currency settings',
    icon: Settings2, path: () => null, enabled: false,
  },
  branding: {
    title: 'هوية المتجر', en: 'Branding', description: 'الشعار والألوان ومظهر الواجهة', descriptionEn: 'Logo, colors and storefront appearance',
    icon: Palette, path: () => null, enabled: false,
  },
};

const editableFields: Partial<Record<ResourceKind, EditableField[]>> = {
  products: [
    { key: 'nameAr', label: 'الاسم بالعربية' },
    { key: 'nameEn', label: 'الاسم بالإنجليزية' },
    { key: 'descriptionAr', label: 'الوصف بالعربية' },
    { key: 'descriptionEn', label: 'الوصف بالإنجليزية' },
    { key: 'price', label: 'السعر', type: 'number' },
    { key: 'compareAtPrice', label: 'السعر قبل الخصم', type: 'number' },
    { key: 'sku', label: 'رمز SKU' },
    { key: 'stock', label: 'المخزون', type: 'number' },
    { key: 'status', label: 'الحالة', type: 'select', options: ['ACTIVE', 'INACTIVE', 'DRAFT'] },
    { key: 'isFeatured', label: 'منتج مميز', type: 'checkbox' },
  ],
  categories: [
    { key: 'nameAr', label: 'الاسم بالعربية' },
    { key: 'nameEn', label: 'الاسم بالإنجليزية' },
    { key: 'isActive', label: 'نشط', type: 'checkbox' },
  ],
  coupons: [
    { key: 'code', label: 'رمز الكوبون' },
    { key: 'type', label: 'النوع', type: 'select', options: ['PERCENTAGE', 'FIXED'] },
    { key: 'value', label: 'قيمة الخصم', sourceKey: 'discount', type: 'number' },
    { key: 'minOrderValue', label: 'الحد الأدنى للطلب', sourceKey: 'minValue', type: 'number' },
    { key: 'maxUses', label: 'عدد الاستخدامات', sourceKey: 'usageLimit', type: 'number' },
    { key: 'status', label: 'الحالة', type: 'select', options: ['ACTIVE', 'INACTIVE'] },
  ],
  tables: [
    { key: 'number', label: 'رقم الطاولة' },
    { key: 'label', label: 'الوصف' },
    { key: 'isActive', label: 'نشط', type: 'checkbox' },
  ],
  delivery: [
    { key: 'city', label: 'المدينة' },
    { key: 'area', label: 'المنطقة' },
    { key: 'deliveryFee', label: 'رسوم التوصيل', type: 'number' },
    { key: 'minimumOrder', label: 'الحد الأدنى للطلب', type: 'number' },
    { key: 'estDeliveryDays', label: 'أيام التوصيل', type: 'number' },
    { key: 'isActive', label: 'نشط', type: 'checkbox' },
  ],
};

function ResourcePage({ kind }: { kind: ResourceKind }) {
  const { user, locale, storeId } = useApp();
  const definition = resourceDefinitions[kind];
  const customerId = user?.role === UserRole.CUSTOMER ? user.customerId || user.id : '';
  const isCustomer = user?.role === UserRole.CUSTOMER;
  const activeStoreId = user?.storeId || storeId;
  const path = definition.path(activeStoreId, customerId);
  const [items, setItems] = useState<unknown[]>([]);
  const [payload, setPayload] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<ApiError | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [editingRecord, setEditingRecord] = useState<Record<string, unknown> | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');
  const [variantProduct, setVariantProduct] = useState<Record<string, unknown> | null>(null);
  const [variantItems, setVariantItems] = useState<Record<string, unknown>[]>([]);
  const [variantEditing, setVariantEditing] = useState<Record<string, unknown> | null>(null);
  const [variantLoading, setVariantLoading] = useState(false);
  const [variantSaving, setVariantSaving] = useState(false);
  const [variantError, setVariantError] = useState('');
  const [productCategories, setProductCategories] = useState<Record<string, unknown>[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [paging, setPaging] = useState<{ total: number; totalPages: number } | null>(null);
  const [qrRecord, setQrRecord] = useState<Record<string, unknown> | null>(null);
  const paginated = kind !== 'staff';
  const pageSize = 10;

  useEffect(() => { setPage(1); setSearch(''); }, [kind, activeStoreId]);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedSearch((current) => { if (current !== search.trim()) setPage(1); return search.trim(); }); }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    if (!definition.enabled || !path) return;
    setLoading(true);
    setProblem(null);
    try {
      const query = paginated ? `?page=${page}&limit=${pageSize}${kind === 'products' && debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : ''}` : '';
      const response = await apiRequest<unknown>(`${path}${query}`);
      setPayload(response);
      setItems(extractItems(response, definition.collection));
      const meta = response && typeof response === 'object' ? (response as Record<string, unknown>).pagination as Record<string, unknown> | undefined : undefined;
      if (meta && typeof meta.total === 'number') {
        const totalPages = Math.max(1, Number(meta.totalPages) || 1);
        setPaging({ total: meta.total, totalPages });
        if (page > totalPages) setPage(totalPages);
      } else {
        setPaging(null);
      }
      if (kind === 'products' && activeStoreId) {
        const categoryResponse = await apiRequest<unknown>(`/stores/${encodeURIComponent(activeStoreId)}/categories`);
        setProductCategories(extractItems(categoryResponse, 'categories').filter((item): item is Record<string, unknown> => !!item && typeof item === 'object'));
      }
    } catch (error) {
      setProblem(error instanceof ApiError ? error : new ApiError('تعذّر تحميل البيانات.', 0));
      setItems([]);
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [activeStoreId, definition.collection, definition.enabled, kind, path, page, paginated, debouncedSearch]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const refreshOnOrderEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ storeId?: string; customerId?: string }>).detail;
      const relevantToStore = Boolean(activeStoreId && detail?.storeId === activeStoreId);
      const relevantToCustomer = Boolean(customerId && detail?.customerId === customerId);
      if (kind === 'orders' && (relevantToStore || relevantToCustomer)) void load();
    };
    window.addEventListener('smartstore:order', refreshOnOrderEvent);
    return () => window.removeEventListener('smartstore:order', refreshOnOrderEvent);
  }, [activeStoreId, customerId, kind, load]);

  async function createRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!definition.createPath || !definition.fields) return;
    const target = definition.createPath(activeStoreId);
    if (!target) return;
    const form = new FormData(event.currentTarget);
    const values: Record<string, unknown> = {};
    for (const field of definition.fields) {
      const raw = String(form.get(field.key) || '').trim();
      if (!raw) continue;
      values[field.key] = field.type === 'number' ? Number(raw) : raw;
    }
    setCreating(true);
    setCreateError('');
    try {
      await apiRequest(target, { method: 'POST', body: JSON.stringify(values) });
      setCreateOpen(false);
      await load();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'تعذّر حفظ التغييرات.');
    } finally {
      setCreating(false);
    }
  }

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingRecord || !editableFields[kind]) return;
    const recordId = String(editingRecord.id || '');
    const route = kind === 'products' ? `/products/${encodeURIComponent(recordId)}`
      : kind === 'categories' ? `/categories/${encodeURIComponent(recordId)}`
        : kind === 'coupons' ? `/coupons/${encodeURIComponent(recordId)}`
          : kind === 'tables' ? `/tables/${encodeURIComponent(recordId)}`
          : `/zones/${encodeURIComponent(recordId)}`;
    const form = new FormData(event.currentTarget);
    const values: Record<string, unknown> = {};
    for (const field of editableFields[kind] || []) {
      if (field.type === 'checkbox') {
        values[field.key] = form.get(field.key) === 'on';
        continue;
      }
      const raw = String(form.get(field.key) || '').trim();
      if (!raw) continue;
      values[field.key] = field.type === 'number' ? Number(raw) : raw;
    }
    setSavingEdit(true);
    setEditError('');
    try {
      await apiRequest(route, { method: 'PUT', body: JSON.stringify(values) });
      setEditingRecord(null);
      await load();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'تعذّر حفظ التغييرات.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function loadVariants(product: Record<string, unknown>) {
    const productId = String(product.id || '');
    if (!productId) return;
    setVariantProduct(product);
    setVariantItems([]);
    setVariantEditing(null);
    setVariantLoading(true);
    setVariantError('');
    try {
      const result = await apiRequest<unknown>(`/products/${encodeURIComponent(productId)}/variants`);
      setVariantItems(extractItems(result, 'variants').filter((item): item is Record<string, unknown> => !!item && typeof item === 'object'));
    } catch (error) {
      setVariantError(error instanceof Error ? error.message : 'تعذّر تحميل متغيرات المنتج.');
    } finally {
      setVariantLoading(false);
    }
  }

  async function saveVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!variantProduct) return;
    const form = new FormData(event.currentTarget);
    const input = {
      name: String(form.get('name') || '').trim(),
      sku: String(form.get('sku') || '').trim(),
      price: Number(form.get('price')),
      stock: Number(form.get('stock')),
      options: String(form.get('options') || '').trim(),
      zoneId: String(form.get('zoneId') || '').trim(),
      ...(variantEditing ? { isActive: form.get('isActive') === 'on' } : {}),
    };
    const productId = String(variantProduct.id);
    const variantId = variantEditing ? String(variantEditing.id) : '';
    setVariantSaving(true);
    setVariantError('');
    try {
      await apiRequest(`/products/${encodeURIComponent(productId)}/variants${variantId ? `/${encodeURIComponent(variantId)}` : ''}`, {
        method: variantId ? 'PUT' : 'POST',
        body: JSON.stringify(input),
      });
      setVariantEditing(null);
      await loadVariants(variantProduct);
    } catch (error) {
      setVariantError(error instanceof Error ? error.message : 'تعذّر حفظ متغير المنتج.');
    } finally {
      setVariantSaving(false);
    }
  }

  async function toggleVariant(variant: Record<string, unknown>) {
    if (!variantProduct || !window.confirm(locale === 'ar' ? 'هل تريد تغيير حالة هذا المتغير؟' : 'Change this variant status?')) return;
    try {
      await apiRequest(`/products/${encodeURIComponent(String(variantProduct.id))}/variants/${encodeURIComponent(String(variant.id))}`, {
        method: variant.isActive ? 'DELETE' : 'PUT',
        ...(variant.isActive ? {} : { body: JSON.stringify({ isActive: true }) }),
      });
      await loadVariants(variantProduct);
    } catch (error) {
      setVariantError(error instanceof Error ? error.message : 'تعذّر تحديث حالة المتغير.');
    }
  }

  const filteredItems = items.filter((item) => {
    if (!search) return true;
    return JSON.stringify(item).toLocaleLowerCase().includes(search.toLocaleLowerCase());
  });
  const Icon = definition.icon;
  const title = locale === 'ar' ? definition.title : definition.en;
  const canCreate = Boolean(definition.createPath && activeStoreId && (
    kind === 'staff' || kind === 'delivery' || kind === 'tables'
      ? storeAdministrators.includes(user?.role as UserRole)
      : ['products', 'categories', 'coupons'].includes(kind) &&
        [UserRole.STORE_OWNER, UserRole.STORE_ADMIN, UserRole.STAFF, UserRole.PLATFORM_ADMIN].includes(user?.role as UserRole)
  ));
  const canActOnRecords = kind === 'orders'
    ? isCustomer || [UserRole.STORE_OWNER, UserRole.STORE_ADMIN, UserRole.STAFF, UserRole.PLATFORM_ADMIN].includes(user?.role as UserRole)
    : ['products', 'categories', 'coupons', 'delivery', 'staff', 'tables'].includes(kind) &&
      (kind === 'products' || kind === 'categories' || kind === 'coupons'
        ? [UserRole.STORE_OWNER, UserRole.STORE_ADMIN].includes(user?.role as UserRole) || user?.role === UserRole.PLATFORM_ADMIN
        : storeAdministrators.includes(user?.role as UserRole));
  const canEditRecords = Boolean(editableFields[kind] && activeStoreId && canActOnRecords);

  async function changeOrderTable(record: Record<string, unknown>) {
    const orderId = String(record.id || '');
    const answer = window.prompt(isCustomer
      ? (locale === 'ar' ? 'الصق رابط أو رمز QR للطاولة الجديدة' : 'Paste the new table QR link or code')
      : (locale === 'ar' ? 'رقم الطاولة الجديدة' : 'New table number'))?.trim();
    if (!orderId || !answer) return;
    let tableId = '';
    if (isCustomer) {
      let code = answer;
      try { code = new URL(answer).searchParams.get('table') || answer; } catch { /* plain code */ }
      const lookup = await apiRequest<{ table: { id: string } }>(`/tables/qr/${encodeURIComponent(code)}`);
      tableId = lookup.table.id;
    } else {
      const list = extractItems(await apiRequest<unknown>(`/stores/${encodeURIComponent(String(record.storeId || activeStoreId))}/tables`), 'tables') as Record<string, unknown>[];
      const match = list.find((table) => table.isActive !== false && String(table.number) === answer);
      if (!match) throw new ApiError(locale === 'ar' ? 'رقم الطاولة غير موجود' : 'Table number not found', 404);
      tableId = String(match.id);
    }
    await apiRequest(`/orders/${encodeURIComponent(orderId)}/table`, { method: 'PATCH', body: JSON.stringify({ tableId }) });
    await load();
  }

  async function actOnRecord(record: Record<string, unknown>) {
    const recordId = String(record.id || '');
    if (!recordId || (!activeStoreId && kind !== 'orders')) return;
    if (kind === 'staff') {
      const nextActive = !Boolean(record.isActive);
      if (!window.confirm(locale === 'ar' ? `هل تريد ${nextActive ? 'تفعيل' : 'إيقاف'} هذا الحساب؟` : `${nextActive ? 'Activate' : 'Deactivate'} this account?`)) return;
      await apiRequest(`/stores/${encodeURIComponent(activeStoreId)}/staff/${encodeURIComponent(recordId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: nextActive }),
      });
    } else if (kind === 'orders') {
      if (isCustomer) {
        if (['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(String(record.status || ''))) return;
        if (!window.confirm(locale === 'ar' ? 'هل تريد إلغاء هذا الطلب؟' : 'Cancel this order?')) return;
        await apiRequest(`/orders/${encodeURIComponent(recordId)}/cancel`, {
          method: 'PATCH',
          body: JSON.stringify({ reason: 'Cancelled by customer' }),
        });
        await load();
        return;
      }
      const transitions: Record<string, string> = {
        PENDING: 'CONFIRMED',
        CONFIRMED: 'PREPARING',
        PREPARING: 'READY',
        READY: 'OUT_FOR_DELIVERY',
        OUT_FOR_DELIVERY: 'DELIVERED',
      };
      const nextStatus = transitions[String(record.status || '')];
      if (!nextStatus) return;
      if (!window.confirm(locale === 'ar' ? `تحديث حالة الطلب إلى ${nextStatus}؟` : `Update order status to ${nextStatus}?`)) return;
      await apiRequest(`/orders/${encodeURIComponent(recordId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
    } else {
      const route = kind === 'products' ? `/products/${recordId}`
        : kind === 'categories' ? `/categories/${recordId}`
          : kind === 'coupons' ? `/coupons/${recordId}`
            : kind === 'tables' ? `/tables/${recordId}`
            : `/zones/${recordId}`;
      if (!window.confirm(locale === 'ar' ? 'هل تريد تنفيذ هذا الإجراء؟' : 'Are you sure you want to perform this action?')) return;
      await apiRequest(route, { method: 'DELETE' });
    }
    await load();
  }

  return (
    <div className="resource-page">
      <div className="page-heading">
        <div><span className="eyebrow">{locale === 'ar' ? 'إدارة المتجر' : 'Store management'}</span><h1>{title}</h1><p>{locale === 'ar' ? definition.description : definition.descriptionEn}</p></div>
        <div className="heading-actions"><button className="button button-outline" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} />{locale === 'ar' ? 'تحديث' : 'Refresh'}</button>{canCreate && <button className="button button-primary" onClick={() => setCreateOpen(true)}><Plus size={17} />{locale === 'ar' ? 'إضافة جديد' : 'Add new'}</button>}</div>
      </div>
      {!activeStoreId && !isCustomer && <div className="alert alert-info"><Store size={18} />{locale === 'ar' ? 'أدخل معرّف متجرك في لوحة المعلومات لربط هذه الصفحة بالمتجر الصحيح.' : 'Add your store ID on the dashboard to connect this page to the right store.'}<Link to="/">{locale === 'ar' ? 'لوحة المعلومات' : 'Dashboard'}<ArrowLeft size={15} /></Link></div>}
      {problem && <ApiProblem error={problem} onRetry={() => void load()} />}
      {!definition.enabled && <UnavailableFeature title={title} locale={locale} icon={Icon} />}
      {definition.enabled && (
        <>
          <section className="resource-metrics">
            <div className="resource-metric"><span className={`resource-icon tone-${kind}`}><Icon size={19} /></span><div><small>{locale === 'ar' ? `إجمالي ${definition.title}` : `Total ${definition.en.toLowerCase()}`}</small><strong>{loading ? '—' : (paging?.total ?? items.length)}</strong></div></div>
            <div className="resource-metric"><span className="resource-icon tone-green"><Activity size={19} /></span><div><small>{locale === 'ar' ? 'مصدر البيانات' : 'Data source'}</small><strong className="source-value">{problem ? (locale === 'ar' ? 'غير متصل' : 'Unavailable') : (locale === 'ar' ? 'API مباشر' : 'Live API')}</strong></div></div>
            <div className="resource-metric"><span className="resource-icon tone-violet"><ShieldCheck size={19} /></span><div><small>{locale === 'ar' ? 'مساحة العمل' : 'Workspace'}</small><strong className="source-value">{activeStoreId ? shorten(activeStoreId) : '—'}</strong></div></div>
          </section>
          <section className="panel data-panel">
            <div className="data-toolbar"><div className="data-title"><span className={`resource-icon tone-${kind}`}><Icon size={17} /></span><div><h3>{title}</h3><p>{locale === 'ar' ? 'البيانات المرسلة من خادم المتجر' : 'Records returned by your store API'}</p></div></div><label className="table-search"><Search size={15} /><input placeholder={locale === 'ar' ? 'بحث في البيانات...' : 'Search records...'} value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
            {loading ? <div className="table-state"><LoaderCircle size={24} className="spin" /><span>{locale === 'ar' ? 'جارٍ تحميل البيانات الحقيقية...' : 'Loading live records...'}</span></div>
              : problem ? <div className="table-state empty-state"><span className="empty-illustration"><Icon size={25} /></span><strong>{locale === 'ar' ? 'تعذّر تحميل البيانات' : 'Unable to load records'}</strong><span>{locale === 'ar' ? 'أعاد API خطأً لهذا الطلب. لم نستخدم بيانات تجريبية.' : 'The API returned an error for this request. No sample records are shown.'}</span><button className="button button-outline button-small" onClick={() => void load()}><RefreshCw size={15} />{locale === 'ar' ? 'إعادة المحاولة' : 'Try again'}</button></div>
              : filteredItems.length === 0 ? <div className="table-state empty-state"><span className="empty-illustration"><Icon size={25} /></span><strong>{locale === 'ar' ? (items.length ? 'لا توجد نتائج مطابقة' : `لا توجد ${definition.title} بعد`) : (items.length ? 'No matching results' : `No ${definition.en.toLowerCase()} yet`)}</strong><span>{locale === 'ar' ? (items.length ? 'جرّب عبارة بحث أخرى.' : 'عند توفر بيانات من API ستظهر هنا مباشرة.') : (items.length ? 'Try a different search.' : 'Records from the API will appear here as soon as they exist.')}</span></div>
              : <RecordTable items={filteredItems} kind={kind} locale={locale} isCustomer={isCustomer} onQr={kind === 'tables' ? setQrRecord : undefined} onEdit={canEditRecords ? setEditingRecord : undefined} onChangeTable={TABLES_ENABLED && kind === 'orders' && canActOnRecords ? (record) => { void changeOrderTable(record).catch((requestError) => setProblem(requestError instanceof ApiError ? requestError : new ApiError(requestError instanceof Error ? requestError.message : 'Action failed.', 0))); } : undefined} onVariants={kind === 'products' && canActOnRecords ? (record) => { void loadVariants(record); } : undefined} onAction={canActOnRecords ? (record) => { void actOnRecord(record).catch((requestError) => setProblem(requestError instanceof ApiError ? requestError : new ApiError(requestError instanceof Error ? requestError.message : 'Action failed.', 0))); } : undefined} />}
            {!problem && Boolean(payload) && !items.length && <p className="table-footnote">{locale === 'ar' ? 'لا توجد سجلات في الاستجابة الحالية.' : 'The API returned no records.'}</p>}
            {paging && paging.total > 0 && <Pagination page={page} totalPages={paging.totalPages} total={paging.total} loading={loading} locale={locale} onChange={setPage} />}
          </section>
        </>
      )}
      {createOpen && definition.fields && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-heading"><div className="modal-heading"><div><span className="eyebrow">{locale === 'ar' ? 'إضافة إلى متجرك' : 'Add to your store'}</span><h2 id="create-heading">{locale === 'ar' ? `إضافة ${definition.title}` : `Add ${definition.en.toLowerCase()}`}</h2></div><button className="icon-button" onClick={() => setCreateOpen(false)} aria-label="إغلاق"><X size={19} /></button></div><form className="modal-form" onSubmit={createRecord}>{definition.fields.map((field) => <label className="field-label" key={field.key}>{locale === 'ar' ? field.label : field.key}{kind === 'products' && field.key === 'categoryId' ? <select className="input-control" name={field.key} required><option value="">{locale === 'ar' ? 'اختر تصنيفاً' : 'Choose a category'}</option>{productCategories.filter((category) => category.isActive !== false).map((category) => <option key={String(category.id)} value={String(category.id)}>{String(category.nameAr || category.nameEn || '')}</option>)}</select> : field.type === 'select' ? <select className="input-control" name={field.key} required={field.required}><option value="">{locale === 'ar' ? 'اختر' : 'Select'}</option>{field.options?.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <input className="input-control" name={field.key} type={field.type || 'text'} min={field.type === 'number' ? 0 : undefined} maxLength={kind === 'coupons' && field.key === 'code' ? 8 : undefined} minLength={kind === 'coupons' && field.key === 'code' ? 8 : undefined} required={field.required} />}</label>)}{createError && <div className="alert alert-error">{createError}</div>}<div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setCreateOpen(false)}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</button><button className="button button-primary" disabled={creating}>{creating ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{locale === 'ar' ? 'حفظ عبر API' : 'Save via API'}</button></div></form></section></div>}
      {qrRecord && <QrDialog link={tableEntryUrl(String(qrRecord.storeId || activeStoreId), String(qrRecord.qrCode || ''))} title={locale === 'ar' ? `طاولة ${String(qrRecord.number)}` : `Table ${String(qrRecord.number)}`} locale={locale} onClose={() => setQrRecord(null)} />}
      {editingRecord && editableFields[kind] && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingRecord(null); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="edit-heading"><div className="modal-heading"><div><span className="eyebrow">{locale === 'ar' ? 'تعديل بيانات محفوظة' : 'Edit saved record'}</span><h2 id="edit-heading">{locale === 'ar' ? `تعديل ${definition.title}` : `Edit ${definition.en.toLowerCase()}`}</h2></div><button className="icon-button" onClick={() => setEditingRecord(null)} aria-label={locale === 'ar' ? 'إغلاق' : 'Close'}><X size={19} /></button></div><form className="modal-form" onSubmit={saveRecord}>{editableFields[kind]?.map((field) => {
        const value = editingRecord[field.sourceKey || field.key];
        if (field.type === 'checkbox') return <label className="field-label checkbox-field" key={field.key}><input type="checkbox" name={field.key} defaultChecked={Boolean(value)} />{locale === 'ar' ? field.label : field.key}</label>;
        if (field.type === 'select') return <label className="field-label" key={field.key}>{locale === 'ar' ? field.label : field.key}<select className="input-control" name={field.key} defaultValue={String(value || '')}>{field.options?.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
        return <label className="field-label" key={field.key}>{locale === 'ar' ? field.label : field.key}<input className="input-control" name={field.key} type={field.type || 'text'} min={field.type === 'number' ? 0 : undefined} defaultValue={value === null || value === undefined ? '' : String(value)} /></label>;
      })}{kind === 'products' && activeStoreId && <ProductImageUploader key={String(editingRecord.id)} storeId={activeStoreId} productId={String(editingRecord.id)} currentUrl={(editingRecord.productImages as Record<string, unknown> | null | undefined)?.url as string | undefined} locale={locale} onChanged={() => void load()} />}{editError && <div className="alert alert-error">{editError}</div>}<div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setEditingRecord(null)}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</button><button className="button button-primary" disabled={savingEdit}>{savingEdit ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{locale === 'ar' ? 'حفظ التغييرات' : 'Save changes'}</button></div></form></section></div>}
      {variantProduct && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setVariantProduct(null); }}><section className="modal-card variant-modal" role="dialog" aria-modal="true" aria-labelledby="variant-heading">
        <div className="modal-heading"><div><span className="eyebrow">{locale === 'ar' ? 'خيارات ومخزون المنتج' : 'Product options and inventory'}</span><h2 id="variant-heading">{String(variantProduct.nameAr || variantProduct.nameEn || '')}</h2></div><button className="icon-button" onClick={() => setVariantProduct(null)} aria-label={locale === 'ar' ? 'إغلاق' : 'Close'}><X size={19} /></button></div>
        {variantError && <div className="alert alert-error" role="alert">{variantError}</div>}
        {variantLoading ? <div className="table-state"><LoaderCircle className="spin" size={22} />{locale === 'ar' ? 'جارٍ تحميل المتغيرات...' : 'Loading variants...'}</div>
          : <div className="variant-list">{variantItems.length ? variantItems.map((variant) => <div className="variant-row" key={String(variant.id)}><div><strong>{String(variant.name)}</strong><small>{String(variant.options)} · {String(variant.sku)} · {locale === 'ar' ? `المخزون ${String(variant.stock)}` : `Stock ${String(variant.stock)}`}</small></div><strong>{formatCurrency(variant.price, locale)}</strong><button className="button button-quiet button-small" onClick={() => setVariantEditing(variant)}>{locale === 'ar' ? 'تعديل' : 'Edit'}</button><button className="button button-outline button-small" onClick={() => void toggleVariant(variant)}>{variant.isActive ? (locale === 'ar' ? 'أرشفة' : 'Archive') : (locale === 'ar' ? 'تفعيل' : 'Activate')}</button></div>) : <div className="table-state empty-state">{locale === 'ar' ? 'لا توجد متغيرات لهذا المنتج.' : 'No variants for this product yet.'}</div>}
        </div>}
        <button className="button button-primary" onClick={() => setVariantEditing({})}><Plus size={16} />{locale === 'ar' ? 'إضافة متغير' : 'Add variant'}</button>
        {variantEditing && <form className="modal-form variant-form" onSubmit={saveVariant}>
          {[['name', locale === 'ar' ? 'اسم المتغير' : 'Variant name'], ['sku', 'SKU'], ['price', locale === 'ar' ? 'السعر' : 'Price'], ['stock', locale === 'ar' ? 'المخزون' : 'Stock'], ['options', locale === 'ar' ? 'الخيارات' : 'Options'], ['zoneId', 'Zone ID']].map(([key, label]) => <label className="field-label" key={key}>{label}<input className="input-control" name={key} type={key === 'price' ? 'number' : key === 'stock' ? 'number' : 'text'} min={key === 'price' || key === 'stock' ? 0 : undefined} step={key === 'price' ? '0.01' : undefined} required defaultValue={variantEditing[key] === undefined ? '' : String(variantEditing[key])} /></label>)}
          {Boolean(variantEditing.id) && <label className="field-label checkbox-field"><input type="checkbox" name="isActive" defaultChecked={Boolean(variantEditing.isActive)} />{locale === 'ar' ? 'متاح للبيع' : 'Available for sale'}</label>}
          <div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setVariantEditing(null)}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</button><button className="button button-primary" disabled={variantSaving}>{variantSaving ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{locale === 'ar' ? 'حفظ المتغير' : 'Save variant'}</button></div>
        </form>}
      </section></div>}
    </div>
  );
}

function RecordTable({ items, kind, locale, isCustomer = false, onEdit, onVariants, onAction, onChangeTable, onQr }: { items: unknown[]; kind: ResourceKind; locale: Locale; isCustomer?: boolean; onQr?: (record: Record<string, unknown>) => void; onEdit?: (record: Record<string, unknown>) => void; onVariants?: (record: Record<string, unknown>) => void; onAction?: (record: Record<string, unknown>) => void; onChangeTable?: (record: Record<string, unknown>) => void }) {
  const columns: Record<ResourceKind, string[]> = {
    products: ['image', 'nameAr', 'sku', 'price', 'stock', 'status'],
    categories: ['nameAr', 'nameEn', 'slug', 'isActive'],
    customers: ['firstName', 'lastName', 'phone', 'email'],
    orders: TABLES_ENABLED ? ['orderNumber', 'customerName', 'tableNumber', 'total', 'status', 'createdAt'] : ['orderNumber', 'customerName', 'total', 'status', 'createdAt'],
    coupons: ['code', 'type', 'discount', 'usedCount', 'status'],
    delivery: ['city', 'area', 'deliveryFee', 'minimumOrder', 'isActive'],
    tables: ['number', 'label', 'qrLink', 'isActive'],
    staff: ['firstName', 'lastName', 'phone', 'email', 'role', 'isActive'],
    settings: ['key', 'value'],
    branding: ['key', 'value'],
  };
  const keys = columns[kind];
  const records = items.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
  const nextOrderStatus: Record<string, string> = { PENDING: 'CONFIRMED', CONFIRMED: 'PREPARING', PREPARING: 'READY', READY: 'OUT_FOR_DELIVERY', OUT_FOR_DELIVERY: 'DELIVERED' };
  return <div className="table-scroll"><table className="records-table"><thead><tr>{keys.map((key) => <th key={key}>{columnLabel(key, locale)}</th>)}{(onAction || onEdit || onVariants || onChangeTable) && <th>{locale === 'ar' ? 'إجراء' : 'Action'}</th>}</tr></thead><tbody>{records.map((record, index) => {
    const canChangeOrder = kind !== 'orders' || (
      isCustomer
        ? !['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(String(record.status || ''))
        : Boolean(nextOrderStatus[String(record.status || '')])
    );
    const actionLabel = kind === 'staff'
      ? (record.isActive ? (locale === 'ar' ? 'إيقاف' : 'Deactivate') : (locale === 'ar' ? 'تفعيل' : 'Activate'))
      : kind === 'orders'
        ? isCustomer
          ? (locale === 'ar' ? 'إلغاء الطلب' : 'Cancel order')
          : (nextOrderStatus[String(record.status || '')] || (locale === 'ar' ? 'مكتمل' : 'Complete'))
        : (locale === 'ar' ? 'أرشفة' : 'Archive');
    return <tr key={String(record.id || index)}>{keys.map((key) => <td key={key}>{key === 'tableNumber'
      ? formatCell((record.table as Record<string, unknown> | null | undefined)?.number, locale)
      : key === 'qrLink'
        ? (() => { const link = tableEntryUrl(String(record.storeId || ''), String(record.qrCode || '')); return <div className="row-actions">{onQr && <QrThumb link={link} label={locale === 'ar' ? 'عرض رمز QR' : 'View QR code'} onOpen={() => onQr(record)} />}<a href={link} target="_blank" rel="noreferrer">{locale === 'ar' ? 'فتح' : 'Open'}</a><button type="button" className="button button-quiet button-small" onClick={() => { void navigator.clipboard?.writeText(link); }}>{locale === 'ar' ? 'نسخ الرابط' : 'Copy link'}</button></div>; })()
        : key === 'image'
          ? (() => { const src = assetUrl((record.productImages as Record<string, unknown> | null | undefined)?.url); return src ? <img className="table-thumb" src={src} alt="" /> : <span className="table-thumb table-thumb-empty"><ShoppingBag size={16} /></span>; })()
          : kind === 'products' && key === 'nameAr'
            ? <Link to={`/products/${encodeURIComponent(String(record.id))}`} className="table-link">{String((locale === 'ar' ? record.nameAr : record.nameEn) || record.nameAr || '')}</Link>
            : formatCell(record[key], locale)}</td>)}{(onAction || onEdit || onVariants || onChangeTable) && <td><div className="row-actions">{onEdit && <button className="button button-quiet button-small" onClick={() => onEdit(record)}>{locale === 'ar' ? 'تعديل' : 'Edit'}</button>}{onChangeTable && !['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(String(record.status || '')) && <button className="button button-quiet button-small" onClick={() => onChangeTable(record)}>{locale === 'ar' ? 'تغيير الطاولة' : 'Change table'}</button>}{onVariants && <button className="button button-quiet button-small" onClick={() => onVariants(record)}>{locale === 'ar' ? 'المتغيرات' : 'Variants'}</button>}{onAction && <button className="button button-outline button-small" disabled={!canChangeOrder} onClick={() => onAction(record)}>{actionLabel}</button>}</div></td>}</tr>;
  })}</tbody></table></div>;
}

function ApiProblem({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  const { locale } = useApp();
  return <div className={`alert ${error.status === 404 ? 'alert-info' : 'alert-error'}`}><CircleHelp size={18} /><span>{error.message}</span><button className="text-button" onClick={onRetry}>{locale === 'ar' ? 'إعادة المحاولة' : 'Retry'}</button></div>;
}

function UnavailableFeature({ title, locale, icon: Icon }: { title: string; locale: Locale; icon: typeof Package }) {
  return <section className="panel unavailable-card"><span className="unavailable-icon"><Icon size={25} /></span><div><h2>{locale === 'ar' ? `${title} — بانتظار ربط API` : `${title} — API not available yet`}</h2><p>{locale === 'ar' ? 'تفقدنا مسارات الخادم الفعلية، ولا يوجد مسار متاح لهذه الميزة حالياً. تبقى هذه الشاشة صادقة ولا تخزن تغييرات وهمية في المتصفح.' : 'We checked the actual server routes and this feature does not have an API endpoint yet. This screen will not pretend to save changes locally.'}</p><span className="route-tag">API endpoint: not implemented</span></div></section>;
}

function readSavedTable(): { id: string; number: string; storeId: string } | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_TABLE_KEY) || 'null');
    return parsed && typeof parsed.id === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

// =====================
// Guest Cart Utility
// =====================
function readGuestCart(): { cartId: string; storeId: string; token: string } | null {
  return readPersistedGuestCart();
}

function clearGuestCart(): void {
  clearPersistedGuestCart();
}

async function createGuestCart(storeId: string): Promise<string> {
  return createPersistedGuestCart(storeId);
}

async function addToGuestCart(
  cartId: string,
  storeId: string,
  productId: string,
  variantId?: string,
  quantity: number = 1
): Promise<void> {
  await persistAddToGuestCart(cartId, storeId, String(productId), variantId, quantity);
}

async function updateGuestCartItemQuantity(
  cartId: string,
  cartItemId: string,
  quantity: number
): Promise<void> {
  await persistUpdateGuestCartItemQuantity(cartId, cartItemId, quantity);
}

async function removeFromGuestCartItem(
  cartId: string,
  cartItemId: string
): Promise<void> {
  await persistRemoveGuestCartItem(cartId, cartItemId);
}

async function getGuestCart(cartId: string, token: string): Promise<GuestCartData> {
  return fetchGuestCart(cartId, token);
}

function DemoHubPage() {
  const { locale } = useApp();
  const stores = DEMO_CREDENTIALS.stores;
  return <main className="demo-hub" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    <header className="demo-hub-nav"><Link className="demo-brand" to="/demo">SMARTSTORE <span>DEMO</span></Link><nav><Link to="/demo/access">{locale === 'ar' ? 'حسابات الوصول' : 'Demo access'}</Link><Link to="/login">{locale === 'ar' ? 'دخول الإدارة' : 'Admin login'}<ArrowUpRight size={15} /></Link></nav></header>
    <section className="demo-hub-hero"><span className="demo-overline"><Sparkles size={15} /> COMMERCE, BEAUTIFULLY CONNECTED</span><h1>{locale === 'ar' ? <>تجارب تسوق<br /><em>مصممة لتُلهم.</em></> : <>A closer look at<br /><em>commerce, elevated.</em></>}</h1><p>{locale === 'ar' ? 'اكتشف واجهات المتاجر التجريبية، المصممة على بيانات حقيقية وتجربة شراء متكاملة.' : 'Explore live, beautifully distinct storefronts—each powered by a real catalog and a complete shopping experience.'}</p><a className="demo-primary-link" href="#stores">{locale === 'ar' ? 'استكشف المتاجر' : 'Explore the stores'}<ArrowLeft size={17} /></a><div className="demo-hero-orb demo-orb-one" /><div className="demo-hero-orb demo-orb-two" /></section>
    <section id="stores" className="demo-store-section"><div className="demo-section-heading"><div><span className="demo-overline">{locale === 'ar' ? 'وجهات مختارة' : 'A curated collection'}</span><h2>{locale === 'ar' ? 'اختر متجرك' : 'Step inside a store'}</h2></div><Link to="/demo/access">{locale === 'ar' ? 'بيانات الدخول' : 'View demo credentials'}<ArrowUpRight size={15} /></Link></div>
      <div className="demo-store-grid">{stores.map((store, index) => <article key={store.slug} className={`demo-store-card demo-store-${store.slug}`}><div className="demo-store-image"><span className="demo-store-number">0{index + 1}</span><span className="demo-store-image-label">{store.descriptor}</span><span className="demo-store-monogram">{index === 1 ? 'V' : index === 2 ? 'É' : 'S'}</span></div><div className="demo-store-card-body"><span className="demo-store-kind">{store.descriptor}</span><h3>{store.name}</h3><p>{store.slug === 'veloura' ? 'A signature in every note.' : store.slug === 'maison-elan' ? 'Considered pieces. Effortless living.' : 'A thoughtfully simple way to shop.'}</p><Link to={`/store/${encodeURIComponent(store.slug)}`}>{locale === 'ar' ? 'زيارة المتجر' : 'Visit storefront'}<ArrowLeft size={16} /></Link></div></article>)}</div>
    </section>
    <footer className="demo-hub-footer"><span>© 2026 SmartStore</span><span>{locale === 'ar' ? 'تجربة تجريبية — بيانات الطلبات غير مخصصة للشراء الحقيقي.' : 'Demo environment · Orders are for demonstration only.'}</span><Link to="/demo/access">{locale === 'ar' ? 'الوصول إلى الإدارة' : 'Admin & staff access'}</Link></footer>
  </main>;
}

function DemoAccessPage() {
  const { locale } = useApp();
  return <main className="demo-access-page" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    <header className="demo-hub-nav"><Link className="demo-brand" to="/demo">SMARTSTORE <span>DEMO</span></Link><nav><Link to="/demo">{locale === 'ar' ? 'مركز العروض' : 'Demo hub'}</Link><Link to="/login">{locale === 'ar' ? 'دخول الإدارة' : 'Admin login'}<ArrowUpRight size={15} /></Link></nav></header>
    <div className="demo-access-content"><Link className="demo-back-link" to="/demo"><ArrowLeft size={15} />{locale === 'ar' ? 'العودة إلى مركز العروض' : 'Back to demo hub'}</Link><span className="demo-overline">{locale === 'ar' ? 'الوصول إلى مساحة العمل' : 'WORKSPACE ACCESS'}</span><h1>{locale === 'ar' ? 'بيانات الدخول التجريبية' : 'Demo credentials'}</h1><p>{locale === 'ar' ? 'استخدم الحسابات التالية لاستكشاف أدوات الإدارة. بيانات الاعتماد مخصصة لهذه البيئة التجريبية.' : 'Use these accounts to explore the management workspace. These credentials are for this demo environment only.'}</p>
      <section className="demo-access-card"><div className="demo-access-heading"><span className="demo-access-icon"><ShieldCheck size={19} /></span><div><h2>{locale === 'ar' ? 'مسؤول المنصة' : 'Platform administrator'}</h2><span>{locale === 'ar' ? 'إدارة شاملة لجميع المتاجر' : 'Manage all stores and platform settings'}</span></div><Link to="/login">{locale === 'ar' ? 'دخول' : 'Sign in'}<ArrowUpRight size={14} /></Link></div><CredentialRow label="Email" value={DEMO_CREDENTIALS.platformAdmin.email} /><CredentialRow label={locale === 'ar' ? 'كلمة المرور' : 'Password'} value={DEMO_CREDENTIALS.platformAdmin.password} /></section>
      {DEMO_CREDENTIALS.stores.map((store) => <section className="demo-access-card" key={store.slug}><div className="demo-access-heading"><span className="demo-access-icon"><Store size={19} /></span><div><h2>{store.name}</h2><span>{store.descriptor}</span></div><Link to={`/store/${encodeURIComponent(store.slug)}`}>{locale === 'ar' ? 'المتجر' : 'Store'}<ArrowUpRight size={14} /></Link></div><CredentialRow label={locale === 'ar' ? 'المالك · البريد' : 'Owner · email'} value={store.owner.email} /><CredentialRow label={locale === 'ar' ? 'كلمة المرور' : 'Password'} value={store.owner.password} />{'staff' in store && <><CredentialRow label={locale === 'ar' ? 'الفريق · البريد' : 'Staff · email'} value={store.staff.email} /><CredentialRow label={locale === 'ar' ? 'كلمة المرور · الفريق' : 'Staff password'} value={store.staff.password} /></>}</section>)}
      <div className="demo-access-note"><Info size={16} /><span>{locale === 'ar' ? 'تسوق كضيف متاح دون تسجيل الدخول. بيانات الاعتماد أعلاه لأغراض العرض فقط.' : 'Guest shopping requires no sign-in. All credentials above are for demonstration purposes only.'}</span></div>
    </div>
  </main>;
}

function CredentialRow({ label, value }: { label: string; value: string }) {
  return <div className="demo-credential-row"><span>{label}</span><code>{value}</code></div>;
}

function StorefrontPage() {
  const { locale, storeId, setStoreId } = useApp();
  const { user } = useApp();
  const { slug } = useParams();
  const navigate = useNavigate();
  const [storeInfo, setStoreInfo] = useState<Record<string, unknown> | null>(null);
  const [products, setProducts] = useState<Record<string, unknown>[]>([]);
  const [stores, setStores] = useState<Record<string, unknown>[]>([]);
  const [categories, setCategories] = useState<Record<string, unknown>[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [paging, setPaging] = useState({ total: 0, totalPages: 1 });
  const [categoryId, setCategoryId] = useState('');
  const [joiningStore, setJoiningStore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<ApiError | null>(null);
  const activeStoreId = slug
    ? String(storeInfo?.id || '')
    : user?.storeId || storeId;
  const [activeTable, setActiveTable] = useState<{ id: string; number: string; storeId: string } | null>(readSavedTable);

  useEffect(() => {
    if (!slug) {
      setStoreInfo(null);
      return;
    }
    let active = true;
    setLoading(true);
    setProblem(null);
    apiRequest<Record<string, unknown>>(`/stores/${encodeURIComponent(slug)}/info`)
      .then(async (store) => {
        if (user?.role === UserRole.CUSTOMER) {
          await apiRequest(`/stores/${encodeURIComponent(String(store.id))}/join`, { method: 'POST' });
        }
        if (!active) return;
        setStoreInfo(store);
        setStoreId(String(store.id));
        setCategoryId('');
      })
      .catch((error) => {
        if (!active) return;
        setStoreInfo(null);
        setProblem(error instanceof ApiError ? error : new ApiError('Unable to load this store.', 0));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug, user?.role, setStoreId]);

  useEffect(() => {
    const code = sessionStorage.getItem(PENDING_TABLE_KEY);
    if (!code || user?.role !== UserRole.CUSTOMER) return;
    sessionStorage.removeItem(PENDING_TABLE_KEY);
    apiRequest<{ table: { id: string; number: string }; store: { id: string } }>(`/tables/qr/${encodeURIComponent(code)}`)
      .then(async (result) => {
        await apiRequest(`/stores/${encodeURIComponent(result.store.id)}/join`, { method: 'POST' });
        const saved = { id: result.table.id, number: result.table.number, storeId: result.store.id };
        localStorage.setItem(SAVED_TABLE_KEY, JSON.stringify(saved));
        setActiveTable(saved);
        setStoreId(result.store.id);
      })
      .catch((requestError) => setProblem(requestError instanceof ApiError ? requestError : new ApiError('رمز الطاولة غير صالح.', 0)));
  }, [user?.role, setStoreId]);

  function clearTable() {
    localStorage.removeItem(SAVED_TABLE_KEY);
    setActiveTable(null);
  }

  useEffect(() => {
    if (slug) return;
    apiRequest<unknown>('/stores/public')      .then((result) => setStores(extractItems(result, 'stores').filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')))
      .catch((requestError) => setProblem(requestError instanceof ApiError ? requestError : new ApiError('تعذّر تحميل المتاجر.', 0)));
  }, [slug]);

  const load = useCallback(async () => {
    if (!activeStoreId) {
      setProducts([]);
      setCategories([]);
      return;
    }
    setLoading(true);
    setProblem(null);
    try {
      const params = new URLSearchParams({ status: 'ACTIVE', page: String(page), limit: '12' });
      if (search.trim()) params.set('search', search.trim());
      if (categoryId) params.set('categoryId', categoryId);
      const [payload, categoryPayload] = await Promise.all([
        apiRequest<unknown>(`/stores/${encodeURIComponent(activeStoreId)}/products?${params.toString()}`),
        apiRequest<unknown>(`/stores/${encodeURIComponent(activeStoreId)}/categories?activeOnly=true`),
      ]);
      const meta = (payload as { pagination?: { total?: number; totalPages?: number } } | null)?.pagination;
      setPaging({ total: Number(meta?.total) || 0, totalPages: Math.max(1, Number(meta?.totalPages) || 1) });
      setProducts(extractItems(payload, 'products').filter((item): item is Record<string, unknown> => !!item && typeof item === 'object'));
      setCategories(extractItems(categoryPayload, 'categories').filter((item): item is Record<string, unknown> => !!item && typeof item === 'object'));
    } catch (error) {
      setProblem(error instanceof ApiError ? error : new ApiError('تعذّر تحميل المنتجات.', 0));
    } finally { setLoading(false); }
  }, [activeStoreId, search, categoryId, page]);

  useEffect(() => { setPage(1); }, [search, categoryId, activeStoreId]);

  useEffect(() => { void load(); }, [load]);

  async function selectStore(nextStoreId: string) {
    if (!nextStoreId) return;
    setJoiningStore(true);
    setProblem(null);
    try {
      if (user?.role === UserRole.CUSTOMER) {
        await apiRequest(`/stores/${encodeURIComponent(nextStoreId)}/join`, { method: 'POST' });
      }
      setStoreId(nextStoreId);
      setCategoryId('');
    } catch (error) {
      setProblem(error instanceof ApiError ? error : new ApiError('تعذّر الانضمام إلى المتجر.', 0));
    } finally {
      setJoiningStore(false);
    }
  }

  async function addToCart(product: Record<string, unknown>) {
    if (!activeStoreId) return;
    const customerId = user?.customerId || user?.id || '';

    try {
      if (!user || user.role !== UserRole.CUSTOMER) {
        // Guest checkout flow - use guest cart
        const cartState = readGuestCart();
        let cartId = cartState?.cartId || null;

        if (!cartId || cartState?.storeId !== activeStoreId) {
          // Create new guest cart if needed
          cartId = await createGuestCart(activeStoreId);
        }

        if (cartId) {
          await addToGuestCart(cartId, activeStoreId, String(product.id), undefined, 1);
          navigate(slug ? `/store/${encodeURIComponent(slug)}/cart` : '/cart');
        }
      } else {
        // Authenticated customer checkout flow
        await apiRequest(`/customers/${encodeURIComponent(customerId)}/cart/items`, {
          method: 'POST',
          body: JSON.stringify({ productId: product.id, quantity: 1, storeId: activeStoreId }),
        });
        navigate(slug ? `/store/${encodeURIComponent(slug)}/cart` : '/cart');
      }
    } catch (error) {
      setProblem(error instanceof ApiError ? error : new ApiError('تعذّر إضافة المنتج', 0));
    }
  }

  const storeName = String(storeInfo?.name || (locale === 'ar' ? 'اكتشف المتجر' : 'Discover the store'));
  const storeDescription = String(storeInfo?.description || (locale === 'ar' ? 'تصفح المنتجات المنشورة من كتالوج المتجر.' : 'Browse published products from the live store catalog.'));
  const storeStyle = storeInfo ? {
    '--store-primary': String(storeInfo.primaryColor || '#315efb'),
    '--store-secondary': String(storeInfo.secondaryColor || '#19213a'),
  } as React.CSSProperties : undefined;

  return <div className={`storefront-page ${slug ? 'branded-storefront' : ''}`} style={storeStyle}>
    {slug && <header className="storefront-topbar"><Link to={`/store/${encodeURIComponent(slug)}`} className="store-wordmark">{storeName}</Link><nav><a href="#categories">{locale === 'ar' ? 'التصنيفات' : 'Collections'}</a><a href="#products">{locale === 'ar' ? 'المنتجات' : 'Shop'}</a></nav><button className="button button-outline" onClick={() => navigate(`/store/${encodeURIComponent(slug)}/cart`)}><ShoppingCart size={17} />{locale === 'ar' ? 'السلة' : 'Cart'}</button></header>}
    {!slug && <div className="page-heading"><div><span className="eyebrow">{locale === 'ar' ? 'تجربة التسوق' : 'Shopping experience'}</span><h1>{locale === 'ar' ? 'اكتشف المتجر' : 'Discover the store'}</h1><p>{locale === 'ar' ? 'تصفح المنتجات المنشورة من كتالوج المتجر.' : 'Browse published products from the live store catalog.'}</p></div><button className="button button-outline" onClick={() => navigate('/cart')}><ShoppingCart size={17} />{locale === 'ar' ? 'سلة التسوق' : 'Shopping cart'}</button></div>}
    <div className="storefront-filters">
      {!slug && <label className="field-label">{locale === 'ar' ? 'المتجر' : 'Store'}<select className="input-control" value={activeStoreId} onChange={(event) => void selectStore(event.target.value)} disabled={joiningStore || Boolean(user?.storeId)}><option value="">{locale === 'ar' ? 'اختر متجراً' : 'Choose a store'}</option>{stores.map((store) => <option key={String(store.id)} value={String(store.id)}>{String(store.name)}</option>)}</select></label>}
      <label className="field-label">{locale === 'ar' ? 'بحث' : 'Search'}<input className="input-control" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={locale === 'ar' ? 'ابحث عن منتج...' : 'Search products...'} /></label>
      <label className="field-label">{locale === 'ar' ? 'التصنيف' : 'Category'}<select className="input-control" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={!activeStoreId}><option value="">{locale === 'ar' ? 'كل التصنيفات' : 'All categories'}</option>{categories.map((category) => <option key={String(category.id)} value={String(category.id)}>{String((locale === 'ar' ? category.nameAr : category.nameEn) || category.nameAr || category.nameEn)}</option>)}</select></label>
    </div>
    {problem && <ApiProblem error={problem} onRetry={() => void load()} />}
    {TABLES_ENABLED && activeTable && activeTable.storeId === activeStoreId && user?.role === UserRole.CUSTOMER && <div className="alert alert-info"><QrCode size={18} />{locale === 'ar' ? `طلبك مرتبط بالطاولة رقم ${activeTable.number}` : `Your order will be served at table ${activeTable.number}`}<button type="button" className="button button-quiet button-small" onClick={clearTable}>{locale === 'ar' ? 'إزالة' : 'Remove'}</button></div>}
    <section className="storefront-hero"><div><span className="eyebrow light-eyebrow"><Sparkles size={14} />{slug ? storeName : 'SMARTSTORE MARKETPLACE'}</span><h2>{slug ? storeName : locale === 'ar' ? <>منتجات تستحق<br />مكانها في يومك.</> : <>Thoughtful finds<br />for every day.</>}</h2><p>{storeDescription}</p>{slug && <a href="#products" className="button store-hero-button">{locale === 'ar' ? 'تسوق الآن' : 'Shop now'}<ArrowLeft size={16} /></a>}</div><div className="storefront-hero-art"><div className="hero-bag"><ShoppingBag size={48} /></div><span className="hero-star star-a">✳</span><span className="hero-star star-b">✳</span><span className="hero-coin" /></div></section>
    {slug && <div id="categories" className="store-category-strip"><span>{locale === 'ar' ? 'اكتشف حسب الفئة' : 'Explore by collection'}</span>{categories.map((category) => <button type="button" key={String(category.id)} className={categoryId === String(category.id) ? 'active' : ''} onClick={() => setCategoryId(categoryId === String(category.id) ? '' : String(category.id))}>{String((locale === 'ar' ? category.nameAr : category.nameEn) || category.nameAr || category.nameEn)}</button>)}</div>}
    <div id="products" className="catalog-heading"><div><h2>{locale === 'ar' ? 'مختارة لك' : 'Curated for you'}</h2><p>{slug ? storeName : locale === 'ar' ? 'من منتجات متجرك المتاحة' : 'From your available store products'}</p></div><span className="catalog-count">{loading ? '…' : `${paging.total} ${locale === 'ar' ? 'منتج' : 'products'}`}</span></div>
    {loading ? <div className="catalog-empty"><LoaderCircle className="spin" size={23} />{locale === 'ar' ? 'جارٍ تحميل المنتجات...' : 'Loading products...'}</div> : products.length ? <div className="product-grid">{products.map((product) => {
      const image = assetUrl(product.productImages && typeof product.productImages === 'object' ? (product.productImages as Record<string, unknown>).url : undefined);
      const detailPath = slug
        ? `/store/${encodeURIComponent(slug)}/products/${encodeURIComponent(String(product.id))}`
        : `/products/${encodeURIComponent(String(product.id))}`;
      return <article className="product-card" key={String(product.id)}><Link to={detailPath} className="product-art" aria-label={String(product.nameAr || product.nameEn || '')}>{image && <img className="catalog-product-image" src={image} alt={String(product.nameAr || product.nameEn || '')} onError={(event) => { event.currentTarget.hidden = true; event.currentTarget.parentElement?.querySelector('.fallback-product-art')?.classList.add('fallback-visible'); }} />}<span className={`product-art-bag fallback-product-art ${image ? '' : 'fallback-visible'}`}><ShoppingBag size={29} /></span>{Boolean(product.isFeatured) && <span className="product-badge">{locale === 'ar' ? 'مميز' : 'Featured'}</span>}</Link><div className="product-info"><small>{String(product.category && typeof product.category === 'object' ? (locale === 'ar' ? (product.category as Record<string, unknown>).nameAr : (product.category as Record<string, unknown>).nameEn) || '' : 'SMARTSTORE')}</small><h3><Link to={detailPath} className="table-link">{String((locale === 'ar' ? product.nameAr : product.nameEn) || product.nameAr || product.nameEn || '')}</Link></h3><div className="product-buy"><strong>{formatCurrency(product.price, locale)}</strong>{(user?.role === UserRole.CUSTOMER || !user || Boolean(slug)) && <button className="add-cart-button" disabled={Number(product.stock) <= 0} onClick={() => void addToCart(product)} aria-label={locale === 'ar' ? 'إضافة إلى السلة' : 'Add to cart'}><Plus size={17} /></button>}</div></div></article>;
    })}</div> : <div className="catalog-empty"><span className="empty-illustration"><ShoppingBag size={26} /></span><strong>{locale === 'ar' ? 'الكتالوج فارغ أو غير متاح بعد' : 'Catalog is empty or unavailable'}</strong><span>{problem?.message || (locale === 'ar' ? 'اختر متجراً يحتوي على منتجات منشورة.' : 'Choose a store with published products.')}</span><button className="button button-outline button-small" onClick={() => void load()}><RefreshCw size={15} />{locale === 'ar' ? 'تحديث الكتالوج' : 'Refresh catalog'}</button></div>}
    {!loading && paging.total > 0 && <Pagination page={page} totalPages={paging.totalPages} total={paging.total} locale={locale} onChange={setPage} />}
    <div className="storefront-contact"><MessageCircle size={18} /><div><strong>{locale === 'ar' ? 'هل تحتاج إلى مساعدة؟' : 'Need a little help?'}</strong><span>{locale === 'ar' ? 'تواصل مع فريق المتجر مباشرة.' : 'Get in touch with the store team.'}</span></div><Link to="/support">{locale === 'ar' ? 'تواصل معنا' : 'Contact us'}<ArrowLeft size={15} /></Link></div>
  </div>;
}

function CartPage() {
  const { user, storeId, locale } = useApp();
  const { slug } = useParams();
  const [routeStoreId, setRouteStoreId] = useState('');
  const [customerCart, setCustomerCart] = useState<Record<string, unknown> | null>(null);
  const [guestCart, setGuestCart] = useState<GuestCartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<ApiError | null>(null);
  const customerId = user?.role === UserRole.CUSTOMER ? user.customerId || user.id : '';
  const savedGuestCart = readGuestCart();
  useEffect(() => {
    let active = true;
    if (!slug) {
      setRouteStoreId('');
      return;
    }
    apiRequest<Record<string, unknown>>(`/stores/${encodeURIComponent(slug)}/info`)
      .then(async (store) => {
        if (user?.role === UserRole.CUSTOMER) {
          await apiRequest(`/stores/${encodeURIComponent(String(store.id))}/join`, { method: 'POST' });
        }
        if (active) setRouteStoreId(String(store.id || ''));
      })
      .catch((error) => { if (active) setProblem(error instanceof ApiError ? error : new ApiError('Unable to load this store.', 0)); });
    return () => { active = false; };
  }, [slug, user?.role]);
  const activeStore = slug ? routeStoreId : user?.storeId || storeId || savedGuestCart?.storeId || '';

  const load = useCallback(async () => {
    setLoading(true);
    setProblem(null);
    try {
      if (customerId && activeStore) {
        setCustomerCart(await apiRequest<Record<string, unknown>>(`/customers/${encodeURIComponent(customerId)}/cart?storeId=${encodeURIComponent(activeStore)}`));
        setGuestCart(null);
      } else {
        setCustomerCart(null);
        const session = readGuestCart();
        if (!session || session.storeId !== activeStore) {
          setGuestCart(null);
          return;
        }
        setGuestCart(await getGuestCart(session.cartId, session.token));
      }
    } catch (error) {
      setCustomerCart(null);
      setGuestCart(null);
      setProblem(error instanceof ApiError ? error : new ApiError('تعذّر تحميل السلة.', 0));
    } finally {
      setLoading(false);
    }
  }, [customerId, activeStore]);
  useEffect(() => { void load(); }, [load]);
  const items = Array.isArray(customerCart?.items)
    ? customerCart.items as Record<string, unknown>[]
    : (guestCart?.items || []) as Record<string, unknown>[];
  const subtotal = Number(customerCart?.subtotal ?? guestCart?.subtotal) || 0;

  async function changeQuantity(itemId: string, quantity: number) {
    try {
      if (customerId) {
        await apiRequest(`/cart/items/${encodeURIComponent(itemId)}`, {
          method: 'PUT',
          body: JSON.stringify({ quantity }),
        });
      } else if (guestCart) {
        await updateGuestCartItemQuantity(guestCart.id, itemId, quantity);
      }
      await load();
    } catch (error) {
      setProblem(error instanceof ApiError ? error : new ApiError('تعذّر تحديث الكمية.', 0));
    }
  }

  async function removeItem(itemId: string) {
    try {
      if (customerId) {
        await apiRequest(`/cart/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
      } else if (guestCart) {
        await removeFromGuestCartItem(guestCart.id, itemId);
      }
      await load();
    } catch (error) {
      setProblem(error instanceof ApiError ? error : new ApiError('تعذّرت إزالة العنصر.', 0));
    }
  }

  return <div className="resource-page"><div className="page-heading"><div><span className="eyebrow">{locale === 'ar' ? 'متجرك' : 'Your store'}</span><h1>{locale === 'ar' ? 'سلة التسوق' : 'Your cart'}</h1><p>{locale === 'ar' ? 'راجع منتجاتك قبل إتمام الطلب.' : 'Review your items before checkout.'}</p></div><button className="button button-outline" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} />{locale === 'ar' ? 'تحديث السلة' : 'Refresh cart'}</button></div>
    {problem && <ApiProblem error={problem} onRetry={() => void load()} />}
    {!activeStore && !slug && <div className="alert alert-info"><Store size={17} />{locale === 'ar' ? 'اختر متجراً من واجهة المتجر.' : 'Choose a store from the storefront.'}<Link to="/storefront">{locale === 'ar' ? 'تصفح المتجر' : 'Browse stores'}</Link></div>}
    <section className="panel cart-panel">{loading ? <div className="table-state"><LoaderCircle className="spin" />{locale === 'ar' ? 'جارٍ تحميل السلة...' : 'Loading cart...'}</div> : items.length ? <><div className="cart-lines">{items.map((item) => {
      const quantity = Number(item.quantity);
      const itemId = String(item.id);
      const productName = item.product && typeof item.product === 'object'
        ? (item.product as Record<string, unknown>).nameAr || (item.product as Record<string, unknown>).nameEn
        : item.productNameAr || item.productNameEn || item.productSlug;
      return <div className="cart-line" key={itemId}><span className="cart-product-icon"><ShoppingBag size={19} /></span><div className="cart-line-name"><strong>{String(productName || '')}</strong><small>{locale === 'ar' ? 'الكمية' : 'Quantity'}</small></div><div className="quantity-control"><button type="button" aria-label={locale === 'ar' ? 'تقليل الكمية' : 'Decrease quantity'} disabled={quantity <= 1} onClick={() => void changeQuantity(itemId, quantity - 1)}>−</button><output>{quantity}</output><button type="button" aria-label={locale === 'ar' ? 'زيادة الكمية' : 'Increase quantity'} disabled={quantity >= 50} onClick={() => void changeQuantity(itemId, quantity + 1)}>+</button></div><strong>{formatCurrency(Number(item.unitPrice) * quantity, locale)}</strong><button className="icon-button remove-item" aria-label={locale === 'ar' ? 'إزالة' : 'Remove'} onClick={() => void removeItem(itemId)}><X size={17} /></button></div>;
    })}</div><div className="cart-total"><span>{locale === 'ar' ? 'الإجمالي قبل التوصيل' : 'Subtotal before delivery'}</span><strong>{formatCurrency(subtotal, locale)}</strong></div><Link to={slug ? `/store/${encodeURIComponent(slug)}/checkout` : '/checkout'} className="button button-primary checkout-link">{locale === 'ar' ? 'المتابعة لإتمام الطلب' : 'Continue to checkout'}<ArrowLeft size={17} /></Link></> : <div className="table-state empty-state"><span className="empty-illustration"><ShoppingCart size={25} /></span><strong>{locale === 'ar' ? 'سلتك فارغة' : 'Your cart is empty'}</strong><span>{locale === 'ar' ? 'أضف بعض المنتجات من المتجر للمتابعة.' : 'Add a few products from the storefront to continue.'}</span><Link to={slug ? `/store/${encodeURIComponent(slug)}` : '/storefront'} className="button button-primary button-small">{locale === 'ar' ? 'تصفح المتجر' : 'Browse store'}<ArrowLeft size={15} /></Link></div>}</section>
  </div>;
}

function CheckoutPage() {
  const { user, storeId, locale } = useApp();
  const { slug } = useParams();
  const [routeStoreId, setRouteStoreId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [trackingToken, setTrackingToken] = useState('');
  const [cart, setCart] = useState<Record<string, unknown> | null>(null);
  const [cartLoading, setCartLoading] = useState(false);
  const [zones, setZones] = useState<Record<string, unknown>[]>([]);
  const [zoneId, setZoneId] = useState('');
  const [address, setAddress] = useState('');
  const [payment, setPayment] = useState('CASH_ON_DELIVERY');
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState<number | null>(null);
  const [couponMessage, setCouponMessage] = useState('');

  // Guest checkout fields
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [requestedTime, setRequestedTime] = useState('');

  useEffect(() => {
    let active = true;
    if (!slug) {
      setRouteStoreId('');
      return;
    }
    apiRequest<Record<string, unknown>>(`/stores/${encodeURIComponent(slug)}/info`)
      .then(async (store) => {
        if (user?.role === UserRole.CUSTOMER) {
          await apiRequest(`/stores/${encodeURIComponent(String(store.id))}/join`, { method: 'POST' });
        }
        if (active) setRouteStoreId(String(store.id || ''));
      })
      .catch((requestError) => { if (active) setError(requestError instanceof Error ? requestError.message : 'Unable to load this store.'); });
    return () => { active = false; };
  }, [slug, user?.role]);
  const activeStore = slug ? routeStoreId : user?.storeId || storeId || readGuestCart()?.storeId || '';
  const customerId = user?.role === UserRole.CUSTOMER ? user.customerId || user.id || '' : '';

  useEffect(() => {
    let active = true;
    setCartLoading(true);
    setError('');
    if (!activeStore) {
      setCart(null);
      setZones([]);
      setError(locale === 'ar' ? 'اختر متجراً أولاً.' : 'Choose a store first.');
      setCartLoading(false);
      return () => { active = false; };
    }
    const loadCart = customerId
      ? apiRequest<Record<string, unknown>>(`/customers/${encodeURIComponent(customerId)}/cart?storeId=${encodeURIComponent(activeStore)}`)
      : (() => {
        const session = readGuestCart();
        if (!session || session.storeId !== activeStore) {
          return Promise.reject(new ApiError('Your guest cart is missing or expired. Add a product to continue.', 404));
        }
        return getGuestCart(session.cartId, session.token);
      })();
    Promise.all([
      loadCart,
      apiRequest<unknown>(`/stores/${encodeURIComponent(activeStore)}/zones`),
    ])
      .then(([cartResult, zoneResult]) => {
        if (!active) return;
        setCart(cartResult as Record<string, unknown>);
        setZones(extractItems(zoneResult, 'zones').filter((item): item is Record<string, unknown> => !!item && typeof item === 'object'));
      })
      .catch((requestError) => {
        if (!active) return;
        setCart(null);
        setError(requestError instanceof Error ? requestError.message : 'تعذّر تحميل بيانات إتمام الطلب.');
      })
      .finally(() => { if (active) setCartLoading(false); });
    return () => { active = false; };
  }, [activeStore, customerId, locale]);

  async function applyCoupon() {
    setError('');
    setCouponMessage('');
    const cartSubtotal = Number(cart?.subtotal) || Number(cart?.total) || 0;
    if (!activeStore || !couponCode.trim() || !cartSubtotal) {
      setError(locale === 'ar' ? 'أدخل رمز كوبون وسلة غير فارغة.' : 'Enter a coupon code and add items to your cart.');
      return;
    }
    try {
      const quote = await apiRequest<{ discountAmount?: number }>('/coupons/apply', {
        method: 'POST',
        body: JSON.stringify({
          couponCode: couponCode.trim().toUpperCase(),
          storeId: activeStore,
          orderTotal: cartSubtotal,
        }),
      });
      const discount = Number(quote.discountAmount || 0);
      setCouponDiscount(discount);
      setCouponMessage(locale === 'ar' ? 'تم التحقق من الكوبون. سيعيد الخادم التحقق عند إنشاء الطلب.' : 'Coupon verified. The server will revalidate it when placing the order.');
    } catch (requestError) {
      setCouponDiscount(null);
      setError(requestError instanceof Error ? requestError.message : 'تعذّر التحقق من الكوبون.');
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    if (!customerId && (!customerName.trim() || !customerPhone.trim() || address.trim().length < 5)) {
      setError(locale === 'ar' ? 'أدخل الاسم الكامل ورقم الهاتف وعنوان التوصيل.' : 'Enter your full name, phone number, and delivery address.');
      setBusy(false);
      return;
    }
    const items = Array.isArray(cart?.items) ? cart.items as Record<string, unknown>[] : [];
    if (!items.length) {
      setError(locale === 'ar' ? 'أضف منتجات إلى السلة أولاً.' : 'Add items to your cart first.');
      setBusy(false);
      return;
    }
    try {
      if (customerId) {
        const order = await apiRequest<Record<string, unknown>>('/orders/checkout', {
          method: 'POST',
          body: JSON.stringify({
            customerId,
            storeId: activeStore,
            items: items.map((item) => ({ productId: item.productId, variantId: item.variantId || undefined, quantity: item.quantity })),
            deliveryZoneId: zoneId || undefined,
            tableId: TABLES_ENABLED ? (() => { const saved = readSavedTable(); return saved && saved.storeId === activeStore ? saved.id : undefined; })() : undefined,
            deliveryAddress: address || undefined,
            deliveryNotes: notes || undefined,
            paymentMethod: payment,
            couponCode: couponDiscount !== null ? couponCode.trim().toUpperCase() : undefined,
          }),
        });
        setResult(String(order.orderNumber || ''));
      } else {
        const session = readGuestCart();
        if (!session || session.storeId !== activeStore) {
          throw new ApiError('Your guest cart is missing or expired. Add a product to continue.', 404);
        }
        const order = await apiRequest<{ orderNumber: string; trackingToken: string }>('/guest/checkout', {
          method: 'POST',
          anonymous: true,
          body: JSON.stringify({
            guestToken: session.token,
            customerName: customerName.trim(),
            customerPhone: customerPhone.trim(),
            deliveryAddress: address.trim(),
            deliveryZoneId: zoneId || undefined,
            deliveryNotes: notes.trim() || undefined,
            requestedAt: requestedTime ? new Date(requestedTime).toISOString() : undefined,
            paymentMethod: payment,
            couponCode: couponDiscount !== null ? couponCode.trim().toUpperCase() : undefined,
          }),
        });
        clearGuestCart();
        setTrackingToken(order.trackingToken);
        setResult(order.orderNumber);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'تعذّر إرسال الطلب.');
    } finally { setBusy(false); }
  }

  if (result) return <div className="checkout-success panel"><span className="success-check"><Check size={28} /></span><span className="eyebrow">{locale === 'ar' ? 'تم إرسال الطلب' : 'Order submitted'}</span><h1>{locale === 'ar' ? 'شكراً لطلبك!' : 'Thank you for your order!'}</h1><p>{locale === 'ar' ? 'رقم الطلب' : 'Order reference'}: <code>{result}</code></p>{trackingToken ? <Link className="button button-primary" to={`/track-order/${encodeURIComponent(trackingToken)}`}>{locale === 'ar' ? 'تتبع الطلب' : 'Track your order'}<ArrowLeft size={16} /></Link> : <Link className="button button-primary" to="/orders">{locale === 'ar' ? 'العودة إلى الطلبات' : 'Go to orders'}<ArrowLeft size={16} /></Link>}</div>;
  return <div className="resource-page"><div className="page-heading"><div><span className="eyebrow">{locale === 'ar' ? 'خطوة أخيرة' : 'One last step'}</span><h1>{locale === 'ar' ? 'إتمام الطلب' : 'Checkout'}</h1><p>{locale === 'ar' ? 'أكّد عنوان التوصيل وطريقة الدفع.' : 'Confirm your delivery details and payment method.'}</p></div></div>
    {error && <div className="alert alert-error"><CircleHelp size={17} />{error}</div>}
    {cartLoading && <div className="table-state"><LoaderCircle className="spin" size={22} />{locale === 'ar' ? 'جارٍ تحميل السلة...' : 'Loading cart...'}</div>}
    {!cartLoading && !cart?.items && <div className="alert alert-info"><ShoppingCart size={17} />{locale === 'ar' ? 'لا توجد سلة متاحة. أضف منتجات للمتابعة.' : 'No cart is available. Add products before checkout.'}<Link to={slug ? `/store/${encodeURIComponent(slug)}` : '/storefront'}>{locale === 'ar' ? 'تصفح المنتجات' : 'Browse products'}</Link></div>}
    <form className="panel checkout-form" onSubmit={submit}>
      {!customerId && <>
        <label className="field-label">{locale === 'ar' ? 'الاسم الكامل' : 'Full name'}<input className="input-control" autoComplete="name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} required minLength={2} maxLength={120} /></label>
        <label className="field-label">{locale === 'ar' ? 'رقم الهاتف' : 'Phone number'}<input className="input-control" type="tel" autoComplete="tel" dir="ltr" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} required minLength={5} maxLength={30} /></label>
      </>}
      <label className="field-label">{locale === 'ar' ? 'عنوان التوصيل' : 'Delivery address'}<textarea className="input-control" rows={3} autoComplete="street-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder={locale === 'ar' ? 'المدينة، الحي، الشارع، رقم المنزل' : 'City, area, street, building number'} required={!customerId} minLength={5} maxLength={500} /></label>
      {!customerId && <label className="field-label">{locale === 'ar' ? 'وقت التوصيل المطلوب (اختياري)' : 'Requested delivery time (optional)'}<input className="input-control" type="datetime-local" value={requestedTime} onChange={(event) => setRequestedTime(event.target.value)} /></label>}
      <label className="field-label">{locale === 'ar' ? 'ملاحظات (اختياري)' : 'Notes (optional)'}<textarea className="input-control" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} /></label>
      <label className="field-label">{locale === 'ar' ? 'منطقة التوصيل' : 'Delivery zone'}
        <select className="input-control" value={zoneId} onChange={(event) => setZoneId(event.target.value)}>
          <option value="">{locale === 'ar' ? 'بدون منطقة محددة' : 'No delivery zone selected'}</option>
          {zones.map((zone) => <option key={String(zone.id)} value={String(zone.id)}>{String(zone.city)} · {String(zone.area)} — {formatCurrency(zone.deliveryFee, locale)}</option>)}
        </select>
      </label>
      <label className="field-label">{locale === 'ar' ? 'طريقة الدفع' : 'Payment method'}<select className="input-control" value={payment} onChange={(event) => setPayment(event.target.value)}><option value="CASH_ON_DELIVERY">{locale === 'ar' ? 'الدفع عند الاستلام' : 'Cash on delivery'}</option><option value="ONLINE_PAYMENT" disabled>{locale === 'ar' ? 'الدفع الإلكتروني — غير مُفعّل (يتطلب مزود دفع)' : 'Online payment — unavailable (payment provider not configured)'}</option></select></label>
      <div className="field-label">{locale === 'ar' ? 'رمز الخصم' : 'Discount code'}<div className="coupon-entry"><input className="input-control" value={couponCode} onChange={(event) => { setCouponCode(event.target.value.toUpperCase()); setCouponDiscount(null); setCouponMessage(''); }} maxLength={8} /><button type="button" className="button button-outline" onClick={() => void applyCoupon()}>{locale === 'ar' ? 'تطبيق' : 'Apply'}</button></div></div>
      {couponMessage && <div className="alert alert-info"><BadgePercent size={17} />{couponMessage}</div>}
      <div className="checkout-total"><span>{locale === 'ar' ? 'الإجمالي قبل التوصيل' : 'Subtotal before delivery'}</span><strong>{formatCurrency(cart?.subtotal, locale)}</strong></div>
      {couponDiscount !== null && <div className="checkout-total"><span>{locale === 'ar' ? 'الخصم المتوقع' : 'Estimated discount'}</span><strong>−{formatCurrency(couponDiscount, locale)}</strong></div>}
      <div className="alert alert-info"><ShieldCheck size={18} />{locale === 'ar' ? 'السعر والمخزون والخصم ورسوم التوصيل يعتمدها الخادم عند إنشاء الطلب.' : 'The server recalculates price, stock, discount and delivery when placing the order.'}</div>
      <button className="button button-primary" disabled={busy || cartLoading || !cart?.items || !(cart.items as unknown[]).length}>{busy ? <LoaderCircle className="spin" size={17} /> : <CreditCard size={17} />}{locale === 'ar' ? 'تأكيد وإرسال الطلب' : 'Confirm and place order'}<ArrowLeft size={16} /></button>
    </form>
  </div>;
}

function SupportPage() {
  const { locale, storeId, user } = useApp();
  const activeStore = user?.storeId || storeId;
  const [store, setStore] = useState<Record<string, unknown> | null>(null);
  const [problem, setProblem] = useState<ApiError | null>(null);
  useEffect(() => {
    if (!activeStore) {
      setStore(null);
      setProblem(null);
      return;
    }
    let active = true;
    setProblem(null);
    apiRequest<Record<string, unknown>>(`/stores/${encodeURIComponent(activeStore)}/info`)
      .then((result) => { if (active) setStore(result); })
      .catch((error) => { if (active) setProblem(error instanceof ApiError ? error : new ApiError('تعذّر تحميل بيانات المتجر.', 0)); });
    return () => { active = false; };
  }, [activeStore]);
  const whatsapp = String(store?.whatsapp || import.meta.env.VITE_WHATSAPP_NUMBER || '').replace(/\D/g, '');
  const address = typeof store?.address === 'string' ? store.address : '';
  const phone = typeof store?.phone === 'string' ? store.phone : '';
  const email = typeof store?.email === 'string' ? store.email : '';
  const city = typeof store?.city === 'string' ? store.city : '';
  const hours = parseOpeningHours(store?.openingHours);
  const mapLink = typeof store?.mapUrl === 'string' && store.mapUrl
    ? store.mapUrl
    : store?.latitude != null && store?.longitude != null
      ? `https://www.google.com/maps?q=${Number(store.latitude)},${Number(store.longitude)}`
      : address ? `https://maps.google.com/?q=${encodeURIComponent(address)}` : '';
  return <div className="resource-page"><div className="page-heading"><div><span className="eyebrow">{locale === 'ar' ? 'نحن هنا لمساعدتك' : 'We are here to help'}</span><h1>{locale === 'ar' ? 'الدعم والتواصل' : 'Support & contact'}</h1><p>{locale === 'ar' ? 'بيانات التواصل والموقع من إعدادات المتجر الحالية.' : 'Contact details and location come from the active store settings.'}</p></div></div>
    {problem && <ApiProblem error={problem} onRetry={() => {
      setProblem(null);
      if (activeStore) {
        apiRequest<Record<string, unknown>>(`/stores/${encodeURIComponent(activeStore)}/info`)
          .then(setStore)
          .catch((error) => setProblem(error instanceof ApiError ? error : new ApiError('تعذّر تحميل بيانات المتجر.', 0)));
      }
    }} />}
    <section className="support-grid">
      <article className="panel support-card"><span className="support-icon whatsapp"><MessageCircle size={21} /></span><h2>WhatsApp</h2><p>{whatsapp ? (locale === 'ar' ? 'تواصل مع فريق المتجر مباشرة.' : 'Message the store team directly.') : (locale === 'ar' ? 'لم يضف المتجر رقم واتساب بعد.' : 'The store has not added a WhatsApp number.')}</p>{whatsapp ? <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className="button button-outline">{locale === 'ar' ? 'بدء محادثة' : 'Start a conversation'}<ExternalLink size={15} /></a> : <span className="route-tag">{locale === 'ar' ? 'غير متاح' : 'Not available'}</span>}</article>
      <article className="panel support-card"><span className="support-icon location"><MapPin size={21} /></span><h2>{locale === 'ar' ? 'الموقع' : 'Location'}</h2><p>{[address, city].filter(Boolean).join(' — ') || (locale === 'ar' ? 'لم يضف المتجر عنواناً بعد.' : 'The store has not added an address yet.')}</p>{mapLink && <a href={mapLink} target="_blank" rel="noreferrer" className="button button-outline">{locale === 'ar' ? 'عرض على الخريطة' : 'View on map'}<ExternalLink size={15} /></a>}</article>
      <article className="panel support-card"><span className="support-icon social"><Clock3 size={21} /></span><h2>{locale === 'ar' ? 'ساعات العمل' : 'Opening hours'}</h2>{hours ? <OpeningHoursList hours={hours} locale={locale} /> : <p>{locale === 'ar' ? 'لم يضف المتجر ساعات العمل بعد.' : 'The store has not published opening hours yet.'}</p>}</article>
      <article className="panel support-card"><span className="support-icon social"><Globe2 size={21} /></span><h2>{locale === 'ar' ? 'الاتصال بالمتجر' : 'Contact the store'}</h2><p>{phone || email || (locale === 'ar' ? 'لا توجد معلومات اتصال بعد.' : 'No contact details are available yet.')}</p>{phone && <a href={`tel:${phone}`} className="button button-outline">{locale === 'ar' ? 'اتصال' : 'Call'}<ExternalLink size={15} /></a>}{email && <a href={`mailto:${email}`} className="button button-outline">{locale === 'ar' ? 'إرسال بريد' : 'Email'}<ExternalLink size={15} /></a>}</article>
    </section></div>;
}

function extractItems(payload: unknown, preferred?: string): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const object = payload as Record<string, unknown>;
  if (preferred && Array.isArray(object[preferred])) return object[preferred] as unknown[];
  for (const key of ['items', 'products', 'orders', 'categories', 'coupons', 'zones', 'customers']) {
    if (Array.isArray(object[key])) return object[key] as unknown[];
  }
  return [];
}

function columnLabel(key: string, locale: Locale) {
  if (locale === 'en') return key.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase());
  const labels: Record<string, string> = {
    nameAr: 'الاسم', nameEn: 'الاسم (EN)', sku: 'رمز المنتج', price: 'السعر', stock: 'المخزون', status: 'الحالة',
    slug: 'الرابط', isActive: 'نشط', orderNumber: 'رقم الطلب', customerName: 'العميل', total: 'الإجمالي',
    createdAt: 'التاريخ', code: 'الرمز', type: 'النوع', discount: 'الخصم', usedCount: 'الاستخدام',
    city: 'المدينة', area: 'المنطقة', deliveryFee: 'رسوم التوصيل', minimumOrder: 'الحد الأدنى',
    firstName: 'الاسم', lastName: 'اللقب', phone: 'الهاتف', email: 'البريد الإلكتروني',
    number: 'رقم الطاولة', label: 'الوصف', qrLink: 'رمز QR', tableNumber: 'الطاولة', image: 'الصورة',
  };
  return labels[key] || key;
}

function formatCell(value: unknown, locale: Locale): ReactNode {
  if (value === null || value === undefined || value === '') return <span className="cell-muted">—</span>;
  if (typeof value === 'boolean') return <span className={`status-chip ${value ? 'status-good' : 'status-wait'}`}><i />{value ? (locale === 'ar' ? 'نعم' : 'Yes') : (locale === 'ar' ? 'لا' : 'No')}</span>;
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value)) return new Date(value).toLocaleDateString(locale === 'ar' ? 'ar-IQ' : 'en-US');
  if (typeof value === 'number' && /price|total|discount|fee/i.test(String(value))) return formatCurrency(value, locale);
  return String(value);
}

function formatCurrency(value: unknown, locale: Locale) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return `${new Intl.NumberFormat(locale === 'ar' ? 'ar-IQ' : 'en-US', { maximumFractionDigits: 0 }).format(amount)} ${locale === 'ar' ? 'د.ع' : 'IQD'}`;
}

type TrackedOrderItem = {
  productSlug?: string | null;
  productNameAr?: string | null;
  productNameEn?: string | null;
  variantName?: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
};

type TrackedOrderHistory = {
  status: string;
  createdAt: string;
};

type TrackedOrder = {
  storeName: string;
  orderNumber: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  items: TrackedOrderItem[];
  subtotal: number;
  discount: number;
  tax: number;
  deliveryFee: number;
  total: number;
  customerName: string;
  customerPhone: string;
  deliveryAddress?: string | null;
  deliveryNotes?: string | null;
  requestedAt?: string | null;
  createdAt: string;
  deliveredAt?: string | null;
  statusHistory: TrackedOrderHistory[];
};

function TrackOrderPage() {
  const { locale } = useApp();
  const navigate = useNavigate();
  const ar = locale === 'ar';
  const { token } = useParams<{ token: string }>();
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || token.length !== 64) {
      setError(ar ? 'رمز التتبع غير صالح' : 'Invalid tracking token');
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    apiRequest<TrackedOrder>(`/orders/track/${encodeURIComponent(token)}`)
      .then((result) => { if (active) { setOrder(result); setLoading(false); } })
      .catch((apiError: unknown) => {
        if (active) {
          if (apiError instanceof ApiError && apiError.status === 404)
            setError(ar ? 'الطلب غير موجود أو انتهى صلاحية الرابط' : 'Order not found or expired');
          else setError(apiError instanceof Error ? apiError.message : (ar ? 'حدث خطأ أثناء تحميل الطلب' : 'Error loading order'));
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, [token, ar, navigate]);

  if (loading)
    return <div className="resource-page"><div className="page-heading"><h1>{ar ? 'تتبع الطلب' : 'Track Order'}</h1></div><div className="table-state empty-state"><LoaderCircle className="spin" size={24} /><span>{ar ? 'جارٍ تحميل بيانات الطلب...' : 'Loading...'}</span></div></div>;

  if (error)
    return (
      <div className="resource-page">
        <div className="page-heading"><div><span className="eyebrow">{ar ? 'طلب غير موجود' : 'Order Not Found'}</span><h1>{ar ? 'الطلب غير متوفر' : 'Order Unavailable'}</h1></div></div>
        <div className="panel error-panel"><CircleHelp size={24} /><p>{error}</p><div className="error-actions"><button className="button button-secondary" onClick={() => navigate('/')}><Check size={18} />{ar ? 'العودة للمتجر' : 'Return'}</button></div></div>
      </div>
    );

  if (!order)
    return <div className="resource-page"><div className="page-heading"><h1>{ar ? 'تتبع الطلب' : 'Track Order'}</h1></div><div className="panel error-panel"><CircleHelp size={24} /><h2>{ar ? 'عذراً، لم يتم العثور على طلب' : 'Sorry, Order not found'}</h2><p>{ar ? 'لا توجد بيانات لطلب بهذا الرمز.' : 'No order data with this token.'}</p><div className="error-actions"><button className="button button-secondary" onClick={() => navigate('/')}><ArrowLeft size={16} /> {ar ? 'العودة للرئيسية' : 'Go Home'}</button></div></div></div>;

  const statusChips = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'REFUNDED'];
  const badgeClassIndex = statusChips.indexOf(String(order.status)?.toUpperCase());
  const statusChipClass = badgeClassIndex > -1 ? `status-${order.status?.toLowerCase()}` : '';

  const formatMoney = (val: unknown) => {
    const n = Number(val);
    return (!Number.isFinite(n)) ? '—' : `${new Intl.NumberFormat(ar ? 'ar-IQ' : 'en-US', { maximumFractionDigits: 0 }).format(n)} ${ar ? 'د.ع' : 'IQD'}`;
  };

  return (
    <div className="resource-page">
      <div className="page-heading"><div><span className="eyebrow">{ar ? 'نشرة تأكيد الطلب' : 'Order Confirmation'}</span><h1>{ar ? 'تتبع حالة طلبك' : 'Track Your Order Status'}</h1></div></div>
      {order.storeName && <div className="panel info-panel mb-4"><Store size={20} /><div><div className="eyebrow">{ar ? 'المتجر' : 'Store'}</div><strong>{order.storeName}</strong></div></div>}
      <div className="panel mb-4">
        <div className="panel-heading"><ClipboardList size={18} /><span>{ar ? 'معلومات الطلب' : 'Order Information'}</span></div>
        <dl className="info-list">
          <div><dt>{ar ? 'رقم الطلب' : 'Order Number'}</dt><dd><code dir="ltr">{order.orderNumber || '—'}</code></dd></div>
          <div><dt>{ar ? 'الحالة' : 'Status'}</dt><dd><span className={`status-chip ${statusChipClass}`}><i />{order.status || '—'}</span></dd></div>
          <div><dt>{ar ? 'حالة الدفع' : 'Payment Status'}</dt><dd><span className={`status-chip payment-${order.paymentStatus?.toLowerCase()}`}><i />{order.paymentStatus || '—'}</span></dd></div>
          {order.createdAt && <div><dt>{ar ? 'تاريخ الطلب' : 'Order Date'}</dt><dd>{new Date(String(order.createdAt)).toLocaleString(ar ? 'ar-IQ' : 'en-US')}</dd></div>}
          {order.paymentMethod && <div><dt>{ar ? 'طريقة الدفع' : 'Payment Method'}</dt><dd>{order.paymentMethod === 'CASH_ON_DELIVERY' ? (ar ? 'الدفع عند الاستلام' : 'Cash on Delivery') : order.paymentMethod}</dd></div>}
        </dl>
      </div>
      {(order.customerName || order.customerPhone) && (
        <div className="panel mb-4">
          <div className="panel-heading"><User size={18} /><span>{ar ? 'بيانات العميل' : 'Customer Information'}</span></div>
          <dl className="info-list">
            {order.customerName && <div><dt>{ar ? 'الاسم' : 'Name'}</dt><dd>{order.customerName}</dd></div>}
            {order.customerPhone && <div><dt>{ar ? 'الهاتف' : 'Phone'}</dt><dd dir="ltr">{order.customerPhone}</dd></div>}
          </dl>
        </div>
      )}
      {Array.isArray(order.items) && order.items.length > 0 && (
        <div className="panel mb-4">
          <div className="panel-heading"><ShoppingBag size={18} /><span>{ar ? 'المنتجات' : 'Products'}</span></div>
          <div className="items-list">
            {order.items.map((item, idx) => (
              <div key={idx} className="item-row">
                <div className="item-info">
                  <div className="item-name" dir={item.productNameAr ? 'rtl' : 'ltr'}>
                    {item.productSlug && <span className="" dir="ltr">{item.productSlug}</span>}
                    <strong>{item.productNameAr || item.productNameEn || 'Product'}</strong>
                    {item.variantName && <span className="text-muted"> - {item.variantName}</span>}
                  </div>
                  <div className="item-price-mobile">{formatMoney(item.unitPrice)} x {item.quantity}</div>
                </div>
                <div className="item-qty-mobile">{item.quantity}</div>
                <div className="item-price-desktop">{formatMoney(item.total)}</div>
              </div>
            ))}
          </div>
          <div className="order-summary mt-4">
            <div className="summary-row"><span>{ar ? 'المجموع الفرعي' : 'Subtotal'}</span><span>{formatMoney(order.subtotal)}</span></div>
            <div className="summary-row"><span>{ar ? 'الخصم' : 'Discount'}</span><span>−{formatMoney(order.discount)}</span></div>
            <div className="summary-row"><span>{ar ? 'الضريبة' : 'Tax'}</span><span>{formatMoney(order.tax)}</span></div>
            <div className="summary-row"><span>{ar ? 'رسوم التوصيل' : 'Delivery fee'}</span><span>{formatMoney(order.deliveryFee)}</span></div>
            <div className="summary-row"><strong>{ar ? 'الإجمالي' : 'Total'}</strong><strong>{formatMoney(order.total)}</strong></div>
          </div>
        </div>
      )}
      {(order.deliveryAddress || order.deliveryNotes || order.requestedAt) && (
        <div className="panel mb-4">
          <div className="panel-heading"><Truck size={18} /><span>{ar ? 'عنوان التوصيل' : 'Delivery Address'}</span></div>
          <dl className="info-list">
            <div><dt>{ar ? 'العنوان' : 'Address'}</dt><dd dir="ltr">{order.deliveryAddress}</dd></div>
            {order.deliveryNotes && <div><dt>{ar ? 'ملاحظات' : 'Notes'}</dt><dd>{order.deliveryNotes}</dd></div>}
            {order.requestedAt && <div><dt>{ar ? 'وقت الطلب' : 'Requested Time'}</dt><dd>{new Date(String(order.requestedAt)).toLocaleString(ar ? 'ar-IQ' : 'en-US')}</dd></div>}
          </dl>
        </div>
      )}
      {Array.isArray(order.statusHistory) && order.statusHistory.length > 0 && (
        <div className="panel mb-4">
          <div className="panel-heading"><Clock3 size={18} /><span>{ar ? 'سجل الحالة' : 'Status History'}</span></div>
          <div className="history-list">
            {order.statusHistory.slice().reverse().map((entry, index) => (
              <div key={`${entry.status}-${entry.createdAt}-${index}`} className="history-item">
                <div className="history-time"><Clock3 size={12} /><span>{new Date(entry.createdAt).toLocaleString(ar ? 'ar-IQ' : 'en-US')}</span></div>
                <span className={`status-chip status-${entry.status?.toLowerCase()}`}>{entry.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="actions">
        <button className="button button-primary" onClick={() => window.location.reload()} type="button">{ar ? 'تحديث' : 'Update'}</button>
        <Link to="/storefront" className="button button-outline"><ArrowLeft size={16} /> {ar ? 'الرئيسية' : 'Storefront'}</Link>
      </div>
    </div>
  );
}

function formatUptime(value: number) {
  if (!Number.isFinite(value)) return '—';
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function initials(user: User | null) {
  if (!user) return 'S';
  const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  if (name) return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('');
  return (user.email || user.phone || 'S').slice(0, 1).toUpperCase();
}

function shorten(value: string) {
  return value.length > 16 ? `${value.slice(0, 7)}…${value.slice(-5)}` : value;
}

const WEEK_DAYS = [
  { key: 'sat', ar: 'السبت', en: 'Saturday' },
  { key: 'sun', ar: 'الأحد', en: 'Sunday' },
  { key: 'mon', ar: 'الاثنين', en: 'Monday' },
  { key: 'tue', ar: 'الثلاثاء', en: 'Tuesday' },
  { key: 'wed', ar: 'الأربعاء', en: 'Wednesday' },
  { key: 'thu', ar: 'الخميس', en: 'Thursday' },
  { key: 'fri', ar: 'الجمعة', en: 'Friday' },
] as const;

type DayHours = { closed: boolean; open: string; close: string };

function parseOpeningHours(value: unknown): Record<string, DayHours> | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, Partial<DayHours> | undefined>;
  const result: Record<string, DayHours> = {};
  for (const day of WEEK_DAYS) {
    const entry = source[day.key];
    if (!entry) return null;
    result[day.key] = { closed: Boolean(entry.closed), open: String(entry.open || '09:00'), close: String(entry.close || '22:00') };
  }
  return result;
}

function OpeningHoursList({ hours, locale }: { hours: Record<string, DayHours>; locale: Locale }) {
  return <ul className="hours-list">{WEEK_DAYS.map((day) => <li key={day.key}><span>{locale === 'ar' ? day.ar : day.en}</span><strong dir="ltr">{hours[day.key].closed ? (locale === 'ar' ? 'مغلق' : 'Closed') : `${hours[day.key].open} – ${hours[day.key].close}`}</strong></li>)}</ul>;
}

function ProductDetailsPage() {
  const { user, locale, storeId } = useApp();
  const { productId = '', slug } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<ApiError | null>(null);
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState('');
  const [routeStoreId, setRouteStoreId] = useState('');
  const ar = locale === 'ar';

  const load = useCallback(async () => {
    setLoading(true);
    setProblem(null);
    try {
      const nextProduct = await apiRequest<Record<string, unknown>>(`/products/${encodeURIComponent(productId)}`);
      if (slug) {
        const store = await apiRequest<Record<string, unknown>>(`/stores/${encodeURIComponent(slug)}/info`);
        if (String(nextProduct.storeId || '') !== String(store.id || '')) {
          throw new ApiError('This product is not part of the selected store.', 404);
        }
        setRouteStoreId(String(store.id || ''));
        if (user?.role === UserRole.CUSTOMER) {
          await apiRequest(`/stores/${encodeURIComponent(String(store.id))}/join`, { method: 'POST' });
        }
      }
      setProduct(nextProduct);
    } catch (error) {
      setProduct(null);
      setRouteStoreId('');
      setProblem(error instanceof ApiError ? error : new ApiError(ar ? 'تعذّر تحميل المنتج.' : 'Unable to load the product.', 0));
    } finally { setLoading(false); }
  }, [productId, ar, slug, user?.role]);
  useEffect(() => { void load(); }, [load]);

  const variants = Array.isArray(product?.variants) ? (product.variants as Record<string, unknown>[]).filter((variant) => variant.isActive !== false) : [];
  const selectedVariant = variants.find((variant) => String(variant.id) === variantId);
  const available = Number(selectedVariant ? selectedVariant.stock : product?.stock) || 0;
  const unitPrice = selectedVariant && selectedVariant.price != null ? Number(selectedVariant.price) : Number(product?.price);
  const compareAt = product?.compareAtPrice != null ? Number(product.compareAtPrice) : 0;
  const category = product?.category && typeof product.category === 'object' ? product.category as Record<string, unknown> : null;
  const image = assetUrl((product?.productImages as Record<string, unknown> | null | undefined)?.url);
  const name = String(((ar ? product?.nameAr : product?.nameEn) || product?.nameAr || product?.nameEn) || '');
  const description = String(((ar ? product?.descriptionAr : product?.descriptionEn) || product?.descriptionAr || product?.descriptionEn) || '');
  const activeStore = slug ? routeStoreId : user?.storeId || storeId;
  // On the public /store/:slug routes, a leftover staff/admin session must not block shopping: it shops as a guest.
  const shopsAsGuest = !user || (Boolean(slug) && user.role !== UserRole.CUSTOMER);
  const canShop = user?.role === UserRole.CUSTOMER || shopsAsGuest;

  useEffect(() => { setQuantity((current) => Math.min(Math.max(1, current), Math.max(1, available))); }, [available]);

  async function addToCart() {
    if (!product) return;
    if (variants.length && !selectedVariant) { setNotice(ar ? 'اختر أحد الخيارات أولاً.' : 'Choose an option first.'); return; }
    setAdding(true);
    setNotice('');
    try {
      const productStoreId = String(product.storeId || activeStore);
      if (user?.role === UserRole.CUSTOMER) {
        await apiRequest(`/customers/${encodeURIComponent(user.customerId || user.id)}/cart/items`, {
          method: 'POST',
          body: JSON.stringify({ productId: product.id, quantity, storeId: productStoreId, ...(selectedVariant ? { variantId: selectedVariant.id } : {}) }),
        });
      } else if (shopsAsGuest) {
        let session = readGuestCart();
        if (session?.storeId !== productStoreId) {
          clearGuestCart();
          await createGuestCart(productStoreId);
          session = readGuestCart();
        }
        if (!session) throw new ApiError(ar ? 'تعذّر بدء سلة الضيف.' : 'Could not start a guest cart.', 0);
        await addToGuestCart(session.cartId, productStoreId, String(product.id), selectedVariant ? String(selectedVariant.id) : undefined, quantity);
      } else {
        setNotice(ar ? 'الشراء متاح للعملاء والضيوف.' : 'Shopping is available to customers and guests.');
        return;
      }
      navigate(slug ? `/store/${encodeURIComponent(slug)}/cart` : '/cart');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : (ar ? 'تعذّر إضافة المنتج.' : 'Could not add to cart.'));
    } finally { setAdding(false); }
  }

  const BackIcon = ar ? ArrowRight : ArrowLeft;
  return <div className="resource-page product-details">
    <Link to={slug ? `/store/${encodeURIComponent(slug)}` : user?.role === UserRole.CUSTOMER ? '/storefront' : '/products'} className="back-link"><BackIcon size={16} />{ar ? 'رجوع إلى المنتجات' : 'Back to products'}</Link>
    {loading ? <div className="table-state"><LoaderCircle className="spin" size={24} /><span>{ar ? 'جارٍ تحميل المنتج...' : 'Loading product...'}</span></div>
      : problem || !product ? <div className="table-state empty-state"><strong>{problem?.status === 404 ? (ar ? 'المنتج غير موجود' : 'Product not found') : (ar ? 'تعذّر تحميل المنتج' : 'Unable to load the product')}</strong><span>{problem?.message}</span><button className="button button-outline button-small" onClick={() => void load()}><RefreshCw size={15} />{ar ? 'إعادة المحاولة' : 'Try again'}</button></div>
        : <section className="panel product-detail-card">
          <div className="product-detail-media">{image && <img src={image} alt={name} onError={(event) => { event.currentTarget.hidden = true; event.currentTarget.parentElement?.querySelector('.fallback-product-art')?.classList.add('fallback-visible'); }} />}<span className={`product-art-bag fallback-product-art ${image ? '' : 'fallback-visible'}`}><ShoppingBag size={56} /></span></div>
          <div className="product-detail-info">
            {category && <small className="eyebrow">{String((ar ? category.nameAr : category.nameEn) || category.nameAr || '')}</small>}
            <h1>{name}</h1>
            {Boolean(product.nameEn && product.nameAr) && <p className="product-alt-name">{String(ar ? product.nameEn : product.nameAr)}</p>}
            <div className="product-price-row"><strong>{formatCurrency(unitPrice, locale)}</strong>{compareAt > unitPrice && <s>{formatCurrency(compareAt, locale)}</s>}</div>
            <p className={`stock-state ${available > 0 ? 'in-stock' : 'out-of-stock'}`}>{available > 0 ? (ar ? `متوفر (${available})` : `In stock (${available})`) : (ar ? 'غير متوفر حالياً' : 'Out of stock')}</p>
            {description && <p className="product-description">{description}</p>}
            <dl className="product-meta">{product.sku ? <div><dt>SKU</dt><dd dir="ltr">{String(selectedVariant?.sku || product.sku)}</dd></div> : null}{category && <div><dt>{ar ? 'التصنيف' : 'Category'}</dt><dd>{String((ar ? category.nameAr : category.nameEn) || category.nameAr || '')}</dd></div>}</dl>
            {variants.length > 0 && <label className="field-label">{ar ? 'الخيارات' : 'Options'}<select className="input-control" value={variantId} onChange={(event) => setVariantId(event.target.value)}><option value="">{ar ? 'اختر خياراً' : 'Choose an option'}</option>{variants.map((variant) => <option key={String(variant.id)} value={String(variant.id)} disabled={Number(variant.stock) <= 0}>{String(variant.name)} — {formatCurrency(variant.price, locale)}{Number(variant.stock) <= 0 ? (ar ? ' (نفد)' : ' (sold out)') : ''}</option>)}</select></label>}
            {canShop ? <div className="product-buy-row">
              <div className="quantity-control"><button type="button" aria-label={ar ? 'تقليل الكمية' : 'Decrease quantity'} disabled={quantity <= 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button><output aria-live="polite">{quantity}</output><button type="button" aria-label={ar ? 'زيادة الكمية' : 'Increase quantity'} disabled={quantity >= available} onClick={() => setQuantity((value) => Math.min(available, value + 1))}>+</button></div>
              <button className="button button-primary" disabled={adding || available <= 0} onClick={() => void addToCart()}>{adding ? <LoaderCircle className="spin" size={17} /> : <ShoppingCart size={17} />}{ar ? 'إضافة إلى السلة' : 'Add to cart'}</button>
            </div> : <div className="alert alert-info"><Eye size={16} />{ar ? 'عرض للمراجعة فقط — الشراء متاح للعملاء والضيوف.' : 'Preview only — purchasing is available to customers and guests.'}</div>}
            {notice && <div className="alert alert-error" role="alert">{notice}</div>}
          </div>
        </section>}
  </div>;
}

type PlatformUser = {
  id: string; email?: string | null; phone?: string | null; firstName?: string | null; lastName?: string | null;
  role: string; storeId?: string | null; storeName?: string | null; isActive: boolean; isEmailVerified?: boolean; isPhoneVerified?: boolean;
  lastLoginAt?: string | null; createdAt: string;
};

function PlatformUsersPage() {
  const { user: me, locale } = useApp();
  const ar = locale === 'ar';
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [paging, setPaging] = useState({ total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [details, setDetails] = useState<Record<string, unknown> | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebounced((current) => { if (current !== search.trim()) setPage(1); return search.trim(); }); }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10' });
      if (debounced) params.set('search', debounced);
      if (role) params.set('role', role);
      if (status) params.set('status', status);
      const result = await apiRequest<{ users: PlatformUser[]; pagination: { total: number; totalPages: number } }>(`/platform/users?${params.toString()}`);
      setUsers(result.users);
      setPaging({ total: result.pagination.total, totalPages: Math.max(1, result.pagination.totalPages) });
    } catch (requestError) {
      setUsers([]);
      setError(requestError instanceof Error ? requestError.message : 'Unable to load users.');
    } finally { setLoading(false); }
  }, [page, debounced, role, status]);
  useEffect(() => { void load(); }, [load]);

  async function openDetails(id: string) {
    setDetails({ id });
    setDetailsLoading(true);
    try { setDetails(await apiRequest<Record<string, unknown>>(`/platform/users/${encodeURIComponent(id)}`)); }
    catch (requestError) { setDetails(null); setError(requestError instanceof Error ? requestError.message : 'Unable to load user.'); }
    finally { setDetailsLoading(false); }
  }

  async function toggle(target: PlatformUser) {
    const next = !target.isActive;
    if (!window.confirm(ar ? `هل تريد ${next ? 'تفعيل' : 'إيقاف'} هذا الحساب؟` : `${next ? 'Activate' : 'Deactivate'} this account?`)) return;
    setError(''); setMessage('');
    try {
      await apiRequest(`/platform/users/${encodeURIComponent(target.id)}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: next }) });
      setMessage(ar ? 'تم تحديث حالة الحساب.' : 'Account status updated.');
      await load();
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Update failed.'); }
  }

  async function revoke(target: PlatformUser) {
    if (!window.confirm(ar ? 'سيتم تسجيل خروج هذا المستخدم من كل الأجهزة. متابعة؟' : 'This signs the user out everywhere. Continue?')) return;
    setError(''); setMessage('');
    try {
      await apiRequest(`/platform/users/${encodeURIComponent(target.id)}/revoke-sessions`, { method: 'POST' });
      setMessage(ar ? 'تم إنهاء جميع الجلسات.' : 'All sessions were revoked.');
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Revoke failed.'); }
  }

  const roles: UserRole[] = [UserRole.PLATFORM_ADMIN, UserRole.STORE_OWNER, UserRole.STORE_ADMIN, UserRole.STAFF, UserRole.CUSTOMER];
  const fullName = (entry: { firstName?: unknown; lastName?: unknown }) => [entry.firstName, entry.lastName].filter(Boolean).join(' ') || '—';
  return <div className="resource-page">
    <div className="page-heading"><div><span className="eyebrow">{ar ? 'إدارة المنصة' : 'Platform administration'}</span><h1>{ar ? 'مستخدمو المنصة' : 'Platform users'}</h1><p>{ar ? 'جميع الحسابات عبر المتاجر مع إدارة الحالة والجلسات.' : 'Every account across all stores, with status and session controls.'}</p></div><button className="button button-outline" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} />{ar ? 'تحديث' : 'Refresh'}</button></div>
    {error && <div className="alert alert-error" role="alert"><CircleHelp size={17} />{error}</div>}
    {message && <div className="alert alert-info" role="status"><Check size={17} />{message}</div>}
    <section className="panel data-panel">
      <div className="data-toolbar users-toolbar">
        <label className="table-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={ar ? 'بحث بالاسم أو البريد أو الهاتف...' : 'Search name, email or phone...'} /></label>
        <select className="input-control" value={role} onChange={(event) => { setPage(1); setRole(event.target.value); }} aria-label={ar ? 'الدور' : 'Role'}><option value="">{ar ? 'كل الأدوار' : 'All roles'}</option>{roles.map((entry) => <option key={entry} value={entry}>{roleTitle[entry][ar ? 0 : 1]}</option>)}</select>
        <select className="input-control" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }} aria-label={ar ? 'الحالة' : 'Status'}><option value="">{ar ? 'كل الحالات' : 'All statuses'}</option><option value="ACTIVE">{ar ? 'نشط' : 'Active'}</option><option value="INACTIVE">{ar ? 'موقوف' : 'Inactive'}</option></select>
      </div>
      {loading ? <div className="table-state"><LoaderCircle size={24} className="spin" /><span>{ar ? 'جارٍ تحميل المستخدمين...' : 'Loading users...'}</span></div>
        : users.length === 0 ? <div className="table-state empty-state"><span className="empty-illustration"><Users size={25} /></span><strong>{ar ? 'لا يوجد مستخدمون مطابقون' : 'No matching users'}</strong></div>
          : <div className="table-scroll"><table className="records-table"><thead><tr><th>{ar ? 'الاسم' : 'Name'}</th><th>{ar ? 'التواصل' : 'Contact'}</th><th>{ar ? 'الدور' : 'Role'}</th><th>{ar ? 'المتجر' : 'Store'}</th><th>{ar ? 'الحالة' : 'Status'}</th><th>{ar ? 'آخر دخول' : 'Last login'}</th><th>{ar ? 'إجراء' : 'Actions'}</th></tr></thead><tbody>{users.map((entry) => <tr key={entry.id}>
            <td>{fullName(entry)}</td><td dir="ltr">{entry.email || entry.phone || '—'}</td><td>{roleTitle[entry.role as UserRole]?.[ar ? 0 : 1] || entry.role}</td><td>{entry.storeName || '—'}</td>
            <td><span className={`status-chip ${entry.isActive ? 'status-good' : 'status-wait'}`}><i />{entry.isActive ? (ar ? 'نشط' : 'Active') : (ar ? 'موقوف' : 'Inactive')}</span></td>
            <td>{entry.lastLoginAt ? new Date(entry.lastLoginAt).toLocaleDateString(ar ? 'ar-IQ' : 'en-US') : '—'}</td>
            <td><div className="row-actions"><button className="button button-quiet button-small" onClick={() => void openDetails(entry.id)}>{ar ? 'التفاصيل' : 'Details'}</button>{entry.role !== UserRole.PLATFORM_ADMIN && entry.id !== me?.id && <><button className="button button-outline button-small" onClick={() => void toggle(entry)}>{entry.isActive ? (ar ? 'إيقاف' : 'Deactivate') : (ar ? 'تفعيل' : 'Activate')}</button><button className="button button-quiet button-small" onClick={() => void revoke(entry)}>{ar ? 'إنهاء الجلسات' : 'Revoke sessions'}</button></>}</div></td>
          </tr>)}</tbody></table></div>}
      {paging.total > 0 && <Pagination page={page} totalPages={paging.totalPages} total={paging.total} loading={loading} locale={locale} onChange={setPage} />}
    </section>
    {details && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetails(null); }}><section className="modal-card" role="dialog" aria-modal="true" aria-label={ar ? 'تفاصيل المستخدم' : 'User details'}>
      <div className="modal-heading"><div><span className="eyebrow">{ar ? 'تفاصيل المستخدم' : 'User details'}</span><h2>{detailsLoading ? '…' : fullName(details)}</h2></div><button className="icon-button" onClick={() => setDetails(null)} aria-label={ar ? 'إغلاق' : 'Close'}><X size={19} /></button></div>
      {detailsLoading ? <div className="table-state"><LoaderCircle className="spin" size={22} /></div> : <dl className="details-list">
        <div><dt>{ar ? 'البريد' : 'Email'}</dt><dd dir="ltr">{String(details.email || '—')}</dd></div>
        <div><dt>{ar ? 'الهاتف' : 'Phone'}</dt><dd dir="ltr">{String(details.phone || '—')}</dd></div>
        <div><dt>{ar ? 'الدور' : 'Role'}</dt><dd>{roleTitle[details.role as UserRole]?.[ar ? 0 : 1] || String(details.role)}</dd></div>
        <div><dt>{ar ? 'الحالة' : 'Status'}</dt><dd>{details.isActive ? (ar ? 'نشط' : 'Active') : (ar ? 'موقوف' : 'Inactive')}</dd></div>
        <div><dt>{ar ? 'المتجر' : 'Store'}</dt><dd>{String((details.store as Record<string, unknown> | null)?.name || '—')}</dd></div>
        <div><dt>{ar ? 'عدد الطلبات' : 'Orders'}</dt><dd>{String(details.orderCount ?? 0)}</dd></div>
        <div><dt>{ar ? 'المتاجر المنضم إليها' : 'Joined stores'}</dt><dd>{Array.isArray(details.joinedStores) && details.joinedStores.length ? (details.joinedStores as Array<{ name: string }>).map((store) => store.name).join('، ') : '—'}</dd></div>
        <div><dt>{ar ? 'تاريخ الإنشاء' : 'Created'}</dt><dd>{details.createdAt ? new Date(String(details.createdAt)).toLocaleString(ar ? 'ar-IQ' : 'en-US') : '—'}</dd></div>
      </dl>}
    </section></div>}
  </div>;
}

type SystemSettingsForm = { platformName: string; supportEmail: string; supportPhone: string; defaultLocale: string; defaultCurrency: string; allowCustomerRegistration: boolean };

function SystemSettingsPage() {
  const { locale } = useApp();
  const ar = locale === 'ar';
  const [settings, setSettings] = useState<SystemSettingsForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setSettings(await apiRequest<SystemSettingsForm>('/platform/settings')); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to load settings.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) || '').trim();
    setSaving(true); setError(''); setMessage('');
    try {
      const saved = await apiRequest<SystemSettingsForm>('/platform/settings', {
        method: 'PUT',
        body: JSON.stringify({
          platformName: value('platformName'),
          supportEmail: value('supportEmail'),
          supportPhone: value('supportPhone'),
          defaultLocale: value('defaultLocale'),
          defaultCurrency: value('defaultCurrency').toUpperCase(),
          allowCustomerRegistration: form.get('allowCustomerRegistration') === 'on',
        }),
      });
      setSettings(saved);
      setMessage(ar ? 'تم حفظ إعدادات النظام في قاعدة البيانات.' : 'System settings saved to the database.');
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to save settings.'); }
    finally { setSaving(false); }
  }

  return <div className="resource-page">
    <div className="page-heading"><div><span className="eyebrow">{ar ? 'إدارة المنصة' : 'Platform administration'}</span><h1>{ar ? 'إعدادات النظام' : 'System settings'}</h1><p>{ar ? 'إعدادات عامة تنطبق على المنصة بأكملها.' : 'Global settings that apply to the whole platform.'}</p></div><button className="button button-outline" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} />{ar ? 'تحديث' : 'Refresh'}</button></div>
    {error && <div className="alert alert-error" role="alert"><CircleHelp size={17} />{error}</div>}
    {message && <div className="alert alert-info" role="status"><Check size={17} />{message}</div>}
    {loading ? <div className="table-state"><LoaderCircle className="spin" size={24} /></div> : settings && <section className="panel profile-panel"><form key={JSON.stringify(settings)} className="modal-form profile-form" onSubmit={save}>
      <label className="field-label">{ar ? 'اسم المنصة' : 'Platform name'}<input className="input-control" name="platformName" defaultValue={settings.platformName} required minLength={2} maxLength={80} /></label>
      <label className="field-label">{ar ? 'بريد الدعم' : 'Support email'}<input className="input-control" type="email" name="supportEmail" defaultValue={settings.supportEmail} dir="ltr" /></label>
      <label className="field-label">{ar ? 'هاتف الدعم' : 'Support phone'}<input className="input-control" type="tel" name="supportPhone" defaultValue={settings.supportPhone} dir="ltr" maxLength={30} /></label>
      <label className="field-label">{ar ? 'اللغة الافتراضية' : 'Default language'}<select className="input-control" name="defaultLocale" defaultValue={settings.defaultLocale}><option value="ar-SA">العربية</option><option value="en-US">English</option></select></label>
      <label className="field-label">{ar ? 'العملة الافتراضية' : 'Default currency'}<input className="input-control" name="defaultCurrency" defaultValue={settings.defaultCurrency} required minLength={3} maxLength={3} dir="ltr" /></label>
      <label className="field-label checkbox-field"><input type="checkbox" name="allowCustomerRegistration" defaultChecked={settings.allowCustomerRegistration} />{ar ? 'السماح بتسجيل العملاء الجدد' : 'Allow new customer registration'}</label>
      <div className="row-actions"><button className="button button-primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{ar ? 'حفظ التغييرات' : 'Save changes'}</button></div>
    </form></section>}
  </div>;
}
export default App;
