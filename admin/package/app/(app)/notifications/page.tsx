'use client';
import { Bell, Calendar, Clock, MessageCircle, MessageSquare, Send, Smartphone, UploadCloud } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, useFetch } from '@/lib/api';
import { num } from '@/lib/format';
import { Badge, Field, PageHeader } from '@/components/ui/kit';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { toast } from '@/components/ui/Toast';

type Ch = 'push' | 'in_app' | 'sms' | 'whatsapp';
type Seg = { items: { id: string; name: string; customers: number }[]; totalCustomers: number };
type Aud = { eligible: number; excludedNoOptIn: number; withoutDevice: number; channelConnected: boolean };
type Tpl = { items: { id: string; name: string; channel: Ch; title: string; body: string }[] };
const CHANNELS: { id: Ch; label: string; icon: typeof Bell; note: string }[] = [
  { id: 'push', label: 'Push Notification', icon: Smartphone, note: 'Reaches customers who opted in and whose app registered a device.' },
  { id: 'in_app', label: 'In-App Message', icon: Bell, note: 'Shown in the customer app inbox. Reaches every active customer.' },
  { id: 'sms', label: 'SMS', icon: MessageSquare, note: 'Opted-in customers only. In India, promotional SMS needs DLT registration with your provider.' },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, note: 'Opted-in customers only. WhatsApp requires an approved message template for business-started chats.' },
];

