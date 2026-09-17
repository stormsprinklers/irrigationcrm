"use client";

import Link from "next/link";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import type { CustomerDTO } from "@/lib/customers/types";
import { attributionChannelLabel } from "@/lib/attribution/normalize";
import { CustomerNameWithBadge } from "@/components/customers/CustomerNameWithBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPhoneDisplay } from "@/lib/inbox/phone";

export function CustomerTable({
  data,
  selectedIds = [],
  onSelectedIdsChange,
  nameColumnLabel = "Customer name",
  pageIndex,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  sorting,
  onSortingChange,
}: {
  data: CustomerDTO[];
  selectedIds?: string[];
  onSelectedIdsChange?: (ids: string[]) => void;
  nameColumnLabel?: string;
  pageIndex: number;
  pageSize: number;
  total: number;
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
}) {
  const rowSelection = useMemo(() => {
    const selection: Record<string, boolean> = {};
    for (const id of selectedIds) selection[id] = true;
    return selection;
  }, [selectedIds]);

  const setRowSelection = (
    updater: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)
  ) => {
    if (!onSelectedIdsChange) return;
    const next = typeof updater === "function" ? updater(rowSelection) : updater;
    onSelectedIdsChange(Object.keys(next).filter((id) => next[id]));
  };

  const columns = useMemo<ColumnDef<CustomerDTO>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: "name",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-4 h-8"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            {nameColumnLabel}
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <Link href={`/customers/${row.original.id}`} className="font-medium text-primary hover:underline">
            <CustomerNameWithBadge
              name={row.original.name}
              doNotService={row.original.doNotService}
              isContact={row.original.isContact}
            />
          </Link>
        ),
      },
      {
        accessorKey: "companyName",
        header: "Company",
        cell: ({ row }) => row.original.companyName ?? "—",
      },
      {
        id: "address",
        header: "Address",
        cell: ({ row }) => (
          <div className="text-sm">
            <div>{row.original.address ?? "—"}</div>
            {(row.original.city || row.original.state || row.original.zip) && (
              <div className="text-muted-foreground">
                {[row.original.city, row.original.state, row.original.zip].filter(Boolean).join(", ")}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "phone",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-4 h-8"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Phone
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => formatPhoneDisplay(row.original.phone) || "—",
      },
      {
        accessorKey: "email",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-4 h-8"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Email
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => row.original.email ?? "—",
      },
      {
        accessorKey: "leadSource",
        header: "Lead source",
        cell: ({ row }) =>
          row.original.leadSource ??
          (row.original.attributionChannel
            ? attributionChannelLabel(row.original.attributionChannel)
            : "—"),
      },
    ],
    [nameColumnLabel]
  );

  const table = useReactTable({
    data,
    getRowId: (row) => row.id,
    columns,
    state: { sorting, rowSelection, pagination: { pageIndex, pageSize } },
    onSortingChange: (updater) => onSortingChange(typeof updater === "function" ? updater(sorting) : updater),
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  });

  return (
    <div>
      <div className="rounded-lg border border-border bg-white">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex items-center justify-end gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>Rows per page</span>
          <select
            className="rounded border border-border bg-white px-2 py-1 text-sm"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {[10, 25, 50].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
        <span>
          Page {pageIndex + 1} of {Math.max(1, Math.ceil(total / pageSize))} · {total} total
        </span>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(pageIndex - 1)}
            disabled={pageIndex === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(pageIndex + 1)}
            disabled={(pageIndex + 1) * pageSize >= total}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
