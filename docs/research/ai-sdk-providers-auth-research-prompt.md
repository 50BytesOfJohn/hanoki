# Vercel AI SDK — Provider Configuration & Auth Methods Research

> Research conducted Feb 2026. Sources: sdk.vercel.ai/providers/ai-sdk-providers + @ai-sdk/\* package sources on GitHub.

## Summary

The current `providers` table schema (`id`, `displayName`, `kind`, `baseUrl`, `apiKeyId`, `config` JSON, `isEnabled`, timestamps) covers ~85% of providers out of the box. It handles:

- Single secret via Keychain reference (`apiKeyId`)
- Custom endpoint via `baseUrl`
- Everything else (org/project IDs, headers, region, etc.) in `config`

**Only two new columns are needed** for full coverage:

- `authKind` — drives the settings UI (which form fields to show)
- `apiSecretId` — secondary Keychain reference (Amazon Bedrock `secretAccessKey`)

---

## 1. Provider Matrix

| slug                       | auth_method                                     | required_non_secret_fields    | optional_fields                                   | needs_second_secret            | notes                                    |
| -------------------------- | ----------------------------------------------- | ----------------------------- | ------------------------------------------------- | ------------------------------ | ---------------------------------------- |
| `openai`                   | `api_key`                                       | — (org/project common)        | `organization`, `project`, `baseURL`, headers     | no                             | org/project often shown in UI            |
| `anthropic`                | `api_key` (or bearer token)                     | —                             | `baseURL`, headers (`anthropic-beta`)             | no                             | —                                        |
| `google`                   | `api_key`                                       | —                             | `baseURL`                                         | no                             | —                                        |
| `google-vertex`            | `service_account_json` / `api_key` / `iam_role` | `project`, `location`         | `googleAuthOptions` / `googleCredentials`         | no (JSON in one Keychain item) | Express mode uses apiKey                 |
| `mistral`                  | `api_key`                                       | —                             | `baseURL`                                         | no                             | —                                        |
| `cohere`                   | `api_key`                                       | —                             | `baseURL`                                         | no                             | —                                        |
| `groq`                     | `api_key`                                       | —                             | `baseURL`                                         | no                             | OpenAI-compatible under the hood         |
| `xai`                      | `api_key`                                       | —                             | `baseURL`                                         | no                             | —                                        |
| `deepseek`                 | `api_key`                                       | —                             | `baseURL`                                         | no                             | —                                        |
| `togetherai`               | `api_key`                                       | —                             | `baseURL`                                         | no                             | —                                        |
| `openrouter`               | `api_key`                                       | —                             | `HTTP-Referer`, `X-Title` headers                 | no                             | Attribution headers strongly recommended |
| `ollama`                   | `none`                                          | `baseURL` (default localhost) | headers                                           | no                             | Local-only                               |
| `azure`                    | `api_key`                                       | `resourceName`                | `apiVersion`, `baseURL`, `useDeploymentBasedUrls` | no                             | Deployment name is per-model             |
| `amazon-bedrock`           | `api_key_pair` / `iam_role`                     | `region`                      | `sessionToken`, `credentialProvider`              | **yes** (secretAccessKey)      | IAM role = no secrets stored             |
| `lmstudio`                 | `none` / `api_key`                              | `baseURL` (localhost:1234/v1) | —                                                 | no                             | OpenAI-compatible                        |
| `fireworks`                | `api_key`                                       | —                             | `baseURL`                                         | no                             | —                                        |
| `cerebras`                 | `api_key`                                       | —                             | `baseURL`                                         | no                             | —                                        |
| `perplexity`               | `api_key`                                       | —                             | `baseURL`                                         | no                             | —                                        |
| `replicate`                | `api_key`                                       | —                             | `baseURL`                                         | no                             | —                                        |
| `fal`                      | `api_key`                                       | —                             | `baseURL`                                         | no                             | —                                        |
| `novita`                   | `api_key`                                       | —                             | `baseURL`                                         | no                             | —                                        |
| `custom_openai_compatible` | `api_key` / `none`                              | `baseURL`                     | `name`, headers, queryParams                      | no                             | Generic factory                          |

**Community / widely-used extras** (not in core `@ai-sdk/` but fully supported):

- `openrouter` (already in table)
- `ollama-ai-provider-v2` / `ai-sdk-ollama`
- LM Studio, vLLM, llama.cpp, etc. via `createOpenAICompatible`

---

## 2. Per-Provider Constructor Signatures

**Simple `api_key` group** (all providers not listed below)

```ts
import { createXXX } from '@ai-sdk/xxx';
const provider = createXXX({
  apiKey: '...',        // or process.env.XXX_API_KEY
  baseURL: '...',       // optional
  headers: { ... },     // optional
});
```

**OpenAI**

```ts
const openai = createOpenAI({
  apiKey,
  organization: "org-...",
  project: "proj-...",
  baseURL,
  headers,
});
```

**Anthropic**

```ts
const anthropic = createAnthropic({
  apiKey, // x-api-key header
  authToken, // Bearer alternative
  baseURL,
  headers: { "anthropic-beta": "..." },
});
```

**Google Vertex AI**

