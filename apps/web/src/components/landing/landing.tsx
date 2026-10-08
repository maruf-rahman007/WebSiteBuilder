import { ArrowUpRight, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { PromptComposer } from '../chat/prompt-composer';
import { Logo } from '../ui/logo';

const EXAMPLES = [
  {
    label: 'SaaS landing page',
    prompt:
      'A landing page for an AI note-taking SaaS with hero, features grid, pricing tiers and FAQ accordion.',
  },
  {
    label: 'Kanban board',
    prompt:
      'A kanban board with drag-and-drop between To do, In progress and Done columns, persisted to localStorage.',
  },
  {
    label: 'Finance dashboard',
    prompt:
      'A personal finance dashboard with a spending chart, recent transactions table and budget progress cards.',
  },
  {
    label: 'Weather app',
    prompt:
      'A weather app that searches cities with the Open-Meteo API and shows a 7-day forecast with icons.',
  },
];

export function Landing() {
  const [prompt, setPrompt] = useState('');

  return (
    <main className="relative flex min-h-full flex-col items-center overflow-hidden px-4">
      {/* Ambient background */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-20%] left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-accent/20 blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(var(--color-line)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
      </div>

      <header className="relative flex w-full max-w-5xl items-center gap-2.5 py-5">
        <Logo />
        <span className="text-sm font-semibold">Website Builder</span>
      </header>

      <section className="relative flex w-full max-w-2xl flex-1 flex-col justify-center pb-24">
        <div className="mb-8 text-center">
          <span className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/60 px-3 py-1 text-xs text-fg-muted backdrop-blur">
            <Sparkles className="h-3 w-3 text-accent" /> React apps, built and running in your
            browser
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            What do you want to build?
          </h1>
          <p className="mt-3 text-fg-muted text-balance">
            Describe it. Watch every file get written, then edit the code and see changes live.
          </p>
        </div>

        <PromptComposer
          variant="hero"
          value={prompt}
          onValueChange={setPrompt}
          placeholder="A habit tracker with streaks, a calendar heatmap and dark mode…"
          autoFocus
        />

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example.label}
              type="button"
              onClick={() => setPrompt(example.prompt)}
              className="group inline-flex items-center gap-1 rounded-full border border-line bg-surface/60 px-3 py-1.5 text-xs text-fg-muted backdrop-blur transition-colors hover:border-line-strong hover:text-fg"
            >
              {example.label}
              <ArrowUpRight className="h-3 w-3 opacity-50 transition-opacity group-hover:opacity-100" />
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
