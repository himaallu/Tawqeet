/**
 * Default play library: one play per signal definition, in English and Arabic.
 * Seeded into every new agency; editable on the Plays page. Arabic plays are written natively
 * in Modern Standard Arabic with a respectful GCC business tone, not translated.
 */
export const PRINCIPLES = {
  en: [
    "First line: a specific, true observation tied to the signal. Never generic flattery.",
    "One quantified, believable outcome relevant to the lead's role — only numbers from the brain or an approved case study.",
    "Under 120 words. Plain text. One link max.",
    "One small, specific ask (e.g. \"a 15-minute call Tuesday or Wednesday?\").",
    "Subject line: short, specific to their situation, no clickbait.",
    "Follow-ups (later): shorter than the first email, stop on reply.",
  ].join("\n"),
  ar: [
    "السطر الأول: ملاحظة محددة وصحيحة مرتبطة بالإشارة، دون مجاملات عامة.",
    "نتيجة واحدة قابلة للقياس وذات صلة بدور المستلم، والأرقام من قاعدة المعرفة أو دراسة حالة معتمدة فقط.",
    "أقل من ١٢٠ كلمة، نص عادي، ورابط واحد كحد أقصى.",
    "طلب واحد صغير ومحدد (مثل: «اتصال لمدة ١٥ دقيقة يوم الثلاثاء أو الأربعاء؟»).",
    "عنوان الرسالة قصير ومحدد لوضعهم، دون إثارة مبالغ فيها.",
    "اللغة: عربية فصحى معاصرة بنبرة مهنية محترمة تناسب بيئة الأعمال الخليجية، مكتوبة أصلاً بالعربية وليست مترجمة.",
  ].join("\n"),
};

type PlaySeed = { signalKey: string; name: string; en: string; ar: string };

const PLAYS: PlaySeed[] = [
  {
    signalKey: "funding_round",
    name: "Fresh capital, new priorities",
    en: "1) Name the round and what it is for (from the announcement).\n2) The operational pressure that funding creates for their role.\n3) One outcome we delivered for a similar company.\n4) Small ask.",
    ar: "١) اذكر جولة التمويل والغرض المعلن منها.\n٢) الضغط التشغيلي الذي يفرضه النمو على دور المستلم.\n٣) نتيجة واحدة حققناها لشركة مماثلة.\n٤) طلب صغير ومحدد.",
  },
  {
    signalKey: "expansion_new_market",
    name: "New market, first 90 days",
    en: "1) Name the market they are entering.\n2) The first bottleneck companies usually hit there.\n3) How we removed it for someone similar (one number).\n4) Small ask.",
    ar: "١) اذكر السوق الجديد الذي يدخلونه.\n٢) أول عقبة تواجه الشركات عادةً هناك.\n٣) كيف أزلناها لشركة مماثلة (رقم واحد).\n٤) طلب صغير.",
  },
  {
    signalKey: "hiring_sales_role",
    name: "Scaling the sales team",
    en: "1) Mention the sales roles they posted.\n2) New reps need pipeline from day one.\n3) Outcome for a similar team.\n4) Small ask.",
    ar: "١) أشر إلى وظائف المبيعات المعلنة.\n٢) الموظفون الجدد يحتاجون إلى فرص بيع منذ اليوم الأول.\n٣) نتيجة لفريق مماثل.\n٤) طلب صغير.",
  },
  {
    signalKey: "hiring_relevant_role",
    name: "Hiring for the problem we solve",
    en: "1) Mention the role(s) they are hiring for.\n2) What that hire will be measured on.\n3) How we help that person hit it faster.\n4) Small ask.",
    ar: "١) اذكر الوظيفة التي يوظفون لها.\n٢) المؤشرات التي سيُقاس بها أداء الموظف الجديد.\n٣) كيف نساعده على تحقيقها أسرع.\n٤) طلب صغير.",
  },
  {
    signalKey: "careers_page_new_roles",
    name: "Team growth on the careers page",
    en: "1) Note the new roles on their careers page.\n2) Growth creates a specific operational strain.\n3) One outcome from a similar company.\n4) Small ask.",
    ar: "١) أشر إلى الوظائف الجديدة على صفحة التوظيف.\n٢) النمو يخلق ضغطاً تشغيلياً محدداً.\n٣) نتيجة من شركة مماثلة.\n٤) طلب صغير.",
  },
  {
    signalKey: "leadership_change",
    name: "New leader, first 100 days",
    en: "1) Congratulate briefly on the new role (one clause, factual).\n2) New leaders review vendors and set priorities early.\n3) One relevant outcome.\n4) Small ask, respectful of their ramp-up.",
    ar: "١) تهنئة موجزة بالمنصب الجديد.\n٢) القادة الجدد يراجعون الأولويات والشركاء مبكراً.\n٣) نتيجة واحدة ذات صلة.\n٤) طلب صغير يراعي انشغالهم في البداية.",
  },
  {
    signalKey: "tender_published",
    name: "Tender response partner",
    en: "1) Reference the tender by name/number.\n2) What evaluators will weigh most.\n3) Our relevant delivery record (one number).\n4) Ask for the right contact or a short call before the deadline.",
    ar: "١) اذكر المناقصة باسمها أو رقمها.\n٢) أهم معايير التقييم المتوقعة.\n٣) سجلنا ذو الصلة (رقم واحد).\n٤) اطلب جهة الاتصال المناسبة أو اتصالاً قصيراً قبل الموعد النهائي.",
  },
  {
    signalKey: "new_company_registration",
    name: "Day-one setup",
    en: "1) Note the new entity/registration.\n2) The setup task that usually gets rushed.\n3) How we make it simple (one outcome).\n4) Small ask.",
    ar: "١) أشر إلى تسجيل الكيان الجديد.\n٢) مهمة التأسيس التي تُنجز عادةً على عجل.\n٣) كيف نجعلها أبسط (نتيجة واحدة).\n٤) طلب صغير.",
  },
  {
    signalKey: "product_launch",
    name: "Launch momentum",
    en: "1) Name the product/launch.\n2) What has to go right in the next quarter for it.\n3) One outcome for a similar launch.\n4) Small ask.",
    ar: "١) اذكر المنتج أو الإطلاق.\n٢) ما يجب أن ينجح خلال الربع القادم.\n٣) نتيجة لإطلاق مماثل.\n٤) طلب صغير.",
  },
  {
    signalKey: "partnership_announced",
    name: "Partnership follow-through",
    en: "1) Name the partnership.\n2) The execution work it creates.\n3) One outcome from similar work.\n4) Small ask.",
    ar: "١) اذكر الشراكة.\n٢) العمل التنفيذي الذي تتطلبه.\n٣) نتيجة من عمل مماثل.\n٤) طلب صغير.",
  },
  {
    signalKey: "event_exhibitor",
    name: "Meet at the event",
    en: "1) Mention the event (e.g. GITEX, Cityscape) and their stand.\n2) One relevant outcome.\n3) Ask for 15 minutes at the event or the week after.",
    ar: "١) اذكر المعرض (مثل جيتكس أو سيتي سكيب) ومشاركتهم.\n٢) نتيجة واحدة ذات صلة.\n٣) اطلب ١٥ دقيقة خلال المعرض أو الأسبوع الذي يليه.",
  },
  {
    signalKey: "office_opening",
    name: "New office, new team",
    en: "1) Name the new office/city.\n2) What a new site needs in its first months.\n3) One outcome for a similar opening.\n4) Small ask.",
    ar: "١) اذكر المكتب أو المدينة الجديدة.\n٢) احتياجات الموقع الجديد في أشهره الأولى.\n٣) نتيجة لافتتاح مماثل.\n٤) طلب صغير.",
  },
];

