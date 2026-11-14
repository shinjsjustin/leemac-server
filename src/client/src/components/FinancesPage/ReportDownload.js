import React from 'react';
import { downloadReport } from '../../api/financeApi';

const FORMATS = [{ format: 'pdf', text: 'PDF' }, { format: 'xlsx', text: 'Excel' }];

export default function ReportDownload({ report, filter, label, caption }) {
  const download = async (format) => {
    const result = await downloadReport(report, format, filter, label);
    if (!result.ok) window.alert(result.error.message);
  };
  return (
    <span className="fl-download">
      {caption && <span className="fl-download-caption">{caption}</span>}
      {FORMATS.map(({ format, text }) => (
        <button key={format} type="button" onClick={() => download(format)}>{text}</button>
      ))}
    </span>
  );
}
