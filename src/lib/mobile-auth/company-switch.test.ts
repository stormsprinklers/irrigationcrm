import assert from "node:assert/strict";
import test from "node:test";

test("Apple reviewer cannot switch companies even if an account link exists", async () => {
  let linksRead = false;
  let targetFilter: any;
  (globalThis as any).prisma = {
    user: {
      findUnique: async () => ({email:"review@example.com",appleDemoAccount:true}),
      findFirst: async (args: any) => { targetFilter=args.where; return {id:"live-admin",email:"admin@example.com",role:"ADMIN",companyId:"live-company"}; },
    },
    userAccountLink: {findFirst: async () => {linksRead=true;return {id:"old-link"};}},
  };
  const {resolveMobileCompanyAccount}=await import("./company-switch");
  assert.equal(await resolveMobileCompanyAccount("reviewer","live-admin"),null);
  assert.equal(linksRead,false);
  assert.equal(targetFilter.appleDemoAccount,false);
});
