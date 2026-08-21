import { buildDataset } from "./src/lib/evaluation-dataset";
import { runAgenticArm } from "./src/lib/evaluation-agentic.server";
import { runTraditionalBaseline } from "./src/lib/evaluation-traditional.server";
import { AgentCommerceClient } from "./src/lib/agent-commerce-client.server";
import { mintAgentSessionToken } from "./src/lib/agent-session-token.server";
import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function main() {
  const userId = "11111111-1111-4111-8111-111111111111"; // TechNova Demo User
  const baseUrl = "http://localhost:8080";
  const accessoryNames = new Set(["Wireless Mouse", "USB-C Hub", "Laptop Stand", "Mechanical Keyboard"]);

  console.log("Starting Phase 10 Regression Suite (24 scenarios)...");

  const fullDataset = buildDataset();
  const categories = [
    "exact_product", "exact_product", "product_discovery", "product_discovery",
    "accessory_discovery", "accessory_discovery", "accessory_discovery",
    "invalid_product", "no_match", "no_match",
    "budget_constrained", "budget_constrained", "budget_constrained",
    "discount_request", "discount_request", "discount_request",
    "cross_sell", "cross_sell", "cross_sell",
    "approval_required", "approval_required",
    "insufficient_inventory", "insufficient_inventory",
    "high_value"
  ];

  const selectedScenarios = categories.map((cat, occ) => {
      const filtered = fullDataset.filter(s => s.category === cat);
      return filtered[occ % filtered.length];
  });

  console.log(`Selected ${selectedScenarios.length} scenarios for regression.`);

  const results = {
    traditional: [] as any[],
    agentic: [] as any[]
  };

  // Pre-mint a token for traditional to use
  const { token: sessionToken } = await mintAgentSessionToken("00000000-0000-0000-0000-000000000000"); // Dummy session for traditional

  for (const scenario of selectedScenarios) {
    console.log(`Running Scenario: ${scenario.scenario_id} (${scenario.category})`);
    
    // Traditional
    const tradClient = new AgentCommerceClient({
      baseUrl,
      merchantSlug: "technova-store",
      sessionToken
    });
    const trad = await runTraditionalBaseline({
      scenario,
      client: tradClient,
      idempotencyKey: `trad-${scenario.scenario_id}-${Date.now()}`
    });
    results.traditional.push(trad);

    // Agentic
    const agnt = await runAgenticArm({
      scenario,
      userId,
      baseUrl,
      accessoryNames,
      signal: new AbortController().signal
    });
    results.agentic.push(agnt);
  }

  // Report
  const report = (name: string, data: any[]) => {
    const total = data.length;
    const converted = data.filter(d => d.converted).length;
    const revenue = data.reduce((acc, d) => acc + (d.final_amount || 0), 0);
    const errors = data.filter(d => d.actual_outcome === 'harness_error').length;
    const match = data.filter(d => d.actual_outcome === d.expected_outcome || 
      (d.expected_outcome === 'converted' && d.actual_outcome === 'approval_required') ||
      (d.expected_outcome === 'policy_capped_discount' && d.actual_outcome === 'approval_required')
    ).length;
    const latencies = data.map(d => d.latency_ms);
    const medianLatency = latencies.sort((a, b) => a - b)[Math.floor(total / 2)];
    const toolCalls = data.reduce((acc, d) => acc + (d.tool_calls || 0), 0);
    const aov = converted > 0 ? revenue / converted : 0;

    return {
      name,
      conversion: (converted / total * 100).toFixed(1) + '%',
      revenue: '₹' + revenue.toLocaleString('en-IN'),
      errors,
      matchRate: (match / total * 100).toFixed(1) + '%',
      medianLatency: (medianLatency / 1000).toFixed(1) + 's',
      avgToolCalls: (toolCalls / total).toFixed(1),
      aov: '₹' + Math.round(aov).toLocaleString('en-IN')
    };
  };

  const finalReport = {
    summary: [report("Traditional", results.traditional), report("Agentic", results.agentic)],
    agenticFailures: results.agentic.filter(d => d.actual_outcome !== d.expected_outcome && 
      !(d.expected_outcome === 'converted' && d.actual_outcome === 'approval_required') &&
      !(d.expected_outcome === 'policy_capped_discount' && d.actual_outcome === 'approval_required')
    ).map(d => ({
        scenario_id: d.scenario_id,
        expected: d.expected_outcome,
        actual: d.actual_outcome,
        reason: d.failure_reason
    }))
  };

  await Bun.write("regression_report.json", JSON.stringify(finalReport, null, 2));
  console.log("\n=== REGRESSION RESULTS ===");
  console.table(finalReport.summary);
}

main().catch(console.error);

