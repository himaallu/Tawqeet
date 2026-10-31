# Tawqeet — Signal definitions v1 (built from the founders' signal list)

**Source:** the founders' Google Doc "Valcat — 50+ Sales Signals for Clay & Trigify", which lists **141 signals** (scraped from valcat.co on 31 Oct 2026). All 141 were reviewed. Our definitions, weights and email angles are written fresh for Tawqeet; the doc's example emails are not reused.

**How the 141 were sorted:**

| Bucket | Doc signals (#) | Decision |
|---|---|---|
| **A. External, public, Gulf-relevant** | 1–4, 22, 30, 40, 69–71, 74, 109–119, 121, 122, 141 | **Built in v1** (20 definitions below, several doc signals merged into one) |
| **B. Client's own first-party data** (their website visitors, product usage, CRM, support, email) | 20, 21, 49–58, 79–108, 125–134, 136 | **Phase 2**: a Tawqeet website pixel and CRM sync per client. Exception: past-champion job changes (#71) use the CRM import, so they're in v1 |
| **C. Social engagement** (LinkedIn likes/comments/views, X, Instagram, TikTok, YouTube, Reddit, influencers) | 9–19, 31–37, 41–46, 72, 73, 75–78 | **Later**, through a compliant data provider. Scraping LinkedIn breaks its terms, and Trigify, which the doc is built around, was shut down on 22 Oct 2026 |
| **D. Infrastructure signals** (performance, subdomains, DNS/SPF/DKIM, CDN, web traffic) | 5–8, 23 | **Phase 2** (cheap DNS checks; DKIM/DMARC additions are a good signal for email-related clients) |
| **E. Not applicable** (inside other tools, developer communities, or workflow features we already have) | 24–29, 38, 39, 47, 48, 59–68, 135, 137–140 | Skip. Enrichment (#38–39) is LeadOcean's job; alerts (#41, #42, #47, #48) are already in Tawqeet. Shared investor/advisor (#138–139) can return later as "warm path" signals |

Weights are 0–40 points. Half-life is how many days until a signal is worth half. Multipliers adjust the weight per client vertical: SaaS/tech (`saas`), real estate & construction (`re`), recruitment & HR (`hr`).

| # | Key | Signal | From doc # | Weight | Half-life | saas / re / hr |
|---|---|---|---|---|---|---|
| 1 | `funding_round` | Raised funding | 121 | 35 | 30 | 1.0 / 0.6 / 1.0 |
| 2 | `tender_published` | Tender published (GCC) | — (Gulf addition) | 35 | 21 | 0.6 / 1.0 / 0.6 |
| 3 | `project_award_or_launch` | Project launched / contract awarded | — (Gulf addition) | 35 | 30 | 0.4 / 1.0 / 0.8 |
| 4 | `champion_job_change` | Past champion joined a new company | 71 | 35 | 60 | 1.0 / 1.0 / 1.0 |
| 5 | `expansion_new_market` | New market, office or location | 118, 30 | 30 | 45 | 1.0 / 0.8 / 1.0 |
| 6 | `leadership_change` | New leader or board member | 40, 69, 70, 117 | 30 | 60 | 1.0 / 1.0 / 1.0 |
| 7 | `acquisition_merger` | Acquisition or merger | 115 | 30 | 90 | 1.0 / 0.8 / 1.0 |
| 8 | `hiring_sales_role` | Hiring sales/BD roles | 74 | 25 | 30 | 1.0 / 0.7 / 0.8 |
| 9 | `hiring_surge` | 5+ new roles in 30 days | 74 | 25 | 21 | 0.8 / 0.8 / 1.0 |
| 10 | `regulation_change` | New regulation for the industry (industry-level) | 122 | 25 | 60 | 1.0 / 0.8 / 1.0 |
| 11 | `product_launch` | Product or service launch | 119 | 20 | 30 | 1.0 / 0.6 / 0.6 |
| 12 | `partnership_announced` | Partnership announced | 114 | 20 | 30 | 1.0 / 0.8 / 0.8 |
| 13 | `event_exhibitor` | Exhibiting, sponsoring or speaking at an event | 109, 110, 111, 124 | 20 | 14 | 1.0 / 1.0 / 0.6 |
| 14 | `tech_stack_change` | Tech stack change or adjacency | 22, 141 | 20 | 45 | 1.0 / 0.4 / 0.6 |
| 15 | `investor_update_growth` | Listed-company growth disclosure (DFM, ADX, Tadawul) | 116 | 20 | 45 | 0.8 / 1.0 / 0.8 |
| 16 | `new_company_registration` | New company or free-zone setup | — (Gulf addition) | 15 | 90 | 0.8 / 0.6 / 0.8 |
| 17 | `award_recognition` | Award or ranking | 113 | 15 | 30 | 1.0 / 1.0 / 0.8 |
| 18 | `certification_acquired` | SOC 2 / ISO certification | 4 | 15 | 60 | 1.0 / 0.6 / 0.6 |
| 19 | `website_change` | Homepage, pricing or integrations page change | 1, 2, 3 | 15 | 21 | 1.0 / 0.6 / 0.6 |
| 20 | `layoffs_or_freeze` | Layoffs or hiring freeze (negative) | — | −25 | 60 | 1.0 / 1.0 / 1.0 |

Press releases (#112) are treated as a source, not a signal: the classifier maps each release to one of the types above.

**Strongest stacks to highlight:** funding + hiring sales roles · expansion + hiring surge · new leader + tech stack change · project award + tender · champion job change + anything at their new company · acquisition + leadership change.

---

## Paste into Replit Agent (Power mode, before Prompt C)

```
Replace the placeholder signal_definitions with the v1 set below (20 definitions).

1. Extend signal_definitions with: description text, source_types text[], vertical_multipliers jsonb ({saas, re, hr}), target_personas text[], keywords_en text[], keywords_ar text[], exclusions text[], play_hint text, is_negative boolean, scope text default 'company' ('company' or 'industry').
2. Seed the 20 definitions from the JSON below (upsert by key).
3. Radar classifier: give the AI every definition (key, description, keywords EN/AR, exclusions) and ask for {event_type, confidence 0-1, company_name, country, date, evidence_quote}. Drop results with confidence < 0.6, no company (unless scope = industry), no date, outside the GCC, or matching an exclusion. Treat press releases as a source and classify them into these types.
4. Collectors per source_type:
   - news: the RSS radar (already planned).
   - careers_page and website: the page-diff watcher. For website_change, also watch the homepage, /pricing and /integrations of tracked companies; ignore small edits (less than 15% of text changed).
   - leadocean: hiring, funding, executive and technographic filters (weekly).
   - crm: champion_job_change. Weekly, check the client's imported CRM contacts against LeadOcean; if a contact's company changed, create the signal on the NEW company and the lead is that contact.
   - exchange_disclosure: RSS/news from DFM, ADX and Tadawul disclosures if available; otherwise news.
   - google_maps, government, tender, registry: news-based for now; add direct collectors later.
5. Industry-scope signals (regulation_change): store once with the affected industries and countries; apply to every tracked company in those industries for clients whose verticals match.
6. Thermometer: signal_points = sum of base_weight x vertical_multiplier[client vertical] x 0.5^(age_days / half_life_days). Negative signals subtract. Cap signal_points at 50, total score 0-100.
7. Settings > Signals page to edit weights, half-lives, multipliers, keywords, and turn each on/off; changes re-score leads.
8. On each lead, show the matched signals with evidence quote and source link.
9. Update CHANGELOG and tell me "Ready to commit".
```

```json
[
  {
    "key": "funding_round",
    "name": "Raised funding",
    "description": "The company announced a new investment round (pre-seed to growth) or a significant strategic investment.",
    "source_types": [
      "news",
      "funding",
      "leadocean"
    ],
    "base_weight": 35,
    "half_life_days": 30,
    "vertical_multipliers": {
      "saas": 1.0,
      "re": 0.6,
      "hr": 1.0
    },
    "target_personas": [
      "CEO",
      "COO",
      "Head of Growth"
    ],
    "keywords_en": [
      "raises",
      "raised",
      "funding round",
      "seed round",
      "Series A",
      "Series B",
      "Series C",
      "investment led by",
      "secures funding"
    ],
    "keywords_ar": [
      "تمويل",
      "جولة تمويل",
      "جولة استثمارية",
      "يجمع",
      "استثمار بقيمة"
    ],
    "exclusions": [
      "fund launch by an investment firm",
      "IPO rumour",
      "government budget"
    ],
    "play_hint": "Growth after funding: help them hit the plan the round was raised for.",
    "is_negative": false
  },
  {
    "key": "expansion_new_market",
    "name": "Expanding to a new market or office",
    "description": "The company is entering a new GCC country or city, or opening a new office, branch or HQ. Includes a new location appearing on Google Maps or a new branch listing.",
    "source_types": [
      "news",
      "google_maps"
    ],
    "base_weight": 30,
    "half_life_days": 45,
    "vertical_multipliers": {
      "saas": 1.0,
      "re": 0.8,
      "hr": 1.0
    },
    "target_personas": [
      "CEO",
      "General Manager",
      "Country Manager"
    ],
    "keywords_en": [
      "expands to",
      "expansion into",
      "opens office",
      "new headquarters",
      "launches in Saudi",
      "enters the UAE",
      "regional HQ"
    ],
    "keywords_ar": [
      "توسع",
      "افتتاح مكتب",
      "مقر إقليمي",
      "يدخل السوق السعودي",
      "فرع جديد"
    ],
    "exclusions": [
      "retail store opening of a mall brand unless client sells to retail"
    ],
    "play_hint": "New market, new pipeline: offer local reach or speed-to-market.",
    "is_negative": false
  },
  {
    "key": "hiring_sales_role",
    "name": "Hiring sales or BD roles",
    "description": "Open roles for SDR, BDR, account executive, business development, sales manager or head of sales.",
    "source_types": [
      "careers_page",
      "hiring",
      "leadocean"
    ],
    "base_weight": 25,
    "half_life_days": 30,
    "vertical_multipliers": {
      "saas": 1.0,
      "re": 0.7,
      "hr": 0.8
    },
    "target_personas": [
      "Head of Sales",
      "CRO",
      "CEO"
    ],
    "keywords_en": [
      "SDR",
      "BDR",
      "Account Executive",
      "Business Development",
      "Sales Manager",
      "Head of Sales"
    ],
    "keywords_ar": [
      "تطوير الأعمال",
      "مدير مبيعات",
      "مندوب مبيعات"
    ],
    "exclusions": [
      "retail sales associate",
      "store sales staff"
    ],
    "play_hint": "They're investing in pipeline: offer more meetings while the team ramps.",
    "is_negative": false
  },
  {
    "key": "hiring_surge",
    "name": "Hiring surge",
    "description": "Five or more new open roles appeared on the company's careers page within 30 days.",
    "source_types": [
      "careers_page"
    ],
    "base_weight": 25,
    "half_life_days": 21,
    "vertical_multipliers": {
      "saas": 0.8,
      "re": 0.8,
      "hr": 1.0
    },
    "target_personas": [
      "HR Director",
      "Head of Talent Acquisition",
      "COO"
    ],
    "keywords_en": [
      "we're hiring",
      "join our team",
      "open positions"
    ],
    "keywords_ar": [
      "نحن نوظف",
      "وظائف شاغرة",
      "انضم إلى فريقنا"
    ],
    "exclusions": [
      "the same roles re-posted"
    ],
    "play_hint": "Scaling fast: offer to remove a bottleneck that growth creates.",
    "is_negative": false
  },
  {
    "key": "leadership_change",
    "name": "New leader",
    "description": "A new CEO, CMO, CRO, head of sales, HR or procurement was appointed in the last 90 days. Also covers board appointments and internal promotions into these roles (lower confidence).",
    "source_types": [
      "news",
      "leadocean"
    ],
    "base_weight": 30,
    "half_life_days": 60,
    "vertical_multipliers": {
      "saas": 1.0,
      "re": 1.0,
      "hr": 1.0
    },
    "target_personas": [
      "the newly appointed executive"
    ],
    "keywords_en": [
      "appoints",
      "names",
      "joins as",
      "new CEO",
      "new Chief",
      "promoted to",
      "joins the board",
      "promoted to"
    ],
    "keywords_ar": [
      "تعيين",
      "رئيساً تنفيذياً",
      "مديراً عاماً جديداً"
    ],
    "exclusions": [
      "board member only",
      "interim announcement retracted"
    ],
    "play_hint": "New leaders review vendors in their first 90 days: offer a quick win.",
    "is_negative": false
  },
  {
    "key": "tender_published",
    "name": "Tender published",
    "description": "A government or semi-government tender or RFP in the client's category was published.",
    "source_types": [
      "tender",
      "news"
    ],
    "base_weight": 35,
    "half_life_days": 21,
    "vertical_multipliers": {
      "saas": 0.6,
      "re": 1.0,
      "hr": 0.6
    },
    "target_personas": [
      "Procurement Manager",
      "Project Director"
    ],
    "keywords_en": [
      "tender",
      "RFP",
      "request for proposal",
      "invitation to bid",
      "procurement notice"
    ],
    "keywords_ar": [
      "مناقصة",
      "طرح مناقصة",
      "منافسة عامة",
      "كراسة الشروط"
    ],
    "exclusions": [
      "tender closing date already passed"
    ],
    "play_hint": "Help bidders win or deliver the tender (partners, subcontractors, staffing).",
    "is_negative": false
  },
  {
    "key": "project_award_or_launch",
    "name": "Project launched or contract awarded",
    "description": "A real estate or construction project was launched, or a construction/infrastructure contract was awarded.",
    "source_types": [
      "news"
    ],
    "base_weight": 35,
    "half_life_days": 30,
    "vertical_multipliers": {
      "saas": 0.4,
      "re": 1.0,
      "hr": 0.8
    },
    "target_personas": [
      "Development Director",
      "Project Director",
      "Procurement Manager"
    ],
    "keywords_en": [
      "awarded contract",
      "wins contract",
      "launches project",
      "master development",
      "groundbreaking",
      "phase launch"
    ],
    "keywords_ar": [
      "ترسية عقد",
      "إطلاق مشروع",
      "وضع حجر الأساس",
      "منح عقد"
    ],
    "exclusions": [
      "project cancelled",
      "rumoured project"
    ],
    "play_hint": "Big project, new needs: staffing, suppliers, software, marketing.",
    "is_negative": false
  },
  {
    "key": "new_company_registration",
    "name": "New company or free-zone setup",
    "description": "A company was newly licensed or set up an entity in a UAE/GCC free zone or mainland.",
    "source_types": [
      "registry",
      "news"
    ],
    "base_weight": 15,
    "half_life_days": 90,
    "vertical_multipliers": {
      "saas": 0.8,
      "re": 0.6,
      "hr": 0.8
    },
    "target_personas": [
      "Founder",
      "Managing Director"
    ],
    "keywords_en": [
      "sets up in",
      "registers in DIFC",
      "joins DMCC",
      "licensed in ADGM",
      "establishes entity"
    ],
    "keywords_ar": [
      "تأسيس شركة",
      "ترخيص جديد",
      "المنطقة الحرة"
    ],
    "exclusions": [
      "shell company with no activity"
    ],
    "play_hint": "New in the market: offer setup essentials and first customers.",
    "is_negative": false
  },
  {
    "key": "product_launch",
    "name": "Product or service launch",
    "description": "The company launched a new product, service line or major feature.",
    "source_types": [
      "news"
    ],
    "base_weight": 20,
    "half_life_days": 30,
    "vertical_multipliers": {
      "saas": 1.0,
      "re": 0.6,
      "hr": 0.6
    },
    "target_personas": [
      "Head of Marketing",
      "Head of Product"
    ],
    "keywords_en": [
      "launches",
      "unveils",
      "introduces",
      "now available"
    ],
    "keywords_ar": [
      "تطلق",
      "تكشف عن",
      "إطلاق خدمة"
    ],
    "exclusions": [
      "minor update",
      "promotional discount"
    ],
    "play_hint": "Launch needs reach: offer demand generation for the new product.",
    "is_negative": false
  },
  {
    "key": "partnership_announced",
    "name": "Partnership announced",
    "description": "A partnership, distribution, reseller or strategic alliance was announced.",
    "source_types": [
      "news"
    ],
    "base_weight": 20,
    "half_life_days": 30,
    "vertical_multipliers": {
      "saas": 1.0,
      "re": 0.8,
      "hr": 0.8
    },
    "target_personas": [
      "Head of Business Development",
      "CEO"
    ],
    "keywords_en": [
      "partners with",
      "partnership",
      "MoU",
      "strategic alliance",
      "distribution agreement"
    ],
    "keywords_ar": [
      "شراكة",
      "مذكرة تفاهم",
      "اتفاقية توزيع"
    ],
    "exclusions": [
      "sponsorship only"
    ],
    "play_hint": "New partnership, new go-to-market: offer to support the rollout.",
    "is_negative": false
  },
  {
    "key": "event_exhibitor",
    "name": "Exhibiting, sponsoring or speaking at an event",
    "description": "The company is exhibiting, sponsoring, giving a keynote or sending a team to a major regional event in the next 30 days, or just did.",
    "source_types": [
      "event",
      "news"
    ],
    "base_weight": 20,
    "half_life_days": 14,
    "vertical_multipliers": {
      "saas": 1.0,
      "re": 1.0,
      "hr": 0.6
    },
    "target_personas": [
      "Head of Marketing",
      "Head of Sales"
    ],
    "keywords_en": [
      "GITEX",
      "LEAP",
      "Cityscape",
      "Big 5",
      "Arabian Travel Market",
      "exhibitor",
      "booth",
      "speaker",
      "sponsor",
      "keynote",
      "headline partner"
    ],
    "keywords_ar": [
      "جيتكس",
      "معرض",
      "جناح",
      "متحدث"
    ],
    "exclusions": [
      "attendee only"
    ],
    "play_hint": "Before: book a meeting at the event. After: follow up on event leads.",
    "is_negative": false
  },
  {
    "key": "tech_stack_change",
    "name": "Tech stack change",
    "description": "The company adopted, migrated to or dropped a tool relevant to the client (including a competitor). Also covers adopting complementary tools in the client's ecosystem (stack adjacency) and hosting/CDN migrations.",
    "source_types": [
      "leadocean",
      "careers_page"
    ],
    "base_weight": 20,
    "half_life_days": 45,
    "vertical_multipliers": {
      "saas": 1.0,
      "re": 0.4,
      "hr": 0.6
    },
    "target_personas": [
      "CTO",
      "Head of Operations",
      "RevOps"
    ],
    "keywords_en": [
      "migrating to",
      "experience with <tool>",
      "implemented",
      "switched to"
    ],
    "keywords_ar": [
      "الانتقال إلى",
      "تطبيق نظام"
    ],
    "exclusions": [
      "tool mentioned only as a nice-to-have skill"
    ],
    "play_hint": "Tool change means a window: offer integration or a better alternative.",
    "is_negative": false
  },
  {
    "key": "champion_job_change",
    "name": "Past champion joined a new company",
    "description": "A contact from the client's CRM (past customer, champion or engaged lead) started a new role at a different company in the last 90 days.",
    "source_types": [
      "crm",
      "leadocean"
    ],
    "base_weight": 35,
    "half_life_days": 60,
    "vertical_multipliers": {
      "saas": 1.0,
      "re": 1.0,
      "hr": 1.0
    },
    "target_personas": [
      "the former champion"
    ],
    "keywords_en": [],
    "keywords_ar": [],
    "exclusions": [
      "contact left to a company outside the client's ICP"
    ],
    "play_hint": "Warm re-introduction: they already know and trust the client.",
    "is_negative": false
  },
  {
    "key": "acquisition_merger",
    "name": "Acquisition or merger",
    "description": "The company acquired another company, merged, or was acquired.",
    "source_types": [
      "news"
    ],
    "base_weight": 30,
    "half_life_days": 90,
    "vertical_multipliers": {
      "saas": 1.0,
      "re": 0.8,
      "hr": 1.0
    },
    "target_personas": [
      "CEO",
      "COO",
      "Head of Integration",
      "HR Director"
    ],
    "keywords_en": [
      "acquires",
      "acquisition",
      "merger",
      "merges with",
      "to be acquired"
    ],
    "keywords_ar": [
      "استحواذ",
      "اندماج",
      "تستحوذ على"
    ],
    "exclusions": [
      "rumoured deal",
      "deal called off"
    ],
    "play_hint": "Integration window: systems, teams and vendors get consolidated in the next 90 days.",
    "is_negative": false
  },
  {
    "key": "regulation_change",
    "name": "New regulation affecting the industry",
    "description": "A new law, mandate or deadline affects the company's industry in the UAE or KSA (e.g. e-invoicing, corporate tax, Emiratisation or Saudisation quotas, data protection). Industry-level: applies to every company in the affected industries.",
    "source_types": [
      "news",
      "government"
    ],
    "base_weight": 25,
    "half_life_days": 60,
    "vertical_multipliers": {
      "saas": 1.0,
      "re": 0.8,
      "hr": 1.0
    },
    "target_personas": [
      "CFO",
      "Head of Compliance",
      "HR Director"
    ],
    "keywords_en": [
      "mandate",
      "deadline",
      "new law",
      "regulation",
      "compliance requirement",
      "e-invoicing",
      "Emiratisation",
      "Saudisation",
      "Nitaqat"
    ],
    "keywords_ar": [
      "قرار",
      "لائحة",
      "الفوترة الإلكترونية",
      "التوطين",
      "نطاقات"
    ],
    "exclusions": [
      "draft consultation with no date"
    ],
    "play_hint": "Deadline-driven: help them comply before the date.",
    "is_negative": false,
    "scope": "industry"
  },
  {
    "key": "investor_update_growth",
    "name": "Listed company growth disclosure",
    "description": "A listed company (DFM, ADX, Tadawul) disclosed results or plans that mention growth, new projects, capex or expansion.",
    "source_types": [
      "news",
      "exchange_disclosure"
    ],
    "base_weight": 20,
    "half_life_days": 45,
    "vertical_multipliers": {
      "saas": 0.8,
      "re": 1.0,
      "hr": 0.8
    },
    "target_personas": [
      "CFO",
      "COO",
      "Head of Strategy"
    ],
    "keywords_en": [
      "results",
      "guidance",
      "capex",
      "growth strategy",
      "investor presentation"
    ],
    "keywords_ar": [
      "النتائج المالية",
      "خطة توسع",
      "الإفصاح"
    ],
    "exclusions": [
      "results showing losses and cost-cutting"
    ],
    "play_hint": "Tie the offer to the priorities they just announced to investors.",
    "is_negative": false
  },
  {
    "key": "award_recognition",
    "name": "Award or ranking",
    "description": "The company won an industry award or was named in a ranking.",
    "source_types": [
      "news"
    ],
    "base_weight": 15,
    "half_life_days": 30,
    "vertical_multipliers": {
      "saas": 1.0,
      "re": 1.0,
      "hr": 0.8
    },
    "target_personas": [
      "CEO",
      "Head of Marketing"
    ],
    "keywords_en": [
      "wins award",
      "named best",
      "awarded",
      "ranked"
    ],
    "keywords_ar": [
      "جائزة",
      "تفوز",
      "تكريم"
    ],
    "exclusions": [
      "sponsored or pay-to-enter lists"
    ],
    "play_hint": "Congratulate, then link the win to what comes next.",
    "is_negative": false
  },
  {
    "key": "certification_acquired",
    "name": "Security or quality certification",
    "description": "The company obtained SOC 2, ISO 27001, ISO 9001 or a similar certification, often a sign of moving upmarket.",
    "source_types": [
      "news",
      "website"
    ],
    "base_weight": 15,
    "half_life_days": 60,
    "vertical_multipliers": {
      "saas": 1.0,
      "re": 0.6,
      "hr": 0.6
    },
    "target_personas": [
      "CTO",
      "Head of Sales",
      "COO"
    ],
    "keywords_en": [
      "SOC 2",
      "ISO 27001",
      "ISO 9001",
      "certified",
      "certification"
    ],
    "keywords_ar": [
      "شهادة الأيزو",
      "حصلت على شهادة"
    ],
    "exclusions": [
      "renewal of an existing certificate"
    ],
    "play_hint": "Moving into enterprise deals: offer what enterprise buyers expect next.",
    "is_negative": false
  },
  {
    "key": "website_change",
    "name": "Website or messaging change",
    "description": "The homepage hero message, pricing page or integrations page changed meaningfully, or the site was redesigned.",
    "source_types": [
      "website"
    ],
    "base_weight": 15,
    "half_life_days": 21,
    "vertical_multipliers": {
      "saas": 1.0,
      "re": 0.6,
      "hr": 0.6
    },
    "target_personas": [
      "Head of Marketing",
      "CEO"
    ],
    "keywords_en": [],
    "keywords_ar": [],
    "exclusions": [
      "minor text edits",
      "date or cookie banner changes"
    ],
    "play_hint": "Reference the new positioning; offer what that new focus needs.",
    "is_negative": false
  },
  {
    "key": "layoffs_or_freeze",
    "name": "Layoffs or hiring freeze",
    "description": "Layoffs, a hiring freeze or restructuring was announced. Lowers the score; never triggers outreach alone.",
    "source_types": [
      "news"
    ],
    "base_weight": -25,
    "half_life_days": 60,
    "vertical_multipliers": {
      "saas": 1.0,
      "re": 1.0,
      "hr": 1.0
    },
    "target_personas": [],
    "keywords_en": [
      "layoffs",
      "lays off",
      "job cuts",
      "hiring freeze",
      "restructuring"
    ],
    "keywords_ar": [
      "تسريح",
      "خفض الوظائف",
      "تجميد التوظيف",
      "إعادة هيكلة"
    ],
    "exclusions": [],
    "play_hint": "Pause outreach.",
    "is_negative": true
  }
]
```
