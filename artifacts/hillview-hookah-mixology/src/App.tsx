import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Calculator, Check, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Edit3, Flame, GlassWater, Heart, Home as HomeIcon, Leaf, LogOut, PackageOpen, Plus, RotateCcw, Send, Settings2, Sparkles, Star, Trash2, Wind, X } from 'lucide-react';
import { Link, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { AVOID_OPTIONS, TASTE_OPTIONS, type Flavour, type Premix, type Strength } from './data/flavours';
import { CATALOG_STORAGE_KEY, readCatalog } from './logic/catalog';
import { getRecommendations, type Recommendation } from './logic/recommendationEngine';
import { getBatchRecipe } from './logic/recipe';
import { getWhatsAppUrl } from './logic/whatsapp';
import type { Catalog, Choice, CustomLevel, FinderAnswers } from './types';

const STORAGE_KEY = 'mixology-pro-current-choice';

async function fileToImageDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  if (file.size > 6 * 1024 * 1024) throw new Error('Please choose an image smaller than 6 MB.');
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('That image could not be read.'));
      img.src = objectUrl;
    });
    const maxSize = 1000;
    const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing is unavailable.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const emptyAnswers: FinderAnswers = {
  tastes: [],
  strength: 'Medium',
  favouriteIds: [],
  avoid: [],
  surprise: false,
};

function readChoice(): Choice | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as Partial<Choice> & { favouriteId?: string | null };
    return {
      ...parsed,
      mixId: parsed.mixId ?? 'custom-hillview-mix',
      mixName: parsed.mixName ?? 'Mixology PRO Custom Mix',
      flavourIds: parsed.flavourIds ?? [],
      tastes: parsed.tastes ?? [],
      strength: parsed.strength ?? 'Medium',
      favouriteIds: parsed.favouriteIds ?? (parsed.favouriteId ? [parsed.favouriteId] : []),
      avoid: parsed.avoid ?? [],
      customizations: parsed.customizations ?? {},
      remarks: parsed.remarks ?? '',
      chosenAt: parsed.chosenAt ?? new Date().toISOString(),
    } as Choice;
  } catch {
    return null;
  }
}

function openWhatsApp(choice: Choice, catalog: Catalog) {
  window.open(getWhatsAppUrl(choice, catalog.flavours, catalog.premixes), '_blank', 'noopener,noreferrer');
}

function FlavourVisual({ flavour, size = 'md' }: { flavour: Flavour; size?: 'sm' | 'md' | 'lg' }) {
  const [imageFailed, setImageFailed] = useState(false);
  const sizeClass = size === 'lg' ? 'h-32 w-32' : size === 'sm' ? 'h-12 w-12' : 'h-20 w-20';
  return (
    <div
      className={`ingredient-orb relative overflow-hidden ${sizeClass} shrink-0 rounded-[1.35rem] border border-white/40 shadow-inner`}
      style={{ '--orb-light': flavour.orb.light, '--orb-mid': flavour.orb.mid, '--orb-deep': flavour.orb.deep } as CSSProperties}
      role="img"
      aria-label={`${flavour.name} ingredient visual`}
      data-testid={`visual-flavour-${flavour.id}`}
    >
      {flavour.photoUrl && !imageFailed && (
        <img
          src={flavour.photoUrl}
          alt={`${flavour.name} ingredient`}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      )}
      <span className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-white/10" />
      <div className="flex h-full w-full items-end justify-end p-2">
        <span className="rounded-full bg-black/15 px-2 py-1 font-mono text-[9px] text-white/90">{flavour.name.split(' ').map((word) => word[0]).join('')}</span>
      </div>
    </div>
  );
}

