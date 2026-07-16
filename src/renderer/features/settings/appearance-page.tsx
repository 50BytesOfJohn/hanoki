import { SettingsPageHeader, SettingsPageShell, SettingsRow, SettingsSection } from "./settings-ui";

export function AppearancePage() {
  return (
    <SettingsPageShell>
      <SettingsPageHeader
        title="Appearance"
        description="How Hanoki looks. Designed to stay out of the way."
      />

      <SettingsSection title="Theme">
        <SettingsRow
          title="Theme"
          description="Ink-black neutrals with a single hinoki-moss accent. More themes are on the way."
          control={
            <span className="text-[13px] text-muted-foreground">Sumi &amp; Hinoki · Dark</span>
          }
        />
      </SettingsSection>
    </SettingsPageShell>
  );
}
