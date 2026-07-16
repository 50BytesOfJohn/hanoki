import { SettingsPageHeader, SettingsPageShell, SettingsRow, SettingsSection } from "./settings-ui";

export function WebPage() {
  return (
    <SettingsPageShell>
      <SettingsPageHeader title="Web search & fetch" />

      <SettingsSection title="Providers">
        <SettingsRow
          title="Web search"
          control={<span className="text-[13px] text-muted-foreground">Firecrawl</span>}
        />
        <SettingsRow
          title="Web fetch"
          control={<span className="text-[13px] text-muted-foreground">Firecrawl</span>}
        />
      </SettingsSection>
    </SettingsPageShell>
  );
}
