import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/*
 * Settings primitives — the one layout every settings page composes:
 * a narrow column, a page header, labeled sections, and rows with
 * title + description on the left and the control on the right
 * (Zed/Linear pattern on Hanoki tokens).
 */

export function SettingsPageShell({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <main className="min-w-0 flex-1">
      <div className={cn("mx-auto w-full max-w-2xl space-y-8 px-6 pt-10 pb-16", className)}>
        {children}
      </div>
    </main>
  );
}

export function SettingsPageHeader({
  leading,
  title,
  description,
  actions,
}: {
  /** Optional visual before the title — an orb, a provider icon tile. */
  leading?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="group/orb flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4">
        {leading}
        <div className="min-w-0 space-y-1">
          <h1 className="truncate font-heading text-xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2 pt-1">{actions}</div> : null}
    </header>
  );
}

export function SettingsSectionLabel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <h2
      className={cn(
        "px-0.5 text-[10px] font-medium tracking-wider text-muted-foreground/80 uppercase",
        className,
      )}
    >
      {children}
    </h2>
  );
}

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="space-y-1">
        <SettingsSectionLabel>{title}</SettingsSectionLabel>
        {description ? <p className="px-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="divide-y divide-separator overflow-hidden rounded-lg border border-border">
        {children}
      </div>
    </section>
  );
}

export function SettingsRow({
  icon,
  title,
  description,
  htmlFor,
  control,
  children,
  className,
}: {
  /** Optional leading icon, rendered in a small bordered tile. */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Renders the title as a <label> pointing at the control. */
  htmlFor?: string;
  /** Right-aligned control: switch, select, button, static value. */
  control?: ReactNode;
  /** Full-width content below the title/control line: swatches, errors. */
  children?: ReactNode;
  className?: string;
}) {
  const TitleTag = htmlFor ? "label" : "div";

  return (
    <div className={cn("px-4 py-3", className)}>
      <div className="flex items-center justify-between gap-8">
        <div className="flex min-w-0 items-start gap-3 py-0.5">
          {icon ? (
            <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface-secondary text-muted-foreground">
              {icon}
            </div>
          ) : null}
          <div className="min-w-0">
            <TitleTag htmlFor={htmlFor} className="block text-[13px] font-medium text-foreground">
              {title}
            </TitleTag>
            {description ? (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {control ? <div className="flex shrink-0 items-center">{control}</div> : null}
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

export function SettingsError({ children }: { children: ReactNode }) {
  if (!children) {
    return null;
  }

  return <p className="px-0.5 text-xs text-danger">{children}</p>;
}