function PremixVisual({ premix, size = 'md' }: { premix: Premix; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'h-32 w-32' : size === 'sm' ? 'h-16 w-16' : 'h-24 w-24';
  const palettes = [
    ['hsl(218 75% 24%)', 'hsl(277 70% 45%)', 'hsl(193 90% 55%)'],
    ['hsl(15 75% 25%)', 'hsl(39 88% 52%)', 'hsl(5 90% 58%)'],
    ['hsl(151 62% 20%)', 'hsl(177 70% 38%)', 'hsl(87 75% 52%)'],
    ['hsl(321 62% 24%)', 'hsl(279 72% 47%)', 'hsl(44 92% 60%)'],
    ['hsl(9 62% 22%)', 'hsl(334 72% 48%)', 'hsl(51 91% 58%)'],
    ['hsl(193 73% 22%)', 'hsl(214 82% 44%)', 'hsl(166 73% 48%)'],
  ];
  const seed = premix.name.split('').reduce((total, char) => total + char.charCodeAt(0), 0);
  const [from, mid, accent] = palettes[seed % palettes.length];
  return (
    <div
      className={`relative ${sizeClass} shrink-0 overflow-hidden rounded-[1.35rem] border border-white/25 shadow-inner`}
      style={{ background: `radial-gradient(circle at 78% 22%, ${accent} 0, transparent 27%), radial-gradient(circle at 18% 82%, ${mid} 0, transparent 34%), linear-gradient(135deg, ${from}, #111827)` }}
      role="img"
      aria-label={`${premix.name} premix graphic`}
    >
      <span className="absolute -right-5 -top-5 h-14 w-14 rounded-full border border-white/25" />
      <span className="absolute -bottom-7 -left-4 h-20 w-20 rounded-full border border-white/20" />
      <span className="absolute left-1/2 top-1/2 h-px w-24 -rotate-45 bg-white/20" />
      <span className="absolute left-3 top-3 h-2 w-2 rounded-full bg-white/70 shadow-[12px_8px_0_rgba(255,255,255,.35),26px_-3px_0_rgba(255,255,255,.2)]" />
      <div className="absolute inset-x-2 bottom-2 rounded-xl bg-black/30 px-2 py-1.5 backdrop-blur-sm">
        <p className="hv-display truncate text-center text-[11px] leading-tight text-white">{premix.name}</p>
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <Link href="/" className="flex items-center gap-3" data-testid="link-brand-home">
      <span className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-secondary shadow-lg shadow-primary/15">
        <Flame size={19} strokeWidth={1.8} />
        <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-secondary" />
      </span>
      <span className="leading-none">
        <span className="block font-mono text-[10px] tracking-[0.18em] text-muted-foreground">MIXOLOGY PRO</span>
        <span className="hv-display block text-lg">Mixology PRO</span>
      </span>
    </Link>
  );
}

function BottomNav({ choice }: { choice: Choice | null }) {
  const [location] = useLocation();
  const items = [
    { href: '/', label: 'Home', icon: HomeIcon },
    { href: '/find', label: 'Find My Hookah', icon: Sparkles },
    { href: '/choice', label: 'My Choice', icon: Heart, count: choice ? '1' : undefined },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/70 bg-background/90 px-3 pb-[max(.8rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl md:bottom-5 md:left-1/2 md:right-auto md:w-[480px] md:-translate-x-1/2 md:rounded-2xl md:border md:shadow-2xl md:shadow-primary/10" aria-label="Primary navigation">
      <div className="mx-auto grid max-w-lg grid-cols-3 gap-1">
        {items.map(({ href, label, icon: Icon, count }) => {
          const active = location === href || (href === '/find' && location.startsWith('/find'));
          return (
            <Link href={href} className={`relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[10px] font-semibold transition-colors ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`} key={href}>
              <Icon size={17} strokeWidth={active ? 2.4 : 1.8} />
              <span>{label}</span>
              {count && <span className="absolute right-5 top-1 h-2 w-2 rounded-full bg-accent" aria-label="Saved choice" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function AppShell({ children, choice }: { children: ReactNode; choice: Choice | null }) {
  return (
    <div className="hv-app hv-noise">
      <header className="hv-shell flex items-center justify-between py-5 md:py-7">
        <BrandMark />
        <div className="flex items-center gap-3">
          <Link href="/manage" className="flex min-h-9 items-center gap-2 rounded-xl px-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground" data-testid="link-manage-catalog">
            <Settings2 size={15} />
            <span className="hidden sm:inline">Manage</span>
          </Link>
          <div className="hidden items-center gap-2 text-right md:flex">
            <CircleHelp size={16} className="text-secondary" />
            <span className="text-xs text-muted-foreground">A little guidance for your next cloud</span>
          </div>
        </div>
      </header>
      {children}
      <BottomNav choice={choice} />
    </div>
  );
}

function SectionEyebrow({ children }: { children: ReactNode }) {
  return <p className="hv-mono mb-4 text-[10px] font-medium text-accent">{children}</p>;
}


function HomeIntroAnimation() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 4200);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[90] overflow-hidden bg-[#090909]" aria-label="Mixology PRO introduction" role="status">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_65%,rgba(255,255,255,.08),transparent_34%),linear-gradient(180deg,#111_0%,#050505_100%)]" />
      <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 translate-y-[18%] animate-[mixology-hookah-rise_1.2s_ease-out_both]">
        <svg width="150" height="230" viewBox="0 0 150 230" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M75 22C61 22 51 31 51 44C51 57 61 64 75 64C89 64 99 57 99 44C99 31 89 22 75 22Z" fill="rgba(190,190,190,.18)" stroke="rgba(255,255,255,.75)" strokeWidth="2"/>
          <path d="M66 64H84L88 119C89 133 83 143 75 143C67 143 61 133 62 119L66 64Z" fill="rgba(180,180,180,.12)" stroke="rgba(255,255,255,.7)" strokeWidth="2"/>
          <path d="M75 143V196" stroke="rgba(255,255,255,.75)" strokeWidth="4" strokeLinecap="round"/>
          <path d="M42 198H108C112 198 115 201 115 205V208H35V205C35 201 38 198 42 198Z" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.7)" strokeWidth="2"/>
          <path d="M88 58C105 54 116 60 121 71C126 82 119 94 106 98" stroke="rgba(255,255,255,.7)" strokeWidth="3" strokeLinecap="round"/>
          <path d="M121 71C133 72 139 80 137 89C135 98 127 102 119 100" stroke="rgba(255,255,255,.55)" strokeWidth="2.5" strokeLinecap="round"/>
          <circle cx="75" cy="44" r="8" fill="rgba(255,255,255,.14)" stroke="rgba(255,255,255,.6)" />
        </svg>
      </div>

      <div className="absolute left-1/2 top-[42%] z-10 h-40 w-40 -translate-x-1/2 rounded-full bg-white/10 blur-3xl animate-[mixology-smoke-core_3.8s_ease-out_both]" />
      <div className="absolute left-[42%] top-[38%] h-32 w-32 rounded-full bg-white/[.07] blur-2xl animate-[mixology-smoke-1_3.7s_ease-out_both]" />
      <div className="absolute left-[54%] top-[35%] h-44 w-44 rounded-full bg-white/[.08] blur-3xl animate-[mixology-smoke-2_4s_ease-out_both]" />
      <div className="absolute left-[34%] top-[48%] h-52 w-52 rounded-full bg-white/[.06] blur-3xl animate-[mixology-smoke-3_4.1s_ease-out_both]" />
      <div className="absolute left-[58%] top-[47%] h-60 w-60 rounded-full bg-white/[.055] blur-3xl animate-[mixology-smoke-4_4.2s_ease-out_both]" />

      <div className="absolute bottom-12 left-1/2 z-30 -translate-x-1/2 text-center animate-[mixology-title-in_1s_.7s_ease-out_both]">
        <p className="font-mono text-[10px] tracking-[.35em] text-white/40">WELCOME TO</p>
        <p className="mt-2 font-serif text-4xl font-semibold tracking-tight text-white">Mixology PRO</p>
      </div>

      <style>{`
        @keyframes mixology-hookah-rise {
          from { opacity: 0; transform: translate(-50%, 30%) scale(.94); }
          to { opacity: 1; transform: translate(-50%, 18%) scale(1); }
        }
        @keyframes mixology-smoke-core {
          0% { opacity: 0; transform: translate(-50%, 35%) scale(.35); }
          25% { opacity: .55; transform: translate(-50%, 0) scale(1); }
          100% { opacity: .08; transform: translate(-50%, -260%) scale(3.6); }
        }
        @keyframes mixology-smoke-1 {
          0% { opacity: 0; transform: translate(0, 35%) scale(.3); }
          30% { opacity: .5; }
          100% { opacity: 0; transform: translate(-70%, -220%) scale(3.5); }
        }
        @keyframes mixology-smoke-2 {
          0% { opacity: 0; transform: translate(0, 35%) scale(.25); }
          25% { opacity: .55; }
          100% { opacity: 0; transform: translate(70%, -240%) scale(3.8); }
        }
        @keyframes mixology-smoke-3 {
          0% { opacity: 0; transform: translate(0, 20%) scale(.25); }
          28% { opacity: .42; }
          100% { opacity: 0; transform: translate(-110%, -170%) scale(3.2); }
        }
        @keyframes mixology-smoke-4 {
          0% { opacity: 0; transform: translate(0, 20%) scale(.25); }
          30% { opacity: .4; }
          100% { opacity: 0; transform: translate(120%, -180%) scale(3.4); }
        }
        @keyframes mixology-title-in {
          from { opacity: 0; transform: translate(-50%, 12px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          [class*="animate-[mixology-"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

function HomePage({ onFind, onSurprise, catalog }: { onFind: () => void; onSurprise: () => void; catalog: Catalog }) {
  const [introEnabled] = useState(() => true);
  const popular = ['Fresh', 'Fruity', 'Cooling', 'Exotic'];
  const shelfFlavours = catalog.flavours.slice(0, 8);
  const shelfPremixes = catalog.premixes.slice(0, 4);
  return (
    <main className="hv-shell hv-page-in">
      {introEnabled && <HomeIntroAnimation />}
      <section className="relative overflow-hidden rounded-[2rem] bg-primary px-6 py-12 text-primary-foreground shadow-2xl shadow-primary/20 md:px-14 md:py-20">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full border border-secondary/20 bg-secondary/10 blur-sm" />
        <div className="absolute -bottom-28 left-1/3 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute right-[12%] top-[34%] hidden h-36 w-36 rounded-full border border-primary-foreground/10 md:block" />
        <div className="relative max-w-2xl">
          <SectionEyebrow>MIXOLOGY PRO / TABLESIDE GUIDE 01</SectionEyebrow>
          <p className="mb-5 max-w-md text-sm leading-6 text-primary-foreground/65">A quiet way to find a flavour you will actually enjoy.</p>
          <h1 className="hv-display text-[3.4rem] leading-[.98] tracking-[-.055em] md:text-[5.6rem]">Find Your<br /><span className="text-secondary">Perfect Hookah.</span></h1>
          <p className="mt-7 max-w-md text-base leading-7 text-primary-foreground/75 md:text-lg">Tell us what you like. We’ll create the mix.</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <button className="hv-press flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-secondary px-6 font-bold text-secondary-foreground shadow-lg shadow-secondary/20" onClick={onFind} data-testid="button-find-my-hookah">
              FIND MY HOOKAH <ArrowRight size={18} />
            </button>
            <button className="hv-press flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-primary-foreground/20 px-6 text-sm font-semibold text-primary-foreground hover:bg-primary-foreground/10" onClick={onSurprise} data-testid="button-surprise-me">
              <Sparkles size={17} /> SURPRISE ME
            </button>
          </div>
        </div>
        <div className="relative mt-14 flex items-end justify-between border-t border-primary-foreground/15 pt-5 md:absolute md:bottom-8 md:right-12 md:mt-0 md:block md:border-0 md:pt-0">
          <div className="hidden text-right md:block">
            <p className="hv-mono text-[9px] text-primary-foreground/40">THE MIXOLOGY PRO NOTE</p>
            <p className="mt-2 max-w-[150px] text-sm leading-5 text-primary-foreground/70">No guesswork. No wrong answers.</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-primary-foreground/45 md:mt-16">
            <span className="h-2 w-2 rounded-full bg-secondary" /> Guided in under a minute
          </div>
        </div>
      </section>

      <section className="py-14 md:py-20">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <SectionEyebrow>START WITH A MOOD</SectionEyebrow>
            <h2 className="hv-display text-4xl md:text-5xl">What sounds good?</h2>
          </div>
          <p className="max-w-xs text-sm leading-6 text-muted-foreground">Tap a starting point, or let the expert take the first pour.</p>
        </div>
        <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
          {popular.map((taste, index) => (
            <button key={taste} className="hv-press hv-surface group flex min-h-28 flex-col justify-between rounded-2xl p-4 text-left hover:-translate-y-1 hover:border-secondary" onClick={onFind} data-testid={`button-popular-${taste.toLowerCase()}`}>
              <span className={`flex h-8 w-8 items-center justify-center rounded-full ${index % 2 ? 'bg-accent/12 text-accent' : 'bg-secondary/20 text-secondary-foreground'}`}>
                {index === 0 ? <Wind size={16} /> : index === 1 ? <Leaf size={16} /> : index === 2 ? <GlassWater size={16} /> : <Star size={16} />}
              </span>
              <span className="flex items-center justify-between text-sm font-semibold">{taste}<ChevronRight size={15} className="text-muted-foreground transition-transform group-hover:translate-x-1" /></span>
            </button>
          ))}
        </div>
      </section>

      <section className="border-y border-border/70 py-12 md:py-16">
        <div className="flex items-end justify-between gap-4">
          <div>
            <SectionEyebrow>THE FLAVOUR SHELF</SectionEyebrow>
            <h2 className="hv-display text-4xl md:text-5xl">Explore the menu.</h2>
          </div>
          <button onClick={onFind} className="hidden items-center gap-2 text-xs font-bold uppercase tracking-wider text-secondary md:flex">See all flavours <ArrowRight size={15} /></button>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {shelfFlavours.map((flavour, index) => (
            <button key={flavour.id} onClick={onFind} className="hv-press group overflow-hidden rounded-3xl border border-border bg-card/60 p-3 text-left hover:-translate-y-1 hover:border-secondary" data-testid={`button-shelf-${flavour.id}`}>
              <div className="relative overflow-hidden rounded-[1.35rem] bg-muted">
                <FlavourVisual flavour={flavour} size="lg" />
                <span className="absolute left-2 top-2 rounded-full bg-background/75 px-2 py-1 font-mono text-[8px] uppercase tracking-wider text-foreground backdrop-blur">{String(index + 1).padStart(2, '0')}</span>
              </div>
              <div className="px-1 pb-1 pt-3">
                <p className="truncate text-sm font-bold">{flavour.name}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{flavour.tags.slice(0, 2).join(' · ')}</p>
              </div>
            </button>
          ))}
        </div>
        <button onClick={onFind} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-border py-3 text-xs font-bold uppercase tracking-wider md:hidden">Explore all flavours <ArrowRight size={15} /></button>
      </section>

      <section className="py-14 md:py-20">
        <div className="grid gap-8 md:grid-cols-[.8fr_1.2fr] md:items-end">
          <div>
            <SectionEyebrow>SIGNATURE BLENDS</SectionEyebrow>
            <h2 className="hv-display text-4xl md:text-5xl">Ready-made, never boring.</h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">Start with one of our balanced premixes, or open the finder and build something around your own taste.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {shelfPremixes.map((premix) => (
              <button key={premix.id} onClick={onFind} className="hv-press group flex items-center gap-3 rounded-3xl border border-border bg-card/60 p-3 text-left hover:-translate-y-1 hover:border-secondary" data-testid={`button-premix-shelf-${premix.id}`}>
                <PremixVisual premix={premix} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{premix.name}</span>
                  <span className="mt-1 block truncate text-[10px] text-muted-foreground">{premix.profile.slice(0, 2).join(' · ')}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[2rem] bg-primary px-6 py-12 text-primary-foreground md:px-12 md:py-16">
        <div className="absolute -right-16 -top-16 h-52 w-52 rounded-full border border-secondary/20" />
        <div className="absolute -bottom-24 left-1/2 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <SectionEyebrow>BUILD YOUR OWN</SectionEyebrow>
            <h2 className="hv-display max-w-2xl text-4xl leading-tight md:text-5xl">Not sure what to choose?</h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-primary-foreground/65">Answer four quick questions and Mixology PRO will narrow the menu down to three directions made for your taste.</p>
          </div>
          <button onClick={onFind} className="hv-press flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-secondary px-6 font-bold text-secondary-foreground">OPEN THE FINDER <ArrowRight size={18} /></button>
        </div>
      </section>

      <section className="grid gap-5 border-b border-border/70 py-14 md:grid-cols-3 md:py-20">
        {[
          ['01', 'Choose a mood', 'Fruity, fresh, sweet, floral, cooling — start wherever your taste starts.'],
          ['02', 'Fine-tune it', 'Pick flavours, adjust the balance, and optionally set exact percentages.'],
          ['03', 'Send the order', 'Save your final mix and send the recipe directly to the Mixology PRO team.'],
        ].map(([number, title, copy]) => (
          <div className="hv-surface rounded-3xl p-6" key={number}>
            <span className="font-mono text-xs text-secondary">{number}</span>
            <h3 className="mt-10 text-lg font-bold">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
          </div>
        ))}
      </section>

      <section className="py-14 pb-28 md:py-20 md:pb-32">
        <div className="mx-auto max-w-3xl text-center">
          <SectionEyebrow>QUESTIONS, BEFORE THE CLOUD</SectionEyebrow>
          <h2 className="hv-display text-4xl md:text-5xl">A few things worth knowing.</h2>
        </div>
        <div className="mx-auto mt-8 max-w-3xl divide-y divide-border rounded-3xl border border-border bg-card/50">
          {[
            ['Do I need to know flavour names?', 'No. Start with taste words and the finder will narrow things down for you.'],
            ['Can I make my own mix?', 'Yes. You can choose your own flavours and optionally use the percentage sliders for an exact recipe.'],
            ['Can I change my mind?', 'Absolutely. Your saved choice can be edited before you send it to the team.'],
          ].map(([question, answer]) => (
            <details key={question} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold">
                {question}<ChevronDown size={17} className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
function StepHeader({ step, total, onBack }: { step: number; total: number; onBack?: () => void }) {
  return (
    <div className="mb-8">
      <div className="mb-5 flex items-center justify-between">
        {onBack ? <button className="flex min-h-10 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground" onClick={onBack} data-testid="button-finder-back"><ArrowLeft size={17} /> Back</button> : <span />}
        <span className="hv-mono text-[10px] text-muted-foreground">STEP {step} / {total}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-secondary transition-all duration-500" style={{ width: `${(step / total) * 100}%` }} />
      </div>
    </div>
  );
}

function FinderPage({ onSave, editChoice, launch, catalog }: { onSave: (choice: Choice) => void; editChoice: Choice | null; launch: 'fresh' | 'surprise' | 'edit'; catalog: Catalog }) {
  const [stage, setStage] = useState<'taste' | 'strength' | 'favourite' | 'results' | 'customize' | 'final'>('taste');
  const [answers, setAnswers] = useState<FinderAnswers>(emptyAnswers);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customizations, setCustomizations] = useState<Record<string, CustomLevel>>({});
  const [percentages, setPercentages] = useState<Record<string, number>>({});
  const [percentageMode, setPercentageMode] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [selectedMixName, setSelectedMixName] = useState('');
  const [selectedMixId, setSelectedMixId] = useState('custom-hillview-mix');
  const [activeDetail, setActiveDetail] = useState<Recommendation | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (launch === 'edit' && editChoice) {
      setAnswers({ tastes: editChoice.tastes, strength: editChoice.strength, favouriteIds: editChoice.favouriteIds, avoid: editChoice.avoid, surprise: false });
      setSelectedIds(editChoice.flavourIds);
      setCustomizations(editChoice.customizations);
      setPercentages(editChoice.percentages ?? {});
      setPercentageMode(Boolean(editChoice.percentages));
      setRemarks(editChoice.remarks);
      setSelectedMixName(editChoice.mixName);
      setSelectedMixId(editChoice.mixId);
      setStage('customize');
    } else if (launch === 'surprise') {
      const surpriseAnswers = { ...emptyAnswers, surprise: true };
      setAnswers(surpriseAnswers);
      setStage('results');
      setSelectedIds([]);
      setCustomizations({});
      setPercentages({});
      setPercentageMode(false);
      setSelectedMixName('');
      setSelectedMixId('custom-mixology-pro-mix');
    } else {
      setStage('taste');
      setAnswers(emptyAnswers);
      setSelectedIds([]);
      setCustomizations({});
      setPercentages({});
      setPercentageMode(false);
      setRemarks('');
      setSelectedMixName('');
      setSelectedMixId('custom-hillview-mix');
    }
  }, [launch, editChoice]);

  const recommendations = useMemo(() => getRecommendations(answers, catalog.flavours, catalog.premixes), [answers, catalog]);
  const selectedFlavours = selectedIds.map((id) => catalog.flavours.find((flavour) => flavour.id === id)).filter((flavour): flavour is Flavour => Boolean(flavour));
  const finalChoice: Choice = {
    mixId: selectedMixId,
    mixName: selectedMixName || 'Mixology PRO Custom Mix',
    flavourIds: selectedIds,
    tastes: answers.tastes,
    strength: answers.strength,
    favouriteIds: answers.favouriteIds,
    avoid: answers.avoid,
    customizations,
    ...(percentageMode ? { percentages } : {}),
    remarks,
    chosenAt: new Date().toISOString(),
  };

  const updateCustomization = (id: string, value: CustomLevel) => setCustomizations((current) => ({ ...current, [id]: value }));

  const getDefaultPercentages = (ids: string[]) => {
    const recommendation = recommendations.find((item) => item.mix.id === selectedMixId);
    if (recommendation && ids.every((id) => recommendation.mix.recipe.some((ingredient) => ingredient.flavourId === id))) {
      const total = ids.reduce((sum, id) => sum + (recommendation.mix.recipe.find((ingredient) => ingredient.flavourId === id)?.percentage ?? 0), 0);
      if (total > 0) return Object.fromEntries(ids.map((id) => [id, Math.round(((recommendation.mix.recipe.find((ingredient) => ingredient.flavourId === id)?.percentage ?? 0) / total) * 100)]));
    }
    const equal = ids.length ? Math.floor(100 / ids.length) : 0;
    const remainder = ids.length ? 100 - equal * ids.length : 0;
    return Object.fromEntries(ids.map((id, index) => [id, equal + (index === ids.length - 1 ? remainder : 0)]));
  };

  const updatePercentage = (id: string, value: number) => {
    setPercentages((current) => ({ ...current, [id]: Math.max(0, Math.min(100, Math.round(value / 5) * 5)) }));
  };

  const percentageTotal = selectedIds.reduce((sum, id) => sum + (percentages[id] ?? 0), 0);
  const percentageReady = !percentageMode || (selectedIds.length > 0 && percentageTotal === 100);
  const chooseRecommendation = (recommendation: Recommendation) => {
    const ids = recommendation.mix.flavourIds;
    setSelectedIds(ids);
    setCustomizations(Object.fromEntries(ids.map((id) => [id, 'Normal'])));
    setPercentages(Object.fromEntries(recommendation.mix.recipe.map((ingredient) => [ingredient.flavourId, ingredient.percentage])));
    setPercentageMode(false);
    setSelectedMixName(recommendation.mix.name);
    setSelectedMixId(recommendation.mix.id);
    setActiveDetail(null);
    setStage('customize');
  };
  const goBack = () => {
    if (stage === 'strength') setStage('taste');
    else if (stage === 'favourite') setStage('strength');
    else if (stage === 'results') setStage('favourite');
    else if (stage === 'customize') setStage('results');
    else if (stage === 'final') setStage('customize');
  };

  return (
    <main className="hv-shell hv-page-in">
      <div className="mx-auto max-w-4xl">
        {stage === 'taste' && (
          <div className="hv-rise">
            <StepHeader step={1} total={4} />
            <SectionEyebrow>FIRST, THE FEELING</SectionEyebrow>
            <h1 className="hv-display max-w-2xl text-4xl leading-tight md:text-6xl">What kind of cloud are you in the mood for?</h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">Pick as many as you like. Think about the first taste you want to notice.</p>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {TASTE_OPTIONS.map((taste) => {
                const selected = answers.tastes.includes(taste);
                return (
                  <button key={taste} className={`hv-press flex min-h-16 items-center justify-between rounded-2xl border px-4 text-left text-sm font-semibold transition-colors ${selected ? 'border-secondary bg-secondary/20 text-primary' : 'border-border bg-card/50 hover:border-secondary/60'}`} onClick={() => setAnswers((current) => ({ ...current, tastes: selected ? current.tastes.filter((item) => item !== taste) : [...current.tastes, taste] }))} aria-pressed={selected} data-testid={`button-taste-${taste.toLowerCase()}`}>
                    {taste}<span className={`flex h-5 w-5 items-center justify-center rounded-full border ${selected ? 'border-secondary bg-secondary text-secondary-foreground' : 'border-muted-foreground/30'}`}>{selected && <Check size={13} />}</span>
                  </button>
                );
              })}
            </div>
            <button className="hv-press mt-8 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 font-bold text-primary-foreground sm:w-auto" onClick={() => setStage('strength')} data-testid="button-next-taste">Continue <ArrowRight size={17} /></button>
          </div>
        )}

        {stage === 'strength' && (
          <div className="hv-rise">
            <StepHeader step={2} total={4} onBack={goBack} />
            <SectionEyebrow>NOW, THE PACE</SectionEyebrow>
            <h1 className="hv-display max-w-2xl text-4xl leading-tight md:text-6xl">How present should the flavour feel?</h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">There is no wrong answer. This only helps us set the volume.</p>
            <div className="mt-10 grid gap-3 md:grid-cols-3">
              {(['Light', 'Medium', 'Strong'] as Strength[]).map((strength) => {
                const selected = answers.strength === strength;
                return (
                  <button key={strength} className={`hv-press relative min-h-36 rounded-3xl border p-5 text-left transition-colors ${selected ? 'border-secondary bg-secondary/18' : 'border-border bg-card/50 hover:border-secondary/60'}`} onClick={() => setAnswers((current) => ({ ...current, strength }))} aria-pressed={selected} data-testid={`button-strength-${strength.toLowerCase()}`}>
                    <span className="flex gap-1.5">
                      {[1, 2, 3].map((dot) => <span className={`h-2.5 w-2.5 rounded-full ${dot <= (strength === 'Light' ? 1 : strength === 'Medium' ? 2 : 3) ? 'bg-secondary' : 'bg-muted'}`} key={dot} />)}
                    </span>
                    <span className="mt-8 block text-lg font-bold">{strength}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{strength === 'Light' ? 'A softer, slower introduction.' : strength === 'Medium' ? 'Balanced and easy to settle into.' : 'Bold enough to hold the room.'}</span>
                    {selected && <Check className="absolute right-5 top-5 text-secondary" size={19} />}
                  </button>
                );
              })}
            </div>
            <button className="hv-press mt-8 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 font-bold text-primary-foreground sm:w-auto" onClick={() => setStage('favourite')} data-testid="button-next-strength">Continue <ArrowRight size={17} /></button>
          </div>
        )}

        {stage === 'favourite' && (
          <div className="hv-rise">
            <StepHeader step={3} total={4} onBack={goBack} />
            <SectionEyebrow>THE FUN DETAIL</SectionEyebrow>
            <h1 className="hv-display max-w-2xl text-4xl leading-tight md:text-6xl">Any flavour you already know you like?</h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">Optional, but useful. Pick any flavours you recognize and we’ll use them as hints. Brands stay out of the way.</p>
            <div className="mt-8 space-y-7">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {catalog.flavours.map((flavour) => {
                      const selected = answers.favouriteIds.includes(flavour.id);
                      return (
                        <button key={flavour.id} className={`hv-press flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${selected ? 'border-secondary bg-secondary/18' : 'border-border bg-card/50 hover:border-secondary/60'}`} onClick={() => setAnswers((current) => ({ ...current, favouriteIds: selected ? current.favouriteIds.filter((id) => id !== flavour.id) : [...current.favouriteIds, flavour.id] }))} aria-pressed={selected} data-testid={`button-favourite-${flavour.id}`}>
                          <FlavourVisual flavour={flavour} size="sm" />
                          <span className="min-w-0"><span className="block truncate text-sm font-bold">{flavour.name}</span><span className="mt-1 block text-[10px] text-muted-foreground">{flavour.tags.slice(0, 2).join(' · ')}</span></span>
                        </button>
                      );
                    })}
              </div>
            </div>
            <div className="mt-10 rounded-3xl border border-border bg-card/60 p-5">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-sm font-bold">Anything you’d rather avoid?</p><p className="mt-1 text-xs leading-5 text-muted-foreground">We’ll quietly keep these out of your first suggestions.</p></div>
                <Leaf size={19} className="text-accent" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {AVOID_OPTIONS.map((avoid) => {
                  const selected = answers.avoid.includes(avoid);
                  return <button key={avoid} className={`rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${selected ? 'border-accent bg-accent/15 text-accent' : 'border-border text-muted-foreground hover:border-accent/50'}`} onClick={() => setAnswers((current) => ({ ...current, avoid: selected ? current.avoid.filter((item) => item !== avoid) : [...current.avoid, avoid] }))} aria-pressed={selected} data-testid={`button-avoid-${avoid.toLowerCase().replaceAll(' ', '-')}`}>{selected && <Check size={12} className="mr-1 inline" />}{avoid}</button>;
                })}
              </div>
            </div>
             <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button className="hv-press flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-primary px-6 font-bold text-primary-foreground" onClick={() => setStage('results')} data-testid="button-see-recommendations">Show my recommendations <ArrowRight size={17} /></button>
              <button className="hv-press flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-border px-6 text-sm font-semibold hover:bg-muted" onClick={() => { setAnswers((current) => ({ ...current, surprise: true })); setStage('results'); }} data-testid="button-favourite-surprise">Surprise me instead <Sparkles size={16} /></button>
            </div>
          </div>
        )}

        {stage === 'results' && (
          <div className="hv-rise">
            <StepHeader step={4} total={4} onBack={goBack} />
            <SectionEyebrow>YOUR MIXOLOGY PRO SHORTLIST</SectionEyebrow>
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div><h1 className="hv-display text-4xl leading-tight md:text-6xl">These feel like you.</h1><p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">Three directions, no scores. Trust the one that makes you curious.</p></div>
              <span className="hv-mono text-[10px] text-muted-foreground">{answers.tastes.length ? answers.tastes.slice(0, 3).join(' · ') : 'A little table-side magic'}</span>
            </div>
            <div className="mt-8 grid gap-4">
              {recommendations.map((recommendation, index) => (
                <article className={`hv-surface hv-press hv-delay-${index + 1} hv-rise rounded-3xl p-5 md:p-7`} key={recommendation.mix.id} data-testid={`card-recommendation-${recommendation.mix.id}`}>
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                    <div className="flex shrink-0"><PremixVisual premix={recommendation.mix} size="lg" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3"><div><p className="hv-mono text-[10px] text-accent">{recommendation.title}</p><h2 className="hv-display mt-1 text-3xl">{recommendation.mix.name}</h2></div><span className="rounded-full bg-muted px-3 py-1 font-mono text-[9px] text-muted-foreground">{recommendation.strength}</span></div>
                      <p className="mt-2 text-xs text-muted-foreground">{recommendation.pairing}</p>
                      <p className="mt-4 max-w-xl text-sm leading-6">{recommendation.description}</p>
                      <div className="mt-5 flex flex-wrap gap-2">{recommendation.flavours.map((flavour) => <span className="rounded-full border border-border px-3 py-1 text-[10px] text-muted-foreground" key={flavour.id}>{flavour.name}</span>)}</div>
                    </div>
                  </div>
                  <div className="mt-6 flex flex-col gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
                    <button className="flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setActiveDetail(recommendation)} data-testid={`button-details-${recommendation.mix.id}`}>See the blend <ChevronDown size={15} /></button>
                    <button className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-xs font-bold text-primary-foreground" onClick={() => chooseRecommendation(recommendation)} data-testid={`button-choose-${recommendation.mix.id}`}>Choose this mix <ArrowRight size={15} /></button>
                  </div>
                </article>
              ))}
            </div>
            {activeDetail && <MixDetailPanel recommendation={activeDetail} onClose={() => setActiveDetail(null)} />}
          </div>
        )}

        {stage === 'customize' && (
          <div className="hv-rise">
            <div className="mb-8 flex items-center justify-between"><button className="flex min-h-10 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground" onClick={goBack} data-testid="button-customize-back"><ArrowLeft size={17} /> Back</button><span className="hv-mono text-[10px] text-muted-foreground">YOUR MIX</span></div>
            <SectionEyebrow>MAKE IT YOURS</SectionEyebrow>
            <h1 className="hv-display max-w-2xl text-4xl leading-tight md:text-6xl">A little less guesswork. A lot more you.</h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">Adjust by feel. If you want, turn on exact percentages and fine-tune each flavour with a slider. Normal is our balanced starting point.</p>
            <div className="mt-7 flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-muted/30 p-4"><div><p className="text-sm font-bold">Set exact percentages <span className="font-normal text-muted-foreground">(optional)</span></p><p className="mt-1 text-[10px] leading-4 text-muted-foreground">Use sliders if you want to control the recipe yourself. Leave this off and our normal recipe stays in charge.</p></div><button type="button" role="switch" aria-checked={percentageMode} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${percentageMode ? 'bg-secondary' : 'bg-muted-foreground/25'}`} onClick={() => { const next = !percentageMode; setPercentageMode(next); if (next) setPercentages(getDefaultPercentages(selectedIds)); }} data-testid="switch-percentage-mode"><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${percentageMode ? 'translate-x-6' : 'translate-x-1'}`} /></button></div>
            {percentageMode && <div className={`text-right text-[10px] font-semibold ${percentageTotal === 100 ? 'text-secondary-foreground' : 'text-destructive'}`}>Total: {percentageTotal}% {percentageTotal === 100 ? '· Ready' : '· Must equal 100%'}</div>}
            <div className="mt-4 space-y-4">
              {selectedFlavours.map((flavour) => (
                <div className="hv-surface rounded-3xl p-4 md:p-5" key={flavour.id} data-testid={`card-customize-${flavour.id}`}>
                   <div className="flex items-center gap-4"><FlavourVisual flavour={flavour} size="md" /><div className="min-w-0 flex-1"><h2 className="hv-display mt-1 text-2xl">{flavour.name}</h2><p className="mt-1 truncate text-xs text-muted-foreground">{flavour.character}</p><p className="mt-2 text-[10px] font-semibold text-secondary-foreground">{flavour.strength} body · {flavour.tags.join(' · ')}</p></div><button className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => { const nextIds = selectedIds.filter((id) => id !== flavour.id); setSelectedIds(nextIds); setPercentages((current) => { const next = { ...current }; delete next[flavour.id]; if (percentageMode && nextIds.length) { const total = nextIds.reduce((sum, id) => sum + (next[id] ?? 0), 0); if (total > 0) nextIds.forEach((id) => { next[id] = Math.round(((next[id] ?? 0) / total) * 100 / 5) * 5; }); } return next; }); }} aria-label={`Remove ${flavour.name}`} data-testid={`button-remove-${flavour.id}`}><Trash2 size={16} /></button></div>
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/70 pt-4"><div className="flex flex-wrap gap-2">{flavour.tags.map((tag) => <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] text-muted-foreground" key={tag}>{tag}</span>)}</div><div className="flex shrink-0 overflow-hidden rounded-xl border border-border bg-muted/50">{(['Less', 'Normal', 'More'] as CustomLevel[]).map((level) => <button key={level} className={`min-h-10 px-2.5 text-[10px] font-bold transition-colors ${customizations[flavour.id] === level ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => updateCustomization(flavour.id, level)} aria-pressed={customizations[flavour.id] === level} data-testid={`button-custom-${level.toLowerCase()}-${flavour.id}`}>{level}</button>)}</div></div>
                  {percentageMode && <div className="mt-4 rounded-2xl bg-muted/50 p-3"><div className="flex items-center justify-between gap-3"><span className="text-[11px] font-semibold">Percentage</span><span className="hv-mono text-xs text-secondary-foreground">{percentages[flavour.id] ?? 0}%</span></div><input type="range" min="0" max="100" step="5" value={percentages[flavour.id] ?? 0} onChange={(event) => updatePercentage(flavour.id, Number(event.target.value))} className="mt-2 w-full accent-secondary" aria-label={`Set ${flavour.name} percentage`} data-testid={`slider-percentage-${flavour.id}`} /><div className="mt-1 flex justify-between text-[9px] text-muted-foreground"><span>0%</span><span>100%</span></div></div>}
                </div>
              ))}
            </div>
            <div className="relative mt-4">
              <button className="flex min-h-14 w-full items-center justify-between rounded-2xl border border-dashed border-secondary/70 px-5 text-sm font-bold text-secondary-foreground hover:bg-secondary/10" onClick={() => setAddOpen((open) => !open)} data-testid="button-add-flavour"><span className="flex items-center gap-2"><Plus size={18} /> Add a flavour</span><ChevronDown size={17} className={addOpen ? 'rotate-180 transition-transform' : 'transition-transform'} /></button>
               {addOpen && <div className="hv-surface absolute left-0 right-0 top-16 z-20 max-h-80 overflow-y-auto rounded-2xl p-3 shadow-2xl"><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{catalog.flavours.filter((flavour) => !selectedIds.includes(flavour.id)).map((flavour) => <button className="flex items-center gap-2 rounded-xl p-2 text-left hover:bg-muted" key={flavour.id} onClick={() => { const nextIds = [...selectedIds, flavour.id]; setSelectedIds(nextIds); updateCustomization(flavour.id, 'Normal'); if (percentageMode) setPercentages(getDefaultPercentages(nextIds)); setAddOpen(false); }} data-testid={`button-add-${flavour.id}`}><FlavourVisual flavour={flavour} size="sm" /><span className="min-w-0"><span className="block truncate text-xs font-bold">{flavour.name}</span><span className="block truncate text-[9px] text-muted-foreground">{flavour.tags.slice(0, 2).join(' · ')}</span></span></button>)}</div></div>}
            </div>
            <button className="hv-press mt-8 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 font-bold text-primary-foreground sm:w-auto" onClick={() => setStage('final')} disabled={selectedIds.length === 0 || !percentageReady} data-testid="button-review-choice">Review my choice <ArrowRight size={17} /></button>
          </div>
        )}

        {stage === 'final' && (
          <div className="hv-rise">
            <div className="mb-8 flex items-center justify-between"><button className="flex min-h-10 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground" onClick={goBack} data-testid="button-final-back"><ArrowLeft size={17} /> Edit mix</button><span className="hv-mono text-[10px] text-muted-foreground">READY WHEN YOU ARE</span></div>
            <SectionEyebrow>ONE LAST LOOK</SectionEyebrow>
            <h1 className="hv-display max-w-2xl text-4xl leading-tight md:text-6xl">Your table is going to like this.</h1>
            <div className="mt-8 grid gap-5 md:grid-cols-[1fr_.78fr]">
              <div className="hv-surface rounded-3xl p-5 md:p-7">
                <div className="flex items-center justify-between border-b border-border/70 pb-4"><span className="hv-mono text-[10px] text-accent">CUSTOMISED MIX</span><span className="text-xs text-muted-foreground">{answers.strength} session</span></div>
                 <div className="mt-5 space-y-3">{selectedFlavours.length ? selectedFlavours.map((flavour) => <div className="flex items-center gap-3" key={flavour.id}><FlavourVisual flavour={flavour} size="sm" /><div className="min-w-0 flex-1"><p className="text-sm font-bold">{flavour.name}</p><p className="text-[10px] text-muted-foreground">{customizations[flavour.id] ?? 'Normal'}{percentageMode ? ` · ${percentages[flavour.id] ?? 0}%` : ''}</p></div><Check size={16} className="text-secondary" /></div>) : <p className="text-sm text-muted-foreground">Your expert will make a thoughtful surprise.</p>}</div>
                <div className="mt-6 flex flex-wrap gap-2 border-t border-border/70 pt-5">{(answers.tastes.length ? answers.tastes : ['Surprise me']).map((taste) => <span className="rounded-full bg-secondary/15 px-3 py-1.5 text-[10px] font-semibold text-secondary-foreground" key={taste}>{taste}</span>)}</div>
              </div>
              <div className="rounded-3xl bg-primary p-5 text-primary-foreground md:p-7"><p className="hv-mono text-[10px] text-secondary">A NOTE FOR THE EXPERT</p><label className="mt-5 block text-sm font-semibold" htmlFor="remarks">Anything else?</label><textarea id="remarks" value={remarks} onChange={(event) => setRemarks(event.target.value)} className="mt-3 min-h-36 w-full resize-none rounded-2xl border border-primary-foreground/15 bg-primary-foreground/10 p-4 text-sm leading-6 text-primary-foreground placeholder:text-primary-foreground/40 focus:border-secondary focus:outline-none" placeholder="Tell us about the mood, the table, or anything to leave out." data-testid="textarea-remarks" /><p className="mt-4 text-xs leading-5 text-primary-foreground/55">This note travels with your mix to Mixology PRO Expert on WhatsApp.</p></div>
            </div>
            <button className="hv-press mt-6 flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-secondary px-6 font-bold text-secondary-foreground shadow-lg shadow-secondary/20" onClick={() => { onSave(finalChoice); openWhatsApp(finalChoice, catalog); }} data-testid="button-order-customised-choice">ORDER CUSTOMISED CHOICE <Send size={18} /></button>
            <p className="mt-3 text-center text-[10px] text-muted-foreground">We’ll send your flavour choice to Mixology PRO; the preparation recipe stays with the team.</p>
          </div>
        )}
      </div>
    </main>
  );
}

