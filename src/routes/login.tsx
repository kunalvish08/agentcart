import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in · Agentic Commerce Merchant Console" },
      {
        name: "description",
        content:
          "Sign in to the Agentic Commerce merchant console to manage your store, products, inventory and negotiation policies.",
      },
      { property: "og:title", content: "Sign in · Agentic Commerce Merchant Console" },
      {
        property: "og:description",
        content: "Secure merchant sign-in for the Agentic Commerce platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

const DEMO_EMAIL = "demo@technova.test";
const DEMO_PASSWORD = "TechNova@2026";

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [fullName, setFullName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) navigate({ to: "/dashboard", replace: true });
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  function switchMode(next: string) {
    const value = next === "signup" ? "signup" : "signin";
    setMode(value);
    if (value === "signup") {
      setEmail("");
      setPassword("");
    } else {
      setEmail(DEMO_EMAIL);
      setPassword(DEMO_PASSWORD);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in");
        navigate({ to: "/dashboard", replace: true });
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { full_name: fullName, store_name: storeName },
        },
      });
      if (error) throw error;

      if (!data.session) {
        toast.info("Check your email to confirm your account before signing in.");
        setMode("signin");
        return;
      }

      toast.success("Account created");
      navigate({ to: "/dashboard", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2 text-sidebar-foreground">
          <span className="flex size-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Sparkles className="size-4" />
          </span>
          <div className="leading-tight">
            <p className="font-semibold">Agentic Commerce</p>
            <p className="text-xs text-sidebar-foreground/60">Merchant Console · Phase 01</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Merchant access</CardTitle>
            <CardDescription>
              Authentication and authorization are enforced by the database, not the browser.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={mode} onValueChange={switchMode}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <TabsContent value="signup" className="mt-0 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full name</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Aarav Sharma"
                      autoComplete="name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="storeName">Store name</Label>
                    <Input
                      id="storeName"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      placeholder="My Store"
                    />
                  </div>
                </TabsContent>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  {mode === "signin" ? "Sign in" : "Create account"}
                </Button>
              </form>
            </Tabs>

            <div className="mt-6 rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Demo merchant</p>
              <p className="mt-1">
                {DEMO_EMAIL} · {DEMO_PASSWORD}
              </p>
              <p className="mt-1">Owns the seeded TechNova Store data.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
