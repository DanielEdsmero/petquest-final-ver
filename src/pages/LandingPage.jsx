import { Link } from 'react-router-dom'
import { PETS } from '../data/pets'

/* Public front door (logged-out "/"). Light palette copied from the mobile app
   (apps/mobile/src/theme.ts) so the website and the app read as one product. */
const C = {
  ivory: '#FAF8F0', white: '#FFFFFF', ink: '#102A43', inkSoft: '#3E5165', inkMuted: '#5B6B7C',
  teal: '#3F8580', tealDeep: '#2F6F6B', tealTint: '#E4EFEE',
  apricotTint: '#FBEEDF', leafTint: '#E6F4EA', line: '#E1E7E3', lineStrong: '#CBD5D0',
}

const PET_ART = {
  dragon: { img: '/landing/arcane_dragon.webp', tint: C.apricotTint },
  cat:    { img: '/landing/mystic_cat.webp',    tint: C.tealTint },
  wolf:   { img: '/landing/spirit_wolf.webp',   tint: C.leafTint },
}

const STEPS = [
  { n: 1, title: 'Plan a quest',      body: 'Write the task, pick Easy, Medium or Hard, and set when you’ll finish.', bg: C.tealTint,    fg: C.tealDeep },
  { n: 2, title: 'Show it’s done', body: 'Snap a photo of your work. It’s checked, and the points are yours.',     bg: C.apricotTint, fg: '#9A5A22' },
  { n: 3, title: 'Care for your pet', body: 'Spend points to feed, clean and play. Keep going and it evolves.',             bg: C.leafTint,    fg: '#2F7A4D' },
]

const SKILLS = ['🎯 Goal setting', '🗓️ Planning and scheduling', '⭐ Prioritization', '⏱️ Time management']

const btnPrimary = 'inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl font-bold text-[15px] text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

