import { Link, createFileRoute } from "@tanstack/react-router";

import { Footer, Nav, Reveal } from "#/components/site-chrome";
import { DISCORD, EMAIL, GITHUB, jsonLd, pageGraph, seo } from "#/lib/seo";

const TITLE = "Privacy — What Hanoki Stores and What It Sends";
const DESCRIPTION =
  "Hanoki has no server, no account and no analytics. Chats live in a local SQLite file, API keys are encrypted by the operating system, and the only network requests are the ones you make to your own model providers.";
const UPDATED = "2026-07-26";

/** Bumping this is the whole maintenance burden of this page. */
const UPDATED_LABEL = "26 July 2026";

export const Route = createFileRoute("/privacy")({
  head: () => {
    const { meta, links } = seo({
      title: TITLE,
      description: DESCRIPTION,
      path: "/privacy",
      social: "No server, no account, no analytics. Here's exactly where your data sits.",
    });
    return {
      meta,
      links,
      scripts: [
        jsonLd(
          pageGraph({
            path: "/privacy",
            name: "Hanoki privacy",
            description: DESCRIPTION,
            breadcrumb: [{ name: "Privacy", path: "/privacy" }],
            dateModified: UPDATED,
          }),
        ),
      ],
    };
  },
  component: Privacy,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Reveal as="section" className="mt-12">
      <h2 className="font-serif text-[1.6rem] font-semibold leading-tight tracking-tight">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-[1rem] leading-relaxed text-[var(--sumi-soft)]">
        {children}
      </div>
    </Reveal>
  );
}

function Privacy() {
  return (
    <div className="min-h-screen text-[var(--sumi)]">
      <Nav />
      <main className="page-wrap pb-20 pt-20 md:pt-24">
        <article className="mx-auto max-w-2xl">
          <Reveal>
            <p className="text-[0.82rem] font-semibold uppercase tracking-[0.18em] text-[var(--sumi-faint)]">
              Last updated {UPDATED_LABEL}
            </p>
            <h1 className="mt-4 text-balance font-serif text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.02em]">
              Privacy
            </h1>
            <p className="mt-6 text-pretty text-[1.08rem] leading-relaxed text-[var(--sumi-soft)]">
              The short version: there is no Hanoki server, so there is no Hanoki database with your
              conversations in it. Everything below is checkable — the app is{" "}
              <a href={GITHUB} target="_blank" rel="noreferrer">
                MIT-licensed on GitHub
              </a>
              .
            </p>
          </Reveal>

          <Section title="The desktop app">
            <p>
              Hanoki stores your chats, folders, workspaces and settings in a SQLite database inside
              your operating system's application-data directory. That file never leaves your
              machine unless you copy it somewhere yourself.
            </p>
            <p>
              API keys are not written into that database in plaintext. They're encrypted through
              Electron's <code>safeStorage</code>, which on macOS is backed by the system Keychain,
              so decrypting them requires your logged-in user session.
            </p>
            <p>
              There is no account, no sign-in, no sync and no licence check. Deleting the app and
              its application-data directory removes everything Hanoki has ever kept about you.
            </p>
          </Section>

          <Section title="What the app sends over the network">
            <p>
              Only the requests you cause. When you send a message, it goes to the provider you
              selected for that message — Anthropic, OpenAI, Google, OpenRouter, Groq, xAI, Mistral,
              Together AI, DeepSeek, Cohere, Hugging Face, or an OpenAI-compatible endpoint you
              configured. When you list available models, Hanoki asks that provider's models
              endpoint. That's the extent of it.
            </p>
            <p>
              Those requests are subject to the privacy policy of whichever provider you chose, and
              Hanoki has no visibility into them. If you'd rather nothing left your machine at all,
              point Hanoki at a local runtime such as Ollama and nothing will.
            </p>
            <p>
              There is no telemetry, no analytics SDK, no crash reporter and no update check. The
              app does not phone home — which is also why{" "}
              <Link to="/download">updates are manual</Link>.
            </p>
          </Section>

          <Section title="This website">
            <p>
              hanoki.app is a static site. It sets no cookies, runs no analytics, embeds no tracking
              pixels, and loads no third-party scripts or fonts — the typefaces are served from this
              domain precisely so that visiting the page doesn't tell anyone else that you did.
            </p>
            <p>
              It is hosted on Cloudflare, which processes ordinary server logs (including IP
              addresses) to serve and protect the site. Following a link to GitHub or Discord hands
              you over to those services and their own policies.
            </p>
          </Section>

          <Section title="Changes and contact">
            <p>
              If any of this changes, the date at the top of the page changes with it, and the diff
              is public in the repository.
            </p>
            <p>
              Questions are welcome at <a href={`mailto:${EMAIL}`}>{EMAIL}</a>, in the{" "}
              <a href={DISCORD} target="_blank" rel="noreferrer">
                Discord
              </a>
              , or as an issue on{" "}
              <a href={GITHUB} target="_blank" rel="noreferrer">
                GitHub
              </a>
              . Security reports have their own process in the repository's SECURITY.md — please
              don't open a public issue for those.
            </p>
          </Section>

          <Reveal className="mt-14">
            <Link to="/" className="nav-link">
              ← Back to the home page
            </Link>
          </Reveal>
        </article>
      </main>
      <Footer />
    </div>
  );
}
