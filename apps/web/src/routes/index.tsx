import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Github } from "lucide-react";

import { Button } from "#/components/ui/button";
import { Footer, Nav, Reveal } from "#/components/site-chrome";
import { DISCORD, GITHUB, jsonLd, pageGraph, seo, url } from "#/lib/seo";

const TITLE = "Hanoki — Local-First AI Chat Desktop App for macOS";
const DESCRIPTION =
  "Hanoki is a free, open-source desktop AI chat app for macOS. Branch any message, organize chats into workspaces, and keep your conversations and API keys on your own machine.";
const SOCIAL_DESCRIPTION =
  "A calm, local-first desktop app for chatting, writing, and creative work with cloud or local AI models.";

const faq = [
  {
    q: "Is Hanoki free?",
    a: "Yes. It's MIT-licensed, with no account and no subscription. You pay your model providers directly with your own API keys, or nothing at all if you run local models.",
  },
  {
    q: "Where do my chats actually live?",
    a: "In a SQLite database on your machine. API keys are encrypted by the operating system — the macOS Keychain — rather than sitting in a plaintext config file. There is no Hanoki server, so there is nothing to sync and nothing to leak.",
  },
  {
    q: "Which models can I use?",
    a: "Anthropic, OpenAI, Google, OpenRouter, Groq, xAI, Mistral, DeepSeek, Together AI, Cohere and Hugging Face out of the box, plus local runtimes like Ollama and any OpenAI-compatible endpoint. Enable the models you care about per provider and switch between them mid-conversation.",
  },
  {
    q: "What does branching a chat mean?",
    a: "Every message in Hanoki is a node in a tree rather than a line in a scroll. Edit a prompt or re-run a reply with a different model and you get a new branch instead of overwriting what was there. Both paths stay, and you can jump between them or pin the ones worth keeping.",
  },
  {
    q: "Windows or Linux?",
    a: "Hanoki is a normal Electron app and the build config already covers Windows and Linux, but macOS is the only platform with published builds today. Follow the repo or the Discord if you want a ping when that changes.",
  },
  {
    q: "Why does macOS warn me on first launch?",
    a: "Builds are still unsigned, because there's no Apple Developer licence yet. Right-click the app and choose Open, or allow it under System Settings → Privacy & Security. It also means no auto-updates for now.",
  },
];

export const Route = createFileRoute("/")({
  head: () => {
    const { meta, links } = seo({
      title: TITLE,
      description: DESCRIPTION,
      path: "/",
      social: SOCIAL_DESCRIPTION,
    });
    return {
      meta,
      links,
      scripts: [
        jsonLd(
          pageGraph({
            path: "/",
            name: TITLE,
            description: DESCRIPTION,
            extra: [
              {
                "@type": "FAQPage",
                "@id": `${url("/")}#faq`,
                mainEntity: faq.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
              },
            ],
          }),
        ),
      ],
    };
  },
  component: Home,
});

/* ------------------------------------------------------------------ page */

