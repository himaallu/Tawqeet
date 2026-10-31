import { describe, expect, it } from "vitest";
import { temperatureOf } from "../shared/enums";
import { shouldRealert, smsSendTime } from "../server/lib/cadence";
import { isFirstWorkdayOfWeek, isWorkday, localParts, nextLocalTime } from "../server/lib/gulf-time";
import { allowedNumbers, check, enforce } from "../server/lib/hard-rules";
import { clarity, simScore } from "../server/lib/sim-score";
import { hasOptOut, OPT_OUT, spamRules } from "../server/lib/spam";
import { computeScore } from "../server/lib/thermometer";
import { presentedVariant } from "../server/routes/pipeline";
import { assertSendOnly, buildMime } from "../server/services/mailboxes";
import { offlineReplyClass, parseInbound } from "../server/services/sending";

const DAY = 86_400_000;
const now = new Date("2026-10-28T10:00:00Z"); // a Wednesday
const sig = (key: string, ageDays: number, baseWeight = 30, halfLifeDays = 30) => ({
  id: key + ageDays,
  key,
  title: key,
  detectedAt: new Date(now.getTime() - ageDays * DAY),
  baseWeight,
  halfLifeDays,
});

describe("thermometer", () => {
  it("decays a signal by half each half-life", () => {
    expect(computeScore([sig("funding_round", 0, 35)], 0, undefined, now).signalPoints).toBe(35);
    expect(computeScore([sig("funding_round", 30, 35)], 0, undefined, now).signalPoints).toBe(17.5);
    expect(computeScore([sig("funding_round", 60, 35)], 0, undefined, now).signalPoints).toBe(8.8);
  });

  it("caps signal points at 50 and adds the stack bonus for 2+ and 3+ types in 30 days", () => {
    const two = computeScore([sig("a", 1, 40), sig("b", 1, 40)], 0, undefined, now);
    expect(two.signalPoints).toBe(50);
    expect(two.stackBonus).toBe(10);
    expect(computeScore([sig("a", 1), sig("b", 2), sig("c", 3)], 0, undefined, now).stackBonus).toBe(15);
    expect(computeScore([sig("a", 1), sig("b", 45)], 0, undefined, now).stackBonus).toBe(0);
  });

  it("adds fit and engagement, caps at 100, and bands Hot ≥ 70 · Warm 40–69 · Cold < 40", () => {
    const s = computeScore([sig("a", 0, 40), sig("b", 0, 40), sig("c", 0, 40)], 25, { replied: true, clicked: true }, now);
    expect(s.engagement).toBe(15);
    expect(s.total).toBe(100);
    expect(s.temperature).toBe("hot");
    expect(temperatureOf(70)).toBe("hot");
    expect(temperatureOf(69)).toBe("warm");
    expect(temperatureOf(40)).toBe("warm");
    expect(temperatureOf(39)).toBe("cold");
    expect(computeScore([], 0, { replied: false, clicked: true }, now).engagement).toBe(5);
  });
});

describe("simulated inbox score", () => {
  it("weights personas 50, survival 25, spam 15, clarity 10", () => {
    expect(simScore({ replyLikelihoods: [1, 1], offerSurvives: 1, spamRisk: 0, clarity: 1 })).toBe(100);
    expect(simScore({ replyLikelihoods: [0.5], offerSurvives: 0.5, spamRisk: 0.5, clarity: 0.5 })).toBe(50);
    expect(simScore({ replyLikelihoods: [0], offerSurvives: 0, spamRisk: 1, clarity: 0.5 })).toBe(5);
  });

  it("clarity is 1 only for ≤120 words with exactly one ask", () => {
    expect(clarity(`Hi.\nCall Tuesday?\n${OPT_OUT.en}`)).toBe(1);
    expect(clarity(`Hi? Call Tuesday?\n${OPT_OUT.en}`)).toBe(0.5);
    expect(clarity(`${"word ".repeat(130)}?`)).toBe(0.5);
  });
});

describe("spam rules", () => {
  it("flags trigger words in English and Arabic, caps, links, length and missing opt-out", () => {
    const r = spamRules("FREE OFFER NOW", "Click here http://a.com http://b.com " + "x ".repeat(160));
    expect(r.flags).toEqual(expect.arrayContaining(["ALL CAPS words", "More than one link", "Longer than 150 words", "Missing opt-out line"]));
    expect(r.flags.some((f) => f.includes("free"))).toBe(true);
    expect(spamRules("عرض", "عرض خاص لفترة محدودة").flags.some((f) => f.includes("عرض خاص"))).toBe(true);
    const clean = spamRules("Noor's GCC expansion", `Hi Rania,\nQuick question?\n${OPT_OUT.en}`);
    expect(clean.flags).toEqual([]);
    expect(clean.risk).toBe(0);
  });

  it("recognises the opt-out line in both languages", () => {
    expect(hasOptOut(OPT_OUT.en)).toBe(true);
    expect(hasOptOut(OPT_OUT.ar)).toBe(true);
    expect(hasOptOut("Thanks")).toBe(false);
  });
});

