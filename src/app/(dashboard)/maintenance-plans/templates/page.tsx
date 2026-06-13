"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/maintenance-plans/format";
import type { MaintenancePlanTemplateDTO } from "@/lib/maintenance-plans/types";

export default function MaintenancePlanTemplatesPage() {
  const [templates, setTemplates] = useState<MaintenancePlanTemplateDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/maintenance-plans/templates");
    if (res.ok) {
      const data = await res.json();
      setTemplates(data.templates ?? []);
    }
  }, []);

  useEffect(() => {
    load()
      .catch(() => toast.error("Failed to load templates"))
      .finally(() => setLoading(false));
  }, [load]);

  return (
    <ContentArea className="max-w-5xl">
      <PageHeader
        breadcrumb={["Maintenance Plans", "Templates"]}
        title="Plan templates"
        actions={
          <Button asChild>
            <Link href="/maintenance-plans/templates/new">
              <Plus className="h-4 w-4" />
              New template
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading templates...</p>
          ) : templates.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">No templates yet.</p>
              <Button className="mt-4" asChild>
                <Link href="/maintenance-plans/templates/new">Create your first template</Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Visits</TableHead>
                  <TableHead>Enrollments</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell>
                      <Link
                        href={`/maintenance-plans/templates/${template.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {template.name}
                      </Link>
                    </TableCell>
                    <TableCell>{formatCurrency(template.basePrice)}</TableCell>
                    <TableCell>{template.visitTemplates.length}</TableCell>
                    <TableCell>{template.enrollmentCount ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant={template.active ? "default" : "outline"}>
                        {template.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </ContentArea>
  );
}
