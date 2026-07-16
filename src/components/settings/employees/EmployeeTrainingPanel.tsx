"use client";

import { useEffect, useState } from "react";

type TrainingSummary = {
  courses?: Array<{ title: string; completionPercent: number }>;
  certifications?: Array<{
    title: string;
    description?: string | null;
    badgeUrl?: string | null;
    pdfUrl?: string | null;
    expiresAt: string | null;
  }>;
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

  const certifications = data.certifications ?? [];

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

      {certifications.length > 0 ? (
        <div className="space-y-2 border-t pt-3">
          <h5 className="text-xs font-medium text-muted-foreground">Certifications</h5>
          <ul className="space-y-2">
            {certifications.map((cert) => (
              <li key={cert.title} className="flex items-start gap-2 text-xs">
                {cert.badgeUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cert.badgeUrl}
                    alt=""
                    title={cert.title}
                    className="h-8 w-8 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px]">
                    ★
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-medium">{cert.title}</p>
                  {cert.expiresAt ? (
                    <p className="text-muted-foreground">
                      Expires {new Date(cert.expiresAt).toLocaleDateString()}
                    </p>
                  ) : null}
                  {cert.pdfUrl ? (
                    <a
                      href={cert.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      Download PDF
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
