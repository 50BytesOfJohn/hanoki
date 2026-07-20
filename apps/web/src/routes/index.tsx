import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion, useReducedMotion, type Variants } from "motion/react";
import {
  ArrowRight,
  Boxes,
  FolderTree,
  GitBranch,
  Github,
  HardDrive,
  Moon,
  Sparkles,
  Sun,
} from "lucide-react";

import { Button } from "#/components/ui/button";

export const Route = createFileRoute("/")({ component: Home });

const GITHUB = "https://github.com/50BytesOfJohn/hanoki";
const RELEASES = "https://github.com/50BytesOfJohn/hanoki/releases";
const DISCORD = "https://discord.gg/uRCYRMrXUx";

const rise: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] },
  }),
};

function Reveal({
  children,
  i = 0,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  i?: number;
  className?: string;
  as?: "div" | "li" | "section";
}) {
  const MotionTag = motion[as];
  return (
    <MotionTag
      className={className}
      custom={i}
      variants={rise}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
    >
      {children}
    </MotionTag>
  );
}

function Home() {
  return (
    <div className="min-h-screen text-[var(--sumi)]">
      <Nav />
      <main>
        <Hero />
        <Features />
        <Providers />
        <Sumi />
        <Branching />
        <CallToAction />
      </main>
      <Footer />
    </div>
  );
}

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    setMounted(true);
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("hanoki-theme", next);
    } catch {}
    setTheme(next);
  };
  return { theme, toggle, mounted };
}

function ThemeToggle() {
  const { theme, toggle, mounted } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label="Toggle theme"
      className="size-9 rounded-full"
    >
      {mounted && theme === "dark" ? (
        <Sun className="size-[1.05rem]" />
      ) : (
        <Moon className="size-[1.05rem]" />
      )}
    </Button>
  );
}

function Wordmark({ className, height = "h-8" }: { className?: string; height?: string }) {
  // background-keyed to transparent from the supplied assets; swap per theme
  return (
    <a href="#top" className={`inline-flex items-center ${className ?? ""}`} aria-label="Hanoki">
      <img
        src="/wordmark-light.png"
        alt="Hanoki"
        className={`${height} w-auto select-none dark:hidden`}
        draggable={false}
      />
      <img
        src="/wordmark-dark.png"
        alt="Hanoki"
        className={`hidden ${height} w-auto select-none dark:block`}
        draggable={false}
      />
    </a>
  );
}

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header id="top" className="site-nav" data-scrolled={scrolled}>
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="washi relative mx-auto flex w-[min(1120px,calc(100%-1.5rem))] items-center justify-between rounded-full py-2 pl-5 pr-2.5"
      >
        <Wordmark height="h-6" />
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-7 text-[0.9rem] font-medium md:flex">
          <a className="nav-link" href="#features">
            Features
          </a>
          <a className="nav-link" href="#providers">
            Models
          </a>
          <a className="nav-link" href="#sumi">
            Sumi
          </a>
        </nav>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <a href={GITHUB} target="_blank" rel="noreferrer">
              <Github />
              GitHub
            </a>
          </Button>
          <Button size="sm" asChild className="rounded-full">
            <a href={RELEASES} target="_blank" rel="noreferrer">
              Download
            </a>
          </Button>
        </div>
      </motion.div>
    </header>
  );
}

