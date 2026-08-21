import { supabaseAdmin } from "../integrations/supabase/client.server";
import { resetJudgeDemo } from "../lib/judge.server";
import { runJudgeDemo } from "../lib/judge.server";

async function testReset() {
  console.log("Starting Phase 11 Safe Demo Reset Test...");

  // 1. Identify TechNova merchant
  const { data: merchant } = await supabaseAdmin
    .from("merchants")
    .select("id, owner_id")
    .eq("slug", "technova-store")
    .single();

  if (!merchant) {
    console.error("TechNova store not found. Ensure seeding is complete.");
    process.exit(1);
  }

  const userId = merchant.owner_id;

  // 2. Create a dummy evaluation run to ensure it's preserved
  const { data: evalRun, error: evalError } = await supabaseAdmin
    .from("evaluation_runs")
    .insert({
      merchant_id: merchant.id,
      status: "completed",
      label: "TEST_PRESERVATION_RUN",
      dataset_seed: "test-seed",
      dataset_version: "v1",
      model: "test-model",
      prompt_version: "v1"
    } as any)
    .select("id")
    .single();

  if (evalError) {
    console.error("Failed to create test evaluation run:", evalError);
    process.exit(1);
  }

  // 3. Run a demo transaction to create demo records
  console.log("Creating demo data...");
  const demoResult = await runJudgeDemo({
    userId,
    baseUrl: "http://localhost:8080"
  });

  if (!demoResult.ok) {
    console.error("Failed to create demo data:", demoResult.error);
    process.exit(1);
  }

  // 4. Verify demo records exist
  const { count: sessionCountBefore } = await supabaseAdmin
    .from("agent_sessions")
    .select("*", { count: "exact", head: true })
    .eq("title", "Judge Mode · deterministic demo run");
  
  console.log(`Demo sessions before reset: ${sessionCountBefore}`);
  if (sessionCountBefore === 0) {
    console.error("No demo sessions created.");
    process.exit(1);
  }

  // 5. Perform Reset
  console.log("Performing reset...");
  const resetResult = await resetJudgeDemo({ userId });
  console.log("Reset result:", resetResult);

  // 6. Verify demo records are gone
  const { count: sessionCountAfter } = await supabaseAdmin
    .from("agent_sessions")
    .select("*", { count: "exact", head: true })
    .eq("title", "Judge Mode · deterministic demo run");
  
  console.log(`Demo sessions after reset: ${sessionCountAfter}`);
  if (sessionCountAfter !== 0) {
    console.error("Demo sessions were not removed.");
    process.exit(1);
  }

  // 7. Verify preservation
  const { data: evalCheck } = await supabaseAdmin
    .from("evaluation_runs")
    .select("id")
    .eq("id", evalRun!.id)
    .maybeSingle();
  
  if (!evalCheck) {
    console.error("Evaluation run was ACCIDENTALLY DELETED!");
    process.exit(1);
  }
  console.log("Preservation verified: Evaluation run still exists.");

  const { data: merchantCheck } = await supabaseAdmin
    .from("merchants")
    .select("id")
    .eq("id", merchant.id)
    .maybeSingle();

  if (!merchantCheck) {
    console.error("Merchant was ACCIDENTALLY DELETED!");
    process.exit(1);
  }
  console.log("Preservation verified: Merchant still exists.");

  // Cleanup
  await supabaseAdmin.from("evaluation_runs").delete().eq("id", evalRun!.id);

  console.log("Phase 11 Reset Test PASSED.");
}

testReset().catch(console.error);
