import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useGetLandingInfo, getGetLandingInfoQueryKey } from "@workspace/api-client-react";
import { Radar, Inbox, BellRing, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand";

type Lang = "en" | "ar";
const copy = {
  en: {
    eyebrow: "For GCC outbound agencies", headline: "Know when to reach out. Know it works before you send.",
    sub: "Tawqeet watches Gulf buying signals, writes evidence-backed emails per client, and tests them on a simulated inbox before a human approves the send.",
    cta: "Book a demo", signIn: "Sign in", toggle: "العربية",
    features: [
      { icon: Radar, title: "Gulf signal radar", body: "Hiring surges, funding rounds and government tenders across the UAE, KSA and the wider GCC, scored with decay and evidence links." },
      { icon: Inbox, title: "Simulated AI inbox", body: "Six buyer personas react to every draft, with Gmail-style summaries and Apple Mail previews, so you rewrite before you send." },
      { icon: BellRing, title: "Hot leads to your tools", body: "When a lead turns Hot, it lands in Trello, Asana, ClickUp, SMS or email, with why-now and the source." },
    ],
    pricingTitle: "Simple agency pricing", price: "USD 399", per: "/month",
    pricing: ["5 client workspaces included", "+USD 59 per extra client", "Human approval and compliance built in"],
    footer: "Tawqeet · Dubai · Riyadh · Doha",
  },
  ar: {
    eyebrow: "لوكالات المبيعات الخارجية في الخليج", headline: "اعرف متى تتواصل. واعرف أن رسالتك تنجح قبل أن ترسلها.",
    sub: "يرصد توقيت إشارات الشراء في الخليج، ويكتب رسائل مدعومة بالأدلة لكل عميل، ويختبرها في صندوق وارد محاكى قبل أن يوافق عليها شخص من فريقك.",
    cta: "احجز عرضاً توضيحياً", signIn: "تسجيل الدخول", toggle: "English",
    features: [
      { icon: Radar, title: "رادار إشارات الخليج", body: "موجات التوظيف وجولات التمويل والمناقصات الحكومية في الإمارات والسعودية ودول الخليج، مع تقييم يتراجع مع الوقت وروابط للمصادر." },
      { icon: Inbox, title: "صندوق وارد محاكى بالذكاء الاصطناعي", body: "ست شخصيات مشترين تتفاعل مع كل مسودة، مع ملخص بأسلوب Gmail ومعاينة Apple Mail، لتعيد الكتابة قبل الإرسال." },
      { icon: BellRing, title: "العملاء الساخنون إلى أدواتك", body: "عندما يصبح العميل ساخناً يصل إلى Trello أو Asana أو ClickUp أو رسالة نصية أو بريد، مع سبب التوقيت والمصدر." },
    ],
    pricingTitle: "تسعير بسيط للوكالات", price: "399 دولاراً", per: "/شهرياً",
    pricing: ["5 مساحات عمل للعملاء مشمولة", "59 دولاراً لكل عميل إضافي", "موافقة بشرية وامتثال مدمجان"],
    footer: "توقيت · دبي · الرياض · الدوحة",
  },
} as const;

export default function LandingPage() {
  const [lang, setLang] = useState<Lang>(() => {
    try { return (localStorage.getItem("tawqeet-lang") as Lang) || "en"; } catch { return "en"; }
  });
  useEffect(() => { try { localStorage.setItem("tawqeet-lang", lang); } catch { /* optional */ } }, [lang]);
  const info = useGetLandingInfo({ query: { queryKey: getGetLandingInfoQueryKey(), retry: false } });
  const t = copy[lang];
  const book = info.data?.bookDemoUrl ?? null;

  return (
    <div dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} className="min-h-[100dvh] bg-background" data-testid="page-landing">
      <header className="mx-auto max-w-6xl px-4 md:px-10 py-5 flex items-center gap-3">
        <Wordmark />
        <div className="ms-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setLang(lang === "en" ? "ar" : "en")} data-testid="button-lang">{t.toggle}</Button>
          <Button variant="outline" size="sm" asChild><Link href="/login">{t.signIn}</Link></Button>
        </div>
      </header>
      <section className="relative overflow-hidden bg-sidebar text-sidebar-foreground">
        <div className="absolute inset-0 girih opacity-30" />
        <div className="relative mx-auto max-w-6xl px-4 md:px-10 py-20 md:py-28 rise">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-sidebar-primary">{t.eyebrow}</div>
          <h1 className="font-display text-4xl md:text-6xl leading-[1.05] mt-4 max-w-3xl">{t.headline}</h1>
          <p className="mt-6 text-sidebar-foreground/75 max-w-2xl leading-relaxed">{t.sub}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {book ? <Button asChild className="h-11 bg-accent text-accent-foreground hover:bg-accent/90" data-testid="button-book-demo">
              <a href={book} target={book.startsWith("mailto:") ? undefined : "_blank"} rel="noreferrer">{t.cta}<ArrowRight className="ms-2 h-4 w-4 rtl:rotate-180" /></a></Button>
              : <Button asChild className="h-11 bg-accent text-accent-foreground hover:bg-accent/90"><Link href="/login">{t.signIn}<ArrowRight className="ms-2 h-4 w-4 rtl:rotate-180" /></Link></Button>}
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 md:px-10 py-16 grid md:grid-cols-3 gap-4">
        {t.features.map((f) => (
          <div key={f.title} className="rounded-lg border bg-card p-6">
            <f.icon className="h-5 w-5 text-accent" />
            <h2 className="font-display text-xl mt-3">{f.title}</h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{f.body}</p>
          </div>
        ))}
      </section>
      <section className="mx-auto max-w-6xl px-4 md:px-10 pb-20">
        <div className="rounded-lg border bg-card p-8 flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex-1">
            <h2 className="font-display text-2xl">{t.pricingTitle}</h2>
            <ul className="mt-3 space-y-1 text-sm">{t.pricing.map((p) => <li key={p} className="flex gap-2"><Check className="h-4 w-4 text-accent mt-0.5" />{p}</li>)}</ul>
          </div>
          <div className="font-display text-4xl">{t.price}<span className="text-base text-muted-foreground">{t.per}</span></div>
          {book && <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90"><a href={book} target={book.startsWith("mailto:") ? undefined : "_blank"} rel="noreferrer">{t.cta}</a></Button>}
        </div>
      </section>
      <footer className="border-t py-6 text-center font-mono text-xs text-muted-foreground">{t.footer}</footer>
    </div>
  );
}
