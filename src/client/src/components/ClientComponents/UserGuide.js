import React, { useEffect, useState } from 'react';
import PortalLayout from './PortalLayout';
import { intro, guides } from './guide/guideContent';

const DESKTOP_QUERY = '(min-width: 768px)';
// Counts a guide as "in view" once it reaches the upper part of the screen.
const IN_VIEW_MARGIN = '0px 0px -70% 0px';

const isDesktop = () => typeof window.matchMedia === 'function' && window.matchMedia(DESKTOP_QUERY).matches;

const UserGuide = () => {
  const [currentId, setCurrentId] = useState(null);
  const [isContentsOpen, setIsContentsOpen] = useState(isDesktop);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.find((entry) => entry.isIntersecting);
      if (visible) setCurrentId(visible.target.id);
    }, { rootMargin: IN_VIEW_MARGIN });
    guides.forEach((guide) => {
      const section = document.getElementById(guide.id);
      if (section) observer.observe(section);
    });
    return () => observer.disconnect();
  }, []);

  const goTo = (event, id) => {
    event.preventDefault();
    document.getElementById(id).scrollIntoView({ behavior: 'smooth' });
    setCurrentId(id);
  };

  return (
    <PortalLayout title="User Guide" wide>
      <div className="portal-guide">
        <details
          className="portal-guide-contents"
          open={isContentsOpen}
          onToggle={(event) => setIsContentsOpen(event.currentTarget.open)}
        >
          <summary>Contents</summary>
          <nav aria-label="Guide contents">
            {guides.map((guide) => (
              <a
                key={guide.id}
                href={`#${guide.id}`}
                aria-current={guide.id === currentId ? 'true' : undefined}
                onClick={(event) => goTo(event, guide.id)}
              >
                {guide.title}
              </a>
            ))}
          </nav>
        </details>
        <div className="portal-guide-body">
          <p className="portal-guide-lede">{intro.lede}</p>
          <p>{intro.body}</p>
          {guides.map((guide) => (
            <section key={guide.id} id={guide.id} className="portal-guide-section">
              <h2>{guide.title}</h2>
              <ol>{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol>
              {guide.tips.map((tip) => <p key={tip} className="portal-guide-tip">{tip}</p>)}
              {guide.shots.map((shot) => (
                <figure key={shot.src}>
                  <img src={shot.src} alt={shot.alt} />
                  <figcaption>{shot.caption}</figcaption>
                </figure>
              ))}
            </section>
          ))}
          <p>{intro.contact}</p>
        </div>
      </div>
    </PortalLayout>
  );
};

export default UserGuide;
