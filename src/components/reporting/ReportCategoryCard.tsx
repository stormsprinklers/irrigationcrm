import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ReportLink = { label: string; href: string };

type ReportCategory = {
  title: string;
  links: ReportLink[];
};

export function ReportCategoryCard({ category }: { category: ReportCategory }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">{category.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {category.links.map((link) => (
            <li key={link.href + link.label}>
              <Link href={link.href} className="text-sm text-primary hover:underline">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