export default function LandingPage() {
  return (
    <div className="relative z-10 min-h-screen font-nunito" style={{ background: C.ivory, color: C.ink }}>
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b" style={{ background: C.ivory + 'f2', borderColor: C.line, backdropFilter: 'blur(6px)' }}>
        <nav className="max-w-6xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between" aria-label="Main">
          <a href="#top" className="flex items-center gap-2 min-h-[44px] font-extrabold text-lg">
            <img src="/landing/mystic_cat.webp" alt="" width="32" height="32" className="w-8 h-8" />
            PetQuest
          </a>
          <div className="flex items-center gap-5 text-sm" style={{ color: C.inkSoft }}>
            <a href="#how" className="hidden md:inline hover:underline">How it works</a>
            <a href="#pets" className="hidden md:inline hover:underline">Pets</a>
            <a href="#study" className="hidden md:inline hover:underline">The study</a>
            <Link to="/login" className="inline-flex items-center min-h-[44px] px-4 rounded-xl border font-semibold"
              style={{ borderColor: C.lineStrong, color: C.ink }}>Log in</Link>
          </div>
        </nav>
      </header>

      <main id="top">
        {/* Hero */}
        <section className="max-w-6xl mx-auto px-4 md:px-8 pt-10 pb-14 md:pt-16 md:pb-20 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <span className="inline-block text-xs font-bold rounded-full px-3 py-1" style={{ background: C.tealTint, color: C.tealDeep }}>
              For Liceo de La Salle Grade 12
            </span>
            <h1 className="mt-4 mb-4 font-extrabold leading-[1.05] text-[40px] md:text-[50px]">
              Finish your tasks.<br />Watch your pet grow.
            </h1>
            <p className="text-[17px] leading-relaxed max-w-md mb-7" style={{ color: C.inkSoft }}>
              PetQuest turns schoolwork into quests. Plan when you&rsquo;ll finish, show proof when you&rsquo;re done,
              and your companion eats, plays and evolves.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link to="/login?mode=register" className={btnPrimary} style={{ background: C.teal, outlineColor: C.teal }}>
                Create your account
              </Link>
              <a href="#how" className="font-bold min-h-[44px] inline-flex items-center" style={{ color: C.tealDeep }}>See how it works ↓</a>
            </div>
            <dl className="flex gap-8 mt-9 text-sm" style={{ color: C.inkMuted }}>
              <div><dt className="sr-only">Pets</dt><dd><b className="block text-2xl" style={{ color: C.ink }}>3</b>pets to raise</dd></div>
              <div><dt className="sr-only">Stages</dt><dd><b className="block text-2xl" style={{ color: C.ink }}>4</b>evolution stages</dd></div>
              <div><dt className="sr-only">Homes</dt><dd><b className="block text-2xl" style={{ color: C.ink }}>4</b>painted homes</dd></div>
            </dl>
          </div>

          {/* App screenshot floating over the cottage painting */}
          <div className="relative h-[460px] md:h-[540px]">
            <img src="/landing/moonlit_cottage.webp" alt="" className="absolute inset-x-0 top-10 bottom-10 w-full h-[calc(100%-5rem)] object-cover rounded-3xl" />
            <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[215px] md:w-[250px] rounded-[34px] overflow-hidden"
              style={{ border: `8px solid ${C.ink}`, boxShadow: '0 18px 40px rgba(16,42,67,.35)', background: C.ivory }}>
              <img src="/landing/app-home.webp" alt="The PetQuest app home screen: the pet in its room, care stats and the next quest"
                width="390" height="844" className="block w-full h-auto" />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-y scroll-mt-16" style={{ background: C.white, borderColor: C.line }}>
          <div className="max-w-6xl mx-auto px-4 md:px-8 py-14">
            <p className="text-xs font-bold tracking-[.12em]" style={{ color: C.inkMuted }}>HOW IT WORKS</p>
            <h2 className="text-3xl font-extrabold mt-1 mb-7">Three steps, every day</h2>
            <ol className="grid md:grid-cols-3 gap-4">
              {STEPS.map(s => (
                <li key={s.n} className="rounded-2xl border p-6" style={{ background: C.ivory, borderColor: C.line }}>
                  <span className="w-11 h-11 rounded-xl flex items-center justify-center font-extrabold text-lg" style={{ background: s.bg, color: s.fg }}>{s.n}</span>
                  <h3 className="mt-4 mb-1 font-extrabold text-lg">{s.title}</h3>
                  <p className="leading-relaxed" style={{ color: C.inkSoft }}>{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Pets */}
        <section id="pets" className="max-w-6xl mx-auto px-4 md:px-8 py-14 scroll-mt-16">
          <p className="text-xs font-bold tracking-[.12em]" style={{ color: C.inkMuted }}>CHOOSE YOUR COMPANION</p>
          <h2 className="text-3xl font-extrabold mt-1 mb-7">Three pets, each with four stages</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {PETS.map(p => (
              <div key={p.id} className="rounded-2xl p-6 text-center" style={{ background: PET_ART[p.id]?.tint }}>
                <img src={PET_ART[p.id]?.img} alt={`${p.name} the ${p.species}`} width="140" height="140" loading="lazy"
                  className="w-32 h-32 mx-auto object-contain" />
                <h3 className="mt-3 font-extrabold text-lg">{p.name} <span className="font-semibold" style={{ color: C.inkMuted }}>· {p.species}</span></h3>
                <p className="text-sm" style={{ color: C.inkSoft }}>{p.trait}</p>
              </div>
            ))}
          </div>
        </section>

        {/* The study */}
        <section id="study" className="max-w-6xl mx-auto px-4 md:px-8 pb-14 scroll-mt-16">
          <div className="rounded-3xl p-7 md:p-10 grid md:grid-cols-[1.4fr_1fr] gap-8 items-center" style={{ background: C.ink, color: '#F3F5F2' }}>
            <div>
              <p className="text-xs font-bold tracking-[.12em]" style={{ color: '#A9B4C6' }}>THE STUDY</p>
              <h2 className="text-2xl md:text-3xl font-extrabold mt-1 mb-3">Can a virtual pet help students stop procrastinating?</h2>
              <p className="leading-relaxed" style={{ color: '#CBD5D0' }}>
                PetQuest is a Grade 12 research project at Liceo de La Salle &ndash; Bacolod. It measures goal setting,
                planning, prioritization and time management before and after using the app.
                Taking part is voluntary, and your answers stay confidential.
              </p>
            </div>
            <ul className="grid grid-cols-2 gap-3 text-sm">
              {SKILLS.map(s => <li key={s} className="rounded-xl p-3" style={{ background: '#1D3A57' }}>{s}</li>)}
            </ul>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="text-center px-4 pb-16">
          <h2 className="text-3xl font-extrabold">Your companion is waiting.</h2>
          <p className="mt-2 mb-6" style={{ color: C.inkSoft }}>Create your account here, then sign in on the PetQuest app.</p>
          <Link to="/login?mode=register" className={btnPrimary} style={{ background: C.teal, outlineColor: C.teal }}>
            Create your account
          </Link>
        </section>
      </main>

      <footer className="border-t" style={{ borderColor: C.line }}>
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-5 flex flex-wrap justify-between gap-2 text-sm" style={{ color: C.inkMuted }}>
          <span>PetQuest · Grade 12 Group 3 · 2026&ndash;2027</span>
          <Link to="/login" className="inline-flex items-center min-h-[44px] hover:underline">Researchers&rsquo; login</Link>
        </div>
      </footer>
    </div>
  )
}