function MixDetailPanel({ recommendation, onClose }: { recommendation: Recommendation; onClose: () => void }) {
  return (
    <div className="fixed inset-x-4 bottom-24 z-30 mx-auto max-w-lg rounded-3xl bg-primary p-5 text-primary-foreground shadow-2xl shadow-primary/30 md:bottom-8" role="dialog" aria-label={`${recommendation.mix.name} details`}>
      <div className="flex items-start gap-4"><PremixVisual premix={recommendation.mix} size="md" /><div className="min-w-0 flex-1"><p className="hv-mono text-[10px] text-secondary">PREMIX DETAILS</p><h2 className="hv-display mt-1 text-3xl">{recommendation.mix.name}</h2><p className="mt-2 text-sm leading-6 text-primary-foreground/70">{recommendation.mix.description}</p></div><button className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-foreground/10" onClick={onClose} aria-label="Close mix details" data-testid="button-close-details"><X size={17} /></button></div>
      <div className="mt-5 flex flex-wrap gap-2">{recommendation.flavours.map((flavour) => <span className="rounded-full border border-primary-foreground/20 px-3 py-1 text-[10px]" key={flavour.id}>{flavour.name}</span>)}</div>
      <p className="mt-4 text-xs text-primary-foreground/60">{recommendation.mix.bestFor}</p>
    </div>
  );
}

