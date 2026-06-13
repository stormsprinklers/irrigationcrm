import type { ReportCategory } from "@/lib/mock/reporting-catalog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ReportCategoryCard({ category }: { category: ReportCategory }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{category.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {category.links.map((link) => (
            <li key={link}>
              <button
                type="button"
                className="text-sm text-primary hover:underline"
              >
                {link}
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
