const { test, assert, load } = require("./harness.cjs");

const v = load("lib/security/validation.ts");
const uploads = load("lib/security/uploads.ts");

const employee = { id: "e1", role: "employee", tenantId: "co-1" };
const admin = { id: "a1", role: "admin", tenantId: "co-1" };
const recruiter = { id: "r1", role: "recruiter", tenantId: "co-1" };

test("test_file_upload_magic_bytes_match_pdf", () => {
  assert.doesNotThrow(() => v.assertMagicBytes(Buffer.from("%PDF-1.7\n"), "pdf"));
  assert.equal(v.sniffType(Buffer.from("%PDF-1.7\n")), "pdf");
});

test("test_file_upload_magic_bytes_match_png", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  assert.doesNotThrow(() => v.assertMagicBytes(png, "png"));
  assert.equal(v.sniffType(png), "png");
});

test("test_file_upload_double_extension_blocked", () => {
  assert.equal(uploads.hasDoubleExtension("invoice.pdf.exe"), true);
  assert.equal(uploads.hasDoubleExtension("invoice.exe.pdf"), true);
  assert.throws(() => uploads.assertNotDoubleExtension("invoice.pdf.exe"), /Double extensions/);
  assert.doesNotThrow(() => uploads.assertNotDoubleExtension("invoice.pdf"));
});

test("test_file_storage_key_is_random_uuid", () => {
  const first = uploads.storageKey("report.pdf");
  const second = uploads.storageKey("report.pdf");
  assert.match(
    first,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/
  );
  assert.notEqual(first, second);
  assert.ok(!first.includes("report"));
});

test("test_file_download_requires_auth", () => {
  assert.throws(() => uploads.assertDownloadAuth(null), /Authentication required/);
  assert.doesNotThrow(() => uploads.assertDownloadAuth(employee));
});

test("test_file_download_access_control", () => {
  const file = { tenantId: "co-1", ownerId: "e1", kind: "document", visibility: "tenant" };
  assert.equal(uploads.canAccessFile(employee, file), true);
  assert.equal(
    uploads.canAccessFile({ id: "x1", role: "employee", tenantId: "gov-1" }, file),
    false
  );
  const privateFile = { ...file, visibility: "private", ownerId: "e2" };
  assert.equal(uploads.canAccessFile(employee, privateFile), false);
});

test("test_private_file_content_disposition", () => {
  const header = uploads.contentDisposition("report.pdf");
  assert.equal(header, 'attachment; filename="report.pdf"');
  assert.ok(header.startsWith("attachment;"));
  assert.ok(!header.includes("\n"));
});

test("test_evidence_restricted_access", () => {
  const evidence = { tenantId: "co-1", kind: "evidence", visibility: "tenant" };
  assert.equal(uploads.canAccessFile(employee, evidence), false);
  assert.equal(uploads.canAccessFile(admin, evidence), true);
});

test("test_resume_access_recruiter_only", () => {
  const resume = { tenantId: "co-1", ownerId: "e1", kind: "resume" };
  assert.equal(uploads.canAccessFile(recruiter, resume), true);
  assert.equal(uploads.canAccessFile(employee, resume), true);
  assert.equal(
    uploads.canAccessFile({ id: "x1", role: "contractor", tenantId: "co-1" }, resume),
    false
  );
});

test("test_file_metadata_sanitized", () => {
  const metadata = uploads.sanitizeMetadata({
    filename: "<script>alert(1)</script>",
    description: "line\u0000break",
    size: 42,
  });
  assert.ok(!metadata.filename.includes("<script"));
  assert.ok(!metadata.description.includes("\u0000"));
  assert.equal("size" in metadata, false);
});
