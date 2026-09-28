import { useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { useT } from "@/lib/i18n";

/** Grupo colapsável de definições, no estilo do resto do produto. */
export function Section({
  title,
  note,
  Icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  note?: string;
  Icon: React.ComponentType<{ className?: string }>;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="panel overflow-hidden p-0">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3.5 px-5 py-4 text-left"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary">
          <Icon className="size-[17px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15.5px] font-medium">{t(title)}</span>
          {note ? (
            <span className="block truncate text-[12.5px] text-muted-foreground">{t(note)}</span>
          ) : null}
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? <div className="border-t border-hairline">{children}</div> : null}
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="border-b border-hairline px-5 py-3.5 last:border-b-0">{children}</div>;
}

export function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  const t = useT();
  return (
    <Row>
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-medium">{t(label)}</span>
          {hint ? <span className="block text-[12px] text-muted-foreground">{t(hint)}</span> : null}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={value}
          aria-label={t(label)}
          onClick={() => onChange(!value)}
          className={`relative box-border inline-flex h-[26px] w-[46px] shrink-0 items-center rounded-full border transition-colors duration-300 ${
            value ? "border-primary bg-primary" : "border-hairline bg-muted"
          }`}
        >
          <span
            className={`pointer-events-none block size-[20px] rounded-full shadow-sm transition-transform duration-300 ${
              value ? "bg-primary-foreground" : "bg-background"
            }`}
            style={{
              transform: `translateX(${value ? 23 : 2}px)`,
              transitionTimingFunction: "var(--ease-griot)",
            }}
          />
        </button>
      </div>
    </Row>
  );
}

export function SelectRow({
  label,
  value,
  options,
  onChange,
  searchable = false,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (next: string) => void;
  searchable?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const formatOption = (opt: string) => {
    // Se for o nome de um idioma da lista de idiomas ou formato numérico/data, não traduz
    if (opt.includes("(") && opt.includes(")")) return opt;
    if (opt.includes("/") || opt.includes("-")) return opt;
    return t(opt);
  };

  const filtered = query
    ? options.filter(
        (option) =>
          formatOption(option).toLowerCase().includes(query.toLowerCase()) ||
          option.toLowerCase().includes(query.toLowerCase()),
      )
    : options;

  return (
    <Row>
      <button
        onClick={() => setOpen((state) => !state)}
        className="flex w-full items-center gap-3 text-left"
      >
        <span className="min-w-0 flex-1 text-[14.5px] font-medium">{t(label)}</span>
        <span className="shrink-0 truncate text-[13px] text-muted-foreground">
          {formatOption(value)}
        </span>
        <ChevronRight
          className={`size-4 shrink-0 text-muted-foreground transition-transform duration-300 ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open ? (
        <div className="rise mt-3 overflow-hidden rounded-2xl border border-hairline">
          {searchable ? (
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Procurar")}
              className="w-full border-b border-hairline bg-transparent px-3.5 py-2.5 text-[13.5px] outline-none placeholder:text-muted-foreground"
            />
          ) : null}
          <div className="max-h-[46vh] overflow-y-auto">
            {filtered.map((option) => (
              <button
                key={option}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left active:bg-secondary"
              >
                <span className="min-w-0 truncate text-[13.5px]">{formatOption(option)}</span>
                {option === value ? <Check className="size-[15px] shrink-0" /> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </Row>
  );
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  const t = useT();
  return (
    <Row>
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 text-[14.5px] font-medium">{t(label)}</span>
        <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">{t(value)}</span>
      </div>
    </Row>
  );
}

export function ActionRow({
  label,
  hint,
  onClick,
  danger = false,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  const t = useT();
  return (
    <Row>
      <button onClick={onClick} className="flex w-full items-center gap-3 text-left">
        <span className="min-w-0 flex-1">
          <span className={`block text-[14.5px] font-medium ${danger ? "text-destructive" : ""}`}>
            {t(label)}
          </span>
          {hint ? <span className="block text-[12px] text-muted-foreground">{t(hint)}</span> : null}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </Row>
  );
}
