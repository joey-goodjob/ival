'use client';

import { useMemo, useState } from 'react';
import type { QuotationRow } from '@/lib/transform';

type Status = 'idle' | 'uploading' | 'processing' | 'ready' | 'error';

interface Totals {
  totalQty: number;
  totalAmount: number;
}

interface ApiSuccess {
  rows: QuotationRow[];
  totals: Totals;
  warnings: string[];
  metadata?: {
    sourceName?: string;
    rowCount?: number;
  };
  excelBase64: string;
}

interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

const excelMime =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const decodeBase64ToBlob = (base64: string) => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: excelMime });
};

export default function Home() {
  const [status, setStatus] = useState<Status>('idle');
  const [rows, setRows] = useState<QuotationRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [excelBase64, setExcelBase64] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string>('');

  const numberFormatter = useMemo(
    () =>
      new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    [],
  );

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [],
  );

  const resetState = () => {
    setStatus('idle');
    setRows([]);
    setTotals(null);
    setWarnings([]);
    setError(null);
    setExcelBase64(null);
    setSourceName('');
  };

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = async (
    event,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setStatus('processing');
    setError(null);
    setWarnings([]);
    setSourceName(file.name);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/convert', {
        method: 'POST',
        body: formData,
      });

      const payload = (await response.json()) as ApiSuccess | ApiError;

      if (!response.ok) {
        const message =
          'error' in payload ? payload.error.message : '转换失败，请稍后重试。';
        setStatus('error');
        setError(message);
        return;
      }

      if ('error' in payload) {
        setStatus('error');
        setError(payload.error.message);
        return;
      }

      setRows(payload.rows);
      setTotals(payload.totals);
      setWarnings(payload.warnings ?? []);
      setExcelBase64(payload.excelBase64);
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setError(
        err instanceof Error
          ? err.message
          : '上传或解析时出现未知错误，请稍后再试。',
      );
    }
  };

  const handleDownload = () => {
    if (!excelBase64) return;
    const blob = decodeBase64ToBlob(excelBase64);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `quotation-${Date.now()}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
        <header className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            报价单助手
          </p>
          <h1 className="text-3xl font-bold text-slate-900">
            矩阵 Excel 一键生成报价明细
          </h1>
          <p className="text-sm text-slate-600">
            上传客户提供的矩阵型 Excel
            文件，系统会自动展开颜色行并生成可下载的报价明细表。
          </p>
        </header>

        <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">使用步骤</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
              <li>按照模板整理好表头后导出 Excel。</li>
              <li>点击下方按钮上传文件，等待系统转换。</li>
              <li>预览结果，若无误直接下载 Excel 或复制表格。</li>
            </ol>
          </div>

          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center">
            <p className="text-sm font-medium text-slate-700">
              选择矩阵型 Excel 文件（.xlsx / .xls）
            </p>
            <p className="mt-1 text-xs text-slate-500">
              固定列需包含 Model、价格 Price、数量合计 Qty、金额 Amount, usd
            </p>
            <label className="mt-4 inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
              上传文件
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            {sourceName && (
              <p className="mt-3 text-xs text-slate-500">
                当前文件：<span className="font-medium">{sourceName}</span>
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              状态：{' '}
              {status === 'idle' && '等待上传'}
              {status === 'processing' && '文件处理中…'}
              {status === 'ready' && '转换完成'}
              {status === 'error' && '出现错误'}
            </span>
            {warnings.length > 0 && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                {warnings.length} 条提醒
              </span>
            )}
            {status === 'ready' && (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                {rows.length} 条明细
              </span>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <p className="font-semibold">提醒：</p>
              <ul className="list-disc space-y-1 pl-4">
                {warnings.map((warn, idx) => (
                  <li key={idx}>{warn}</li>
                ))}
              </ul>
            </div>
          )}

          {status === 'ready' && rows.length > 0 && totals && (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Model No.</th>
                      <th className="px-4 py-3 font-semibold">
                        Category / Name
                      </th>
                      <th className="px-4 py-3 font-semibold">Color</th>
                      <th className="px-4 py-3 font-semibold text-right">
                        QTY
                      </th>
                      <th className="px-4 py-3 font-semibold text-right">
                        PRICE (USD)
                      </th>
                      <th className="px-4 py-3 font-semibold text-right">
                        Amount (USD)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {rows.map((row, index) => (
                      <tr key={`${row.modelNo}-${row.color}-${index}`}>
                        <td className="px-4 py-3 text-slate-700">
                          {row.modelNo}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {row.categoryName}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {row.color}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-800">
                          {numberFormatter.format(row.qty)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {currencyFormatter.format(row.priceUSD)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">
                          {currencyFormatter.format(row.amountUSD)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 text-sm font-semibold text-slate-800">
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 uppercase">Total:</td>
                      <td className="px-4 py-3 text-right">
                        {numberFormatter.format(totals.totalQty)}
                      </td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 text-right">
                        {currencyFormatter.format(totals.totalAmount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
                >
                  下载 Excel
                </button>
                <button
                  type="button"
                  onClick={resetState}
                  className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  重新上传
                </button>
                <span className="text-xs text-slate-500">
                  总计 {rows.length} 行明细，已自动追加 total 行。
                </span>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
