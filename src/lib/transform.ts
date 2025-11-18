import type { WorkBook } from 'xlsx';
import { read, utils, write } from 'xlsx';

export interface QuotationRow {
  modelNo: string;
  categoryName: string;
  color: string;
  qty: number;
  priceUSD: number;
  amountUSD: number;
}

export interface TransformOptions {
  defaultPrice?: number;
}

export interface TransformResult {
  rows: QuotationRow[];
  totals: {
    totalQty: number;
    totalAmount: number;
  };
  warnings: string[];
}

export type TransformErrorCode =
  | 'INVALID_TEMPLATE'
  | 'PARSE_ERROR'
  | 'EMPTY_RESULT';

export class TransformError extends Error {
  constructor(
    message: string,
    public readonly code: TransformErrorCode,
  ) {
    super(message);
    this.name = 'TransformError';
  }
}

const DEFAULT_PRICE = 0.8;
const FIXED_COLUMNS = new Set([
  'model',
  'qty',
  'price',
  'amount,usd',
  'amount',
  'amountusd',
]);

type RawRow = Record<string, unknown>;

const normalizeHeader = (header: string): string =>
  header.replace(/\s+/g, '').toLowerCase();

const parseNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const normalized = trimmed.replace(/,/g, '');
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const getPrice = (row: RawRow, defaultPrice: number, warnings: string[]): number => {
  const price = parseNumber(row.Price ?? row.price);
  if (price === null || price <= 0) {
    warnings.push('Price column missing or invalid; fallback to default price.');
    return defaultPrice;
  }
  return price;
};

const extractHeaders = (rows: RawRow[]): string[] => {
  const headers = new Set<string>();
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (key) {
        headers.add(key);
      }
    });
  });
  return Array.from(headers);
};

const identifyColorColumns = (headers: string[]): string[] => {
  return headers.filter((header) => {
    if (!header) return false;
    const normalized = normalizeHeader(header);
    return !FIXED_COLUMNS.has(normalized);
  });
};

const ensureModelColumn = (headers: string[]): void => {
  const hasModel = headers.some((header) => normalizeHeader(header) === 'model');
  if (!hasModel) {
    throw new TransformError('Missing required column "Model".', 'INVALID_TEMPLATE');
  }
};

export const transformMatrixRows = (
  rows: RawRow[],
  options?: TransformOptions,
): TransformResult => {
  const defaultPrice = options?.defaultPrice ?? DEFAULT_PRICE;
  const headers = extractHeaders(rows);

  if (headers.length === 0) {
    throw new TransformError('Could not detect headers in worksheet.', 'PARSE_ERROR');
  }

  ensureModelColumn(headers);

  const colorColumns = identifyColorColumns(headers);

  if (colorColumns.length === 0) {
    throw new TransformError('No color columns detected in worksheet.', 'INVALID_TEMPLATE');
  }

  const resultRows: QuotationRow[] = [];
  const warnings: string[] = [];
  let totalQty = 0;
  let totalAmount = 0;

  rows.forEach((row, index) => {
    const modelValue = row.Model ?? row.model ?? '';
    const model = typeof modelValue === 'string' ? modelValue.trim() : `${modelValue ?? ''}`.trim();

    if (!model) {
      warnings.push(`Row ${index + 2}: Missing model name, skipping.`);
      return;
    }

    const price = getPrice(row, defaultPrice, warnings);

    colorColumns.forEach((colorColumn) => {
      const qtyRaw = row[colorColumn];
      const qty = parseNumber(qtyRaw);

      if (qty === null) {
        warnings.push(`Row ${index + 2}, column "${colorColumn}": Invalid quantity, ignored.`);
        return;
      }

      if (qty <= 0) {
        return;
      }

      const amount = Number.parseFloat((qty * price).toFixed(2));

      resultRows.push({
        modelNo: model,
        categoryName: model,
        color: colorColumn.trim(),
        qty,
        priceUSD: price,
        amountUSD: amount,
      });

      totalQty += qty;
      totalAmount += amount;
    });
  });

  if (resultRows.length === 0) {
    throw new TransformError('No valid rows produced from worksheet.', 'EMPTY_RESULT');
  }

  const roundedTotalAmount = Number.parseFloat(totalAmount.toFixed(2));

  return {
    rows: resultRows,
    totals: {
      totalQty,
      totalAmount: roundedTotalAmount,
    },
    warnings,
  };
};

type SupportedBuffer = ArrayBuffer | ArrayBufferView;

const toArrayBuffer = (input: SupportedBuffer): ArrayBuffer => {
  if (input instanceof ArrayBuffer) {
    return input;
  }
  if (ArrayBuffer.isView(input)) {
    const { buffer, byteOffset, byteLength } = input;
    // 确保 buffer 是 ArrayBuffer 类型，而不是 SharedArrayBuffer
    return buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer;
  }
  throw new TransformError('Unsupported buffer type received.', 'PARSE_ERROR');
};

export const workbookFromBuffer = (buffer: SupportedBuffer): WorkBook => {
  try {
    const arrayBuffer = toArrayBuffer(buffer);
    return read(arrayBuffer, { type: 'array' });
  } catch (error) {
    throw new TransformError(
      `Failed to parse workbook: ${(error as Error).message}`,
      'PARSE_ERROR',
    );
  }
};

export const rowsFromWorkbook = (workbook: WorkBook): RawRow[] => {
  const [firstSheetName] = workbook.SheetNames ?? [];
  if (!firstSheetName) {
    throw new TransformError('Workbook does not contain any sheets.', 'PARSE_ERROR');
  }
  const worksheet = workbook.Sheets[firstSheetName];
  const json = utils.sheet_to_json<RawRow>(worksheet, {
    defval: '',
    raw: false,
    blankrows: false,
  });
  if (!json.length) {
    throw new TransformError('Worksheet is empty.', 'PARSE_ERROR');
  }
  return json;
};

export const createWorkbookFromQuotation = (
  data: TransformResult,
): WorkBook => {
  const { rows, totals } = data;
  const sheetRows = [
    ...rows.map((row) => ({
      'Model No.': row.modelNo,
      'Category / Name': row.categoryName,
      color: row.color,
      QTY: row.qty,
      'PRICE (USD)': row.priceUSD,
      'Amount (USD)': row.amountUSD,
    })),
    {
      'Model No.': '',
      'Category / Name': '',
      color: 'total:',
      QTY: totals.totalQty,
      'PRICE (USD)': '',
      'Amount (USD)': totals.totalAmount,
    },
  ];
  const worksheet = utils.json_to_sheet(sheetRows);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, 'Quotation');
  return workbook;
};

export const serializeWorkbook = (workbook: WorkBook): ArrayBuffer => {
  try {
    return write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  } catch (error) {
    throw new TransformError(
      `Failed to serialize workbook: ${(error as Error).message}`,
      'PARSE_ERROR',
    );
  }
};
