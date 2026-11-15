'use client';
import { Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api, useFetch } from '@/lib/api';
import { Async, Badge, ConfirmDialog, PageHeader } from '@/components/ui/kit';
import { DataTable, type Col } from '@/components/ui/DataTable';
import { toast } from '@/components/ui/Toast';

type T = { id: string; name: string; channel: string; title: string; body: string };
const CH: Record<string, string> = { push: 'Push', in_app: 'In-app', sms: 'SMS', whatsapp: 'WhatsApp' };

export default function Templates() {
  const { data, error, loading, reload } = useFetch<{ items: T[] }>('admin/message-templates');
  const [del, setDel] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const remove = async () => { if (!del) return; setBusy(true); try { await api(`admin/message-templates/${del.id}`, { method: 'DELETE' }); toast('Template deleted'); setDel(null); reload(); } catch (e) { toast((e as Error).message, 'bad'); } setBusy(false); };
  const cols: Col<T>[] = [
    { key: 'n', title: true, header: 'Template', cell: (t) => <b>{t.name}</b> },
    { key: 'c', header: 'Channel', cell: (t) => <Badge tone="violet">{CH[t.channel]}</Badge> },
    { key: 't', header: 'Message', cell: (t) => <div><p className="font-medium">{t.title}</p><p className="text-xs text-ink-muted">{t.body}</p></div> },
    { key: 'a', header: '', cell: (t) => <button className="icon-btn icon-btn-bad" aria-label={`Delete ${t.name}`} onClick={() => setDel(t)}><Trash2 className="h-4 w-4" /></button> },
  ];
  return (
    <>
      <PageHeader title="Templates" subtitle="Saved messages you can reuse. Create one from the Create Notification page." crumbs={['Notifications', 'Templates']} actions={<Link href="/notifications" className="btn-primary">Create Notification</Link>} />
      <div className="card overflow-hidden">
        <Async loading={loading} error={error} hasData={!!data} onRetry={reload} empty={data?.items.length === 0} emptyTitle="No templates yet" emptyHint="Write a message and choose Save as Template.">
          {data && <DataTable rows={data.items} cols={cols} rowKey={(t) => t.id} caption="Templates" />}
        </Async>
      </div>
      <ConfirmDialog open={!!del} danger busy={busy} onClose={() => setDel(null)} onConfirm={remove} title="Delete template?" confirmLabel="Delete" message={<p><b>{del?.name}</b> will be removed.</p>} />
    </>
  );
}
