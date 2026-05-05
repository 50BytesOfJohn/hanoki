import type { SupportedProviderDefinition } from "@shared/providers/catalog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ProviderSetupModelsTabProps {
  provider: SupportedProviderDefinition;
}

export function ProviderSetupModelsTab({ provider }: ProviderSetupModelsTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Models</CardTitle>
        <CardDescription>
          Model sync becomes available after you save this provider configuration.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">Selected provider</span>
          <Badge variant="outline">{provider.name}</Badge>
          <Badge variant="outline">{provider.id}</Badge>
        </div>

        <Alert variant="default">
          <AlertTitle>Save config first</AlertTitle>
          <AlertDescription>
            After saving, the app will sync models in the background and list them on the provider
            details page.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
