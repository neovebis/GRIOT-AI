import type { ReactNode } from "react";

export function Screen({
  title,
  subtitle,
  icon,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-lg px-5 pb-36">
      <header className="safe-top flex flex-col gap-1 pb-5 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            {subtitle ? (
              <p
                suppressHydrationWarning
                className="text-[12.5px] font-medium text-muted-foreground tracking-wide"
              >
                {subtitle}
              </p>
            ) : null}
            <div className="flex items-center gap-2.5 mt-0.5">
              {icon ? <div className="shrink-0">{icon}</div> : null}
              <h1
                suppressHydrationWarning
                className="truncate text-[28px] leading-tight font-semibold tracking-tight text-foreground"
              >
                {title}
              </h1>
            </div>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </header>
      <div className="rise space-y-4">{children}</div>
    </div>
  );
}

export function Panel({
  children,
  className = "",
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`panel w-full px-5 py-4 text-left transition-transform duration-200 ${
        onClick ? "active:scale-[0.985]" : ""
      } ${className}`}
    >
      {children}
    </Tag>
  );
}

export function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Panel>
      <p className="text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1.5 text-[26px] leading-none font-semibold tracking-tight">{value}</p>
      {note ? <p className="mt-2 text-[13px] text-muted-foreground">{note}</p> : null}
    </Panel>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="panel px-5 py-10 text-center text-[14px] text-muted-foreground">{text}</div>
  );
}