export default function CreateNotification() {
  const segs = useFetch<Seg>('admin/segments');
  const tpls = useFetch<Tpl>('admin/message-templates');
  const [ch, setCh] = useState<Ch>('push');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [image, setImage] = useState<string[]>([]);
  const [audience, setAudience] = useState<'all' | 'segment'>('all');
  const [segmentId, setSegmentId] = useState('');
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [at, setAt] = useState('');
  const [aud, setAud] = useState<Aud | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (audience === 'segment' && !segmentId) { setAud(null); return; }
    let live = true;
    api<Aud>('admin/broadcasts/audience', { method: 'POST', body: { channel: ch, audienceType: audience, segmentId: audience === 'segment' ? segmentId : null } }).then((a) => live && setAud(a)).catch(() => live && setAud(null));
    return () => { live = false; };
  }, [ch, audience, segmentId]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (title.trim().length < 2) e.title = 'Enter a title';
    if (message.trim().length < 2) e.message = 'Enter a message';
    if (audience === 'segment' && !segmentId) e.segment = 'Choose a segment';
    if (when === 'later' && (!at || new Date(at).getTime() < Date.now() + 60_000)) e.at = 'Pick a time in the future';
    setErrs(e);
    return !Object.keys(e).length;
  };
  const submit = async (mode: 'draft' | 'now' | 'later') => {
    if (busy) return;
    if (mode !== 'draft' && !validate()) return;
    if (mode === 'draft' && title.trim().length < 2) { setErrs({ title: 'Enter a title' }); return; }
    setBusy(true);
    try {
      const r = await api<{ id: string; delivered?: number; failed?: number; status: string }>('admin/broadcasts', { method: 'POST', body: { channel: ch, title: title.trim(), message: message.trim() || title.trim(), imageUrl: image[0] ?? null, audienceType: audience, segmentId: audience === 'segment' ? segmentId : null, when: mode, scheduledAt: mode === 'later' ? new Date(at).toISOString() : undefined } });
      toast(mode === 'draft' ? 'Saved as a draft in Notification History' : mode === 'later' ? 'Scheduled. It sends automatically at that time.' : `Sent: ${r.delivered ?? 0} delivered${r.failed ? `, ${r.failed} failed` : ''}`);
      if (mode !== 'draft') { setTitle(''); setMessage(''); setImage([]); }
    } catch (e) { toast((e as Error).message, 'bad'); }
    setBusy(false);
  };
  const saveTemplate = async () => {
    if (busy) return;
    if (title.trim().length < 2 || message.trim().length < 2) { setErrs({ title: title.trim().length < 2 ? 'Enter a title' : '', message: message.trim().length < 2 ? 'Enter a message' : '' }); return; }
    setBusy(true);
    try { await api('admin/message-templates', { method: 'POST', body: { name: title.trim().slice(0, 60), channel: ch, title: title.trim(), body: message.trim() } }); toast('Saved as a template'); tpls.reload(); } catch (e) { toast((e as Error).message, 'bad'); }
    setBusy(false);
  };

  const meta = CHANNELS.find((c) => c.id === ch)!;
  const connected = aud?.channelConnected ?? true;

  return (
    <>
      <PageHeader title="Notification & Customer Segmentation" subtitle="Create targeted notifications, choose who receives them and run personalised campaigns." crumbs={['Notifications', 'Create Notification']} />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.3fr_1fr]">
        <section className="card p-4 sm:p-5" aria-label="Create notification">
          <h2 className="mb-3 flex items-center gap-2 section-title"><Send className="h-5 w-5" aria-hidden />Create Notification</h2>
          <div className="-mx-1 mb-4 overflow-x-auto px-1"><div className="inline-flex min-w-max gap-1 rounded-xl bg-cream-deep p-1" role="tablist">
            {CHANNELS.map((c) => <button key={c.id} role="tab" aria-selected={ch === c.id} onClick={() => setCh(c.id)} className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${ch === c.id ? 'bg-burgundy text-white' : 'text-ink-muted'}`}><c.icon className="h-4 w-4" aria-hidden />{c.label}</button>)}
          </div></div>
          <p className="mb-3 text-xs text-ink-muted">{meta.note}</p>
          {!connected && <p role="alert" className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-sm font-medium text-warn">This channel is not connected yet, so it cannot be sent. You can still save drafts. See docs/ADMIN_PANEL.md for how to connect a provider.</p>}
          <div className="space-y-4">
            <Field label="Notification title" required error={errs.title}>
              <div className="relative"><input className="input pr-16" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-muted">{title.length} / 60</span></div>
            </Field>
            <Field label="Notification message" required error={errs.message}>
              <textarea className="input min-h-[96px] py-2" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={160} /><p className="mt-1 text-right text-xs text-ink-muted">{message.length} / 160</p>
            </Field>
            {(ch === 'push' || ch === 'whatsapp') && <Field label="Notification image (optional)"><ImageUpload value={image} onChange={setImage} label="Upload image" /></Field>}
            <fieldset><legend className="label">Target audience <span className="text-bad">*</span></legend>
              <label className="flex min-h-[40px] items-center gap-2 text-sm"><input type="radio" checked={audience === 'all'} onChange={() => setAudience('all')} />All customers {segs.data ? `(${num(segs.data.totalCustomers)})` : ''}</label>
              <label className="flex min-h-[40px] flex-wrap items-center gap-2 text-sm"><input type="radio" checked={audience === 'segment'} onChange={() => setAudience('segment')} />Select segment
                <select className="input w-auto min-w-[200px]" value={segmentId} onChange={(e) => { setSegmentId(e.target.value); setAudience('segment'); }} aria-label="Segment"><option value="">Choose…</option>{segs.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.customers})</option>)}</select></label>
              {errs.segment && <p className="text-xs font-medium text-bad">{errs.segment}</p>}
              {aud && <p className="mt-1 rounded-lg bg-cream p-2 text-sm">Will reach <b>{num(aud.eligible)}</b> customer{aud.eligible === 1 ? '' : 's'}.{aud.excludedNoOptIn > 0 && ` ${num(aud.excludedNoOptIn)} skipped (no marketing opt-in).`}{aud.withoutDevice > 0 && ` ${num(aud.withoutDevice)} have no registered device.`}</p>}
            </fieldset>
            <fieldset><legend className="label">Schedule</legend>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex min-h-[40px] items-center gap-2"><input type="radio" checked={when === 'now'} onChange={() => setWhen('now')} />Send now</label>
                <label className="flex min-h-[40px] items-center gap-2"><input type="radio" checked={when === 'later'} onChange={() => setWhen('later')} />Schedule for later</label>
                {when === 'later' && <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-burgundy" aria-hidden /><input className="input w-auto" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} aria-label="Send at" /></div>}
              </div>
              {errs.at && <p className="text-xs font-medium text-bad">{errs.at}</p>}
            </fieldset>
            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
              <button className="btn-outline" onClick={saveTemplate} disabled={busy}><UploadCloud className="h-4 w-4" />Save as Template</button>
              <button className="btn-outline" onClick={() => submit('draft')} disabled={busy}>Save draft</button>
              <button className="btn-primary" onClick={() => submit(when)} disabled={busy || !connected}><Send className="h-4 w-4" />{when === 'now' ? 'Send Notification' : 'Schedule'}</button>
            </div>
          </div>
        </section>

        <div className="space-y-5">
          <section className="card p-4 sm:p-5" aria-label="Preview">
            <h2 className="mb-3 section-title">Preview</h2>
            <div className="rounded-2xl border border-line bg-cream p-3">
              <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-burgundy font-serif font-bold text-white" aria-hidden>SH</span>
                <div className="min-w-0"><p className="truncate font-semibold">{title || 'Notification title'}</p><p className="text-sm text-ink-muted">{message || 'Your message appears here.'}</p></div></div>
              {image[0] && <img src={image[0]} alt="" className="mt-3 max-h-40 w-full rounded-xl object-cover" />}
            </div>
          </section>
          <section className="card p-4 sm:p-5" aria-label="Templates">
            <h2 className="mb-2 flex items-center gap-2 section-title"><Clock className="h-4 w-4" aria-hidden />Use a template</h2>
            {tpls.data?.items.length ? <ul className="space-y-2">{tpls.data.items.slice(0, 5).map((t) => <li key={t.id}><button className="w-full rounded-xl border border-line p-3 text-left text-sm hover:bg-burgundy-soft" onClick={() => { setCh(t.channel); setTitle(t.title); setMessage(t.body); }}><b>{t.name}</b> <Badge tone="gray">{t.channel}</Badge><br /><span className="text-ink-muted">{t.body}</span></button></li>)}</ul> : <p className="text-sm text-ink-muted">No templates yet. Write a message and choose Save as Template.</p>}
          </section>
        </div>
      </div>
    </>
  );
}
