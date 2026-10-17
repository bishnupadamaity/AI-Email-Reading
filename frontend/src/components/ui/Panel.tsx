import { type ReactNode } from 'react';

export function Panel({
  children,
  className,
  flush,
}: {
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <div
      className={['panel', flush ? 'panel--flush' : '', className ?? ''].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}

export function PanelHead({
  title,
  meta,
  actions,
  id,
}: {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  id?: string;
}) {
  return (
    <div className="panel__head">
      <div className="inline inline--sm">
        <h3 className="panel__title" id={id}>
          {title}
        </h3>
        {meta ? <span className="panel__meta">{meta}</span> : null}
      </div>
      {actions ? <div className="inline inline--sm">{actions}</div> : null}
    </div>
  );
}

export function PanelBody({
  children,
  flush,
  className,
}: {
  children: ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <div
      className={['panel__body', flush ? 'panel__body--flush' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}

export function PanelFoot({ children }: { children: ReactNode }) {
  return <div className="panel__foot">{children}</div>;
}

export function Section({
  title,
  description,
  actions,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="section">
      {title || actions ? (
        <div className="section__head">
          <div>
            {title ? <h2 className="section__title">{title}</h2> : null}
            {description ? <p className="section__description">{description}</p> : null}
          </div>
          {actions ? <div className="section__actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
