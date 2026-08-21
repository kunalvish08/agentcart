import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/agent-manifest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleAgentManifest } = await import("@/lib/agent-manifest.server");
        return handleAgentManifest("/api/public/agent-manifest", request);
      },
      OPTIONS: async () => {
        const { corsPreflight } = await import("@/lib/public-api.server");
        return corsPreflight();
      },
    },
  },
});