function Hero() {
  const reduce = useReducedMotion();
  return (
    <section className="page-wrap relative pb-4 pt-24 text-center md:pt-28">
      <motion.h1
        variants={rise}
        custom={0}
        initial="hidden"
        animate="show"
        className="mx-auto max-w-4xl font-serif text-[2.9rem] font-semibold leading-[1.04] tracking-[-0.02em] sm:text-[3.7rem] lg:text-[4.4rem]"
      >
        Where AI chat feels{" "}
        <span className="ink-underline italic text-[var(--moss-deep)]">calm</span> again.
      </motion.h1>

      <motion.p
        variants={rise}
        custom={1}
        initial="hidden"
        animate="show"
        className="mx-auto mt-6 max-w-xl text-[1.08rem] leading-relaxed text-[var(--sumi-soft)]"
      >
        Hanoki is a local-first desktop app for chatting, writing, and creative work with any model
        — quietly beautiful, neatly organized, and entirely yours.
      </motion.p>

      <motion.div
        variants={rise}
        custom={2}
        initial="hidden"
        animate="show"
        className="mt-9 flex flex-wrap items-center justify-center gap-3"
      >
        <Button size="lg" asChild>
          <a href={RELEASES} target="_blank" rel="noreferrer">
            Download for macOS
            <ArrowRight />
          </a>
        </Button>
        <Button size="lg" variant="outline" asChild>
          <a href={GITHUB} target="_blank" rel="noreferrer">
            <Github />
            Star on GitHub
          </a>
        </Button>
      </motion.div>

      <motion.p
        variants={rise}
        custom={3}
        initial="hidden"
        animate="show"
        className="mt-5 text-[0.82rem] text-[var(--sumi-faint)]"
      >
        Free &amp; MIT-licensed. Your chats and keys never leave your machine.
      </motion.p>

      {/* the money shot: the real app */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative mx-auto mt-16 max-w-5xl"
      >
        <div className="app-frame">
          <img
            src="/shot-chat.png"
            alt="The Hanoki desktop app: workspaces and nested folders in the sidebar with a chat open"
            width={3364}
            height={2044}
          />
        </div>
      </motion.div>
    </section>
  );
}

const features = [
  {
    icon: FolderTree,
    title: "Workspaces & folders",
    body: "Group chats into workspaces and nested folders — projects, clients, experiments. Your thinking, organized the way you actually work.",
  },
  {
    icon: Sparkles,
    title: "Sumi, woven in",
    body: "Small AI-assisted actions right in the composer — refine a draft, name a chat, tidy a thought. Quietly there when you want them.",
  },
  {
    icon: Boxes,
    title: "Bring your own models",
    body: "Anthropic, OpenAI, Google, OpenRouter, local runtimes. Add your keys and switch models without changing how you chat.",
  },
  {
    icon: HardDrive,
    title: "Local-first & private",
    body: "Chats and settings live on your machine. API keys go in the OS keychain — nothing synced anywhere you didn't ask for.",
  },
];

function Features() {
  return (
    <section id="features" className="page-wrap py-24">
      <Reveal className="mb-12 max-w-2xl">
        <p className="kicker">Calm by design</p>
        <h2 className="mt-3 font-serif text-[2.1rem] font-semibold leading-tight tracking-tight sm:text-[2.5rem]">
          Everything you want in a chat app. Nothing you don't.
        </h2>
      </Reveal>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {features.map((f, i) => (
          <Reveal as="div" i={i} key={f.title} className="feature-card rounded-2xl p-7">
            <div className="flex size-11 items-center justify-center rounded-xl bg-[var(--moss-wash)] text-[var(--moss-deep)]">
              <f.icon className="size-5" strokeWidth={1.75} />
            </div>
            <h3 className="mt-5 font-serif text-[1.35rem] font-semibold tracking-tight">
              {f.title}
            </h3>
            <p className="mt-2.5 text-[0.98rem] leading-relaxed text-[var(--sumi-soft)]">
              {f.body}
            </p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Showcase({
  id,
  kicker,
  title,
  body,
  img,
  alt,
  reverse,
  children,
}: {
  id?: string;
  kicker: string;
  title: React.ReactNode;
  body: string;
  img: string;
  alt: string;
  reverse?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={`page-wrap grid grid-cols-1 items-center gap-12 py-16 ${
        reverse ? "lg:grid-cols-[1.1fr_0.9fr]" : "lg:grid-cols-[0.9fr_1.1fr]"
      }`}
    >
      <Reveal className={reverse ? "order-2 lg:order-1" : ""}>
        <p className="kicker">{kicker}</p>
        <h2 className="mt-3 font-serif text-[2.1rem] font-semibold leading-tight tracking-tight sm:text-[2.6rem]">
          {title}
        </h2>
        <p className="mt-5 max-w-lg text-[1.05rem] leading-relaxed text-[var(--sumi-soft)]">
          {body}
        </p>
        {children}
      </Reveal>

      <Reveal i={1} className={`app-frame ${reverse ? "order-1 lg:order-2" : ""}`}>
        <img src={img} alt={alt} width={3364} height={2044} />
      </Reveal>
    </section>
  );
}

const providers = ["Anthropic", "OpenAI", "Google", "OpenRouter", "Ollama", "Local models"];

function Providers() {
  return (
    <Showcase
      id="providers"
      kicker="Bring your own models"
      title="Cloud when you want it. Local when you don't."
      body="Add your own API keys or point Hanoki at a local runtime. Every model you enable is a tap away — and your keys stay in the OS keychain, never synced anywhere."
      img="/shot-providers.png"
      alt="Hanoki provider settings: a searchable list of models you can enable per provider"
    >
      <div className="mt-7 flex flex-wrap gap-2.5">
        {providers.map((p) => (
          <span
            key={p}
            className="chip px-4 py-2 text-[0.9rem] font-medium text-[var(--sumi-soft)]"
          >
            {p}
          </span>
        ))}
      </div>
    </Showcase>
  );
}

function Sumi() {
  return (
    <Showcase
      id="sumi"
      kicker="A gentle assist"
      title="Sumi helps — only when you ask."
      body="Little AI-assisted actions woven through the app: refine a message, generate a chat title, keep things tidy. Pick the model that powers them. No autocomplete jumping at you, no noise."
      img="/shot-sumi.png"
      alt="Hanoki Sumi settings: toggles for prompt actions and title generation"
      reverse
    />
  );
}

function Branching() {
  return (
    <Showcase
      kicker="When one answer isn't enough"
      title="Explore a branch, keep the original."
      body="Fork any message to try another angle or another model, and Hanoki keeps every path as a live graph — so you can wander without losing the thread. There when you need it, invisible when you don't."
      img="/shot-graph.png"
      alt="Hanoki graph view: a conversation branching into multiple assistant and user messages"
    >
      <div className="mt-6 inline-flex items-center gap-2 text-[0.95rem] font-medium text-[var(--moss-deep)]">
        <GitBranch className="size-4" strokeWidth={1.9} />
        Branch, compare, and backtrack — nothing lost
      </div>
    </Showcase>
  );
}

function CallToAction() {
  return (
    <section className="page-wrap py-20">
      <Reveal className="cta-band relative overflow-hidden rounded-3xl px-8 py-16 text-center sm:px-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(560px 280px at 50% -20%, var(--cta-glow), transparent 70%)",
          }}
        />
        <img
          src="/hanoki-mark.png"
          alt=""
          className="relative mx-auto mb-6 size-14"
          draggable={false}
        />
        <h2 className="relative font-serif text-[2.1rem] font-semibold leading-tight tracking-tight text-[var(--cta-fg)] sm:text-[2.7rem]">
          Bring a little calm to your chats.
        </h2>
        <p className="relative mx-auto mt-4 max-w-lg text-[1.02rem] leading-relaxed text-[var(--cta-dim)]">
          A desktop AI app that stays out of the way and keeps your work local. Early, honest, and
          moving fast.
        </p>
        <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button
            size="lg"
            asChild
            className="bg-[var(--cta-fg)] text-[var(--cta-bg)] shadow-sm hover:bg-white hover:text-[var(--cta-bg)]"
          >
            <a href={RELEASES} target="_blank" rel="noreferrer">
              Download Hanoki
              <ArrowRight />
            </a>
          </Button>
          <Button
            size="lg"
            variant="outline"
            asChild
            className="border-white/20 bg-white/5 text-[var(--cta-fg)] hover:bg-white/10 hover:text-white"
          >
            <a href={DISCORD} target="_blank" rel="noreferrer">
              Join the Discord
            </a>
          </Button>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="site-footer mt-6">
      <div className="page-wrap flex flex-col items-center justify-between gap-6 py-10 sm:flex-row">
        <Wordmark />
        <nav className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-[0.9rem] text-[var(--sumi-soft)]">
          <a className="nav-link" href={GITHUB} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a className="nav-link" href={RELEASES} target="_blank" rel="noreferrer">
            Releases
          </a>
          <a className="nav-link" href={DISCORD} target="_blank" rel="noreferrer">
            Discord
          </a>
          <a className="nav-link" href="https://hanoki.app" target="_blank" rel="noreferrer">
            hanoki.app
          </a>
        </nav>
        <p className="text-[0.82rem] text-[var(--sumi-faint)]">MIT · made with care</p>
      </div>
    </footer>
  );
}
