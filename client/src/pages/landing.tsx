import { ArrowRight, Check, Inbox, Mail, PenLine, Radar, ShieldCheck, Thermometer as ThermoIcon } from "lucide-react";
import * as React from "react";
import { Link } from "wouter";
import { Thermometer, ScoreRing } from "@/components/heat";
import { Logo } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, useApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const COPY = {
  en: {
    nav: { signin: "Sign in", demo: "Book a demo" },
    eyebrow: "For B2B outbound agencies in the UAE & GCC",
    title: "The right email, at the right moment.",
    sub: "Tawqeet watches Gulf business signals, finds the right person, scores how hot they are, writes three emails, tests them on a simulated inbox — and lets your client send the winner from their own mailbox.",
    cta: "Join the waitlist",
    ctaDemo: "Book a demo",
    placeholder: "you@agency.ae",
    joined: "You're on the list. We'll be in touch.",
    steps: [
      ["Radar", "Funding rounds, tenders, hiring, new offices, leadership changes — across Zawya, The National, MAGNiTT, careers pages and tender portals, every 30 minutes."],
      ["Thermometer", "Every signal decays over time. Stacked signals and ICP fit push an account from cold to hot — and you get alerted the moment it crosses."],
      ["Three variants", "Outcome-led, signal-led and proof-led. Written natively in English or Modern Standard Arabic, using only facts from your client's brain and approved case studies."],
      ["Simulated inbox", "Six AI personas, a Gmail-style summary, an iPhone lock-screen preview and a spam check score each variant before a human ever reads it."],
      ["Review & send", "Your client approves and sends from their own Gmail or Outlook. Send-only access, daily caps, opt-out on every email. Nothing goes out without a click."],
    ],
    trustTitle: "Safe by design",
    trustSub: "Tawqeet never sends on its own. Your client sees every email, the signal behind it and how it tested — then decides.",
    trust: ["Send-only mailbox access — we never read your inbox", "B2B work emails only, global suppression, one-click opt-out", "Every send is approved by a person, and logged"],
    pricing: { title: "One plan for agencies", price: "USD 399", per: "/month", items: ["5 client workspaces", "2,500 simulated emails / month", "Extra client USD 59 / month", "English + Arabic writer"] },
    footer: "Built in the Gulf, for the Gulf.",
  },
  ar: {
    nav: { signin: "تسجيل الدخول", demo: "احجز عرضاً توضيحياً" },
    eyebrow: "لوكالات التسويق والمبيعات بين الشركات في الإمارات والخليج",
    title: "الرسالة المناسبة، في التوقيت المناسب.",
    sub: "يراقب توقيت إشارات الأعمال في الخليج، ويجد الشخص المناسب، ويقيس مدى جاهزيته، ويكتب ثلاث رسائل، ويختبرها على صندوق بريد محاكى — ثم يتيح لعميلك إرسال الأفضل من بريده الخاص.",
    cta: "انضم إلى قائمة الانتظار",
    ctaDemo: "احجز عرضاً توضيحياً",
    placeholder: "you@agency.ae",
    joined: "تمت إضافتك إلى القائمة. سنتواصل معك قريباً.",
    steps: [
      ["الرادار", "جولات التمويل والمناقصات والتوظيف والمكاتب الجديدة وتغييرات القيادة — من زاوية وذا ناشيونال وماغنت وصفحات التوظيف وبوابات المناقصات، كل ٣٠ دقيقة."],
      ["مقياس الحرارة", "تتراجع قيمة كل إشارة مع الوقت. الإشارات المتراكمة وملاءمة العميل المثالي ترفع الحساب من بارد إلى ساخن — وتصلك التنبيهات فور ذلك."],
      ["ثلاث صيغ", "صيغة تركز على النتيجة، وأخرى على الإشارة، وثالثة على دراسة حالة. مكتوبة أصلاً بالإنجليزية أو بالعربية الفصحى، بالاعتماد على حقائق موثقة فقط."],
      ["صندوق بريد محاكى", "ست شخصيات افتراضية وملخص بأسلوب Gmail ومعاينة شاشة القفل وفحص للبريد المزعج، تقيّم كل صيغة قبل أن يقرأها أحد."],
      ["المراجعة والإرسال", "يوافق عميلك ويرسل من Gmail أو Outlook الخاص به. صلاحية إرسال فقط، وحدود يومية، وخيار إلغاء الاشتراك في كل رسالة. لا يُرسل شيء دون نقرة بشرية."],
    ],
    trustTitle: "آمن بطبيعته",
    trustSub: "لا يرسل توقيت أي رسالة بمفرده. يرى عميلك كل رسالة والإشارة التي وراءها ونتيجة اختبارها — ثم يقرر.",
    trust: ["صلاحية إرسال فقط — لا نقرأ بريدك أبداً", "عناوين عمل فقط، وقائمة حظر شاملة، وإلغاء اشتراك بنقرة", "كل رسالة يوافق عليها شخص، وتُسجل"],
    pricing: { title: "خطة واحدة للوكالات", price: "٣٩٩ دولاراً", per: "/شهرياً", items: ["٥ مساحات عمل للعملاء", "٢٬٥٠٠ رسالة محاكاة شهرياً", "عميل إضافي بـ ٥٩ دولاراً شهرياً", "كاتب بالعربية والإنجليزية"] },
    footer: "صُنع في الخليج، للخليج.",
  },
};