describe("writer hard rules", () => {
  const allowed = allowedNumbers(["Clients cut transfer time by 30%", "AED 120M Series B"]);

  it("allows numbers from the brain/signal and meeting lengths, flags invented ones", () => {
    const body = `We cut transfer time by 30% after your AED 120M round. A 15-minute call?\n${OPT_OUT.en}`;
    expect(check(body, { noGo: [], allowed })).toEqual([]);
    const bad = check(`We save 45% guaranteed.\n${OPT_OUT.en}`, { noGo: ["guaranteed"], allowed });
    expect(bad.map((v) => v.rule).sort()).toEqual(["invented_number", "no_go"]);
  });

  it("treats Arabic-Indic digits like Western digits", () => {
    expect(check(`خفضنا الوقت ٣٠٪.\n${OPT_OUT.ar}`, { noGo: [], allowed })).toEqual([]);
  });

  it("enforce() drops offending sentences and appends the opt-out", () => {
    const out = enforce("Hi Rania. We save 45% for everyone. Worth a call?", { noGo: [], allowed, language: "en" });
    expect(out).not.toContain("45%");
    expect(out).toContain("Worth a call?");
    expect(hasOptOut(out)).toBe(true);
  });
});

describe("Gulf time + alert cadence", () => {
  it("knows UAE and KSA work weeks", () => {
    const fri = new Date("2026-10-30T08:00:00Z");
    expect(isWorkday(fri, "Asia/Dubai")).toBe(true);
    expect(isWorkday(fri, "Asia/Riyadh")).toBe(false);
    expect(isFirstWorkdayOfWeek(new Date("2026-11-01T08:00:00Z"), "Asia/Riyadh")).toBe(true); // Sunday
    expect(isFirstWorkdayOfWeek(new Date("2026-11-02T08:00:00Z"), "Asia/Dubai")).toBe(true); // Monday
  });

  it("holds SMS outside 08:00–21:00 local until 08:00", () => {
    const late = new Date("2026-10-28T18:30:00Z"); // 22:30 Dubai
    const at = smsSendTime(late, "Asia/Dubai");
    expect(localParts(at, "Asia/Dubai")).toMatchObject({ hour: 8, minute: 0, day: 29 });
    const noon = new Date("2026-10-28T08:00:00Z"); // 12:00 Dubai
    expect(smsSendTime(noon, "Asia/Dubai")).toEqual(noon);
    expect(localParts(nextLocalTime(noon, "Asia/Riyadh", 8), "Asia/Riyadh").hour).toBe(8);
  });

  it("doesn't repeat an alert within 7 days unless the score rose by 15+", () => {
    const last = { at: new Date(now.getTime() - 2 * DAY), score: 72 };
    expect(shouldRealert(last, 80, now)).toBe(false);
    expect(shouldRealert(last, 87, now)).toBe(true);
    expect(shouldRealert({ at: new Date(now.getTime() - 8 * DAY), score: 72 }, 72, now)).toBe(true);
    expect(shouldRealert({ at: null, score: null }, 50, now)).toBe(true);
  });
});

describe("sending helpers", () => {
  it("refuses mailbox grants with read scopes", () => {
    expect(() => assertSendOnly("gmail", "https://www.googleapis.com/auth/gmail.send openid https://www.googleapis.com/auth/userinfo.email")).not.toThrow();
    expect(() => assertSendOnly("gmail", "https://www.googleapis.com/auth/gmail.readonly")).toThrow(/extra scopes/);
    expect(() => assertSendOnly("outlook", "Mail.Send openid email profile offline_access")).not.toThrow();
    expect(() => assertSendOnly("outlook", "Mail.Read Mail.Send")).toThrow();
  });

  it("builds UTF-8 MIME with Reply-To and List-Unsubscribe", () => {
    const mime = buildMime("a@x.ae", { to: "b@y.ae", subject: "مرحبا", body: "نص", replyTo: "r+t@in.x", headers: { "List-Unsubscribe": "<https://u>" } });
    expect(mime).toContain("Subject: =?UTF-8?B?");
    expect(mime).toContain("Reply-To: r+t@in.x");
    expect(mime).toContain("List-Unsubscribe: <https://u>");
    expect(Buffer.from(mime.split("\r\n\r\n")[1], "base64").toString()).toBe("نص");
  });

  it("parses Postmark and generic inbound payloads", () => {
    expect(parseInbound({ ToFull: [{ Email: "R+abc@in.x" }], From: "Rania <rania@noor.ae>", Subject: "Re: hi", StrippedTextReply: "Yes, Tuesday works" })).toEqual({
      to: ["r+abc@in.x"],
      from: "rania@noor.ae",
      subject: "Re: hi",
      text: "Yes, Tuesday works",
    });
    expect(parseInbound({ type: "email.received", data: { to: ["r+x@in.x"], from: "a@b.c", subject: "s", text: "t" } })?.to).toEqual(["r+x@in.x"]);
  });

  it("classifies replies offline", () => {
    expect(offlineReplyClass("stop")).toBe("unsubscribe");
    expect(offlineReplyClass("I'm out of the office until Sunday")).toBe("ooo");
    expect(offlineReplyClass("Not interested, thanks")).toBe("negative");
    expect(offlineReplyClass("Sounds good — Tuesday?")).toBe("positive");
    expect(offlineReplyClass("Who handles this on your side?")).toBe("neutral");
  });

  it("presents the second-best variant to the 10% A/B challenger group", () => {
    const ds = [
      { id: "a", status: "winner", score: 80 },
      { id: "b", status: "generated", score: 70 },
      { id: "c", status: "generated", score: 60 },
    ];
    expect(presentedVariant(ds, "control")?.id).toBe("a");
    expect(presentedVariant(ds, "challenger")?.id).toBe("b");
  });
});
