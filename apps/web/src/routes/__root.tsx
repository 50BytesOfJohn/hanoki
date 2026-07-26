import { HeadContent, Link, ScriptOnce, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";

import appCss from "../styles.css?url";
// The two faces that paint above the fold. Importing the files (not just the
// CSS) gives us their hashed URLs, so they can be preloaded instead of being
// discovered only after the stylesheet parses.
import frauncesRoman from "@fontsource-variable/fraunces/files/fraunces-latin-opsz-normal.woff2?url";
import frauncesItalic from "@fontsource-variable/fraunces/files/fraunces-latin-opsz-italic.woff2?url";
import manrope from "@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2?url";

import { Button } from "#/components/ui/button";
import { Footer, Nav } from "#/components/site-chrome";
import { OG_IMAGE, OG_IMAGE_ALT, SITE_NAME, jsonLd, siteGraph } from "#/lib/seo";

const preloadFont = (href: string) => ({
  rel: "preload" as const,
  as: "font" as const,
  type: "font/woff2",
  href,
  crossOrigin: "anonymous" as const,
});

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "application-name", content: SITE_NAME },
      { name: "apple-mobile-web-app-title", content: SITE_NAME },
      { name: "color-scheme", content: "light dark" },
      { name: "generator", content: SITE_NAME },
      // shared by every page; per-page heads override title/description/url
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "en_US" },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:image:secure_url", content: OG_IMAGE },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: OG_IMAGE_ALT },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: OG_IMAGE },
      { name: "twitter:image:alt", content: OG_IMAGE_ALT },
    ],
    links: [
      preloadFont(frauncesRoman),
      preloadFont(frauncesItalic),
      preloadFont(manrope),
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
      { rel: "icon", href: "/logo192.png", type: "image/png", sizes: "192x192" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "manifest", href: "/manifest.json" },
    ],
    scripts: [jsonLd(siteGraph)],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Two theme-colors, one per scheme, written straight into the head:
            the router's head manager keys meta by `name`, so a second
            `theme-color` entry would silently replace the first. */}
        <meta name="theme-color" content="#e8e3d7" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#13120e" media="(prefers-color-scheme: dark)" />
        <ScriptOnce>
          {
            "(function(){try{var t=localStorage.getItem('hanoki-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();"
          }
        </ScriptOnce>
        <HeadContent />
      </head>
      <body>
        {children}
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}

/** A real 404 with a real status code beats a soft 404 — Google treats a
 *  200-with-"not found" page as a thin duplicate of the whole site. */
function NotFound() {
  return (
    <div className="flex min-h-screen flex-col text-[var(--sumi)]">
      {/* React 19 hoists these into <head>; the 404 status does the real work,
          this just stops a soft-404 from ever being indexed. */}
      <title>Page not found — Hanoki</title>
      <meta name="robots" content="noindex, follow" />
      <Nav />
      <main className="page-wrap flex flex-1 flex-col items-center justify-center py-28 text-center">
        <p className="text-[0.82rem] font-semibold uppercase tracking-[0.18em] text-[var(--sumi-faint)]">
          404
        </p>
        <h1 className="mt-4 text-balance font-serif text-[2.4rem] font-semibold leading-tight tracking-tight sm:text-[3rem]">
          This page took another branch.
        </h1>
        <p className="mx-auto mt-5 max-w-md text-pretty text-[1.02rem] leading-relaxed text-[var(--sumi-soft)]">
          Nothing lives at that address. The pages below are the whole site — it's a small one.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" asChild>
            <Link to="/">Back to the home page</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/download">Download for macOS</Link>
          </Button>
        </div>
      </main>
      <Footer />
    </div>
  );
}
