import { readFileSync } from "node:fs";
import { rankMarketingDecisionMaker } from "../src/lib/lusha-rank.ts";
const file = process.argv[2];
const data = JSON.parse(readFileSync(file, "utf8"));
for (const r of data.results || []) {
  const dms = r.decisionMakers || [];
  const best = rankMarketingDecisionMaker(dms, { preferCountry: "Brazil" });
  const ref = r.clientReferenceId || (r.company && r.company.name) || "?";
  if (!best) { console.log(`\n[${ref}] — sem decisor de marketing (${dms.length} decisores no total)`); continue; }
  const dm = best.dm;
  const canE = (dm.canReveal||[]).some((x:any)=>x.field==="emails");
  const canP = (dm.canReveal||[]).some((x:any)=>x.field==="phones");
  console.log(`\n[${ref}]  (${dms.length} decisores)`);
  console.log(`  🎯 ${dm.firstName} ${dm.lastName} — ${dm.jobTitle?.title}`);
  console.log(`     tier=${best.tier} · ${dm.location?.country||"?"} · email:${canE?"revelável(1cr)":"—"} tel:${canP?"revelável(5cr)":"—"}`);
  console.log(`     ${dm.socialLinks?.linkedin||""}`);
}
