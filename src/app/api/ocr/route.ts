import { NextRequest, NextResponse } from 'next/server';
import Ocr from '@gutenye/ocr-node';
import { parseReceiptText } from '@/lib/receiptParser';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

let ocrInstance: Awaited<ReturnType<typeof Ocr.create>> | null = null;

async function getOCR() {
  if (!ocrInstance) {
    ocrInstance = await Ocr.create();
  }
  return ocrInstance;
}

export async function POST(request: NextRequest) {
  let tempFilePath: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get('image') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No image file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload an image.' },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      );
    }

    // Save file temporarily
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const tempDir = join(tmpdir(), 'splitbill-ocr');
    await mkdir(tempDir, { recursive: true });

    const ext = file.name.split('.').pop() || 'jpg';
    tempFilePath = join(tempDir, `${randomUUID()}.${ext}`);
    await writeFile(tempFilePath, buffer);

    // Process with OCR
    const ocr = await getOCR();
    const lines = await ocr.detect(tempFilePath);

    // Define Line type based on OCR result
    interface Line {
      text: string;
      mean: number;
      box?: number[][];
    }

    // Cast to typed array for processing
    const typedLines = lines as Line[];

    // Combine detected text
    const rawText = typedLines
      .sort((a: Line, b: Line) => {
        // Sort by vertical position (top to bottom)
        const aTop = a.box ? Math.min(...a.box.map((p: number[]) => p[1])) : 0;
        const bTop = b.box ? Math.min(...b.box.map((p: number[]) => p[1])) : 0;
        return aTop - bTop;
      })
      .map(line => line.text)
      .join('\n');

    // Calculate average confidence
    const avgConfidence = typedLines.length > 0
      ? typedLines.reduce((sum: number, line: Line) => sum + line.mean, 0) / typedLines.length
      : 0;

    // Parse the receipt text
    const result = parseReceiptText(rawText);

    // Adjust confidence based on OCR confidence
    result.confidence = Math.min(result.confidence, avgConfidence);

    return NextResponse.json(result);
  } catch (error) {
    console.error('OCR processing error:', error);
    return NextResponse.json(
      { error: 'Failed to process image' },
      { status: 500 }
    );
  } finally {
    // Clean up temp file
    if (tempFilePath) {
      try {
        await unlink(tempFilePath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
