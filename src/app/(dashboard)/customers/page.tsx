import { CustomerTable } from "@/components/customers/CustomerTable";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Columns3, Filter, Plus } from "lucide-react";
import { customers, customerRecordCount } from "@/lib/mock/customers";
import { cn } from "@/lib/utils";

const filterTabs = ["All", "Serviceable", "Do not service"];

export default function CustomersPage() {
  return (
    <ContentArea>
      <PageHeader
        breadcrumb={["Customers", "All Customers"]}
        title="All Customers"
        subtitle={`${customerRecordCount.toLocaleString()} records`}
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Actions
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>Export</DropdownMenuItem>
                <DropdownMenuItem>Import</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Create customer
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 max-w-sm">
          <Input placeholder="Search customers" />
        </div>
        <Button variant="outline" size="icon">
          <Filter className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon">
          <Columns3 className="h-4 w-4" />
        </Button>
      </div>

      <div className="mb-4 flex gap-6 border-b border-border">
        {filterTabs.map((tab, index) => (
          <button
            key={tab}
            type="button"
            className={cn(
              "relative pb-3 text-sm font-medium transition-colors",
              index === 0
                ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      <CustomerTable data={customers} />
    </ContentArea>
  );
}
