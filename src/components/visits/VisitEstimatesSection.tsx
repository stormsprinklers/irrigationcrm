import Link from "next/link";
import { FilePlus2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Estimate = {
  id: string;
  status: string;
  total: string | number;
  createdAt: string;
};

type Props = {
  visitId: string;
  estimates: Estimate[];
};

function formatCurrency(value: string | number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(value)
  );
}

export function VisitEstimatesSection({ visitId, estimates }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Estimates</CardTitle>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/customers/estimates?visitId=${visitId}`}>
            <FilePlus2 className="h-4 w-4" />
            New estimate
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {estimates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No estimates linked to this visit.</p>
        ) : (
          <div className="space-y-2">
            {estimates.map((estimate) => (
              <div
                key={estimate.id}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <div className="flex items-center gap-2">
                  <Link href={`/estimates/${estimate.id}`} className="font-medium text-primary hover:underline">
                    {formatCurrency(estimate.total)}
                  </Link>
                  <Badge variant="outline">{estimate.status}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(estimate.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
