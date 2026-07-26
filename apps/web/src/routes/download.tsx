import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Github } from "lucide-react";

import { Button } from "#/components/ui/button";
import { Footer, Nav, Reveal } from "#/components/site-chrome";
import { DISCORD, GITHUB, RELEASES, jsonLd, pageGraph, seo, url } from "#/lib/seo";

const TITLE = "Download Hanoki for macOS — Free, Open-Source AI Chat App";
const DESCRIPTION =
  "Download the latest Hanoki release for macOS. Free and MIT-licensed, no account needed. Includes the first-launch steps for unsigned builds and what you need before your first chat.";

/** Kept as data so the page copy and the JSON-LD can never drift apart. */
const steps = [
  {
    name: "Download the .dmg",
    text: "Grab the newest hanoki-macos-*.dmg from the GitHub releases page. It's roughly 130 MB.",
  },
  {
    name: "Drag Hanoki to Applications",
    text: "Open the disk image and drag the app into your Applications folder, then eject the image.",
  },
  {
    name: "Open it the first time with right-click → Open",
    text: "Builds are unsigned, so macOS blocks a normal double-click. Right-click the app in Applications, choose Open, and confirm. Alternatively, allow it under System Settings → Privacy & Security. You only do this once per version.",
  },
  {
    name: "Add a model provider",
    text: "In Settings, paste an API key for Anthropic, OpenAI, Google or OpenRouter, or point Hanoki at a local Ollama instance. Keys are encrypted by macOS rather than written to a plaintext config file.",
  },
];

const specs = [
  ["Latest version", "0.0.19"],
  ["Platform", "macOS, Apple Silicon"],
  ["Format", ".dmg, about 130 MB"],
  ["Price", "Free — MIT licensed"],
  ["Account", "Not required"],
  ["Signing", "Unsigned (no Apple Developer licence yet)"],
  ["Updates", "Manual for now"],
];

export const Route = createFileRoute("/download")({
  head: () => {
    const { meta, links } = seo({
      title: TITLE,
      description: DESCRIPTION,
      path: "/download",
      social: "Free, open-source, local-first AI chat for macOS. No account, bring your own keys.",
    });
    return {
      meta,
      links,
      scripts: [
        jsonLd(
          pageGraph({
            path: "/download",
            name: "Download Hanoki for macOS",
            description: DESCRIPTION,
            breadcrumb: [{ name: "Download", path: "/download" }],
            extra: [
              {
                "@type": "HowTo",
                "@id": `${url("/download")}#install`,
                name: "How to install Hanoki on macOS",
                description:
                  "Install the unsigned macOS build of Hanoki and connect your first model provider.",
                totalTime: "PT5M",
                step: steps.map((s, i) => ({
                  "@type": "HowToStep",
                  position: i + 1,
                  name: s.name,
                  text: s.text,
                })),
                about: { "@id": `${url("/")}#app` },
              },
            ],
          }),
        ),
      ],
    };
  },
  component: Download,
});

function Download() {
  return (
    <div className="min-h-screen text-[var(--sumi)]">
      <Nav />
      <main className="page-wrap pt-20 md:pt-24">
        <Reveal as="section" className="mx-auto max-w-3xl text-center">
          <p className="text-[0.82rem] font-semibold uppercase tracking-[0.18em] text-[var(--sumi-faint)]">
            Version 0.0.19 · pre-alpha
          </p>
          <h1 className="mt-4 text-balance font-serif text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-[3.2rem]">
            Download Hanoki for macOS
          </h1>
          <p className="mx-auto mt-6 max-w-[36rem] text-pretty text-[1.08rem] leading-relaxed text-[var(--sumi-soft)]">
            Free, open source, and local-first. No account, no subscription, no telemetry — you
            bring your own API keys, or run everything against a local model.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" asChild>
              <a href={RELEASES} target="_blank" rel="noreferrer">
                Get the latest .dmg
                <ArrowRight />
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href={GITHUB} target="_blank" rel="noreferrer">
                <Github />
                Build it from source
              </a>
            </Button>
          </div>
          <p className="mt-4 text-[0.85rem] text-[var(--sumi-faint)]">
            Downloads are hosted on GitHub Releases.
          </p>
        </Reveal>

        <Reveal as="section" className="mx-auto mt-16 max-w-3xl">
          <h2 className="font-serif text-[1.9rem] font-semibold leading-tight tracking-tight">
            Installing it
          </h2>
          <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-[var(--sumi-soft)]">
            Four steps, and the third one is the only unusual part.
          </p>
          <ol className="mt-8 space-y-4">
            {steps.map((step, i) => (
              <li key={step.name} className="paper-card flex gap-5 p-6">
                <span
                  aria-hidden
                  className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--moss-wash)] font-serif text-[1.05rem] font-semibold text-[var(--moss-deep)]"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-serif text-[1.2rem] font-semibold tracking-tight">
                    {step.name}
                  </h3>
                  <p className="mt-2 text-pretty text-[0.97rem] leading-relaxed opacity-80">
                    {step.text}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>

        <Reveal as="section" className="mx-auto mt-16 max-w-3xl">
          <h2 className="font-serif text-[1.9rem] font-semibold leading-tight tracking-tight">
            What you're getting
          </h2>
          <dl className="spec-list mt-6">
            {specs.map(([k, v]) => (
              <div key={k} className="spec-row">
                <dt className="opacity-65">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-[0.97rem] leading-relaxed text-[var(--sumi-soft)]">
            Because the builds are unsigned there is no auto-updater yet: check the{" "}
            <a href={RELEASES} target="_blank" rel="noreferrer">
              releases page
            </a>{" "}
            now and then, or watch the repository. Nothing about Hanoki phones home to tell you a
            new version exists — see <Link to="/privacy">what the app does and doesn't send</Link>.
          </p>
        </Reveal>

        <Reveal as="section" className="mx-auto mt-16 max-w-3xl pb-20">
          <h2 className="font-serif text-[1.9rem] font-semibold leading-tight tracking-tight">
            Windows and Linux
          </h2>
          <p className="mt-3 text-[1rem] leading-relaxed text-[var(--sumi-soft)]">
            Hanoki is a normal Electron app and the packaging config already produces Windows and
            Linux artifacts, but macOS is the only platform with published builds today. If you want
            a ping when that changes, the{" "}
            <a href={DISCORD} target="_blank" rel="noreferrer">
              Discord
            </a>{" "}
            is the fastest way to hear about it — or you can clone the{" "}
            <a href={GITHUB} target="_blank" rel="noreferrer">
              repository
            </a>{" "}
            and build for your own platform in the meantime.
          </p>
          <p className="mt-8">
            <Link to="/" className="nav-link">
              ← Back to what Hanoki actually does
            </Link>
          </p>
        </Reveal>
      </main>
      <Footer />
    </div>
  );
}
