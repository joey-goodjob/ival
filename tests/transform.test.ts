import { describe, expect, it } from 'vitest';
import {
  TransformError,
  createWorkbookFromQuotation,
  rowsFromWorkbook,
  serializeWorkbook,
  transformMatrixRows,
  workbookFromBuffer,
} from '@/lib/transform';
import type { TransformResult } from '@/lib/transform';

describe('transformMatrixRows', () => {
  it('expands color columns into multiple rows and computes totals', () => {
    const rows = [
      {
        Model: 'IP 12/12 pro',
        '18#Black': 50,
        '5#Lilac Blue': '20',
        'Qty': 230,
        Price: 0.8,
        'Amount, usd': 184,
      },
      {
        Model: 'IP 12 promax',
        '18#Black': 0,
        Red: 30,
        Qty: 150,
        Price: '1.2',
        'Amount, usd': 120,
        Amount: 480,
      },
    ];

    const result = transformMatrixRows(rows);

    expect(result.rows).toHaveLength(3);
    const lilac = result.rows.find((row) => row.color === '5#Lilac Blue');
    expect(lilac).toMatchObject({
      modelNo: 'IP 12/12 pro',
      qty: 20,
      priceUSD: 0.8,
      amountUSD: 16,
    });

    const red = result.rows.find((row) => row.color === 'Red');
    expect(red).toMatchObject({
      modelNo: 'IP 12 promax',
      qty: 30,
      priceUSD: 1.2,
      amountUSD: 36,
    });

    expect(result.totals).toEqual({
      totalQty: 100,
      totalAmount: 92,
    });
  });

  it('falls back to default price when missing and records warning', () => {
    const rows = [
      {
        Model: 'Model X',
        Black: 10,
      },
    ];

    const result = transformMatrixRows(rows, { defaultPrice: 0.9 });

    expect(result.rows[0].priceUSD).toBe(0.9);
    expect(result.warnings).toContain('Price column missing or invalid; fallback to default price.');
  });

  it('throws INVALID_TEMPLATE when model column is missing', () => {
    const rows = [
      {
        '18#Black': 10,
      },
    ];

    expect(() => transformMatrixRows(rows)).toThrowError(TransformError);
    try {
      transformMatrixRows(rows);
    } catch (error) {
      expect(error).toBeInstanceOf(TransformError);
      expect((error as TransformError).code).toBe('INVALID_TEMPLATE');
      expect((error as Error).message).toContain('Missing required column "Model"');
    }
  });

  it('throws EMPTY_RESULT when no valid rows produced', () => {
    const rows = [
      {
        Model: 'Model X',
        Black: 0,
      },
    ];

    expect(() => transformMatrixRows(rows)).toThrowError(TransformError);
    try {
      transformMatrixRows(rows);
    } catch (error) {
      expect(error).toBeInstanceOf(TransformError);
      expect((error as TransformError).code).toBe('EMPTY_RESULT');
      expect((error as Error).message).toContain('No valid rows produced');
    }
  });
});

describe('workbook helpers', () => {
  const sampleResult: TransformResult = {
    rows: [
      {
        modelNo: 'Model A',
        categoryName: 'Model A',
        color: 'Black',
        qty: 10,
        priceUSD: 0.8,
        amountUSD: 8,
      },
    ],
    totals: {
      totalQty: 10,
      totalAmount: 8,
    },
    warnings: [],
  };

  it('creates and serializes workbook without errors', () => {
    const workbook = createWorkbookFromQuotation(sampleResult);
    const arrayBuffer = serializeWorkbook(workbook);
    expect(arrayBuffer).toBeInstanceOf(ArrayBuffer);

    const parsed = workbookFromBuffer(arrayBuffer);
    const rows = rowsFromWorkbook(parsed);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('throws PARSE_ERROR when reading invalid buffer', () => {
    const invalid = Buffer.from('not-an-excel-file');
    expect(() => {
      const workbook = workbookFromBuffer(invalid);
      rowsFromWorkbook(workbook);
    }).toThrowError(TransformError);
  });
});
