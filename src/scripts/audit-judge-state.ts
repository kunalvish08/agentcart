import { supabaseAdmin } from "../integrations/supabase/client.server";

async function auditDatabaseState() {
  console.log("--- AUDIT: DATABASE STATE ---");
  
  // 1. Check for the TechNova merchant
  const { data: merchant } = await supabaseAdmin
    .from("merchants")
    .select("id, slug")
    .eq("slug", "technova-store")
    .single();
  
  if (!merchant) {
    console.log("Merchant 'technova-store' not found.");
    return;
  }
  console.log(`Merchant ID: ${merchant.id}`);

  // 2. Check for Judge Mode sessions
  const { data: sessions } = await supabaseAdmin
    .from("agent_sessions")
    .select("id, title, started_at")
    .eq("merchant_id", merchant.id)
    .ilike("title", "%Judge Mode%")
    .order("started_at", { ascending: false });
  
  console.log(`Judge sessions found: ${sessions?.length ?? 0}`);
  if (sessions && sessions.length > 0) {
    const latestSession = sessions[0];
    console.log(`Latest Session: ${latestSession.id} (${latestSession.title}) at ${latestSession.started_at}`);

    // 3. Check for runs in this session
    const { data: runs } = await supabaseAdmin
      .from("agent_runs")
      .select("id, status, started_at, model")
      .eq("session_id", latestSession.id)
      .order("started_at", { ascending: false });
    
    console.log(`Runs in latest session: ${runs?.length ?? 0}`);
    if (runs && runs.length > 0) {
      const latestRun = runs[0];
      console.log(`Latest Run: ${latestRun.id} (Status: ${latestRun.status}) at ${latestRun.started_at}`);

      // 4. Check for steps and tool calls
      const { count: stepsCount } = await supabaseAdmin
        .from("agent_steps")
        .select("id", { count: "exact", head: true })
        .eq("run_id", latestRun.id);
      
      const { count: toolsCount } = await supabaseAdmin
        .from("tool_calls")
        .select("id", { count: "exact", head: true })
        .eq("run_id", latestRun.id);
      
      console.log(`Steps in run: ${stepsCount}`);
      console.log(`Tool calls in run: ${toolsCount}`);
    }
  }

  // 5. Check for completed orders/payments
  const { data: orders } = await supabaseAdmin
    .from("orders")
    .select("id, status, final_amount, created_at, customer_request_summary")
    .eq("merchant_id", merchant.id)
    .ilike("customer_request_summary", "%Judge Mode%")
    .order("created_at", { ascending: false });

  console.log(`Judge-tagged orders found: ${orders?.length ?? 0}`);
  if (orders && orders.length > 0) {
    const latestOrder = orders[0];
    console.log(`Latest Order: ${latestOrder.id} (Status: ${latestOrder.status}) Amount: ${latestOrder.final_amount}`);

    const { data: payments } = await supabaseAdmin
      .from("payments")
      .select("id, status, amount")
      .eq("order_id", latestOrder.id);
    
    console.log(`Payments for order: ${payments?.length ?? 0}`);
    payments?.forEach(p => console.log(` - Payment ${p.id}: ${p.status} (${p.amount})`));
  }
}

auditDatabaseState().catch(console.error);
