'use client';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/components/ui/Toast';

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX = 5 * 1024 * 1024;

/** Uploads to the API (type is verified there from the file bytes) and returns the hosted URL. */
export function ImageUpload({ value, onChange, label = 'Upload image', max = 1 }: { value: string[]; onChange: (urls: string[]) => void; label?: string; max?: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const next = [...value];
    for (const f of Array.from(files).slice(0, max - value.length)) {
      if (!TYPES.includes(f.type)) { toast(`${f.name}: use a JPG, PNG or WebP image`, 'bad'); continue; }
      if (f.size > MAX) { toast(`${f.name} is larger than 5 MB`, 'bad'); continue; }
      try {
        const r = await api<{ uri: string }>('uploads', { method: 'POST', raw: f, contentType: f.type });
        next.push(r.uri);
      } catch (e) {
        toast(`${f.name}: ${(e as Error).message}`, 'bad');
      }
    }
    onChange(next);
    setBusy(false);
    if (input.current) input.current.value = '';
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {value.map((u, i) => (
          <div key={u} className="relative h-24 w-24 overflow-hidden rounded-xl border border-line">
            <img src={u} alt={`Uploaded image ${i + 1}`} className="h-full w-full object-cover" />
            <button type="button" onClick={() => onChange(value.filter((x) => x !== u))} aria-label={`Remove image ${i + 1}`} className="absolute right-1 top-1 rounded-full bg-bad p-1 text-white"><X className="h-3 w-3" /></button>
          </div>
        ))}
        {value.length < max && (
          <button type="button" onClick={() => input.current?.click()} disabled={busy} className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-gold bg-gold-soft/40 text-xs font-medium text-ink-muted hover:bg-gold-soft">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5 text-burgundy" />}
            {label}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept={TYPES.join(',')} multiple={max > 1} className="sr-only" onChange={(e) => pick(e.target.files)} aria-label={label} />
      <p className="mt-1 text-xs text-ink-muted">JPG, PNG or WebP, up to 5 MB.</p>
    </div>
  );
}
