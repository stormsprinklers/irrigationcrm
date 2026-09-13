import test from "node:test";
import assert from "node:assert/strict";
import { pickDefaultSite } from "../site-selection";
test("uses accessible domain properties and ignores unverified URL prefixes", () => {
  assert.equal(pickDefaultSite([{ siteUrl: "https://www.stormsprinklers.com/", permissionLevel: "siteUnverifiedUser" }, { siteUrl: "sc-domain:stormsprinklers.com", permissionLevel: "siteOwner" }], "https://www.stormsprinklers.com/"), "sc-domain:stormsprinklers.com");
});
test("never chooses another domain based on a substring match", () => {
  assert.equal(pickDefaultSite([{ siteUrl: "sc-domain:stormsprinklers.com.other.com", permissionLevel: "siteOwner" }], "https://stormsprinklers.com/"), null);
  assert.equal(pickDefaultSite([{ siteUrl: "https://stormsprinklers.com/", permissionLevel: "siteUnverifiedUser" }]), null);
});
