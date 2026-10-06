import { useRef, useState } from 'react';
import { ImagePlus, LoaderCircle, Trash2, Upload } from 'lucide-react';
import { apiRequest, SOCKET_URL } from '../lib/api';

export function assetUrl(url?: unknown) {
  if (typeof url !== 'string' || !url) return '';
  return url.startsWith('/uploads/') ? `${SOCKET_URL}${url}` : url;
}

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_BYTES = 2 * 1024 * 1024;

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

type Props = {
  storeId: string;
  productId: string;
  currentUrl?: string;
  locale: 'ar' | 'en';
  onChanged: () => void;
};

export function ProductImageUploader({ storeId, productId, currentUrl, locale, onChanged }: Props) {
  const ar = locale === 'ar';
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(currentUrl || '');

  function choose(next: File | null) {
    setError('');
    if (preview) URL.revokeObjectURL(preview);
    if (!next) { setFile(null); setPreview(''); return; }
    if (!ALLOWED.includes(next.type)) {
      setError(ar ? 'نوع الملف غير مدعوم. استخدم PNG أو JPG أو WEBP أو GIF.' : 'Unsupported file type. Use PNG, JPG, WEBP or GIF.');
      setFile(null); setPreview(''); return;
    }
    if (next.size > MAX_BYTES) {
      setError(ar ? 'حجم الصورة يجب ألا يتجاوز 2 ميغابايت.' : 'Image must be 2 MB or smaller.');
      setFile(null); setPreview(''); return;
    }
    setFile(next);
    setPreview(URL.createObjectURL(next));
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const uploaded = await apiRequest<{ url: string }>(`/stores/${encodeURIComponent(storeId)}/uploads`, {
        method: 'POST',
        body: JSON.stringify({ kind: 'product', dataBase64: await toBase64(file) }),
      });
      await apiRequest(`/products/${encodeURIComponent(productId)}/image`, { method: 'PUT', body: JSON.stringify({ url: uploaded.url }) });
      setSaved(uploaded.url);
      choose(null);
      if (input.current) input.current.value = '';
      onChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : (ar ? 'تعذّر رفع الصورة.' : 'Upload failed.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError('');
    try {
      await apiRequest(`/products/${encodeURIComponent(productId)}/image`, { method: 'DELETE' });
      setSaved('');
      onChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : (ar ? 'تعذّر حذف الصورة.' : 'Could not remove the image.'));
    } finally {
      setBusy(false);
    }
  }

  const shown = preview || assetUrl(saved);
  return (
    <div className="image-uploader">
      <div className="image-uploader-preview">{shown ? <img src={shown} alt={ar ? 'صورة المنتج' : 'Product'} /> : <ImagePlus size={30} />}</div>
      <div className="image-uploader-actions">
        <input ref={input} type="file" accept={ALLOWED.join(',')} hidden onChange={(event) => choose(event.target.files?.[0] || null)} />
        <button type="button" className="button button-outline button-small" onClick={() => input.current?.click()} disabled={busy}><ImagePlus size={15} />{ar ? 'اختيار صورة' : 'Choose image'}</button>
        <button type="button" className="button button-primary button-small" onClick={() => void upload()} disabled={!file || busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <Upload size={15} />}{ar ? 'رفع وربط' : 'Upload & attach'}</button>
        {saved && <button type="button" className="button button-quiet button-small" onClick={() => void remove()} disabled={busy}><Trash2 size={15} />{ar ? 'إزالة الصورة' : 'Remove image'}</button>}
        <small>{ar ? 'PNG أو JPG أو WEBP أو GIF — حتى 2 ميغابايت' : 'PNG, JPG, WEBP or GIF — up to 2 MB'}</small>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
      </div>
    </div>
  );
}
