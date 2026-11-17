import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { openSharedQuote, fetchSharedQuotePdfUrl } from '../../api/shareApi';
import PortalLayout from './PortalLayout';
import PortalMessage from './PortalMessage';
import { quoteView } from './shareQuoteView';
import '../Styling/PortalShare.css';

export default function ShareQuotePage() {
  const { token } = useParams();
  const [state, setState] = useState({ status: 'loading' });
  const [pdfError, setPdfError] = useState('');

  useEffect(() => {
    let isCurrent = true;
    openSharedQuote(token).then((result) => {
      if (!isCurrent) return;
      if (!result.ok) {
        setState({ status: result.error.kind === 'not_found' ? 'not_found' : 'error' });
      } else {
        setState(result.data ? { status: 'ready', view: quoteView(result.data) } : { status: 'not_found' });
      }
    });
    return () => { isCurrent = false; };
  }, [token]);

  const viewPdf = async () => {
    setPdfError('');
    // Open the tab inside the click so popup blockers allow it.
    const tab = window.open('', '_blank');
    const result = await fetchSharedQuotePdfUrl(token);
    if (!result.ok) {
      if (tab) tab.close();
      setPdfError('We could not open the PDF. Please try again.');
      return;
    }
    if (tab) tab.location.href = result.url;
  };

  const { status, view } = state;
  return (
    <PortalLayout title={view ? `Quote ${view.reference}` : 'Quote'} signedIn={false}>
      {status === 'loading' && <PortalMessage kind="loading" />}
      {status === 'error' && <PortalMessage kind="error" />}
      {status === 'not_found' && (
        <PortalMessage kind="not_found" heading="We couldn't find that quote" message="The link may have expired or been turned off." />
      )}
      {status === 'ready' && (
        <div className="portal-share-quote">
          <dl className="portal-share-facts">
            <dt>Company</dt><dd>{view.company}</dd>
            <dt>Quote date</dt><dd>{view.date}</dd>
            <dt>Lead time</dt><dd>{view.leadTime}</dd>
          </dl>
          <div className="portal-share-table-wrap">
            <table className="portal-share-table">
              <thead>
                <tr><th>Part</th><th>Rev</th><th>Description</th><th>Qty</th><th>Price</th><th>Ext</th></tr>
              </thead>
              <tbody>
                {view.items.map((item, index) => (
                  <tr key={index}>
                    <td data-label="Part">{item.number}</td>
                    <td data-label="Rev">{item.rev}</td>
                    <td data-label="Description">{item.description}{item.details && <small>{item.details}</small>}</td>
                    <td data-label="Qty">{item.quantity}</td>
                    <td data-label="Price">{item.price}</td>
                    <td data-label="Ext">{item.ext}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="portal-share-totals">
            <dt>Subtotal</dt><dd>{view.subtotal}</dd>
            <dt>Tax</dt><dd>{view.tax}</dd>
            <dt>Total</dt><dd>{view.total}</dd>
          </dl>
          <button type="button" className="portal-button" onClick={viewPdf}>View PDF</button>
          {pdfError && <p className="portal-error" role="alert">{pdfError}</p>}
        </div>
      )}
      <Link className="portal-button portal-button--quiet" to="/client-login">Log in</Link>
    </PortalLayout>
  );
}
