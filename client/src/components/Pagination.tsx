import { ChevronLeft, ChevronRight } from 'lucide-react';

type PaginationProps = {
  page: number;
  totalPages: number;
  total?: number;
  loading?: boolean;
  locale: 'ar' | 'en';
  onChange: (page: number) => void;
};

function pageWindow(page: number, totalPages: number): Array<number | 'gap'> {
  const wanted = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...wanted].filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b);
  const result: Array<number | 'gap'> = [];
  sorted.forEach((value, index) => {
    if (index > 0 && value - sorted[index - 1] > 1) result.push('gap');
    result.push(value);
  });
  return result;
}

export function Pagination({ page, totalPages, total, loading = false, locale, onChange }: PaginationProps) {
  const ar = locale === 'ar';
  const pages = Math.max(1, totalPages);
  return (
    <nav className="pagination" aria-label={ar ? 'التنقل بين الصفحات' : 'Pagination'} aria-busy={loading}>
      <span className="pagination-summary">
        {typeof total === 'number' && <>{ar ? `${total} سجل` : `${total} records`} · </>}
        {ar ? `الصفحة ${page} من ${pages}` : `Page ${page} of ${pages}`}
      </span>
      <div className="pagination-controls">
        <button type="button" className="button button-outline button-small pagination-step" disabled={page <= 1 || loading} onClick={() => onChange(page - 1)}>
          <ChevronLeft size={15} className="pagination-chevron" />
          <span>{ar ? 'السابق' : 'Previous'}</span>
        </button>
        <div className="pagination-pages">
          {pageWindow(page, pages).map((entry, index) => entry === 'gap'
            ? <span key={`gap-${index}`} className="pagination-gap" aria-hidden="true">…</span>
            : <button key={entry} type="button" className={`pagination-page${entry === page ? ' is-current' : ''}`} disabled={loading} aria-current={entry === page ? 'page' : undefined} onClick={() => onChange(entry)}>{entry}</button>)}
        </div>
        <button type="button" className="button button-outline button-small pagination-step" disabled={page >= pages || loading} onClick={() => onChange(page + 1)}>
          <span>{ar ? 'التالي' : 'Next'}</span>
          <ChevronRight size={15} className="pagination-chevron" />
        </button>
      </div>
    </nav>
  );
}
