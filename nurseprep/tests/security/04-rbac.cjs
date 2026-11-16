const { test, assert, load } = require("./harness.cjs");

const rbac = load("lib/security/rbac.ts");

const superAdmin = { id: "s1", role: "super_admin" };
const gov = { id: "g1", role: "gov_admin", tenantId: "gov-1", tenantType: "gov" };
const company = { id: "c1", role: "company_admin", tenantId: "co-1", tenantType: "company" };
const employee = { id: "e1", role: "employee", tenantId: "co-1", tenantType: "company" };
const contractor = { id: "k1", role: "contractor", tenantId: "co-1", tenantType: "company" };

test("test_super_admin_has_all_permissions", () => {
  assert.equal(rbac.can("super_admin", "tender:award"), true);
  assert.equal(rbac.can("super_admin", "any:unknown:permission"), true);
});

test("test_gov_admin_cannot_access_company_data", () => {
  assert.equal(rbac.canAccessTenant(gov, { id: "co-1", type: "company" }), false);
  assert.equal(rbac.canAccessTenant(gov, { id: "gov-1", type: "gov" }), true);
});

test("test_company_admin_cannot_access_gov_data", () => {
  assert.equal(rbac.canAccessTenant(company, { id: "gov-1", type: "gov" }), false);
  assert.equal(rbac.canAccessTenant(company, { id: "co-1", type: "company" }), true);
});

test("test_rbac_denies_missing_permission", () => {
  assert.equal(rbac.can("employee", "tender:award"), false);
  assert.throws(() => rbac.assertCan(employee, "tender:award"), /Missing permission/);
});

test("test_idor_project_access_denied", () => {
  assert.equal(rbac.canAccessProject(employee, { id: "p1", members: ["e2"] }), false);
  assert.equal(rbac.canAccessProject(employee, { id: "p1", members: ["e1"] }), true);
});

test("test_idor_user_profile_access_denied", () => {
  assert.equal(rbac.canAccessUserProfile(employee, "e2"), false);
  assert.equal(rbac.canAccessUserProfile(employee, "e1"), true);
  assert.equal(rbac.canAccessUserProfile(superAdmin, "e2"), true);
});

test("test_object_level_authz_for_documents", () => {
  assert.equal(
    rbac.canAccessDocument(employee, { tenantId: "co-1", visibility: "tenant" }),
    true
  );
  assert.equal(
    rbac.canAccessDocument(employee, { tenantId: "gov-1", visibility: "tenant" }),
    false
  );
  assert.equal(
    rbac.canAccessDocument(employee, { tenantId: "co-1", ownerId: "e2", visibility: "private" }),
    false
  );
});

test("test_tenant_isolation_between_organizations", () => {
  assert.equal(rbac.canAccessTenant(gov, { id: "gov-2", type: "gov" }), false);
  assert.equal(rbac.isSameTenant(gov, "gov-2"), false);
  assert.equal(rbac.isSameTenant(gov, "gov-1"), true);
});

test("test_employee_restricted_from_business_modules", () => {
  assert.equal(rbac.can("employee", "tender:create"), false);
  assert.equal(rbac.can("employee", "company:write"), false);
  assert.equal(rbac.can("employee", "job:read"), true);
});

test("test_regular_employee_cannot_create_tender", () => {
  assert.throws(() => rbac.assertCan(employee, "tender:create"), /Missing permission/);
});

test("test_prevent_privilege_escalation_self_role_change", () => {
  assert.equal(rbac.canChangeOwnRole(employee, "e1"), false);
  assert.equal(rbac.canChangeOwnRole(superAdmin, "e2"), true);
});

test("test_cannot_deactivate_self", () => {
  assert.equal(rbac.canDeactivateSelf(employee, "e1"), false);
  assert.equal(rbac.canDeactivateSelf(employee, "e2"), true);
});

test("test_cannot_delete_self", () => {
  assert.equal(rbac.canDeleteSelf(employee, "e1"), false);
  assert.equal(rbac.canDeleteSelf(company, "e1"), true);
});

test("test_project_member_only_access", () => {
  const project = { id: "p1", members: ["e1", "c1"] };
  assert.equal(rbac.canAccessProject(employee, project), true);
  assert.equal(rbac.canAccessProject(contractor, project), false);
});

test("test_contractor_cannot_access_owner_only_data", () => {
  assert.equal(rbac.canAccessOwnerOnly(contractor, "k1"), true);
  assert.equal(rbac.canAccessOwnerOnly(contractor, "c1"), false);
});

test("test_public_jobs_accessible_without_login", () => {
  assert.equal(rbac.can("public", "jobs:read"), true);
  assert.equal(rbac.canReadPublicResource("public", "jobs"), true);
});

test("test_public_tenders_accessible_without_login", () => {
  assert.equal(rbac.can("public", "tenders:read"), true);
  assert.equal(rbac.canReadPublicResource("public", "tenders"), true);
});

test("test_audit_logs_org_scoped", () => {
  assert.equal(rbac.auditTenantScope(gov), "gov-1");
  assert.equal(rbac.auditTenantScope(company), "co-1");
  assert.equal(rbac.auditTenantScope(superAdmin), null);
});

test("test_roles_cannot_be_minted_if_actor_lacks_permissions", () => {
  assert.equal(rbac.canGrantRole(employee, "employee"), false);
  assert.equal(rbac.canGrantRole(gov, "employee"), true);
  assert.equal(rbac.canGrantRole(gov, "company_admin"), false);
  assert.equal(rbac.canGrantRole(company, "contractor"), true);
  assert.equal(rbac.canGrantRole(superAdmin, "gov_admin"), true);
});

test("test_cross_org_file_download_denied", () => {
  assert.equal(
    rbac.canDownloadFile(employee, { tenantId: "gov-1", visibility: "tenant" }),
    false
  );
  assert.equal(
    rbac.canDownloadFile(employee, { tenantId: "co-1", visibility: "tenant" }),
    true
  );
});
