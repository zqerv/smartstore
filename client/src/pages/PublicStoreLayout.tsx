import { ArrowLeft, ArrowRight, Globe2, ShoppingBag } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './public-store.css';

export function PublicStoreLayout({ active, locale, setLocale, children }: {
  active: boolean;
  locale: 'ar' | 'en';
  setLocale: (locale: 'ar' | 'en') => void;
  children: ReactNode;
}) {
  const ar = locale === 'ar';
  const Arrow = ar ? ArrowRight : ArrowLeft;
  useEffect(() => {
    if (!active) return;
    const previousTitle = document.title;
    document.title = 'VAYRON STORE | Collections';
    return () => { document.title = previousTitle; };
  }, [active]);

  if (!active) return <>{children}</>;
  return (
    <div className="public-commerce" dir={ar ? 'rtl' : 'ltr'} lang={locale}>
      <header className="public-commerce-header">
        <Link to="/demo" className="public-commerce-brand" aria-label="VAYRON STORE">
          <span aria-hidden="true">V</span><strong dir="ltr">VAYRON <small>STORE</small></strong>
        </Link>
        <nav aria-label={ar ? 'التنقل العام' : 'Public navigation'}>
          <Link to="/demo"><Arrow size={16} aria-hidden="true" />{ar ? 'المتاجر' : 'Stores'}</Link>
          <button type="button" onClick={() => setLocale(ar ? 'en' : 'ar')}>
            <Globe2 size={16} aria-hidden="true" /><span lang={ar ? 'en' : 'ar'}>{ar ? 'English' : 'العربية'}</span>
          </button>
        </nav>
      </header>
      <div className="public-commerce-content">{children}</div>
      <footer className="public-commerce-footer">
        <span dir="ltr">© {new Date().getFullYear()} VAYRON STORE</span>
        <span><ShoppingBag size={15} aria-hidden="true" />{ar ? 'تجربة عرض · تسوّق كضيف دون تسجيل دخول' : 'Demo experience · Guest shopping, no sign-in'}</span>
        <Link to="/demo">{ar ? 'اكتشف المتاجر' : 'Explore the stores'}</Link>
      </footer>
    </div>
  );
}
