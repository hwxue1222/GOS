import React from 'react';

export default function SectionCard(props: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={props.id} className="rounded-xl bg-white border border-black/5 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium">{props.title}</div>
          {props.subtitle ? <div className="mt-1 text-xs text-black/50">{props.subtitle}</div> : null}
        </div>
        {props.right ? <div className="shrink-0">{props.right}</div> : null}
      </div>
      {props.children ? <div className="mt-4">{props.children}</div> : null}
    </section>
  );
}

