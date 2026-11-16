import Link from "next/link";
import { DATABASE_UPDATE_MESSAGE } from "@/lib/database-status";
import { Card, CardContent } from "@/components/ui/card";

export function DatabaseNotice({ updateRequired = true }: { updateRequired?: boolean }) {
  return (
    <Card role="alert" className="border-amber-200 bg-amber-50">
      <CardContent className="space-y-2 p-5">
        <h2 className="font-semibold">{updateRequired ? "Database update required" : "Could not load test data"}</h2>
        <p className="text-sm text-muted-foreground">
          {updateRequired ? DATABASE_UPDATE_MESSAGE : "Your attempt has not been deleted. Refresh this page to retry, or contact the administrator if the problem continues."}
        </p>
        <Link href="/dashboard" className="inline-block text-sm font-medium text-primary hover:underline">Back to dashboard</Link>
      </CardContent>
    </Card>
  );
}