function RecipeCard({ choice, catalog }: { choice: Choice; catalog: Catalog }) {
  const [batchSize, setBatchSize] = useState('100');
  const parsedBatchSize = Number(batchSize);
  const safeBatchSize = Number.isFinite(parsedBatchSize) && parsedBatchSize > 0 ? parsedBatchSize : 0;
  const recipe = getBatchRecipe(choice, safeBatchSize, catalog.flavours, catalog.premixes);

  if (!recipe.length) return null;

  return (
    <section className="mt-6 rounded-[2rem] border border-secondary/35 bg-card/70 p-5 shadow-sm md:p-7" data-testid="card-staff-recipe">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="hv-mono text-[10px] text-accent">STAFF RECIPE CARD</p>
          <h2 className="hv-display mt-2 text-3xl">Preparation recipe</h2>
          <p className="mt-2 max-w-lg text-xs leading-5 text-muted-foreground">Use these normalized percentages for the selected mix. Less and More adjustments are already included.</p>
        </div>
        <ClipboardList className="text-secondary" size={22} />
      </div>
      <div className="mt-6 rounded-2xl bg-muted/55 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="text-xs font-bold" htmlFor="batch-size">Preparation calculator</label>
          <div className="flex items-center gap-2">
            <Calculator size={16} className="text-secondary" />
            <div className="flex items-center overflow-hidden rounded-xl border border-border bg-background">
              <input id="batch-size" type="number" min="1" step="1" value={batchSize} onChange={(event) => setBatchSize(event.target.value)} className="h-10 w-24 bg-transparent px-3 text-right text-sm font-bold outline-none" aria-label="Batch size in grams" data-testid="input-batch-size" />
              <span className="pr-3 text-xs text-muted-foreground">g</span>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 divide-y divide-border/70 rounded-2xl border border-border/70 bg-background/70">
        {recipe.map(({ flavour, percentage, amount, customization }) => (
          <div className="flex items-center gap-3 px-4 py-3" key={flavour.id} data-testid={`recipe-line-${flavour.id}`}>
            <FlavourVisual flavour={flavour} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{flavour.name}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">{customization} amount</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-secondary-foreground">{percentage}%</p>
              <p className="mt-1 text-[10px] text-muted-foreground">{amount.toFixed(1)} g</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[10px] leading-5 text-muted-foreground">Total: {safeBatchSize || '—'} g · Percentages total 100% · Internal preparation reference</p>
    </section>
  );
}

function ChoicePage({ choice, onEdit, onReset, catalog }: { choice: Choice | null; onEdit: () => void; onReset: () => void; catalog: Catalog }) {
  const selected = choice?.flavourIds.map((id) => catalog.flavours.find((flavour) => flavour.id === id)).filter((flavour): flavour is Flavour => Boolean(flavour)) ?? [];
  return (
    <main className="hv-shell hv-page-in">
      <div className="mx-auto max-w-4xl">
        <SectionEyebrow>YOUR MIXOLOGY PRO NOTE</SectionEyebrow>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end"><div><h1 className="hv-display text-5xl md:text-6xl">My Choice</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">{choice ? 'Your last cloud is saved here on this device.' : 'Nothing saved yet. Let’s find your first cloud.'}</p></div>{choice && <span className="hv-mono text-[10px] text-secondary">SAVED LOCALLY</span>}</div>
        {!choice ? (
          <div className="hv-surface mt-10 flex flex-col items-center rounded-[2rem] px-6 py-16 text-center"><span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-secondary/20 text-secondary-foreground"><Sparkles size={25} /></span><h2 className="hv-display mt-6 text-3xl">A blank page, for now.</h2><p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">Answer a few easy questions and we’ll keep your finished choice close by.</p><Link href="/find" className="mt-7 flex min-h-13 items-center gap-2 rounded-2xl bg-primary px-6 text-sm font-bold text-primary-foreground" data-testid="link-empty-find">Find my hookah <ArrowRight size={16} /></Link></div>
        ) : (
          <>
            <div className="mt-9 grid gap-4 md:grid-cols-[1.05fr_.95fr]">
              <div className="rounded-[2rem] bg-primary p-6 text-primary-foreground md:p-8"><div className="flex items-center justify-between"><span className="hv-mono text-[10px] text-secondary">THE MIX</span><Flame size={19} className="text-secondary" /></div><h2 className="hv-display mt-6 text-3xl">{choice.mixName || 'Mixology PRO Custom Mix'}</h2><div className="mt-6 space-y-4">{selected.map((flavour) => <div className="flex items-center gap-3" key={flavour.id} data-testid={`text-saved-flavour-${flavour.id}`}><FlavourVisual flavour={flavour} size="sm" /><div><p className="text-sm font-bold">{flavour.name}</p><p className="text-[10px] text-primary-foreground/55">{choice.customizations[flavour.id] ?? 'Normal'}</p></div></div>)}</div><div className="mt-8 border-t border-primary-foreground/15 pt-5"><p className="hv-mono text-[9px] text-primary-foreground/50">MOOD</p><p className="mt-2 text-sm">{choice.tastes.length ? choice.tastes.join(' · ') : 'A Mixology PRO surprise'}</p></div></div>
              <div className="hv-surface rounded-[2rem] p-6 md:p-8"><div className="flex items-center justify-between"><span className="hv-mono text-[10px] text-accent">TABLE NOTES</span><span className="rounded-full bg-muted px-3 py-1 text-[10px] font-semibold">{choice.strength}</span></div><p className="mt-8 text-sm leading-7">{choice.remarks || 'No extra notes — the blend can speak for itself.'}</p><div className="mt-8 border-t border-border/70 pt-5"><p className="text-xs font-bold">Avoiding</p><p className="mt-2 text-xs text-muted-foreground">{choice.avoid.length ? choice.avoid.join(' · ') : 'Nothing noted'}</p></div></div>
            </div>
             <div className="mt-6 flex flex-col gap-3 sm:flex-row"><button className="flex min-h-13 flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-card px-5 text-sm font-bold hover:bg-muted" onClick={onEdit} data-testid="button-edit-choice"><Edit3 size={16} /> EDIT</button><button className="flex min-h-13 flex-[1.5] items-center justify-center gap-2 rounded-2xl bg-secondary px-5 text-sm font-bold text-secondary-foreground shadow-lg shadow-secondary/15" onClick={() => openWhatsApp(choice, catalog)} data-testid="button-order-whatsapp"><Send size={16} /> ORDER ON WHATSAPP</button><button className="flex min-h-13 items-center justify-center gap-2 rounded-2xl border border-border px-5 text-sm font-bold text-muted-foreground hover:border-destructive/40 hover:text-destructive" onClick={onReset} data-testid="button-start-over"><RotateCcw size={16} /> START OVER</button></div>
          </>
        )}
      </div>
    </main>
  );
}

const manageInputClass = 'mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-secondary';

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom';
}

function createOrb(seed: string) {
  const hue = [...seed].reduce((total, character) => total + character.charCodeAt(0), 0) % 360;
  return {
    light: `hsl(${hue} 78% 78%)`,
    mid: `hsl(${hue} 58% 50%)`,
    deep: `hsl(${hue} 48% 25%)`,
  };
}

function ManagePage({ catalog, onChange, onLogout }: { catalog: Catalog; onChange: (next: Catalog) => void; onLogout: () => void }) {
  const [flavourForm, setFlavourForm] = useState({ name: '', brand: '', tags: 'Fruity, Fresh', strength: 'Medium' as Strength, character: '', photoUrl: '' });
  const [premixForm, setPremixForm] = useState({ name: '', profile: 'Fruity, Fresh', description: '', bestFor: '' });
  const [selectedIngredients, setSelectedIngredients] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');

  const handleFlavourPhoto = async (file?: File) => {
    if (!file) return;
    try {
      const photoUrl = await fileToImageDataUrl(file);
      setFlavourForm((current) => ({ ...current, photoUrl }));
      setNotice('Flavour picture selected.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load that picture.');
    }
  };

  const addFlavour = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = flavourForm.name.trim();
    if (!name || !flavourForm.character.trim()) {
      setNotice('Add a flavour name and a short flavour description.');
      return;
    }
    const baseId = `custom-${slugify(name)}`;
    const id = catalog.flavours.some((flavour) => flavour.id === baseId) ? `${baseId}-${catalog.flavours.length + 1}` : baseId;
    const nextFlavour: Flavour = {
      id,
      name,
      brand: flavourForm.brand.trim() || 'Mixology PRO Stock',
      tags: flavourForm.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      strength: flavourForm.strength,
      character: flavourForm.character.trim(),
      photoUrl: flavourForm.photoUrl.trim() || undefined,
      orb: createOrb(name),
    };
    onChange({ ...catalog, flavours: [...catalog.flavours, nextFlavour] });
    setFlavourForm({ name: '', brand: '', tags: 'Fruity, Fresh', strength: 'Medium', character: '', photoUrl: '' });
    setNotice(`${name} was added to flavour stock.`);
  };

  const removeFlavour = (flavour: Flavour) => {
    const linkedPremixes = catalog.premixes.filter((premix) => premix.flavourIds.includes(flavour.id));
    if (linkedPremixes.length) {
      setNotice(`Remove ${linkedPremixes.map((premix) => premix.name).join(', ')} before removing ${flavour.name}.`);
      return;
    }
    if (!window.confirm(`Remove ${flavour.name} from active flavour stock?`)) return;
    onChange({ ...catalog, flavours: catalog.flavours.filter((item) => item.id !== flavour.id) });
    setNotice(`${flavour.name} was removed from active stock.`);
  };

  const toggleIngredient = (flavourId: string) => {
    setSelectedIngredients((current) => {
      if (current[flavourId] !== undefined) {
        const next = { ...current };
        delete next[flavourId];
        return next;
      }
      return { ...current, [flavourId]: '25' };
    });
  };

  const addPremix = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = premixForm.name.trim();
    const entries = Object.entries(selectedIngredients).map(([flavourId, percentage]) => ({ flavourId, percentage: Number(percentage) }));
    const total = entries.reduce((sum, entry) => sum + entry.percentage, 0);
    if (!name || !premixForm.description.trim() || !premixForm.bestFor.trim()) {
      setNotice('Add a premix name, description, and best-for note.');
      return;
    }
    if (entries.length < 2 || entries.some((entry) => !Number.isFinite(entry.percentage) || entry.percentage <= 0) || Math.abs(total - 100) > 0.01) {
      setNotice('Choose at least two flavours and make their percentages total exactly 100%.');
      return;
    }
    const baseId = `custom-${slugify(name)}`;
    const id = catalog.premixes.some((premix) => premix.id === baseId) ? `${baseId}-${catalog.premixes.length + 1}` : baseId;
    const nextPremix: Premix = {
      id,
      name,
      flavourIds: entries.map((entry) => entry.flavourId),
      recipe: entries,
      profile: premixForm.profile.split(',').map((tag) => tag.trim()).filter(Boolean),
      description: premixForm.description.trim(),
      bestFor: premixForm.bestFor.trim(),
    };
    onChange({ ...catalog, premixes: [...catalog.premixes, nextPremix] });
    setPremixForm({ name: '', profile: 'Fruity, Fresh', description: '', bestFor: '' });
    setSelectedIngredients({});
    setNotice(`${name} was added to premixes.`);
  };

  const removePremix = (premix: Premix) => {
    if (!window.confirm(`Remove ${premix.name} from active premixes?`)) return;
    onChange({ ...catalog, premixes: catalog.premixes.filter((item) => item.id !== premix.id) });
    setNotice(`${premix.name} was removed from active premixes.`);
  };

  return (
    <main className="hv-shell hv-page-in pb-28">
      <div className="mx-auto max-w-6xl">
        <SectionEyebrow>STAFF CATALOG</SectionEyebrow>
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 className="hv-display text-5xl md:text-6xl">Manage stock</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Keep active flavour profiles and premix recipes ready for the customer finder. Changes are saved on this device.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2"><div className="flex items-center gap-2 rounded-2xl bg-secondary/15 px-4 py-3 text-xs font-semibold text-secondary-foreground"><PackageOpen size={17} /> {catalog.flavours.length} flavours · {catalog.premixes.length} premixes</div><button className="flex min-h-11 items-center gap-2 rounded-2xl border border-border px-4 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground" onClick={onLogout} data-testid="button-manage-logout"><LogOut size={15} /> Lock</button></div>
        </div>
        {notice && <p className="mt-6 rounded-2xl border border-secondary/40 bg-secondary/10 px-4 py-3 text-sm font-semibold text-secondary-foreground" role="status">{notice}</p>}

        <section className="mt-9 grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
          <form className="hv-surface rounded-[2rem] p-5 md:p-7" onSubmit={addFlavour} data-testid="form-add-flavour">
            <p className="hv-mono text-[10px] text-accent">FLAVOUR PROFILES</p>
            <h2 className="hv-display mt-2 text-3xl">Add stock flavour</h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Brands stay internal here for staff context; customers still see flavour names only.</p>
            <label className="mt-5 block text-xs font-bold" htmlFor="stock-flavour-name">Flavour name<input id="stock-flavour-name" className={manageInputClass} value={flavourForm.name} onChange={(event) => setFlavourForm({ ...flavourForm, name: event.target.value })} placeholder="e.g. Peach" data-testid="input-stock-flavour-name" /></label>
            <label className="mt-4 block text-xs font-bold" htmlFor="stock-flavour-brand">Internal brand<input id="stock-flavour-brand" className={manageInputClass} value={flavourForm.brand} onChange={(event) => setFlavourForm({ ...flavourForm, brand: event.target.value })} placeholder="Optional" data-testid="input-stock-flavour-brand" /></label>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-bold" htmlFor="stock-flavour-strength">Strength<select id="stock-flavour-strength" className={manageInputClass} value={flavourForm.strength} onChange={(event) => setFlavourForm({ ...flavourForm, strength: event.target.value as Strength })} data-testid="select-stock-flavour-strength"><option>Light</option><option>Medium</option><option>Strong</option></select></label>
              <label className="block text-xs font-bold" htmlFor="stock-flavour-tags">Taste tags<input id="stock-flavour-tags" className={manageInputClass} value={flavourForm.tags} onChange={(event) => setFlavourForm({ ...flavourForm, tags: event.target.value })} placeholder="Fruity, Fresh" data-testid="input-stock-flavour-tags" /></label>
            </div>
            <label className="mt-4 block text-xs font-bold" htmlFor="stock-flavour-character">Flavour profile<textarea id="stock-flavour-character" className="mt-2 min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-secondary" value={flavourForm.character} onChange={(event) => setFlavourForm({ ...flavourForm, character: event.target.value })} placeholder="Bright peach with a soft, juicy finish." data-testid="input-stock-flavour-character" /></label>
            <label className="mt-4 block text-xs font-bold" htmlFor="stock-flavour-photo">Flavour picture <span className="font-normal text-muted-foreground">(optional)</span><input id="stock-flavour-photo" type="file" accept="image/*" className="mt-2 block w-full rounded-xl border border-border bg-background p-2 text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-xs file:font-semibold" onChange={(event) => handleFlavourPhoto(event.target.files?.[0])} data-testid="input-stock-flavour-photo" />{flavourForm.photoUrl && <img src={flavourForm.photoUrl} alt="Flavour preview" className="mt-3 h-24 w-full rounded-xl object-cover" />}</label>
            <button className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground" type="submit" data-testid="button-add-stock-flavour"><Plus size={17} /> Add flavour to stock</button>
          </form>

          <div className="hv-surface rounded-[2rem] p-5 md:p-7">
            <div className="flex items-start justify-between gap-4"><div><p className="hv-mono text-[10px] text-accent">ACTIVE STOCK</p><h2 className="hv-display mt-2 text-3xl">Flavour profiles</h2></div><PackageOpen className="text-secondary" size={22} /></div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {catalog.flavours.map((flavour) => (
                <article className="rounded-2xl border border-border bg-background/70 p-3" key={flavour.id} data-testid={`card-stock-${flavour.id}`}>
                  <div className="flex items-center gap-3"><FlavourVisual flavour={flavour} size="sm" /><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-bold">{flavour.name}</h3><p className="mt-1 truncate text-[10px] text-muted-foreground">{flavour.brand} · {flavour.strength}</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{flavour.tags.join(' · ')}</p></div><button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => removeFlavour(flavour)} aria-label={`Remove ${flavour.name} from stock`} data-testid={`button-remove-stock-${flavour.id}`}><Trash2 size={15} /></button></div>
                </article>
              ))}
              {!catalog.flavours.length && <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No active flavour profiles. Add stock to build premixes.</p>}
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
          <form className="hv-surface rounded-[2rem] p-5 md:p-7" onSubmit={addPremix} data-testid="form-add-premix">
            <p className="hv-mono text-[10px] text-accent">PREMIX RECIPES</p>
            <h2 className="hv-display mt-2 text-3xl">Add premix</h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Select active flavours and set the internal recipe percentages. They must total 100%.</p>
            <label className="mt-5 block text-xs font-bold" htmlFor="premix-name">Premix name<input id="premix-name" className={manageInputClass} value={premixForm.name} onChange={(event) => setPremixForm({ ...premixForm, name: event.target.value })} placeholder="e.g. Peach Breeze" data-testid="input-premix-name" /></label>
            <label className="mt-4 block text-xs font-bold" htmlFor="premix-profile">Profile tags<input id="premix-profile" className={manageInputClass} value={premixForm.profile} onChange={(event) => setPremixForm({ ...premixForm, profile: event.target.value })} placeholder="Fruity, Cooling" data-testid="input-premix-profile" /></label>
            <label className="mt-4 block text-xs font-bold" htmlFor="premix-description">Description<textarea id="premix-description" className="mt-2 min-h-20 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-secondary" value={premixForm.description} onChange={(event) => setPremixForm({ ...premixForm, description: event.target.value })} placeholder="A balanced fruit blend..." data-testid="input-premix-description" /></label>
            <label className="mt-4 block text-xs font-bold" htmlFor="premix-best-for">Best for<input id="premix-best-for" className={manageInputClass} value={premixForm.bestFor} onChange={(event) => setPremixForm({ ...premixForm, bestFor: event.target.value })} placeholder="For guests who enjoy..." data-testid="input-premix-best-for" /></label>
            <div className="mt-5"><div className="flex items-center justify-between"><p className="text-xs font-bold">Recipe ingredients</p><span className="text-[10px] text-muted-foreground">{Object.values(selectedIngredients).reduce((sum, value) => sum + (Number(value) || 0), 0)}% selected</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{catalog.flavours.map((flavour) => { const selectedIngredient = selectedIngredients[flavour.id] !== undefined; return <div className={`flex items-center gap-2 rounded-xl border p-2 ${selectedIngredient ? 'border-secondary bg-secondary/10' : 'border-border'}`} key={flavour.id}><label className="flex min-w-0 flex-1 items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={selectedIngredient} onChange={() => toggleIngredient(flavour.id)} data-testid={`checkbox-premix-${flavour.id}`} /><span className="truncate">{flavour.name}</span></label>{selectedIngredient && <div className="flex items-center gap-1"><input type="number" min="0.1" max="100" step="0.1" value={selectedIngredients[flavour.id]} onChange={(event) => setSelectedIngredients({ ...selectedIngredients, [flavour.id]: event.target.value })} className="h-8 w-16 rounded-lg border border-border bg-background px-2 text-right text-xs font-bold outline-none" aria-label={`${flavour.name} percentage`} /><span className="text-[10px] text-muted-foreground">%</span></div>}</div>; })}</div></div>
            <button className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40" type="submit" disabled={!catalog.flavours.length} data-testid="button-add-premix"><Plus size={17} /> Add premix to catalog</button>
          </form>

          <div className="hv-surface rounded-[2rem] p-5 md:p-7">
            <div className="flex items-start justify-between gap-4"><div><p className="hv-mono text-[10px] text-accent">ACTIVE RECIPES</p><h2 className="hv-display mt-2 text-3xl">Premix catalog</h2></div><ClipboardList className="text-secondary" size={22} /></div>
            <div className="mt-6 space-y-3">
              {catalog.premixes.map((premix) => (
                <article className="rounded-2xl border border-border bg-background/70 p-4" key={premix.id} data-testid={`card-premix-${premix.id}`}>
                  <div className="flex items-start gap-3"><PremixVisual premix={premix} size="sm" /><div className="min-w-0 flex-1"><h3 className="hv-display text-2xl">{premix.name}</h3><p className="mt-1 text-[10px] text-muted-foreground">{premix.profile.join(' · ')}</p></div><button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => removePremix(premix)} aria-label={`Remove ${premix.name}`} data-testid={`button-remove-premix-${premix.id}`}><Trash2 size={15} /></button></div>
                  <div className="mt-3 flex flex-wrap gap-2">{premix.recipe.map((ingredient) => <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] text-muted-foreground" key={ingredient.flavourId}>{catalog.flavours.find((flavour) => flavour.id === ingredient.flavourId)?.name ?? 'Unavailable flavour'} {ingredient.percentage}%</span>)}</div>
                </article>
              ))}
              {!catalog.premixes.length && <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No active premixes. Add a recipe to populate recommendations.</p>}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function ManageGate({ catalog, onChange }: { catalog: Catalog; onChange: (next: Catalog) => void }) {
  const [status, setStatus] = useState<'checking' | 'locked' | 'unlocked'>('checking');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/manage/session', { credentials: 'include' })
      .then((response) => response.ok ? response.json() as Promise<{ authenticated?: boolean }> : Promise.reject(new Error('Session check failed')))
      .then((data) => { if (active) setStatus(data.authenticated ? 'unlocked' : 'locked'); })
      .catch(() => { if (active) { setStatus('locked'); setError('The staff login service is unavailable. Please try again.'); } });
    return () => { active = false; };
  }, []);

  const login = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    try {
      const response = await fetch('/api/manage/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        setPassword('');
        setError(response.status === 401 ? 'That password was not accepted.' : 'The staff login service is unavailable.');
        return;
      }
      setPassword('');
      setStatus('unlocked');
    } catch {
      setError('The staff login service is unavailable. Please try again.');
    }
  };

  const logout = async () => {
    await fetch('/api/manage/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined);
    setStatus('locked');
  };

  if (status === 'checking') {
    return <main className="hv-shell hv-page-in flex min-h-[60vh] items-center justify-center"><div className="hv-surface rounded-3xl px-8 py-10 text-center"><Settings2 className="mx-auto text-secondary" size={24} /><p className="mt-4 text-sm font-semibold">Checking staff access…</p></div></main>;
  }

  if (status === 'unlocked') return <ManagePage catalog={catalog} onChange={onChange} onLogout={logout} />;

  return (
    <main className="hv-shell hv-page-in flex min-h-[65vh] items-center justify-center pb-28">
      <form className="hv-surface w-full max-w-md rounded-[2rem] p-6 md:p-8" onSubmit={login} data-testid="form-manage-login">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/20 text-secondary-foreground"><Settings2 size={22} /></div>
        <SectionEyebrow>STAFF ACCESS</SectionEyebrow>
        <h1 className="hv-display text-4xl">Manage stock</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Enter the staff password to manage flavour profiles and premix recipes.</p>
        <label className="mt-7 block text-xs font-bold" htmlFor="manage-password">Password<input id="manage-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className={manageInputClass} data-testid="input-manage-password" /></label>
        {error && <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive" role="alert">{error}</p>}
        <button className="mt-5 flex min-h-12 w-full items-center justify-center rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground" type="submit" data-testid="button-manage-login">Unlock management</button>
      </form>
    </main>
  );
}

function NotFoundPage() {
  return <main className="hv-shell flex min-h-[60vh] flex-col items-center justify-center text-center"><span className="hv-mono text-[10px] text-accent">404 / WRONG TURN</span><h1 className="hv-display mt-4 text-5xl">That cloud drifted away.</h1><Link href="/" className="mt-7 flex min-h-12 items-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground" data-testid="link-not-found-home">Back home <ArrowRight size={16} /></Link></main>;
}

function RouterView({ choice, onSave, onEdit, onReset, launch, setLaunch, catalog, onCatalogChange }: { choice: Choice | null; onSave: (choice: Choice) => void; onEdit: () => void; onReset: () => void; launch: 'fresh' | 'surprise' | 'edit'; setLaunch: (launch: 'fresh' | 'surprise' | 'edit') => void; catalog: Catalog; onCatalogChange: (next: Catalog) => void }) {
  return (
    <Switch>
      <Route path="/"><HomePage onFind={() => { setLaunch('fresh'); }} onSurprise={() => { setLaunch('surprise'); }} catalog={catalog} /></Route>
      <Route path="/find"><FinderPage onSave={onSave} editChoice={choice} launch={launch} catalog={catalog} /></Route>
      <Route path="/choice"><ChoicePage choice={choice} onEdit={onEdit} onReset={onReset} catalog={catalog} /></Route>
      <Route path="/manage"><ManageGate catalog={catalog} onChange={onCatalogChange} /></Route>
      <Route><NotFoundPage /></Route>
    </Switch>
  );
}

function AgeGate() {
  const [verified, setVerified] = useState<boolean | null>(() => {
    try {
      return localStorage.getItem('hillview-age-verified') === 'true';
    } catch {
      return false;
    }
  });

  const confirmAge = () => {
    try {
      localStorage.setItem('hillview-age-verified', 'true');
    } catch {
      // Continue even if storage is unavailable.
    }
    setVerified(true);
  };

  if (verified === true) return null;

  return (
    <div className="fixed inset-0 z-[100] flex min-h-screen items-center justify-center bg-primary/95 px-5 py-8 text-primary-foreground backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="age-gate-title">
      <div className="w-full max-w-md rounded-[2rem] border border-primary-foreground/15 bg-primary p-7 text-center shadow-2xl md:p-9">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
          <Flame size={25} />
        </div>
        <SectionEyebrow>MIXOLOGY PRO / AGE CHECK</SectionEyebrow>
        <h1 id="age-gate-title" className="hv-display text-4xl md:text-5xl">Are you 18 or older?</h1>
        <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-primary-foreground/70">
          This site contains information about hookah and tobacco-related products. You must be 18 or older to enter.
        </p>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            className="hv-press flex min-h-13 items-center justify-center gap-2 rounded-2xl bg-secondary px-5 font-bold text-secondary-foreground shadow-lg"
            onClick={confirmAge}
            data-testid="button-age-yes"
          >
            <Check size={17} /> YES, I’M 18+
          </button>
          <button
            type="button"
            className="hv-press flex min-h-13 items-center justify-center gap-2 rounded-2xl border border-primary-foreground/20 px-5 font-semibold text-primary-foreground hover:bg-primary-foreground/10"
            onClick={() => setVerified(false)}
            data-testid="button-age-no"
          >
            <X size={17} /> NO, EXIT
          </button>
        </div>
        {verified === false && (
          <p className="mt-5 rounded-xl bg-primary-foreground/10 px-3 py-2 text-xs font-semibold text-primary-foreground/80" role="alert">
            You must be 18 or older to enter this site.
          </p>
        )}
        <p className="mt-6 text-[10px] leading-4 text-primary-foreground/40">
          Age confirmation is a self-declaration and does not verify your identity.
        </p>
      </div>
    </div>
  );
}

function App() {
  const [, setLocation] = useLocation();
  const [choice, setChoice] = useState<Choice | null>(readChoice);
  const [catalog, setCatalog] = useState<Catalog>(readCatalog);
  const [launch, setLaunch] = useState<'fresh' | 'surprise' | 'edit'>('fresh');

  useEffect(() => {
    if (choice) localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
    else localStorage.removeItem(STORAGE_KEY);
  }, [choice]);

  useEffect(() => {
    localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(catalog));
  }, [catalog]);

  const setFinderLaunch = (next: 'fresh' | 'surprise' | 'edit') => {
    setLaunch(next);
    setLocation('/find');
  };

  return (
    <>
      <AgeGate />
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <AppShell choice={choice}>
        <RouterView
          choice={choice}
          onSave={(next) => { setChoice(next); setLocation('/choice'); }}
          onEdit={() => setFinderLaunch('edit')}
          onReset={() => { setChoice(null); setFinderLaunch('fresh'); }}
          launch={launch}
          setLaunch={setFinderLaunch}
           catalog={catalog}
           onCatalogChange={setCatalog}
          />
        </AppShell>
      </WouterRouter>
    </>
  );
}

export default App;