function Home() {
  return (
    <div className="min-h-screen text-[var(--sumi)]">
      <Nav />
      <main>
        <Hero />
        <Providers />
        <Bento />
        <Honest />
        <Faq />
        <CallToAction />
      </main>
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------ hero */

function Hero() {
  return (
    <section className="page-wrap relative pb-4 pt-20 text-center md:pt-24">
      <h1
        style={{ "--i": 0 } as React.CSSProperties}
        className="rise mx-auto max-w-4xl text-balance font-serif text-[2.9rem] font-semibold leading-[1.03] tracking-[-0.02em] sm:text-[3.7rem] lg:text-[4.4rem]"
      >
        Where AI chat feels{" "}
        <span className="ink-underline italic text-[var(--moss-deep)]">calm</span> again.
      </h1>

      <p
        style={{ "--i": 1 } as React.CSSProperties}
        className="rise mx-auto mt-6 max-w-[38rem] text-pretty text-[1.08rem] leading-relaxed text-[var(--sumi-soft)]"
      >
        A local-first desktop app for chatting with any model, cloud or local. Fork any message to
        try another angle, keep every path, and file the whole thing into workspaces that match how
        you work.
      </p>

      <div
        style={{ "--i": 2 } as React.CSSProperties}
        className="rise mt-9 flex flex-wrap items-center justify-center gap-3"
      >
        <Button size="lg" asChild>
          <Link to="/download">
            Download for macOS
            <ArrowRight />
          </Link>
        </Button>
        <Button size="lg" variant="outline" asChild>
          <a href={GITHUB} target="_blank" rel="noreferrer">
            <Github />
            Star on GitHub
          </a>
        </Button>
      </div>

      <ul
        style={{ "--i": 3 } as React.CSSProperties}
        className="rise mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[0.82rem] text-[var(--sumi-faint)]"
      >
        <li>Free &amp; MIT-licensed</li>
        <li className="dotted">No account</li>
        <li className="dotted">Bring your own keys</li>
        <li className="dotted">Nothing leaves your machine</li>
      </ul>

      {/* the money shot: a real conversation, branched */}
      <div className="rise-shot relative mx-auto mt-16 max-w-5xl">
        <div className="app-frame">
          <img
            src="/shot-graph.webp"
            alt="The Hanoki desktop app showing one conversation as a graph, branching into several assistant and user replies"
            width={3364}
            height={2044}
            fetchPriority="high"
            decoding="async"
          />
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- providers */

const providers = [
  "Anthropic",
  "OpenAI",
  "Google",
  "OpenRouter",
  "Groq",
  "xAI",
  "Mistral",
  "DeepSeek",
  "Together AI",
  "Cohere",
  "Hugging Face",
  "Ollama",
  "Any OpenAI-compatible endpoint",
];

function Providers() {
  return (
    <section id="models" className="page-wrap pt-10">
      <Reveal className="provider-strip">
        <p className="whitespace-nowrap text-[0.9rem] text-[var(--sumi-faint)]">Works with</p>
        <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[0.95rem] font-medium text-[var(--sumi-soft)]">
          {providers.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ shots */

/** A pre-cropped detail of the app, sitting flush with the card's bottom edge
 *  so it reads as a window peeking up. The crops live in `public/crop-*.webp`
 *  — cutting them at build time beats scaling a 3364px screenshot down in the
 *  browser, both in bytes and in paint cost. */
function Shot({
  src,
  alt,
  width,
  height,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
}) {
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      draggable={false}
      className="shot mx-7 mt-auto block h-auto w-[calc(100%-3.5rem)] select-none rounded-t-xl"
    />
  );
}

/* ------------------------------------------------------------------ bento */

function BranchDiagram() {
  return (
    <svg
      viewBox="0 0 320 170"
      fill="none"
      className="branch-svg w-full max-w-[23rem]"
      role="img"
      aria-label="A message branching into two replies, one of which continues"
    >
      {/* the road not taken — dashed, like the app's own inactive graph edges */}
      <path
        d="M96 85 C 124 85 124 34 152 34"
        stroke="var(--branch-line)"
        strokeWidth="1.5"
        className="branch-edge-idle"
      />
      <path d="M96 85 C 124 85 124 136 152 136" stroke="var(--branch-active)" strokeWidth="1.5" />
      <path d="M240 136 H 262" stroke="var(--branch-active)" strokeWidth="1.5" />

      {/* nodes */}
      <rect x="8" y="70" width="88" height="30" rx="8" className="branch-node" />
      <rect x="152" y="19" width="88" height="30" rx="8" className="branch-node" />
      <rect x="152" y="121" width="88" height="30" rx="8" className="branch-node is-active" />
      <rect x="262" y="121" width="50" height="30" rx="8" className="branch-node is-active" />

      <text x="22" y="89" className="branch-text">
        your prompt
      </text>
      <text x="166" y="38" className="branch-text">
        model A
      </text>
      <text x="166" y="140" className="branch-text">
        model B
      </text>
      <text x="276" y="140" className="branch-text">
        …
      </text>
    </svg>
  );
}

function CardHead({ title, body }: { title: string; body: string }) {
  return (
    <>
      <span className="card-rule" aria-hidden />
      <h3 className="mt-5 font-serif text-[1.32rem] font-semibold tracking-tight">{title}</h3>
      <p className="mt-2.5 text-pretty text-[0.97rem] leading-relaxed opacity-80">{body}</p>
    </>
  );
}

function Bento() {
  return (
    <section id="features" className="page-wrap pb-20 pt-16 sm:pt-20">
      <Reveal className="mb-12 max-w-2xl">
        <h2 className="text-balance font-serif text-[2.1rem] font-semibold leading-tight tracking-tight sm:text-[2.5rem]">
          What a single scrolling thread can't give you.
        </h2>
        <p className="mt-4 max-w-lg text-[1.02rem] leading-relaxed text-[var(--sumi-soft)]">
          Six things Hanoki does differently, none of which require you to change how you type a
          message.
        </p>
      </Reveal>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Reveal i={0} className="ink-card flex flex-col p-7 sm:col-span-2 lg:col-span-3">
          <CardHead
            title="Every message can fork"
            body="Edit a reply, try a second model, chase a side thought. Each attempt becomes its own branch instead of overwriting the last one, so the answer you liked is still there tomorrow."
          />
          <div className="flex flex-1 items-center justify-center pt-6">
            <BranchDiagram />
          </div>
        </Reveal>

        <Reveal i={1} className="ink-card flex flex-col sm:col-span-2 lg:col-span-3">
          <div className="p-7">
            <CardHead
              title="Workspaces & nested folders"
              body="Group chats the way you already think about them: by project, by client, by whatever you're chasing this week. Not one flat list of half-remembered titles."
            />
          </div>
          <Shot
            src="/crop-sidebar.webp"
            alt="Hanoki's sidebar with chats grouped into nested folders"
            width={830}
            height={622}
          />
        </Reveal>

        <Reveal i={2} className="paper-card flex flex-col overflow-hidden lg:col-span-2">
          <div className="p-7">
            <CardHead
              title="Bring your own models"
              body="Add your keys, switch on the models you actually use, and change provider mid-conversation without changing how you chat."
            />
          </div>
          <Shot
            src="/crop-models.webp"
            alt="Hanoki provider settings with a searchable list of models to enable"
            width={639}
            height={400}
          />
        </Reveal>

        <Reveal i={3} className="paper-card flex flex-col overflow-hidden lg:col-span-2">
          <div className="p-7">
            <CardHead
              title="Sumi, woven in"
              body="Small AI-assisted actions live in the composer: refine a draft, name a chat. Off by default, and powered by whichever model you point them at."
            />
          </div>
          <Shot
            src="/crop-sumi.webp"
            alt="Hanoki's Sumi settings with toggles for prompt actions and title generation"
            width={639}
            height={400}
          />
        </Reveal>

        <Reveal i={4} className="paper-card flex flex-col overflow-hidden lg:col-span-2">
          <div className="p-7">
            <CardHead
              title="Pin the good branches"
              body="Bookmark the turns worth keeping. Jump the whole chat back to any of them in one click."
            />
          </div>
          <Shot
            src="/crop-pinned.webp"
            alt="Hanoki's pinned branches panel listing bookmarked points in a conversation"
            width={639}
            height={400}
          />
        </Reveal>

        <Reveal
          i={5}
          className="paper-card grid gap-8 p-7 sm:col-span-2 md:grid-cols-[1.1fr_1fr] md:items-center lg:col-span-6 lg:p-9"
        >
          <div>
            <CardHead
              title="Local-first, and honest about it"
              body="There is no Hanoki server. Chats and settings live in a SQLite file on your disk, API keys go to the OS keychain, and the only requests Hanoki makes are the ones you send to your own providers."
            />
            <p className="mt-4 text-[0.95rem]">
              <Link to="/privacy" className="nav-link">
                What Hanoki does and doesn't collect →
              </Link>
            </p>
          </div>
          <dl className="spec-list">
            {[
              ["API keys", "OS keychain"],
              ["Chats & folders", "Local SQLite file"],
              ["Telemetry", "None"],
              ["Accounts", "None"],
              ["Source", "MIT on GitHub"],
            ].map(([k, v]) => (
              <div key={k} className="spec-row">
                <dt className="opacity-65">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- honest */

function Honest() {
  return (
    <section className="page-wrap pb-4">
      <Reveal className="mx-auto max-w-3xl text-center">
        <span className="rule" aria-hidden />
        <h2 className="mt-10 text-balance font-serif text-[1.8rem] font-semibold leading-tight tracking-tight sm:text-[2.15rem]">
          It's pre-alpha. Things move fast and break sometimes.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-[1.02rem] leading-relaxed text-[var(--sumi-soft)]">
          There's no Apple Developer licence yet, so macOS builds are unsigned: the first launch
          needs a right-click → Open, and updates are manual. The{" "}
          <Link to="/download">install guide</Link> walks through it. If that sounds fun rather than
          scary, you're exactly the right kind of early.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Button variant="outline" asChild>
            <a href={DISCORD} target="_blank" rel="noreferrer">
              Join the Discord
            </a>
          </Button>
          <Button variant="ghost" asChild>
            <a href={`${GITHUB}/issues`} target="_blank" rel="noreferrer">
              Report a bug
              <ArrowRight />
            </a>
          </Button>
        </div>
      </Reveal>
    </section>
  );
}

/* -------------------------------------------------------------------- faq */

function Faq() {
  return (
    <section id="faq" className="page-wrap py-20">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <Reveal>
          <h2 className="text-balance font-serif text-[2.1rem] font-semibold leading-tight tracking-tight">
            Before you download.
          </h2>
          <p className="mt-4 max-w-sm text-[0.98rem] leading-relaxed text-[var(--sumi-soft)]">
            Anything missing? The{" "}
            <a href={DISCORD} target="_blank" rel="noreferrer">
              Discord
            </a>{" "}
            is small and answers quickly.
          </p>
        </Reveal>

        <Reveal i={1} className="faq">
          {faq.map((item) => (
            <details key={item.q} name="faq">
              <summary>
                {item.q}
                <span className="faq-mark" aria-hidden />
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------- cta */

function CallToAction() {
  return (
    <section className="page-wrap pb-20">
      <Reveal className="cta-band relative overflow-hidden rounded-3xl px-8 py-16 text-center sm:px-16">
        <div aria-hidden className="cta-glow pointer-events-none absolute inset-0" />
        <img
          src="/hanoki-mark.png"
          alt=""
          width={512}
          height={512}
          loading="lazy"
          decoding="async"
          className="relative mx-auto mb-6 size-14"
          draggable={false}
        />
        <h2 className="relative text-balance font-serif text-[2.1rem] font-semibold leading-tight tracking-tight text-[var(--cta-fg)] sm:text-[2.7rem]">
          Bring a little calm to your chats.
        </h2>
        <p className="relative mx-auto mt-4 max-w-lg text-pretty text-[1.02rem] leading-relaxed text-[var(--cta-dim)]">
          Download it, point it at your own keys, and see whether it sticks. There's nothing to sign
          up for.
        </p>
        <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button
            size="lg"
            asChild
            className="bg-[var(--cta-fg)] text-[var(--cta-bg)] shadow-sm hover:bg-white hover:text-[var(--cta-bg)]"
          >
            <Link to="/download">
              Download Hanoki
              <ArrowRight />
            </Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            asChild
            className="border-white/20 bg-white/5 text-[var(--cta-fg)] hover:bg-white/10 hover:text-white"
          >
            <a href={GITHUB} target="_blank" rel="noreferrer">
              <Github />
              Read the source
            </a>
          </Button>
        </div>
      </Reveal>
    </section>
  );
}

/* ----------------------------------------------------------------- footer */
