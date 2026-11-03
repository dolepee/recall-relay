import React from 'react';
import {Button as BaseButton} from '@base-ui/react/button';
import {STAGES} from './guided-state.mjs';

// Shared token/component layer for the guided product surfaces. Values come
// from ui/system.css and DESIGN.md; nothing here is page-specific.

export const RelayMark = ({size = 34}) => (
  <svg width={size} height={size} viewBox="0 0 38 38" role="img" aria-hidden="true" focusable="false">
    <rect x="2.5" y="4.5" width="14" height="19" fill="none" stroke="currentColor" strokeWidth="1.9" />
    <path d="M6.5 10.5h6M6.5 14.5h6M6.5 18.5h4" stroke="currentColor" strokeWidth="1.1" />
    <rect x="21.5" y="14.5" width="14" height="19" fill="none" stroke="currentColor" strokeWidth="1.9" />
    <path d="M25.5 20.5h6M25.5 24.5h6M25.5 28.5h4" stroke="currentColor" strokeWidth="1.1" />
    <path d="M16.5 9.5h4.5v13.5h1.5" fill="none" stroke="#315CF5" strokeWidth="2" />
    <path d="M19.2 20.4 22.5 23l3.3-2.6" fill="none" stroke="#315CF5" strokeWidth="2" />
  </svg>
);

export function Button({variant = 'primary', block = false, className = '', children, ...props}) {
  const classes = ['rr-btn', variant !== 'primary' ? `rr-btn--${variant}` : '', block ? 'rr-btn--block' : '', className].filter(Boolean).join(' ');
  return <BaseButton className={classes} {...props}>{children}</BaseButton>;
}

export function Card({quiet = false, className = '', children, ...props}) {
  return <section className={['rr-card', quiet ? 'rr-card--quiet' : '', className].filter(Boolean).join(' ')} {...props}>{children}</section>;
}

export function Badge({tone = 'neutral', children}) {
  return <span className={['rr-badge', tone !== 'neutral' ? `rr-badge--${tone}` : ''].filter(Boolean).join(' ')}>{children}</span>;
}

export function Callout({tone = 'info', title, children, actions}) {
  return (
    <div className={['rr-callout', `rr-callout--${tone}`].join(' ')}>
      {title && <h3>{title}</h3>}
      <div className="rr-stack" style={{gap: 6}}>{children}</div>
      {actions && <div className="rr-actions">{actions}</div>}
    </div>
  );
}

export function Field({label, hint, children, htmlFor}) {
  return (
    <label className="rr-field" htmlFor={htmlFor}>
      <span>{label}</span>
      {hint && <small>{hint}</small>}
      {children}
    </label>
  );
}

export function ErrorText({error}) {
  return error ? <p role="alert" className="rr-error">{error}</p> : null;
}

export function StageTrack({current}) {
  return (
    <ol className="rr-stages" aria-label="Claim stages">
      {STAGES.map(s => {
        const done = s.id < current;
        return (
          <li key={s.id} className="rr-stage" aria-current={s.id === current ? 'step' : undefined} data-done={done ? 'true' : 'false'}>
            <span className="rr-stage__n">{done ? 'Done' : `Stage ${s.id} of 3`}</span>
            <span className="rr-stage__label">{s.label}</span>
            <span className="rr-stage__detail">{s.detail}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function AppShell({children, strip, current = '/practice'}) {
  const nav = [['Practice claim', '/practice'], ['How it works', '/#workflow'], ['Sandbox workspace', '/desk']];
  return (
    <>
      <a className="rr-skip" href="#main">Skip to main content</a>
      <header className="rr-header">
        <div className="rr-header__inner">
          <a className="rr-lockup" href="/" aria-label="Recall Relay, home">
            <RelayMark />
            <span>
              <span className="rr-lockup__name">Recall<i>Relay</i></span>
              <span className="rr-lockup__sub">Recall resolution</span>
            </span>
          </a>
          <nav className="rr-nav" aria-label="Product navigation">
            {nav.map(([label, href]) => (
              <a key={href} href={href} aria-current={href === current ? 'page' : undefined}>{label}</a>
            ))}
          </nav>
        </div>
        {strip && <div className="rr-header__inner" style={{minHeight: 0, paddingTop: 0, paddingBottom: 10}}><p className="rr-strip"><span className="rr-strip__dot" aria-hidden="true" />{strip}</p></div>}
      </header>
      <main className="rr-main" id="main">{children}</main>
    </>
  );
}
