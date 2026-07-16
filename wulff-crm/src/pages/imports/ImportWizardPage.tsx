import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, Download } from 'lucide-react';
import Papa from 'papaparse';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { logAudit } from '../../lib/audit';
import { Field, Spinner } from '../../components/ui';
import { parseFile, type ParsedFile } from '../../features/import/parsers';
import { analyzeColumns, CRM_FIELDS, type ColumnInfo, type CrmFieldKey } from '../../features/import/mapping';
import {
  buildCandidate, loadExistingIndex, findDuplicate, commitImport,
  type Candidate, type PreparedRow, type DupAction, type CommitResult,
} from '../../features/import/process';

const STEPS = ['Upload', 'Leitura', 'Mapeamento', 'Normalização', 'Duplicidades', 'Pré-visualização', 'Importação', 'Relatório'];

export function ImportWizardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [mapping, setMapping] = useState<Record<string, CrmFieldKey>>({});
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [prepared, setPrepared] = useState<PreparedRow[]>([]);
  const [defaultDupAction, setDefaultDupAction] = useState<DupAction>('complementar');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<CommitResult | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dropRef = useRef<HTMLLabelElement>(null);

  // ---------- Etapa 1-2: upload e leitura ----------
  const handleFile = async (f: File) => {
    setError(null);
    setBusy(true);
    try {
      const p = await parseFile(f);
      setFile(f);
      setParsed(p);
      const cols = analyzeColumns(p.headers, p.rows);
      setColumns(cols);
      const map: Record<string, CrmFieldKey> = {};
      for (const c of cols) map[c.header] = c.suggested;
      setMapping(map);
      setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao ler o arquivo.');
    } finally {
      setBusy(false);
    }
  };

  // ---------- Etapa 4: normalização ----------
  const normalize = () => {
    if (!parsed) return;
    const cands = parsed.rows.map((row, i) => buildCandidate(row, i + 2, mapping));
    setCandidates(cands);
    setStep(3);
  };

  // ---------- Etapa 5: duplicidades ----------
  const detectDuplicates = async () => {
    setBusy(true);
    setError(null);
    try {
      const idx = await loadExistingIndex();
      const seenEmails = new Map<string, number>();
      const seenPhones = new Map<string, number>();
      const rows: PreparedRow[] = [];
      for (const c of candidates) {
        if (!c.valid) continue;
        let dup = findDuplicate(c, idx, candidates.length <= 8000);
        // duplicidade dentro do próprio arquivo
        if (!dup) {
          for (const e of c.emails) {
            const prior = seenEmails.get(e);
            if (prior !== undefined) {
              dup = { contactId: '', contactName: `linha ${prior} deste arquivo`, reason: `e-mail repetido no arquivo (${e})` };
              break;
            }
          }
          if (!dup) {
            for (const p of c.phones) {
              const prior = seenPhones.get(p);
              if (prior !== undefined) {
                dup = { contactId: '', contactName: `linha ${prior} deste arquivo`, reason: 'telefone repetido no arquivo' };
                break;
              }
            }
          }
        }
        c.emails.forEach((e) => seenEmails.set(e, c.rowNumber));
        c.phones.forEach((p) => seenPhones.set(p, c.rowNumber));
        rows.push({
          candidate: c,
          duplicate: dup,
          action: dup ? (dup.contactId ? defaultDupAction : 'ignorar') : 'criar',
        });
      }
      setPrepared(rows);
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao detectar duplicidades.');
    } finally {
      setBusy(false);
    }
  };

  // ---------- Etapa 7: confirmação e gravação ----------
  const confirm = async () => {
    if (!user || !file || !parsed) return;
    setBusy(true);
    setError(null);
    setStep(6);
    try {
      const { data: job, error: jobErr } = await supabase
        .from('import_jobs')
        .insert({
          user_id: user.id,
          file_name: file.name,
          file_type: parsed.fileType,
          status: 'pendente',
          total_rows: parsed.rows.length,
          column_mapping: mapping,
        })
        .select('id')
        .single();
      if (jobErr) throw new Error(jobErr.message);
      setJobId(job.id);

      const res = await commitImport(prepared, user.id, job.id, setProgress);
      setResult(res);

      await supabase
        .from('import_jobs')
        .update({
          status: 'concluida',
          created_count: res.created,
          updated_count: res.updated,
          merged_count: res.merged,
          skipped_count: res.skipped,
          error_count: res.errors.length,
          report: {
            invalidas: candidates.filter((c) => !c.valid).length,
            avisos: candidates.reduce((acc, c) => acc + c.warnings.length, 0),
          },
          finished_at: new Date().toISOString(),
        })
        .eq('id', job.id);
      await logAudit('import', job.id, 'importar', { arquivo: file.name, criados: res.created });
      setStep(7);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na importação.');
      setStep(5);
    } finally {
      setBusy(false);
    }
  };

  const exportErrors = () => {
    if (!result) return;
    const csv = Papa.unparse(result.errors.map((e) => ({ linha: e.rowNumber, erro: e.message })));
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'erros-importacao.csv';
    a.click();
  };

  // estatísticas para as telas
  const stats = useMemo(() => {
    const valid = candidates.filter((c) => c.valid);
    return {
      total: candidates.length,
      valid: valid.length,
      invalid: candidates.length - valid.length,
      withEmail: valid.filter((c) => c.emails.length).length,
      withPhone: valid.filter((c) => c.phones.length).length,
      warnings: candidates.reduce((a, c) => a + c.warnings.length, 0),
    };
  }, [candidates]);

  const dupStats = useMemo(() => {
    const dups = prepared.filter((r) => r.duplicate);
    return {
      news: prepared.filter((r) => !r.duplicate).length,
      dups: dups.length,
      byAction: {
        ignorar: prepared.filter((r) => r.duplicate && r.action === 'ignorar').length,
        complementar: prepared.filter((r) => r.duplicate && r.action === 'complementar').length,
        substituir: prepared.filter((r) => r.duplicate && r.action === 'substituir').length,
        criar: prepared.filter((r) => r.duplicate && r.action === 'criar').length,
        mesclar: prepared.filter((r) => r.duplicate && r.action === 'mesclar').length,
      },
    };
  }, [prepared]);

  const mappedColumns = columns.filter((c) => c.filledCount > 0);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-xl font-extrabold text-ink-900">Importar contatos</h1>
      <p className="mb-5 text-sm text-ink-500">
        CSV, XLSX, JSON ou VCF · Google Contacts, Outlook, celular e planilhas · importação incremental (nunca apaga o que já existe)
      </p>

      {/* Stepper */}
      <ol className="mb-6 flex flex-wrap gap-1.5 text-xs">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={`rounded-full px-3 py-1 font-semibold ${
              i === step ? 'bg-accent-800 text-white' : i < step ? 'bg-accent-100 text-accent-800' : 'bg-ink-100 text-ink-400'
            }`}
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {error && (
        <p className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {/* Etapa 1 — Upload */}
      {step === 0 && (
        <label
          ref={dropRef}
          onDragOver={(e) => {
            e.preventDefault();
            dropRef.current?.classList.add('border-accent-500');
          }}
          onDragLeave={() => dropRef.current?.classList.remove('border-accent-500')}
          onDrop={(e) => {
            e.preventDefault();
            dropRef.current?.classList.remove('border-accent-500');
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-ink-200 bg-white p-14 text-center transition-colors hover:border-accent-400"
        >
          <UploadCloud className="h-10 w-10 text-ink-300" />
          <p className="font-semibold text-ink-800">Arraste o arquivo aqui ou clique para selecionar</p>
          <p className="text-sm text-ink-400">.csv · .xlsx · .json · .vcf — até dezenas de milhares de contatos</p>
          {busy && <Spinner label="Lendo arquivo…" />}
          <input
            type="file"
            accept=".csv,.txt,.xlsx,.xls,.json,.vcf,.vcard"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>
      )}

      {/* Etapa 2 — Leitura */}
      {step === 1 && parsed && (
        <div className="card">
          <div className="mb-4 flex items-center gap-3">
            <FileSpreadsheet className="h-8 w-8 text-accent-700" />
            <div>
              <p className="font-bold text-ink-900">{file?.name}</p>
              <p className="text-sm text-ink-500">
                Formato {parsed.fileType.toUpperCase()} · {parsed.rows.length.toLocaleString('pt-BR')} registros ·{' '}
                {parsed.headers.length} colunas ({mappedColumns.length} com dados)
              </p>
            </div>
          </div>
          {parsed.encodingNote && <p className="mb-3 text-sm text-amber-700">⚠ {parsed.encodingNote}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-xs uppercase text-ink-400">
                  <th className="py-2 pr-3">Coluna</th>
                  <th className="py-2 pr-3">Preenchidos</th>
                  <th className="py-2">Exemplos</th>
                </tr>
              </thead>
              <tbody>
                {mappedColumns.slice(0, 40).map((c) => (
                  <tr key={c.header} className="border-b border-ink-50">
                    <td className="py-1.5 pr-3 font-medium">{c.header}</td>
                    <td className="py-1.5 pr-3 text-ink-500">
                      {c.filledCount} ({Math.round((100 * c.filledCount) / parsed.rows.length)}%)
                    </td>
                    <td className="max-w-md truncate py-1.5 text-ink-400">{c.samples.join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {mappedColumns.length > 40 && (
              <p className="mt-2 text-xs text-ink-400">… e mais {mappedColumns.length - 40} colunas com dados.</p>
            )}
          </div>
          <div className="mt-4 flex justify-between">
            <button className="btn-secondary" onClick={() => setStep(0)}>Trocar arquivo</button>
            <button className="btn-primary" onClick={() => setStep(2)}>Continuar para o mapeamento</button>
          </div>
        </div>
      )}

      {/* Etapa 3 — Mapeamento */}
      {step === 2 && parsed && (
        <div className="card">
          <p className="mb-4 text-sm text-ink-600">
            Confira como cada coluna do arquivo será gravada no CRM. As sugestões foram detectadas
            automaticamente (cabeçalhos em português e inglês, incluindo exports do Google Contacts).
            Colunas vazias foram ocultadas.
          </p>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {mappedColumns.map((c) => (
              <div key={c.header} className="grid grid-cols-2 items-center gap-3 rounded-lg border border-ink-100 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-800">{c.header}</p>
                  <p className="truncate text-xs text-ink-400">{c.samples.join(' · ') || 'sem exemplos'}</p>
                </div>
                <select
                  className="input"
                  value={mapping[c.header] ?? ''}
                  onChange={(e) => setMapping((m) => ({ ...m, [c.header]: e.target.value as CrmFieldKey }))}
                >
                  {CRM_FIELDS.map((f) => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-between">
            <button className="btn-secondary" onClick={() => setStep(1)}>Voltar</button>
            <button className="btn-primary" onClick={normalize}>Aplicar normalização</button>
          </div>
        </div>
      )}

      {/* Etapa 4 — Normalização */}
      {step === 3 && (
        <div className="card">
          <h3 className="mb-3 font-bold text-ink-900">Normalização aplicada</h3>
          <ul className="mb-4 grid gap-2 text-sm text-ink-600 sm:grid-cols-2">
            <li>✔ Nomes padronizados (Título) e espaços corrigidos</li>
            <li>✔ Telefones normalizados para +55 (E.164)</li>
            <li>✔ E-mails validados e convertidos para minúsculas</li>
            <li>✔ Datas convertidas (incluindo aniversários sem ano "--MM-DD")</li>
            <li>✔ Estados (UF) e países padronizados</li>
            <li>✔ Nomes que eram e-mails tratados e recuperados</li>
            <li>✔ Grupos do Google convertidos em tags (exceto myContacts)</li>
            <li>✔ Redes sociais identificadas pelo tipo (LinkedIn/Instagram/Facebook)</li>
          </ul>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Registros lidos" value={stats.total} />
            <Stat label="Válidos" value={stats.valid} />
            <Stat label="Incompletos/ignorados" value={stats.invalid} tone={stats.invalid ? 'amber' : undefined} />
            <Stat label="Avisos de normalização" value={stats.warnings} tone={stats.warnings ? 'amber' : undefined} />
            <Stat label="Com e-mail" value={stats.withEmail} />
            <Stat label="Com telefone" value={stats.withPhone} />
          </div>
          <div className="mt-4 flex justify-between">
            <button className="btn-secondary" onClick={() => setStep(2)}>Voltar</button>
            <button className="btn-primary" onClick={detectDuplicates} disabled={busy}>
              {busy ? 'Comparando com a base…' : 'Detectar duplicidades'}
            </button>
          </div>
        </div>
      )}

      {/* Etapa 5 — Duplicidades */}
      {step === 4 && (
        <div className="card">
          <h3 className="mb-1 font-bold text-ink-900">Duplicidades detectadas</h3>
          <p className="mb-4 text-sm text-ink-500">
            Comparação por e-mail, telefone normalizado, WhatsApp, LinkedIn, nome + empresa e similaridade
            de nome (fuzzy) — contra a base atual e dentro do próprio arquivo.
          </p>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <Stat label="Registros novos" value={dupStats.news} />
            <Stat label="Possíveis duplicados" value={dupStats.dups} tone={dupStats.dups ? 'amber' : undefined} />
          </div>
          {dupStats.dups > 0 && (
            <>
              <Field label="Ação padrão para duplicados">
                <select
                  className="input"
                  value={defaultDupAction}
                  onChange={(e) => {
                    const action = e.target.value as DupAction;
                    setDefaultDupAction(action);
                    setPrepared((rows) =>
                      rows.map((r) => (r.duplicate && r.duplicate.contactId ? { ...r, action } : r)),
                    );
                  }}
                >
                  <option value="complementar">Complementar dados (preencher só campos vazios)</option>
                  <option value="mesclar">Mesclar (complementar + agregar e-mails/telefones)</option>
                  <option value="ignorar">Ignorar (não importar duplicados)</option>
                  <option value="substituir">Substituir dados existentes</option>
                  <option value="criar">Criar mesmo assim (novo registro)</option>
                </select>
              </Field>
              <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-ink-100">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-ink-50 text-left text-xs uppercase text-ink-400">
                    <tr>
                      <th className="px-3 py-2">Registro do arquivo</th>
                      <th className="px-3 py-2">Já existe como</th>
                      <th className="px-3 py-2">Motivo</th>
                      <th className="px-3 py-2">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prepared.filter((r) => r.duplicate).slice(0, 300).map((r, i) => (
                      <tr key={i} className="border-t border-ink-50">
                        <td className="px-3 py-1.5">{r.candidate.name ?? r.candidate.emails[0] ?? '—'}</td>
                        <td className="px-3 py-1.5 text-ink-500">{r.duplicate!.contactName}</td>
                        <td className="px-3 py-1.5 text-xs text-ink-400">{r.duplicate!.reason}</td>
                        <td className="px-3 py-1.5">
                          <select
                            className="input !py-1 text-xs"
                            value={r.action}
                            onChange={(e) =>
                              setPrepared((rows) =>
                                rows.map((x) => (x === r ? { ...x, action: e.target.value as DupAction } : x)),
                              )
                            }
                          >
                            <option value="ignorar">Ignorar</option>
                            <option value="criar">Criar novo</option>
                            <option value="substituir">Substituir</option>
                            <option value="complementar">Complementar</option>
                            <option value="mesclar">Mesclar</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {dupStats.dups > 300 && (
                  <p className="px-3 py-2 text-xs text-ink-400">
                    Exibindo os primeiros 300 — a ação padrão vale para todos os demais.
                  </p>
                )}
              </div>
            </>
          )}
          <div className="mt-4 flex justify-between">
            <button className="btn-secondary" onClick={() => setStep(3)}>Voltar</button>
            <button className="btn-primary" onClick={() => setStep(5)}>Continuar</button>
          </div>
        </div>
      )}

      {/* Etapa 6 — Pré-visualização / Etapa 7 — Confirmação */}
      {step === 5 && (
        <div className="card">
          <h3 className="mb-4 font-bold text-ink-900">Resumo antes de importar</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Total no arquivo" value={stats.total} />
            <Stat label="Serão criados" value={prepared.filter((r) => r.action === 'criar').length} tone="accent" />
            <Stat label="Complementados/mesclados" value={dupStats.byAction.complementar + dupStats.byAction.mesclar} />
            <Stat label="Substituídos" value={dupStats.byAction.substituir} />
            <Stat label="Ignorados" value={dupStats.byAction.ignorar + stats.invalid} tone="amber" />
            <Stat label="Linhas inválidas" value={stats.invalid} tone={stats.invalid ? 'amber' : undefined} />
          </div>
          <p className="mt-4 text-sm text-ink-500">
            A importação é incremental e só começa após a sua confirmação. Todas as linhas ficam registradas
            no histórico, com o dado original preservado para auditoria.
          </p>
          <div className="mt-4 flex justify-between">
            <button className="btn-secondary" onClick={() => setStep(4)}>Voltar</button>
            <button className="btn-primary" onClick={confirm} disabled={busy}>
              Confirmar e importar {prepared.filter((r) => r.action !== 'ignorar').length.toLocaleString('pt-BR')} registros
            </button>
          </div>
        </div>
      )}

      {step === 6 && (
        <div className="card text-center">
          <Spinner label={`Importando… ${progress.done.toLocaleString('pt-BR')} de ${progress.total.toLocaleString('pt-BR')}`} />
          <div className="mx-auto h-2 w-full max-w-md overflow-hidden rounded-full bg-ink-100">
            <div
              className="h-full bg-accent-600 transition-all"
              style={{ width: progress.total ? `${(100 * progress.done) / progress.total}%` : '0%' }}
            />
          </div>
          <p className="mt-3 text-xs text-ink-400">Não feche esta aba durante a importação.</p>
        </div>
      )}

      {/* Etapa 8 — Relatório */}
      {step === 7 && result && (
        <div className="card">
          <div className="mb-4 flex items-center gap-2 text-accent-800">
            <CheckCircle2 className="h-6 w-6" />
            <h3 className="text-lg font-bold">Importação concluída</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Criados" value={result.created} tone="accent" />
            <Stat label="Atualizados" value={result.updated} />
            <Stat label="Mesclados" value={result.merged} />
            <Stat label="Ignorados" value={result.skipped} />
            <Stat label="Erros" value={result.errors.length} tone={result.errors.length ? 'red' : undefined} />
          </div>
          {result.errors.length > 0 && (
            <button className="btn-secondary mt-4" onClick={exportErrors}>
              <Download className="h-4 w-4" /> Exportar erros em CSV
            </button>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => navigate('/contatos')}>Ver contatos</button>
            <Link to="/importacoes" className="btn-secondary">Histórico de importações</Link>
            <button
              className="btn-secondary"
              onClick={() => {
                setStep(0);
                setFile(null);
                setParsed(null);
                setResult(null);
                setPrepared([]);
                setCandidates([]);
              }}
            >
              Importar outro arquivo
            </button>
          </div>
          {jobId && <p className="mt-3 text-xs text-ink-400">Job: {jobId}</p>}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'accent' | 'amber' | 'red' }) {
  const toneClass =
    tone === 'accent' ? 'text-accent-800' : tone === 'amber' ? 'text-amber-700' : tone === 'red' ? 'text-red-700' : 'text-ink-900';
  return (
    <div className="rounded-xl border border-ink-100 bg-ink-50 px-4 py-3">
      <p className={`text-2xl font-extrabold ${toneClass}`}>{value.toLocaleString('pt-BR')}</p>
      <p className="text-xs text-ink-500">{label}</p>
    </div>
  );
}
