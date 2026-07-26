/**
 * One source of truth for everything a crawler reads: URLs, copy, and the
 * schema.org graph. Route `head()`s call `seo()` and spread the result; the
 * site-wide nodes live on the root route so every page carries them.
 */

export const SITE_URL = "https://hanoki.app";
export const GITHUB = "https://github.com/50BytesOfJohn/hanoki";
export const RELEASES = `${GITHUB}/releases`;
export const DISCORD = "https://discord.gg/uRCYRMrXUx";
export const EMAIL = "hello@hanoki.app";
export const LICENSE_URL = `${GITHUB}/blob/main/LICENSE`;

export const SITE_NAME = "Hanoki";
export const OG_IMAGE = `${SITE_URL}/og-image.png`;
export const OG_IMAGE_ALT = "Hanoki — Where AI chat feels calm again.";

/** `https://hanoki.app` + `/download`. Home is `/` with the trailing slash so
 *  canonical, og:url and the sitemap all agree on one spelling per page. */
export const url = (path: string) => `${SITE_URL}${path}`;

type SeoInput = {
  title: string;
  description: string;
  /** Absolute path, e.g. `/download`. */
  path: string;
  /** Shown when the link is shared; falls back to `description`. */
  social?: string;
  noindex?: boolean;
};

export function seo({ title, description, path, social, noindex }: SeoInput) {
  const href = url(path);
  const shared = social ?? description;

  return {
    meta: [
      { title },
      { name: "description", content: description },
      {
        name: "robots",
        content: noindex
          ? "noindex, nofollow"
          : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
      },
      { property: "og:title", content: title },
      { property: "og:description", content: shared },
      { property: "og:url", content: href },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: shared },
    ],
    links: noindex ? [] : [{ rel: "canonical", href }],
  };
}

/* ------------------------------------------------------------ structured data */

const ORG = `${SITE_URL}/#organization`;
const WEBSITE = `${SITE_URL}/#website`;
const APP = `${SITE_URL}/#app`;

const DESCRIPTION =
  "Hanoki is a free, open-source desktop AI chat app for macOS. Branch any message, organize chats into workspaces, and keep your conversations and API keys on your own machine.";

/** Emitted once from the root route, so every page inherits the same entities
 *  and per-page `WebPage` nodes can just `@id`-reference them. */
export const siteGraph = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": ORG,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      email: EMAIL,
      description: "Maker of Hanoki, a local-first desktop app for branching AI chat.",
      logo: {
        "@type": "ImageObject",
        "@id": `${SITE_URL}/#logo`,
        url: `${SITE_URL}/hanoki-mark.png`,
        contentUrl: `${SITE_URL}/hanoki-mark.png`,
        width: 512,
        height: 512,
        caption: SITE_NAME,
      },
      image: { "@id": `${SITE_URL}/#logo` },
      sameAs: [GITHUB, DISCORD],
    },
    {
      "@type": "WebSite",
      "@id": WEBSITE,
      url: `${SITE_URL}/`,
      name: SITE_NAME,
      description: DESCRIPTION,
      inLanguage: "en",
      publisher: { "@id": ORG },
    },
    {
      "@type": "SoftwareApplication",
      "@id": APP,
      name: SITE_NAME,
      alternateName: "Hanoki AI Chat",
      url: `${SITE_URL}/`,
      description: DESCRIPTION,
      applicationCategory: ["ProductivityApplication", "CommunicationApplication"],
      applicationSubCategory: "AI chat client",
      operatingSystem: "macOS",
      softwareVersion: "0.0.19",
      releaseNotes: RELEASES,
      softwareRequirements:
        "macOS. An API key from a model provider such as Anthropic, OpenAI, Google or OpenRouter, or a local runtime such as Ollama.",
      image: OG_IMAGE,
      screenshot: [
        {
          "@type": "ImageObject",
          url: `${SITE_URL}/shot-graph.png`,
          caption: "One conversation as a branching graph of replies",
        },
        {
          "@type": "ImageObject",
          url: `${SITE_URL}/shot-chat.png`,
          caption: "A chat in progress, streaming a reply",
        },
        {
          "@type": "ImageObject",
          url: `${SITE_URL}/shot-providers.png`,
          caption: "Provider settings with cloud and local models",
        },
      ],
      downloadUrl: RELEASES,
      installUrl: url("/download"),
      softwareHelp: { "@id": `${SITE_URL}/download#webpage` },
      discussionUrl: DISCORD,
      license: LICENSE_URL,
      isAccessibleForFree: true,
      offers: {
        "@type": "Offer",
        price: 0,
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        url: url("/download"),
      },
      featureList: [
        "Branch any message into a new conversation path",
        "Workspaces and nested folders for organizing chats",
        "Cloud and local AI models from one interface",
        "Switch model or provider mid-conversation",
        "Chats stored locally in SQLite, no account required",
        "API keys encrypted by the operating system, not a config file",
        "Pin and jump back to any branch in a conversation",
      ],
      author: { "@id": ORG },
      publisher: { "@id": ORG },
      maintainer: { "@id": ORG },
    },
    {
      "@type": "SoftwareSourceCode",
      "@id": `${SITE_URL}/#source`,
      name: "Hanoki source code",
      codeRepository: GITHUB,
      programmingLanguage: ["TypeScript", "React"],
      runtimePlatform: "Electron",
      license: LICENSE_URL,
      about: { "@id": APP },
      author: { "@id": ORG },
    },
  ],
};

type PageGraphInput = {
  path: string;
  name: string;
  description: string;
  /** Trail after Home, e.g. `[{ name: "Download", path: "/download" }]`. */
  breadcrumb?: Array<{ name: string; path: string }>;
  /** Extra nodes such as `FAQPage` or `HowTo`, merged into the same graph. */
  extra?: Array<Record<string, unknown>>;
  /** ISO date. Worth setting on pages where freshness is the point. */
  dateModified?: string;
};

/** A `WebPage` node wired to the site-wide entities, plus a breadcrumb trail. */
export function pageGraph({
  path,
  name,
  description,
  breadcrumb,
  extra,
  dateModified,
}: PageGraphInput) {
  const href = url(path);
  const trail = [{ name: "Home", path: "/" }, ...(breadcrumb ?? [])];

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${href}#webpage`,
        url: href,
        name,
        description,
        inLanguage: "en",
        ...(dateModified ? { dateModified } : {}),
        isPartOf: { "@id": WEBSITE },
        about: { "@id": APP },
        primaryImageOfPage: { "@type": "ImageObject", url: OG_IMAGE },
        breadcrumb: { "@id": `${href}#breadcrumb` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${href}#breadcrumb`,
        itemListElement: trail.map((crumb, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: crumb.name,
          item: url(crumb.path === "/" ? "/" : crumb.path),
        })),
      },
      ...(extra ?? []),
    ],
  };
}

/** JSON-LD is injected as a `script` with `children`, per TanStack Start's head API. */
export const jsonLd = (data: unknown) => ({
  type: "application/ld+json",
  children: JSON.stringify(data),
});
