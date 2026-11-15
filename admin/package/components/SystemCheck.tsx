'use client';
import { RefreshCw } from 'lucide-react';
import { useFetch } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { Async } from '@/components/ui/kit';

type Diag = {
  database: { name: string; host: string; port: string; timeZone: string; migrationsApplied: number };
  api: { publicUrl: string; seenAs: string; environment: string };
  catalogue: { version: string; productsTotal: number; productsPublished: number };
  counts: { orders: number; customers: number };
  serverTime: string;
};

/**
 * Shows which database and API this panel is really using, with no passwords. Open the customer app's
 * Account → About: if its "Server" and "Catalogue version" match what is shown here, both apps are on the same backend.
 */
export function SystemCheck() {
  const { data, error, loading, reload } = useFetch<Diag>('admin/diagnostics');
  return (
    <section className="card mt-5 max-w-3xl space-y-3 p-4 sm:p-5" aria-label="System check">
      <div className="flex items-center justify-between gap-2">
        <h2 className="section-title">System check</h2>
        <button className="btn-outline btn-sm" onClick={reload}><RefreshCw className="h-4 w-4" />Refresh</button>
      </div>
      <Async loading={loading} error={error} hasData={!!data} onRetry={reload}>
        {data && (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Row k="Database" v={`${data.database.name} on ${data.database.host}:${data.database.port}`} />
            <Row k="Migrations applied" v={String(data.database.migrationsApplied)} />
            <Row k="Database time zone" v={data.database.timeZone} warn={!/^(UTC|Etc\/UTC)$/i.test(data.database.timeZone)} />
            <Row k="API environment" v={data.api.environment} />
            <Row k="API address (as the panel reaches it)" v={data.api.seenAs} />
            <Row k="Public address used for image links" v={data.api.publicUrl} />
            <Row k="Products (published / total)" v={`${data.catalogue.productsPublished} / ${data.catalogue.productsTotal}`} />
            <Row k="Catalogue version" v={data.catalogue.version} />
            <Row k="Customers / orders" v={`${data.counts.customers} / ${data.counts.orders}`} />
            <Row k="Server time" v={dateTime(data.serverTime)} />
          </dl>
        )}
      </Async>
      <p className="text-xs text-ink-muted">To confirm the customer app uses the same backend, open its Account → About: the server address and catalogue version must match these values. Changing a product here changes the catalogue version.</p>
    </section>
  );
}

function Row({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-ink-faint">{k}</dt>
      <dd className={`break-words font-medium ${warn ? 'text-bad' : 'text-ink'}`}>{v}{warn ? ' — should be UTC' : ''}</dd>
    </div>
  );
}