export function defaultPlays(agencyId: string) {
  return PLAYS.flatMap((p) => [
    { agencyId, signalKey: p.signalKey, persona: "any", vertical: "any", language: "en", name: p.name, structure: p.en, principles: PRINCIPLES.en },
    { agencyId, signalKey: p.signalKey, persona: "any", vertical: "any", language: "ar", name: p.name, structure: p.ar, principles: PRINCIPLES.ar },
  ]);
}

/** Placeholder signal list (the founders will replace it): base weight / half-life days. */
export const DEFAULT_SIGNAL_DEFINITIONS = [
  { key: "funding_round", name: "Funding round", sourceType: "funding", baseWeight: 35, halfLifeDays: 30 },
  { key: "expansion_new_market", name: "Expansion into a new market", sourceType: "news", baseWeight: 30, halfLifeDays: 45 },
  { key: "hiring_sales_role", name: "Hiring a sales role", sourceType: "hiring", baseWeight: 25, halfLifeDays: 30 },
  { key: "hiring_relevant_role", name: "Hiring a relevant role", sourceType: "hiring", baseWeight: 25, halfLifeDays: 30 },
  { key: "careers_page_new_roles", name: "New roles on careers page", sourceType: "careers_page", baseWeight: 20, halfLifeDays: 21 },
  { key: "leadership_change", name: "Leadership change", sourceType: "leadership", baseWeight: 30, halfLifeDays: 60 },
  { key: "tender_published", name: "Tender published", sourceType: "tender", baseWeight: 35, halfLifeDays: 21 },
  { key: "new_company_registration", name: "New company registration", sourceType: "registry", baseWeight: 15, halfLifeDays: 90 },
  { key: "product_launch", name: "Product launch", sourceType: "news", baseWeight: 20, halfLifeDays: 30 },
  { key: "partnership_announced", name: "Partnership announced", sourceType: "news", baseWeight: 20, halfLifeDays: 30 },
  { key: "event_exhibitor", name: "Event exhibitor (GITEX, Cityscape…)", sourceType: "news", baseWeight: 20, halfLifeDays: 14 },
  { key: "office_opening", name: "Office opening", sourceType: "news", baseWeight: 25, halfLifeDays: 45 },
] as const;

/** Public RSS sources for radar-news. Feeds move; failing ones show their error in Settings. */
export const DEFAULT_RADAR_SOURCES = [
  { name: "Zawya — Business", url: "https://www.zawya.com/sitemaps/en/rss", job: "radar-news" },
  { name: "Gulf News — Business", url: "https://gulfnews.com/feeds/business", job: "radar-news" },
  { name: "The National — Business", url: "https://www.thenationalnews.com/arc/outboundfeeds/rss/category/business/?outputType=xml", job: "radar-news" },
  { name: "Wamda", url: "https://www.wamda.com/feed", job: "radar-news" },
  { name: "MAGNiTT — News", url: "https://magnitt.com/news/rss", job: "radar-news" },
  { name: "Arabian Business", url: "https://www.arabianbusiness.com/feed", job: "radar-news" },
] as const;
