import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/.well-known/agent-manifest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleAgentManifest } = await import("@/lib/agent-manifest.server");
        return handleAgentManifest("/.well-known/agent-manifest", request);
      },
      OPTIONS: async () => {
        const { corsPreflight } = await import("@/lib/public-api.server");
        return corsPreflight();
      },
    },
  },
});
