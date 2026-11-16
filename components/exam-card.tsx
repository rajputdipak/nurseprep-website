import Link from "next/link";
import { ArrowRight, Building2, Landmark } from "lucide-react";
import type { Exam } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ExamCard({ exam }: { exam: Exam }) {
  const Icon = exam.category === "central" ? Landmark : Building2;
  return (
    <Link href={`/exam/${exam.id}`} className="group block">
      <Card className="h-full transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md">
        <CardContent className="flex h-full flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-2">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <Badge variant={exam.category === "central" ? "default" : "secondary"}>
              {exam.category === "central" ? "Central" : "State"}
            </Badge>
          </div>
          <div>
            <h3 className="font-semibold leading-snug">{exam.name}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{exam.description}</p>
          </div>
          <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary">
            Practice now
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}