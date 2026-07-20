import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Hanoki — a calm home for your AI chats",
      },
      {
        name: "description",
        content:
          "Hanoki is a local-first desktop app for chatting, writing, and creative work with any model. Quietly beautiful, neatly organized, and entirely yours. Free & open source.",
      },
      { name: "theme-color", content: "#e8e3d7" },
      { property: "og:title", content: "Hanoki" },
      {
        property: "og:description",
        content:
          "A calm, local-first desktop app for chatting, writing, and creative work with any AI model.",
      },
      { property: "og:image", content: "/hanoki-banner.png" },
      { property: "og:type", content: "website" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/hanoki-mark.png" },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          // set theme before paint to avoid a flash of the wrong palette
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('hanoki-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();",
          }}
        />
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
