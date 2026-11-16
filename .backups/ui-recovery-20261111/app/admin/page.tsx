import type { Metadata } from "next";
import { ClipboardList, FileQuestion, GraduationCap, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Admin Overview" };

async function countTable(supabase: ReturnType<typeof createClient>, table: string) {
  const { count } = await supabase.from(table).select("*", { count: "exact", head: true });
  return count ?? 0;
}

export default async function AdminOverviewPage() {
  const supabase = createClient();
  const [users, questions, attempts, exams] = await Promise.all([
    countTable(supabase, "profiles"),
    countTable(supabase, "questions"),
    countTable(supabase, "user_attempts"),
    countTable(supabase, "exams"),
  ]);

  const stats = [
    { label: "Registered users", value: users, icon: Users },
    { label: "Questions in bank", value: questions, icon: FileQuestion },
    { label: "Test attempts", value: attempts, icon: ClipboardList },
    { label: "Exams", value: exams, icon: GraduationCap },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((s) => (
        <Card key={s.label}>
          <CardContent className="flex items-center gap-4 p-6">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <s.icon className="h-6 w-6" />
            </span>
            <div>
              <p className="text-2xl font-bold tabular-nums">{s.value}</p>
              <p className="text-sm text-muted-foreground">{s.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}