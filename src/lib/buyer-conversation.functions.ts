import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PersistedConversation } from "@/lib/buyer-conversation.server";

/** Rebuilds the signed-in buyer's latest conversation from persisted rows. */
export const getBuyerConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PersistedConversation> => {
    const { loadBuyerConversation } = await import("@/lib/buyer-conversation.server");
    return loadBuyerConversation(context.supabase, context.userId);
  });
