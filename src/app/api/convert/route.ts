import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  TransformError,
  createWorkbookFromQuotation,
  rowsFromWorkbook,
  serializeWorkbook,
  transformMatrixRows,
  workbookFromBuffer,
} from '@/lib/transform';

const DEFAULT_PRICE = 0.8;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_TEMPLATE',
            message: 'Missing uploaded file under field "file".',
          },
        },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const workbook = workbookFromBuffer(buffer);
    const rows = rowsFromWorkbook(workbook);
    const transformResult = transformMatrixRows(rows, { defaultPrice: DEFAULT_PRICE });
    const outWorkbook = createWorkbookFromQuotation(transformResult);
    const excelArrayBuffer = serializeWorkbook(outWorkbook);
    const excelBuffer = Buffer.from(excelArrayBuffer);

    return NextResponse.json({
      rows: transformResult.rows,
      totals: transformResult.totals,
      warnings: transformResult.warnings,
      metadata: {
        sourceName: file.name,
        defaultPrice: DEFAULT_PRICE,
        rowCount: transformResult.rows.length,
      },
      excelBase64: excelBuffer.toString('base64'),
    });
  } catch (error) {
    if (error instanceof TransformError) {
      const status =
        error.code === 'INVALID_TEMPLATE' ? 400 : error.code === 'EMPTY_RESULT' ? 422 : 500;
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: 'PARSE_ERROR',
          message: 'Unexpected server error occurred while processing file.',
        },
      },
      { status: 500 },
    );
  }
}
