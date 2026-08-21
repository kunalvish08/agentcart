import { supabaseAdmin } from "../integrations/supabase/client.server";

/**
 * Validates Phase 11 persistence requirements using admin privileges.
 */
async function testPhase11Persistence() {
  console.log("--- PHASE 11 PERSISTENCE REGRESSION TEST (ADMIN) ---");
  
  // 1. Identify TechNova Merchant
  const { data: merchant } = await supabaseAdmin
    .from("merchants")
    .select("id")
    .eq("slug", "technova-store")
    .single();
  
  if (!merchant) {
    console.error("Merchant 'technova-store' not found.");
    return;
  }
  console.log(`Merchant ID: ${merchant.id}`);
  
  // 2. Check for runs in sessions belonging to this merchant
  const { data: sessions } = await supabaseAdmin
    .from("agent_sessions")
    .select("id")
    .eq("merchant_id", merchant.id);
  
  const sessionIds = sessions?.map(s => s.id) ?? [];
  console.log(`Sessions found: ${sessionIds.length}`);

  if (sessionIds.length > 0) {
    const { data: runs } = await supabaseAdmin
      .from("agent_runs")
      .select("id, session_id, started_at")
      .in("session_id", sessionIds)
      .order("started_at", { ascending: false });
    
    const judgeRuns = runs?.length ?? 0;
    console.log(`Persisted agent runs: ${judgeRuns}`);
    
    if (judgeRuns > 0) {
      const latestRun = runs![0]!;
      // 3. Verify steps for latest run
      const { count: stepCount } = await supabaseAdmin
        .from("agent_steps")
        .select("id", { count: "exact", head: true })
        .eq("run_id", latestRun.id);
      
      console.log(`Steps for latest run (${latestRun.id}): ${stepCount}`);
    }
  }

  // 4. Verify orders
  const { count: orderCount } = await supabaseAdmin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchant.id)
    .ilike("customer_request_summary", "%Judge Mode%");
  
  console.log(`Persisted Judge orders: ${orderCount}`);
  
  console.log("--- TEST COMPLETE ---");
}

testPhase11Persistence().catch(console.error);
