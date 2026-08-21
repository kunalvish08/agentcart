import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function run() {
  // Create a run
  const { data: run, error } = await supabase.from('evaluation_runs').insert({
    name: "Phase 09 Full Evaluation (Re-run)",
    status: "pending",
    metadata: { phase: "09" }
  }).select().single();
  
  if (error) {
    console.error("Error creating run:", error);
    return;
  }
  
  console.log("Created run:", run.id);
}
run();
