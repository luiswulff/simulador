import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, FileSpreadsheet } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Spinner, EmptyState } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import { exportRows } from '../../features/export/exporters';
import type { ImportJob } from '../../types/db';

export function ImportsPage() {
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['import-jobs'],
    queryFn: async () =>
      (await supabase.from('import_jobs').select('*').order('created_at', { ascending: false })).data as ImportJob[],
  });

  return (
    <div>
      <div className="mb-5 flex items-center gap-2">
        <h1 className="mr-auto text-xl font-extrabold text-ink-900">Importações</h1>
        {jobs.length > 0 && (
          <button
            className="btn-secondary"
            onClick={() =>
              exportRows(
                jobs.map((j) => ({
                  arquivo: j.file_name,
                  tipo: j.file_type,
                  status: j.status,
                  registros: j.total_rows,
                  criados: j.created_count,
                  atualizados: j.updated_count,
                  mesclados: j.merged_count,
                  ignorados: j.skipped_count,
                  erros: j.error_count,
                  data: j.created_at,
                })),
                'csv',
                'historico-importacoes',
              )
            }
          >
            Exportar histórico
          </button>
        )}
        <Link to="/importacoes/nova" className="btn-primary">
          <Plus className="h-4 w-4" /> Nova importação
        </Link>
      </div>

      {isLoading ? (
        <Spinner />
      ) : jobs.length === 0 ? (
        <EmptyState
          title="Nenhuma importação realizada"
          hint="Importe suas bases em CSV, XLSX, JSON ou VCF. O assistente reconhece exports do Google Contacts, Outlook e do celular, detecta duplicidades e nunca apaga o que já existe."
          action={
            <Link to="/importacoes/nova" className="btn-primary">
              <Plus className="h-4 w-4" /> Importar agora
            </Link>
          }
        />
      ) : (
        <div className="card overflow-x-auto !p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400">
                <th className="px-4 py-3">Arquivo</th>
                <th className="px-2 py-3">Data</th>
                <th className="px-2 py-3">Status</th>
                <th className="px-2 py-3 text-right">Registros</th>
                <th className="px-2 py-3 text-right">Criados</th>
                <th className="px-2 py-3 text-right">Atualizados</th>
                <th className="px-2 py-3 text-right">Mesclados</th>
                <th className="px-2 py-3 text-right">Ignorados</th>
                <th className="px-4 py-3 text-right">Erros</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-b border-ink-50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-ink-400" />
                      <span className="font-medium">{j.file_name}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-ink-500">{fmtDateTime(j.created_at)}</td>
                  <td className="px-2 py-2.5">
                    <span className={`chip ${j.status === 'concluida' ? 'bg-accent-100 text-accent-800' : 'bg-ink-100 text-ink-600'}`}>
                      {j.status}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right">{j.total_rows.toLocaleString('pt-BR')}</td>
                  <td className="px-2 py-2.5 text-right font-semibold text-accent-800">{j.created_count}</td>
                  <td className="px-2 py-2.5 text-right">{j.updated_count}</td>
                  <td className="px-2 py-2.5 text-right">{j.merged_count}</td>
                  <td className="px-2 py-2.5 text-right">{j.skipped_count}</td>
                  <td className={`px-4 py-2.5 text-right ${j.error_count ? 'font-semibold text-red-700' : ''}`}>{j.error_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