const STEP_ICONS = [<Radar key="r" />, <ThermoIcon key="t" />, <PenLine key="p" />, <Inbox key="i" />, <Mail key="m" />];

function HeroVisual() {
  const [score, setScore] = React.useState(38);
  React.useEffect(() => {
    const steps = [38, 61, 84];
    let i = 0;
    const t = setInterval(() => setScore(steps[++i % steps.length]), 2400);
    return () => clearInterval(t);
  }, []);
  const temp = score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";
  return (
    <div className="relative mx-auto w-full max-w-[460px]" dir="ltr">
      <div className="absolute -inset-10 -z-10 rounded-full [background:radial-gradient(closest-side,var(--hot-soft),transparent)] opacity-80" />
      <div className="rounded-2xl border bg-surface p-4 shadow-pop">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-ink-3">Noor Retail Group · 🇦🇪</div>
            <div className="mt-0.5 text-[14px] font-semibold">Rania Haddad, VP Supply Chain</div>
          </div>
          <Thermometer score={score} temperature={temp} />
        </div>
        <div className="mt-3 grid gap-1.5">
          {[
            ["◆", "Funding round", "AED 120M Series B", 61],
            ["＋", "Hiring sales roles", "Regional Sales Director, KSA", 38],
            ["↗", "New market", "12 stores in Saudi Arabia", 84],
          ].map(([icon, name, detail, at]) => (
            <div key={name as string} className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12px] transition-all duration-500", score >= (at as number) ? "opacity-100" : "opacity-30")}>
              <span className="text-ink-3">{icon}</span>
              <span className="font-medium">{name}</span>
              <span className="truncate text-ink-3">{detail}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="relative -mt-3 ms-8 rounded-2xl border bg-surface p-4 shadow-pop sm:ms-14">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-ink-3">Winning variant · signal-led</div>
            <div className="mt-1 truncate text-[13px] font-semibold">Noor's GCC expansion — warehousing</div>
            <p className="mt-1 line-clamp-2 text-[12px] text-ink-2">Saw Noor Retail just closed its Series B to expand across the GCC. New stores usually mean new warehouse capacity in a hurry…</p>
          </div>
          <ScoreRing score={score >= 70 ? 81 : 64} size={48} label="sim" />
        </div>
        <div className="mt-3 flex gap-1">
          {["Target lead", "C-level", "Skeptic", "Assistant", "AI agent", "Arabic-first"].map((p, i) => (
            <span key={p} title={p} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-500", i < (score >= 70 ? 5 : 3) ? "bg-good" : "bg-surface-3")} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function LandingPage({ locale = "en" }: { locale?: "en" | "ar" }) {
  const t = COPY[locale];
  const rtl = locale === "ar";
  const cfg = useApi<{ bookDemoUrl: string | null }>(["config"], "/public/config");
  const [email, setEmail] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [state, setState] = React.useState<"idle" | "busy" | "done" | string>("idle");
  const join = async (wantsDemo: boolean) => {
    setState("busy");
    try {
      await api("/public/waitlist", { method: "POST", json: { email, company: company || undefined, locale, wantsDemo } });
      setState("done");
    } catch (e) {
      setState((e as Error).message);
    }
  };
  const demo = () => (cfg.data?.bookDemoUrl ? window.open(cfg.data.bookDemoUrl, "_blank") : email ? join(true) : document.getElementById("waitlist")?.focus());

  return (
    <div dir={rtl ? "rtl" : "ltr"} lang={locale} className="min-h-screen overflow-x-clip">
      <header className="sticky top-0 z-30 border-b border-transparent bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Logo />
          <div className="flex items-center gap-1 sm:gap-2">
            <Link href={rtl ? "/" : "/ar"} className="rounded-lg px-2.5 py-1.5 text-[13px] text-ink-2 hover:bg-surface-3">
              {rtl ? "English" : "العربية"}
            </Link>
            <Button variant="ghost" asChild>
              <Link href="/login">{t.nav.signin}</Link>
            </Button>
            <Button variant="primary" className="hidden sm:inline-flex" onClick={demo}>
              {t.nav.demo}
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-12 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
        <div className="animate-in">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-1 text-[12px] text-ink-2 shadow-card">
            <span className="size-1.5 rounded-full bg-hot pulse-hot" /> {t.eyebrow}
          </p>
          <h1 className={cn("text-balance font-semibold tracking-[-0.035em]", rtl ? "text-[40px] leading-[1.25] sm:text-[52px]" : "text-[42px] leading-[1.02] sm:text-[60px]")}>{t.title}</h1>
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-ink-2">{t.sub}</p>
          {state === "done" ? (
            <p className="mt-8 inline-flex items-center gap-2 rounded-xl border bg-good-soft px-4 py-3 text-[14px] text-good">
              <Check className="size-4" /> {t.joined}
            </p>
          ) : (
            <form
              className="mt-8 flex max-w-lg flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                join(false);
              }}
            >
              <Input id="waitlist" type="email" required placeholder={t.placeholder} value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 text-[14px]" dir="ltr" />
              <Input placeholder={rtl ? "الوكالة" : "Agency"} value={company} onChange={(e) => setCompany(e.target.value)} className="h-11 text-[14px] sm:max-w-40" />
              <Button variant="primary" size="lg" className="h-11" loading={state === "busy"}>
                {t.cta} <ArrowRight className={rtl ? "rotate-180" : ""} />
              </Button>
            </form>
          )}
          {!["idle", "busy", "done"].includes(state) && <p className="mt-2 text-[12.5px] text-bad">{state}</p>}
          <button onClick={demo} className="mt-3 text-[13px] text-ink-2 underline-offset-4 hover:text-ink hover:underline">
            {t.ctaDemo} {rtl ? "←" : "→"}
          </button>
        </div>
        <HeroVisual />
      </section>

      <section className="border-y bg-surface-2/60">
        <div className="mx-auto grid max-w-6xl gap-px overflow-hidden px-4 py-16 sm:grid-cols-2 lg:grid-cols-5 lg:gap-6">
          {t.steps.map(([title, body], i) => (
            <div key={title} className="rounded-xl p-4 lg:p-0">
              <div className="mb-3 flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-lg bg-surface text-hot shadow-card [&_svg]:size-4">{STEP_ICONS[i]}</span>
                <span className="num text-[11px] text-ink-3">0{i + 1}</span>
              </div>
              <h3 className="text-[14px] font-semibold">{title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-20 lg:grid-cols-2">
        <div className="rounded-2xl border bg-surface p-6 shadow-card">
          <ShieldCheck className="mb-4 size-6 text-good" />
          <h2 className="text-[22px] font-semibold tracking-tight">{t.trustTitle}</h2>
          <p className="mt-2 mb-6 max-w-md text-[14px] leading-relaxed text-ink-2">{t.trustSub}</p>
          <ul className="grid gap-3">
            {t.trust.map((x) => (
              <li key={x} className="flex gap-2.5 text-[14px]">
                <Check className="mt-0.5 size-4 shrink-0 text-good" /> {x}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border bg-primary p-6 text-primary-ink shadow-pop">
          <p className="text-[13px] opacity-70">{t.pricing.title}</p>
          <p className="mt-2">
            <span className="num text-[40px] font-semibold tracking-tight">{t.pricing.price}</span>
            <span className="opacity-70">{t.pricing.per}</span>
          </p>
          <ul className="mt-4 grid gap-2 text-[14px]">
            {t.pricing.items.map((x) => (
              <li key={x} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-hot" /> {x}
              </li>
            ))}
          </ul>
          <Button variant="hot" size="lg" className="mt-6" onClick={demo}>
            {t.ctaDemo}
          </Button>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-[12.5px] text-ink-3">
          <Logo mark={false} />
          <span>{t.footer}</span>
        </div>
      </footer>
    </div>
  );
}
