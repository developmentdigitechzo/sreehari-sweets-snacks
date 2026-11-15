'use client';
import { Send } from 'lucide-react';
import { useState } from 'react';
import { api, qs, useFetch } from '@/lib/api';
import { dateTime, num } from '@/lib/format';
import { Async, Badge, ConfirmDialog, PageHeader, Pagination, Select, StatCard } from '@/components/ui/kit';
import { DataTable, type Col } from '@/components/ui/DataTable';
import { toast } from '@/components/ui/Toast';

type B = { id: string; channel: string; title: string; message: string; status: string; scheduledAt: string | null; sentAt: string | null; targeted: number; delivered: number; failed: number; error: string | null; segmentName: string | null; audienceType: string; opened: number | null; createdAt: string };
type List = { items: B[]; total: number; page: number; pages: number; pageSize: number; stats: { sent: number; failed: number; deliveryRate: number | null }; channels: Record<string, boolean> };
const CH: Record<string, string> = { push: 'Push', in_app: 'In-app', sms: 'SMS', whatsapp: 'WhatsApp' };
const ST: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'gray' | 'info' }> = { DRAFT: { label: 'Draft', tone: 'gray' }, SCHEDULED: { label: 'Scheduled', tone: 'info' }, SENDING: { label: 'Sending', tone: 'warn' }, SENT: { label: 'Sent', tone: 'ok' }, PARTIAL: { label: 'Partly sent', tone: 'warn' }, FAILED: { label: 'Failed', tone: 'bad' }, BLOCKED: { label: 'Not sent', tone: 'bad' } };

export default function History() {
  const [channel, setChannel] = useState('all');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useFetch<List>(`admin/broadcasts${qs({ channel, page, pageSize: 10 })}`);
  const [del, setDel] = useState<B | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (b: B) => { setBusy(true); try { const r = await api<{ delivered: number; failed: number }>(`admin/broadcasts/${b.id}/send`, { method: 'POST' }); toast(`Sent: ${r.delivered} delivered${r.failed ? `, ${r.failed} failed` : ''}`); reload(); } catch (e) { toast((e as Error).message, 'bad'); reload(); } setBusy(false); };
  const remove = async () => { if (!del) return; setBusy(true); try { await api(`admin/broadcasts/${del.id}`, { method: 'DELETE' }); toast('Deleted'); setDel(null); reload(); } catch (e) { toast((e as Error).message, 'bad'); } setBusy(false); };

  const cols: Col<B>[] = [
    { key: 't', title: true, header: 'Message', cell: (b) => <div><p className="font-semibold">{b.title}</p><p className="line-clamp-1 max-w-xs text-xs text-ink-muted">{b.message}</p></div> },
    { key: 'c', header: 'Channel', cell: (b) => <Badge tone="violet">{CH[b.channel]}</Badge> },
    { key: 'a', header: 'Audience', hideOnMobile: true, cell: (b) => (b.audienceType === 'all' ? 'All customers' : b.segmentName ?? 'Segment') },
    { key: 's', header: 'Status', cell: (b) => <Badge tone={ST[b.status]?.tone} dot>{ST[b.status]?.label ?? b.status}</Badge> },
    { key: 'r', header: 'Result', cell: (b) => (b.status === 'DRAFT' || b.status === 'SCHEDULED' ? <span className="text-xs text-ink-muted">{b.scheduledAt ? `At ${dateTime(b.scheduledAt)}` : 'Not sent'}</span> : <span className="text-sm">{num(b.delivered)} delivered{b.failed ? `, ${b.failed} failed` : ''}{b.opened !== null ? ` · ${b.opened} opened` : ''}{b.error && <span className="block text-xs text-bad">{b.error}</span>}</span>) },
    { key: 'd', header: 'When', hideOnMobile: true, cell: (b) => dateTime(b.sentAt ?? b.createdAt) },
    { key: 'x', header: 'Actions', cell: (b) => (
      <div className="flex gap-1">
        {(b.status === 'DRAFT' || b.status === 'SCHEDULED') && <button className="btn-primary btn-sm" disabled={busy || !data?.channels[b.channel]} title={data?.channels[b.channel] ? '' : 'This channel is not connected'} onClick={() => send(b)}><Send className="h-4 w-4" />Send now</button>}
        {['DRAFT', 'SCHEDULED', 'BLOCKED'].includes(b.status) && <button className="btn-ghost btn-sm text-bad" onClick={() => setDel(b)}>Delete</button>}
      </div>) },
  ];
  return (
    <>
      <PageHeader title="Notification History" subtitle="Everything you have sent, scheduled or saved. Results are counted from real send attempts." crumbs={['Notifications', 'History']} />
      <div className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 min-[480px]:grid-cols-3">
        <StatCard icon={<Send />} label="Messages delivered" value={data ? num(data.stats.sent) : '—'} />
        <StatCard icon={<Send />} label="Failed" value={data ? num(data.stats.failed) : '—'} tone="bad" />
        <StatCard icon={<Send />} label="Delivery rate" value={data?.stats.deliveryRate != null ? `${data.stats.deliveryRate}%` : '—'} tone="ok" />
      </div>
      <p className="mb-3 text-xs text-ink-muted">Open and click counts are only available for in-app messages (counted when the customer opens them). Push, SMS and WhatsApp delivery means the provider accepted the message.</p>
      <div className="card overflow-hidden">
        <div className="border-b border-line p-4"><Select label="Channel" value={channel} onChange={(v) => { setChannel(v); setPage(1); }} options={[{ value: 'all', label: 'All channels' }, ...Object.entries(CH).map(([v, l]) => ({ value: v, label: l }))]} /></div>
        <Async loading={loading} error={error} hasData={!!data} onRetry={reload} empty={data?.total === 0} emptyTitle="No messages yet" emptyHint="Create one from Create Notification.">
          {data && <><DataTable rows={data.items} cols={cols} rowKey={(b) => b.id} caption="Notification history" /><Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.pageSize} onPage={setPage} noun="messages" /></>}
        </Async>
      </div>
      <ConfirmDialog open={!!del} danger busy={busy} onClose={() => setDel(null)} onConfirm={remove} title="Delete this message?" confirmLabel="Delete" message={<p><b>{del?.title}</b> has not been sent and will be removed.</p>} />
    </>
  );
}
