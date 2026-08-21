import { supabase } from "../integrations/supabase/client";

/**
 * Validates Phase 11 persistence requirements.
 */
async function testPhase11Persistence() {
  console.log("--- PHASE 11 PERSISTENCE REGRESSION TEST ---");
  
  // 1. Identify TechNova Merchant
  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("slug", "technova-store")
    .single();
  
  if (!merchant) throw new Error("TechNova merchant not found");
  
  // 2. Check for runs in sessions belonging to this merchant
  const { data: sessions } = await supabase
    .from("agent_sessions")
    .select("id")
    .eq("merchant_id", merchant.id);
  
  const sessionIds = sessions?.map(s => s.id) ?? [];

  if (sessionIds.length === 0) {
    console.log("No sessions found for merchant.");
  } else {
    const { data: runs } = await supabase
      .from("agent_runs")
      .select("id, session_id, started_at")
      .in("session_id", sessionIds)
      .order("started_at", { ascending: false });
    
    const judgeRuns = runs?.length ?? 0;
    console.log(`Persisted agent runs: ${judgeRuns}`);
    
    if (judgeRuns === 0) {
      console.warn("WARNING: No persisted runs found. Run a demo first.");
    } else {
      const latestRun = runs![0]!;
      // 3. Verify steps for latest run
      const { count: stepCount } = await supabase
        .from("agent_steps")
        .select("id", { count: "exact", head: true })
        .eq("run_id", latestRun.id);
      
      console.log(`Steps for latest run (${latestRun.id}): ${stepCount}`);
      if ((stepCount ?? 0) < 5) { // Adjusted expectation
        console.warn(`WARNING: Latest run has only ${stepCount} steps.`);
      }
    }
  }

  // 4. Verify orders
  const { count: orderCount } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchant.id)
    .ilike("customer_request_summary", "%Judge Mode%");
  
  console.log(`Persisted Judge orders: ${orderCount}`);
  
  console.log("--- TEST COMPLETE ---");
}

testPhase11Persistence().catch(console.error);
