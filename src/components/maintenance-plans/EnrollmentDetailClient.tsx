"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EnrollmentDetail } from "@/components/maintenance-plans/EnrollmentDetail";
import type { EnrollmentDTO } from "@/lib/maintenance-plans/types";

export function EnrollmentDetailClient({ enrollmentId }: { enrollmentId: string }) {
  const [enrollment, setEnrollment] = useState<EnrollmentDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/maintenance-plans/enrollments/${enrollmentId}`)
      .then(async (res) => {
        if (res.ok) setEnrollment(await res.json());
        else toast.error("Enrollment not found");
      })
      .catch(() => toast.error("Failed to load enrollment"))
      .finally(() => setLoading(false));
  }, [enrollmentId]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading enrollment...</p>;
  if (!enrollment) return <p className="text-sm text-muted-foreground">Enrollment not found.</p>;

  return <EnrollmentDetail enrollment={enrollment} onUpdated={setEnrollment} />;
}
