import Link from "next/link";
import { Database } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function SetupNotice() {
  return (
    <main className="container flex min-h-screen items-center justify-center py-10">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
            <Database className="h-6 w-6" />
          </div>
          <CardTitle>Connect Supabase first</CardTitle>
          <CardDescription>
            Auth and the question bank live in Supabase. Add your project URL and API key to
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">.env.local</code>
            and restart the dev server, then register/login will work.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            1. supabase.com → New Project<br />
            2. SQL Editor → run <code className="rounded bg-muted px-1">supabase/schema.sql</code> then <code className="rounded bg-muted px-1">supabase/seed.sql</code><br />
            3. Settings → API → copy URL + anon key into <code className="rounded bg-muted px-1">.env.local</code>
          </p>
          <Button variant="outline" asChild>
            <Link href="/">Back to home</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}