```ts
const vertex = createVertex({
  project: "my-gcp-project",
  location: "us-central1",
  googleAuthOptions: { credentials: { client_email, private_key } }, // Node
  // or apiKey for Express mode (no project/location needed)
  baseURL, // optional override
});
```

**Azure OpenAI**

```ts
const azure = createAzure({
  resourceName: "my-resource",
  apiKey,
  apiVersion: "2024-...",
  baseURL, // overrides resourceName
  useDeploymentBasedUrls: false,
});
// Model usage: azure('deployment-name')
```

**Amazon Bedrock**

```ts
const bedrock = createAmazonBedrock({
  region: "us-east-1",
  accessKeyId,
  secretAccessKey,
  sessionToken, // optional
  // or credentialProvider: fromNodeProviderChain() for IAM role
});
```

**Ollama**

```ts
const ollama = createOllama({ baseURL: "http://localhost:11434/api" });
```

**OpenRouter**

```ts
const openrouter = createOpenRouter({
  apiKey,
  // headers recommended for leaderboard:
  // 'HTTP-Referer': 'https://myapp.com',
  // 'X-Title': 'Hanoki'
});
```

**LM Studio / Custom OpenAI-compatible**

```ts
const lmstudio = createOpenAICompatible({
  name: "lmstudio",
  baseURL: "http://localhost:1234/v1",
  apiKey: "", // usually empty
});
```

---

## 3. Schema Recommendations

### Minimal additions (recommended)

Add **two columns** to the `providers` table:

```ts
// New columns to add via Drizzle migration:
authKind: text("auth_kind").notNull().default("api_key"),
// Values: 'api_key' | 'api_key_pair' | 'service_account_json' | 'none' | 'iam_role'

apiSecretId: text("api_secret_id"),
// nullable; secondary Keychain ref (e.g. Bedrock secretAccessKey)
```

### Keep `config` JSON for

- All custom headers (OpenRouter `HTTP-Referer`/`X-Title`, Anthropic beta flags)
- `googleAuthOptions` details (if not storing full JSON)
- `organization`, `project` (OpenAI), `resourceName` (Azure), `region` (Bedrock), `location` (Vertex) — these are fine in `config` unless you want to query/filter on them
- Any provider-specific flags (`reasoningEffort`, `apiVersion`, etc.)

### Optional first-class columns (if UI feels clunky parsing `config`)

If the settings form needs to render these fields cleanly without parsing JSON, consider promoting:

- `organization` text
- `project` text
- `region` text
- `location` text
- `resourceName` text
- `apiVersion` text

These are not required for correctness — only for UX convenience.

### Secret handling (macOS Keychain)

- `apiKeyId` → primary secret (API key, service-account JSON string, or AWS `accessKeyId`)
- `apiSecretId` → secondary (Bedrock `secretAccessKey`)
- Service-account JSON: store entire `{ "type": "service_account", ... }` as one Keychain text item under `apiKeyId`

No refresh tokens or OAuth flows needed — none of the providers require stored refresh tokens; short-lived tokens are obtained at runtime via SDK/ADC.

### `kind` column

Keep as open `text` (supports custom providers, future `@ai-sdk/*` packages, community ones). Use a TS enum/union in app code for type safety.

### Migration path

1. Add `authKind` + `apiSecretId` columns + Drizzle migration.
2. Backfill existing rows to `authKind = 'api_key'`.
3. Update provider factory code to read from row + Keychain + `config` JSON.
4. (Optional) Promote extra fields to first-class columns later if UI feels clunky.

---

## 4. Settings UI Field Map

### Common form (all providers)

- Display Name (text)
- Kind (select or searchable dropdown with all slugs + "Custom OpenAI-compatible")
- Enabled (toggle)
- Base URL (text, optional, pre-filled per kind)
- Auth section (driven by `authKind` + kind)

### Per-provider / authKind specific fields

| Provider / authKind             | Secret fields (Keychain)                                 | Plain-text / config fields                         | Conditional notes                                                     |
| ------------------------------- | -------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------- |
| Most (`openai`, `anthropic`, …) | API Key                                                  | Organization, Project (OpenAI), custom headers     | —                                                                     |
| `openrouter`                    | API Key                                                  | HTTP-Referer, X-Title (pre-filled with app name)   | —                                                                     |
| `google-vertex`                 | Service Account JSON (textarea) **or** API Key (Express) | Project, Location (dropdown: us-central1, etc.)    | Auth selector: "Service Account JSON" / "API Key" / "IAM (no secret)" |
| `azure`                         | API Key                                                  | Resource Name (required), API Version (default v1) | —                                                                     |
| `amazon-bedrock`                | Access Key ID + Secret Access Key                        | Region (dropdown), Session Token (optional)        | Auth selector: "Access/Secret Keys" / "IAM Role (no secrets)"         |
| `ollama` / `lmstudio`           | (none)                                                   | Base URL (pre-filled localhost)                    | —                                                                     |
| `custom_openai_compatible`      | API Key (optional)                                       | Base URL (required), Name, custom headers          | —                                                                     |

**Advanced section** (always visible, collapsed): raw `config` JSON editor + "Test Connection" button.

**Multiple profiles** already supported via multiple rows with same `kind`.
