"use client";

import { useEffect, useState } from "react";

type TrainingSummary = {
  courses?: Array<{ title: string; completionPercent: number }>;
  certifications?: Array<{ title: string; expiresAt: string | null }>;
  error?: string;
};

export function EmployeeTrainingPanel({ employeeId, email }: { employeeId: string; email: string }) {
  const [data, setData] = useState<TrainingSummary | null>(null);
  const lmsUrl = process.env.NEXT_PUBLIC_LMS_URL?.replace(/\/$/, "");

  useEffect(() => {
    fetch(`/api/settings/employees/${employeeId}/training`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ error: "Failed to load" }));
  }, [employeeId]);

  if (!data) return <p className="text-sm text-muted-foreground">Loading training...</p>;
  if (data.error) return <p className="text-sm text-muted-foreground">{data.error}</p>;

  return (
    <div className="space-y-3 rounded border p-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm">Training (LMS)</h4>
        {lmsUrl && (
          <a
            href={`${lmsUrl}/admin/users?email=${encodeURIComponent(email)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary underline"
          >
            Open in LMS
          </a>
        )}
      </div>
      {(data.courses ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">No enrollments yet.</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {data.courses!.map((c) => (
            <li key={c.title} className="flex justify-between">
              <span>{c.title}</span>
              <span>{c.completionPercent}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
