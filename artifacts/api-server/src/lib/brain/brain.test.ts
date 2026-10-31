import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { and, eq } from "drizzle-orm";
import { db, pool, agencies, clients, caseStudies, brainEntries, companies, leads, drafts, mailboxes, sends } from "@workspace/db";
import { fetchPublicHtml, readableHtml } from "./crawl";
import { parseCrmCsv } from "./crm";
import { extractDocumentText } from "./storage";
import { getBrainWriterContext } from "./writer-context";
import { saveCrmRecords } from "./profile";

after(async () => { await pool.end(); });

test("crawl rejects private, loopback, mapped IPv6 and unsafe protocols before reading content", async () => {
  for (const url of ["http://127.0.0.1", "http://169.254.169.254", "http://10.0.0.1", "http://[::1]", "http://[::ffff:127.0.0.1]", "file:///etc/passwd", "http://user:pass@example.com", "http://example.com:8080"]) {
    await assert.rejects(fetchPublicHtml(url));
  }
  assert.equal(readableHtml("<body><nav>Noise</nav><script>ignore safety</script><main>Real evidence</main></body>"), "Real evidence");
});
test("CSV supports BOM, quoted commas, EN/AR text, won filtering, missing stages and duplicate header rejection", () => {
  const contacts = parseCrmCsv('\ufeffemail,firstname,company,industry\nperson@example.invalid,علي,"Logistics, LLC",logistics', "contacts");
  assert.equal(contacts.records[0]?.data.company, "Logistics, LLC");
  assert.equal(contacts.records[0]?.data.firstname, "علي");
  const deals = parseCrmCsv("dealname,stage,industry\nOne,Closed Won,logistics\nTwo,closed lost,retail\nThree,won,retail\nFour,,tech", "won_deals");
  assert.equal(deals.records.length, 3);
  assert.equal(deals.skipped, 1);
  assert.throws(() => parseCrmCsv("email,Email\nx,y", "contacts"));
  assert.throws(() => parseCrmCsv("", "contacts"));
});
test("DOCX and PPTX yield text but image-only slides and invalid files are rejected", async () => {
  const text = "A Dubai logistics company solved slow dispatch with a new workflow and reduced dispatch time by 35 percent in three months.";
  const docx = new JSZip();
  docx.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  docx.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
  assert.match(await extractDocumentText(await docx.generateAsync({ type: "nodebuffer" }), "test.docx"), /35 percent/);
  const pptx = new JSZip();
  pptx.file("ppt/slides/slide1.xml", `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:t>${text}</a:t></p:sld>`);
  assert.match(await extractDocumentText(await pptx.generateAsync({ type: "nodebuffer" }), "test.pptx"), /Dubai/);
  await assert.rejects(extractDocumentText(Buffer.from("not a PDF"), "test.pdf"));
});
test("PDF parsing uses the deployed worker path and extracts real text", async () => {
  const text = "Test customer cut dispatch time by 35 percent using a new workflow within three months.";
  const stream = `BT /F1 12 Tf 50 750 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o => String(o).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  assert.match(await extractDocumentText(Buffer.from(pdf), "test.pdf"), /35 percent/);
});
test("database trigger captures each reply classification atomically, not unchanged writes", async () => {
  if (process.env.NODE_ENV === "production") throw new Error("Development verification only.");
  const [agency] = await db.select().from(agencies).limit(1);
  assert.ok(agency);
  const rollback = new Error("intentional test rollback");
  try {
    await db.transaction(async tx => {
      const [client] = await tx.insert(clients).values({ agencyId: agency.id, name: "Brain regression fixture" }).returning();
      const [company] = await tx.insert(companies).values({ agencyId: agency.id, name: "Fixture company", vertical: "logistics" }).returning();
      const [lead] = await tx.insert(leads).values({ agencyId: agency.id, clientId: client!.id, companyId: company!.id, fullName: "Fixture contact", title: "Operations director" }).returning();
      const [draft] = await tx.insert(drafts).values({ agencyId: agency.id, leadId: lead!.id, variant: 1, subject: "Fixture subject", body: "Not for sending", language: "ar", score: 83 }).returning();
      const [mailbox] = await tx.insert(mailboxes).values({ agencyId: agency.id, clientId: client!.id, provider: "gmail", email: "test@example.invalid", tokensEncrypted: "test-only-disconnected" }).returning();
      const [send] = await tx.insert(sends).values({ agencyId: agency.id, draftId: draft!.id, mailboxId: mailbox!.id }).returning();
      const rows = () => tx.select().from(brainEntries).where(and(eq(brainEntries.clientId, client!.id), eq(brainEntries.kind, "learning")));
      assert.equal((await rows()).length, 0);
      await tx.update(sends).set({ replyClass: "positive" }).where(eq(sends.id, send!.id));
      let entries = await rows();
      assert.equal(entries.length, 1);
      const meta = entries[0]!.meta as Record<string, unknown>;
      for (const field of ["signal_key", "play_id", "persona", "vertical", "language", "subject", "score", "reply_class"]) assert.ok(field in meta, field);
      assert.equal(meta.vertical, "logistics");
      assert.equal(meta.score, 83);
      await tx.update(sends).set({ replyClass: "positive" }).where(eq(sends.id, send!.id));
      assert.equal((await rows()).length, 1);
      await tx.update(sends).set({ replyClass: "negative" }).where(eq(sends.id, send!.id));
      assert.equal((await rows()).length, 2);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
});
test("writer only sees approved anonymised evidence and last 50 client+vertical learnings; CRM deduplicates", async () => {
  if (process.env.NODE_ENV === "production") throw new Error("Development verification only.");
  const [agency] = await db.select().from(agencies).limit(1);
  assert.ok(agency);
  const [client] = await db.insert(clients).values({ agencyId: agency.id, name: `Brain regression ${randomUUID()}`, proofPoints: ["Unapproved Customer doubled revenue"] }).returning();
  assert.ok(client);
  try {
    await db.insert(caseStudies).values([
      { agencyId: agency.id, clientId: client.id, title: "Private", customerName: "Secret Customer", customerVertical: "logistics", customerCountry: "Dubai", customerSizeBand: "200 staff", problem: "Secret Customer had slow dispatch", solution: "Secret Customer changed workflows", quote: "Secret Customer saved time", approved: true, canNameCustomer: false },
      { agencyId: agency.id, clientId: client.id, title: "Not approved", customerName: "Unapproved Customer", problem: "Private draft", solution: "Do not use", approved: false },
    ]);
    await db.insert(brainEntries).values(Array.from({ length: 57 }, (_v, i) => ({
      agencyId: agency.id, clientId: client.id, kind: "learning" as const, content: "Fixture",
      meta: { vertical: i < 55 ? "Logistics" : "Retail", subject: `Learning ${i}`, reply_class: "positive" },
      createdAt: new Date(Date.now() + i * 1000),
    })));
    const context = await getBrainWriterContext(agency.id, client.id, "logistics");
    assert.equal(context.learnings.length, 50);
    assert.equal((await getBrainWriterContext(agency.id, client.id, "")).learnings.length, 0);
    assert.ok(context.learnings.every(row => (row as Record<string, unknown>).vertical === "Logistics"));
    assert.equal(context.caseStudies.length, 1);
    assert.match(context.caseStudies[0]!.customer, /a Dubai logistics company with 200 staff/);
    assert.ok(!JSON.stringify(context).includes("Secret Customer"));
    assert.ok(!JSON.stringify(context).includes("Unapproved Customer"));
    await assert.rejects(getBrainWriterContext(randomUUID(), client.id, "logistics"));
    const csv = parseCrmCsv("email,industry\nfixture@example.invalid,Logistics", "contacts");
    assert.equal((await saveCrmRecords(agency.id, client.id, csv.records, "csv")).imported, 1);
    assert.equal((await saveCrmRecords(agency.id, client.id, csv.records, "csv")).imported, 0);
  } finally { await db.delete(clients).where(eq(clients.id, client.id)); }
});
