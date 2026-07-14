export function AppearancePage() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-6 py-6">
      <div className="space-y-1">
        <h1 className="font-heading text-xl font-semibold tracking-tight">Appearance</h1>
        <p className="text-sm text-muted-foreground">Customize the look and feel of the app.</p>
      </div>
      <p className="text-sm text-muted-foreground">
        Hanoki currently ships a single dark theme. More options are coming.
      </p>
    </div>
  );
}
