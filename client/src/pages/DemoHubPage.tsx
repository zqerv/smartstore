import { ArrowLeft, ArrowRight, Globe2, ShieldCheck, ShoppingBag, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './demo-hub.css';

type Locale = 'ar' | 'en';

const stores = [
  {
    slug: 'veloura',
    name: 'Veloura Parfums',
    monogram: 'V',
    category: { ar: 'عطور فاخرة', en: 'Luxury fragrance' },
    description: {
      ar: 'مجموعة مختارة من العطور الشرقية المعاصرة، صُممت لتكون جزءاً من بصمتك الخاصة.',
      en: 'A considered collection of modern oriental fragrances, composed to become part of your signature.',
    },
  },
  {
    slug: 'maison-elan',
    name: 'Maison Élan',
    monogram: 'É',
    category: { ar: 'أزياء فاخرة', en: 'Luxury fashion' },
    description: {
      ar: 'قطع أزياء مختارة بعناية، بتفاصيل أنيقة وقصّات مريحة تواكب إيقاع الحياة.',
      en: 'Thoughtful wardrobe pieces, tailored with ease and made for a life in motion.',
    },
  },
] as const;

export function DemoHubPage({ locale, setLocale }: {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}) {
  const [introState, setIntroState] = useState<'visible' | 'leaving' | 'hidden'>('visible');
  const ar = locale === 'ar';
  const Arrow = ar ? ArrowLeft : ArrowRight;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'VAYRON STORE | Demo Hub';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIntroState('hidden');
      return () => { document.title = previousTitle; };
    }
    const leaveTimer = window.setTimeout(() => setIntroState('leaving'), 850);
    const hideTimer = window.setTimeout(() => setIntroState('hidden'), 1_100);
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(hideTimer);
      document.title = previousTitle;
    };
  }, []);

  return (
    <main className="vayron-demo" dir={ar ? 'rtl' : 'ltr'} lang={locale}>
      <a className="vayron-skip-link" href="#demo-stores">
        {ar ? 'انتقل إلى المتاجر' : 'Skip to stores'}
      </a>
      <header className="vayron-demo-header">
        <Link to="/demo" className="vayron-wordmark" aria-label="VAYRON STORE">
          <span className="vayron-brand-symbol" aria-hidden="true">V</span>
          <span dir="ltr">VAYRON <small>STORE</small></span>
        </Link>
        <button className="vayron-language" type="button" onClick={() => setLocale(ar ? 'en' : 'ar')}>
          <Globe2 size={16} aria-hidden="true" />
          <span lang={ar ? 'en' : 'ar'}>{ar ? 'English' : 'العربية'}</span>
        </button>
      </header>

      <section className="vayron-demo-hero" aria-labelledby="demo-title">
        <div className="vayron-hero-ring" aria-hidden="true" />
        <span className="vayron-demo-eyebrow" dir="ltr"><Sparkles size={15} aria-hidden="true" /> THE VAYRON EXPERIENCE</span>
        <h1 id="demo-title">
          {ar ? <>جرّب منظومة <span dir="ltr">VAYRON STORE</span></> : <>Experience <span>VAYRON STORE</span></>}
        </h1>
        <p className="vayron-demo-subtitle">
          {ar ? 'منصة متكاملة لإدارة وتشغيل المتاجر الإلكترونية' : 'A complete platform to manage and power online stores'}
        </p>
        <p className="vayron-demo-intro">
          {ar ? 'علامتان، تجربتان مميزتان. اكتشف المتاجر وتصفّح مجموعاتها دون الحاجة إلى تسجيل الدخول.' : 'Two brands. Two distinct experiences. Discover their storefronts and explore their collections without signing in.'}
        </p>
        <a className="vayron-gold-button" href="#demo-stores">
          {ar ? 'اكتشف المتاجر' : 'Explore the stores'}<Arrow size={18} aria-hidden="true" />
        </a>
        <div className="vayron-guest-note"><ShieldCheck size={16} aria-hidden="true" />{ar ? 'تصفّح كضيف · دون تسجيل دخول' : 'Browse as a guest · No sign-in required'}</div>
      </section>

      <section className="vayron-demo-stores" id="demo-stores" aria-labelledby="demo-stores-title" tabIndex={-1}>
        <div className="vayron-demo-section-heading">
          <div>
            <span className="vayron-demo-eyebrow">{ar ? 'متاجر مختارة' : 'CURATED STOREFRONTS'}</span>
            <h2 id="demo-stores-title">{ar ? 'اختر تجربتك' : 'Choose your experience'}</h2>
          </div>
          <p>{ar ? 'هويات مختلفة. منظومة واحدة.' : 'Distinct identities. One connected platform.'}</p>
        </div>
        <div className="vayron-demo-grid">
          {stores.map((store, index) => (
            <article className={`vayron-store-card vayron-store-${store.slug}`} key={store.slug} aria-labelledby={`demo-${store.slug}`}>
              <div className="vayron-store-visual" aria-hidden="true">
                <span className="vayron-store-edition" dir="ltr">0{index + 1} / THE COLLECTION</span>
                <span className="vayron-store-monogram">{store.monogram}</span>
                <span className="vayron-store-visual-name" dir="ltr">{store.name}</span>
                <span className="vayron-store-visual-category" dir="ltr">{store.category.en}</span>
              </div>
              <div className="vayron-store-content">
                <span className="vayron-store-category">{store.category[locale]}</span>
                <h3 id={`demo-${store.slug}`} dir="ltr">{store.name}</h3>
                <p>{store.description[locale]}</p>
                <Link className="vayron-store-link" to={`/store/${store.slug}`} aria-label={`${ar ? 'تصفح المتجر' : 'Browse store'} — ${store.name}`}>
                  <span>{ar ? 'تصفح المتجر' : 'Browse store'}</span><Arrow size={18} aria-hidden="true" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="vayron-demo-note" aria-label={ar ? 'عن التجربة' : 'About the experience'}>
        <ShoppingBag size={22} aria-hidden="true" />
        <div>
          <h2>{ar ? 'من الواجهة إلى التشغيل، تجربة مترابطة.' : 'From storefront to operations, seamlessly connected.'}</h2>
          <p>{ar ? 'اكتشف واجهات المتاجر وكتالوجاتها الفعلية. هذه بيئة عرض تجريبية وليست مخصصة للشراء الحقيقي.' : 'Explore the stores and their real catalogs. This is a demonstration environment, not intended for real purchases.'}</p>
        </div>
      </section>
      <footer className="vayron-demo-footer">
        <span dir="ltr">© {new Date().getFullYear()} VAYRON STORE</span>
        <span>{ar ? 'صُممت لتمنح تجارتك حضوراً مختلفاً.' : 'Built to give your business a distinctive presence.'}</span>
        <a href="#demo-title">{ar ? 'العودة للأعلى' : 'Back to top'}</a>
      </footer>
      {introState !== 'hidden' && <div className={`vayron-intro vayron-intro-${introState}`} role="status" aria-live="polite">
        <div className="vayron-intro-lockup" dir="ltr">
          <span>VAYRON</span>
          <small>TECHNOLOGY • SECURITY • INTELLIGENCE</small>
        </div>
        <button type="button" onClick={() => setIntroState('hidden')}>
          {ar ? 'تخطّ المقدمة' : 'Skip intro'}
        </button>
      </div>}
    </main>
  );
}
