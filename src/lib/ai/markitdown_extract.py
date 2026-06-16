#!/usr/bin/env python3
# Reads PDF bytes from stdin, writes extracted markdown to stdout.
# Called as a subprocess by agents.js runPdfParser.
import sys
import io
import warnings

warnings.filterwarnings('ignore')

from markitdown import MarkItDown

def main():
    pdf_bytes = sys.stdin.buffer.read()
    if not pdf_bytes:
        sys.exit(1)
    md = MarkItDown()
    result = md.convert_stream(io.BytesIO(pdf_bytes), file_extension='.pdf')
    sys.stdout.write(result.markdown or '')

if __name__ == '__main__':
    main()
