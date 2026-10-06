import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download, Printer, X } from 'lucide-react';

export function tableEntryUrl(storeId: string, qrCode: string) {
  return `${window.location.origin}/storefront?store=${encodeURIComponent(storeId)}&table=${encodeURIComponent(qrCode)}`;
}

export function useQrDataUrl(text: string, width = 320) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(text, { width, margin: 2, errorCorrectionLevel: 'M' })
      .then((value) => { if (!cancelled) setUrl(value); })
      .catch(() => { if (!cancelled) setUrl(''); });
    return () => { cancelled = true; };
  }, [text, width]);
  return url;
}

export function QrThumb({ link, label, onOpen }: { link: string; label: string; onOpen: () => void }) {
  const url = useQrDataUrl(link, 160);
  return (
    <button type="button" className="qr-thumb" onClick={onOpen} aria-label={label} title={label}>
      {url ? <img src={url} alt={label} width={56} height={56} /> : <span className="qr-thumb-empty" />}
    </button>
  );
}

type QrDialogProps = {
  link: string;
  title: string;
  locale: 'ar' | 'en';
  onClose: () => void;
};

export function QrDialog({ link, title, locale, onClose }: QrDialogProps) {
  const ar = locale === 'ar';
  const url = useQrDataUrl(link, 640);

  function printQr() {
    const popup = window.open('', '_blank', 'width=520,height=640');
    if (!popup || !url) return;
    const safeTitle = title.replace(/[<>&"]/g, '');
    popup.document.write(`<!doctype html><html dir="${ar ? 'rtl' : 'ltr'}"><head><title>${safeTitle}</title><style>body{font-family:sans-serif;text-align:center;padding:32px}img{width:360px;height:360px}h1{font-size:28px}</style></head><body><h1>${safeTitle}</h1><img src="${url}" alt="QR" /><p>${ar ? 'امسح الرمز لبدء الطلب' : 'Scan to start ordering'}</p></body></html>`);
    popup.document.close();
    popup.focus();
    popup.onload = () => popup.print();
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card qr-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-heading">
          <div><span className="eyebrow">{ar ? 'رمز QR للطاولة' : 'Table QR code'}</span><h2>{title}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label={ar ? 'إغلاق' : 'Close'}><X size={19} /></button>
        </div>
        <div className="qr-preview">{url ? <img src={url} alt={`QR ${title}`} data-testid="qr-image" /> : <span className="qr-thumb-empty" />}</div>
        <p className="qr-link" dir="ltr">{link}</p>
        <div className="modal-actions">
          <a className={`button button-outline${url ? '' : ' is-disabled'}`} href={url || undefined} download={`${title.replace(/[^\w\u0600-\u06FF-]+/g, '-')}.png`}><Download size={16} />{ar ? 'تنزيل PNG' : 'Download PNG'}</a>
          <button type="button" className="button button-primary" onClick={printQr} disabled={!url}><Printer size={16} />{ar ? 'طباعة' : 'Print'}</button>
        </div>
      </section>
    </div>
  );
}
