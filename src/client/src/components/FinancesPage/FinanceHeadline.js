import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../api/apiFetch';
import './financeHeadline.css';

const QUARTERS = [1, 2, 3, 4];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const money = (n) => `$${Math.round(Number(n)).toLocaleString('en-US')}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const monthName = (key) => MONTH_NAMES[Number(key.slice(5, 7)) - 1];

export default function FinanceHeadline({ periods, period, onSelect, refreshKey }) {
  const [summary, setSummary] = useState(null);
  const periodId = period?.id;

  useEffect(() => {
    if (periodId == null) return undefined;
    let isCurrent = true;
    (async () => {
      const res = await apiFetch(`/internal/finances/periods/${periodId}/quarter`);
      if (!res.ok || !isCurrent) return;
      setSummary(await res.json());
    })();
    return () => { isCurrent = false; };
  }, [periodId, refreshKey]);

  const years = [...new Set(periods.map((p) => p.year))].sort((a, b) => a - b);
  const inYear = periods.filter((p) => p.year === period?.year);
  const latestOfYear = (year) => periods.filter((p) => p.year === year).sort((a, b) => b.quarter - a.quarter)[0];

  const months = summary?.months || [];
  const peak = Math.max(0, ...months.flatMap((m) => [m.invoiced, m.expenses]));
  const bar = (value) => `${peak ? (value / peak) * 100 : 0}%`;

  return (
    <section className="fh">
      <div className="fh-head">
        <h1>Finances<span>재무</span></h1>
        <div className="fh-seg">
          {years.map((y) => (
            <button key={y} className={y === period?.year ? 'on' : ''} onClick={() => onSelect(latestOfYear(y))}>{y}</button>
          ))}
        </div>
        <div className="fh-seg">
          {QUARTERS.map((q) => {
            const target = inYear.find((p) => p.quarter === q);
            return (
              <button key={q} disabled={!target} className={q === period?.quarter ? 'on' : ''} onClick={() => onSelect(target)}>{`Q${q}`}</button>
            );
          })}
        </div>
      </div>
      {summary && (
        <div className="fh-band">
          <div className="fh-tile b"><small>Invoiced</small><b>{money(summary.invoiced.total)}</b><span>{plural(summary.invoiced.count, 'invoice')}</span></div>
          <div className="fh-tile g"><small>Paid</small><b>{money(summary.paid.total)}</b><span>{plural(summary.paid.count, 'invoice')}</span></div>
          <div className="fh-tile a"><small>Waiting</small><b>{money(summary.waiting.total)}</b><span>{`${plural(summary.waiting.count, 'invoice')} · ${summary.waiting.over_30} over 30 days`}</span></div>
          <div className="fh-tile r"><small>Expenses</small><b>{money(summary.expenses.total)}</b><span>{plural(summary.expenses.count, 'expense')}</span></div>
          <div className="fh-tile"><small>Profit (paid − expenses)</small><b>{money(summary.profit)}</b><span>{`${money(summary.paid.total)} − ${money(summary.expenses.total)}`}</span></div>
          <div className="fh-tile">
            <small>By month · <span className="inv-key">invoiced</span> · <span className="exp-key">expenses</span></small>
            <div className="fh-months">
              {months.map((m) => (
                <div key={m.month}>
                  <i className="inv" style={{ height: bar(m.invoiced) }} />
                  <i className="exp" style={{ height: bar(m.expenses) }} />
                  <em>{monthName(m.month)}</em>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
