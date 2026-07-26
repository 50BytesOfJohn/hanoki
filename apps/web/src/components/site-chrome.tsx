import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Github, Moon, Sun } from "lucide-react";

import { Button } from "#/components/ui/button";
import { DISCORD, GITHUB, LICENSE_URL, RELEASES } from "#/lib/seo";

/** Scroll-linked reveal, done with a native `animation-timeline: view()` in
 *  styles.css. Browsers without it simply render the content — unlike a JS
 *  reveal, nothing can leave the page stuck at opacity 0. `i` staggers
 *  siblings by nudging the animation range. */
export function Reveal({
  children,
  i = 0,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  i?: number;
  className?: string;
  as?: "div" | "li" | "section";
}) {
  return (
    <Tag className={`reveal ${className ?? ""}`} style={{ "--i": i } as React.CSSProperties}>
      {children}
    </Tag>
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
      aria-label="Toggle colour theme"
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

/** Anchor into a section of the home page. Hrefs stay absolute (`/#features`)
 *  so they're crawlable and work from any page; only when we're already on the
 *  target page do we take over the scroll, because the router's scroll
 *  restoration reacts to history changes and would yank the page back
 *  mid-scroll. */
export function JumpLink({
  href,
  className,
  children,
  ...rest
}: React.ComponentProps<"a"> & { href: string }) {
  return (
    <a
      {...rest}
      href={href}
      className={className}
      onClick={(e) => {
        const [path, hash] = href.split("#");
        if ((path || "/") !== window.location.pathname) return; // let the browser navigate
        const target = hash ? document.getElementById(hash) : document.body;
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
    >
      {children}
    </a>
  );
}

export function Wordmark({ className, height = "h-8" }: { className?: string; height?: string }) {
  // background-keyed to transparent from the supplied assets; swap per theme
  return (
    <Link to="/" className={`inline-flex items-center ${className ?? ""}`} aria-label="Hanoki home">
      <img
        src="/wordmark-light.webp"
        alt="Hanoki"
        width={480}
        height={130}
        className={`${height} w-auto select-none dark:hidden`}
        draggable={false}
      />
      <img
        src="/wordmark-dark.webp"
        alt="Hanoki"
        width={480}
        height={126}
        className={`hidden ${height} w-auto select-none dark:block`}
        draggable={false}
      />
    </Link>
  );
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header id="top" className="site-nav" data-scrolled={scrolled}>
      <div className="washi drop-in mx-auto grid w-[min(1120px,calc(100%-1.5rem))] grid-cols-[auto_1fr_auto] items-center rounded-full py-2 pl-5 pr-2.5">
        <Wordmark height="h-6" />
        <nav
          aria-label="Main"
          className="hidden items-center justify-center gap-7 text-[0.9rem] font-medium md:flex"
        >
          <JumpLink className="nav-link" href="/#features">
            Features
          </JumpLink>
          <JumpLink className="nav-link" href="/#models">
            Models
          </JumpLink>
          <JumpLink className="nav-link" href="/#faq">
            FAQ
          </JumpLink>
          <Link className="nav-link" to="/download">
            Download
          </Link>
        </nav>
        <div className="col-start-3 flex items-center gap-1.5">
          <ThemeToggle />
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <a href={GITHUB} target="_blank" rel="noreferrer">
              <Github />
              GitHub
            </a>
          </Button>
          <Button size="sm" asChild className="rounded-full">
            <Link to="/download">Download</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

type FooterLink =
  /** A route of this site — rendered with the router's `Link`. */
  | { label: string; to: "/" | "/download" | "/privacy" }
  /** An anchor on the home page, or an off-site URL. */
  | { label: string; href: string };

const footerLinks: Array<{ title: string; links: Array<FooterLink> }> = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "Models", href: "/#models" },
      { label: "FAQ", href: "/#faq" },
      { label: "Download for macOS", to: "/download" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "GitHub", href: GITHUB },
      { label: "Releases", href: RELEASES },
      { label: "Discord", href: DISCORD },
      { label: "Privacy", to: "/privacy" },
      { label: "Licence", href: LICENSE_URL },
    ],
  },
];

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="page-wrap grid gap-10 py-14 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-xs text-[0.92rem] leading-relaxed text-[var(--sumi-soft)]">
            A local-first desktop app for AI chat that branches. Built in the open, one release at a
            time.
          </p>
        </div>
        {footerLinks.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <p className="text-[0.82rem] font-semibold text-[var(--sumi-faint)]">{group.title}</p>
            <ul className="mt-4 space-y-2.5 text-[0.92rem]">
              {group.links.map((link) => (
                <li key={link.label}>
                  {"to" in link ? (
                    <Link className="nav-link" to={link.to}>
                      {link.label}
                    </Link>
                  ) : link.href.startsWith("/") ? (
                    <JumpLink className="nav-link" href={link.href}>
                      {link.label}
                    </JumpLink>
                  ) : (
                    <a className="nav-link" href={link.href} target="_blank" rel="noreferrer">
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="page-wrap flex flex-col items-center justify-between gap-2 border-t border-[var(--hairline)] py-6 text-[0.82rem] text-[var(--sumi-faint)] sm:flex-row">
        <p>MIT licensed · made with care</p>
        <p>hanoki.app</p>
      </div>
    </footer>
  );
}
