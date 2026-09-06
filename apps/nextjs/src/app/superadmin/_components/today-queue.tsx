"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Bug,
  CheckCircle2,
  Clock,
  Coins,
  CreditCard,
  HardDrive,
  Inbox,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  Store,
} from "lucide-react";

import { cn } from "@acme/ui";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@acme/ui/card";
import { Input } from "@acme/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
} from "@acme/ui/table";

import { useTRPC } from "~/trpc/react";

type CategoryFilter =
  | "all"
  | "past_due"
  | "renewal_risk"
  | "storage_limit"
  | "channel_down"
  | "bug_report"
  | "unprofitable";

export function TodayQueue() {
  const trpc = useTRPC();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>("all");

  const { data, isLoading, refetch, isFetching } = useQuery(
    trpc.superadmin.getAttentionQueue.queryOptions(),
  );

  const items = useMemo(() => data?.items ?? [], [data?.items]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const matchesCategory =
        selectedCategory === "all" || item.category === selectedCategory;
      const term = search.toLowerCase();
      const matchesSearch =
        !search ||
        item.title.toLowerCase().includes(term) ||
        item.description.toLowerCase().includes(term) ||
        item.businessName.toLowerCase().includes(term) ||
        (item.businessSlug?.toLowerCase().includes(term) ?? false);
      return matchesCategory && matchesSearch;
    });
  }, [items, selectedCategory, search]);

  const categoryIcons: Record<string, React.ElementType> = {
    past_due: CreditCard,
    renewal_risk: Clock,
    storage_limit: HardDrive,
    channel_down: Radio,
    bug_report: Bug,
    unprofitable: Coins,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Today's Attention Queue</h1>
            <Badge variant="outline" className="border-primary/30 text-primary text-xs">
              Live Priority Feed
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            Action items across billing, channel outages, capacity limits, and store health requiring superadmin intervention.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="h-8 gap-1.5 text-xs self-start sm:self-auto"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          Refresh Feed
        </Button>
      </div>

      {/* KPI Stats Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
              Pending Actions
            </CardTitle>
            <Inbox className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.counts.total ?? 0}</div>
            <p className="text-muted-foreground text-xs">Total items requiring attention</p>
          </CardContent>
        </Card>

        <Card className="border-rose-500/20 bg-rose-500/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-rose-600 dark:text-rose-400 text-xs font-semibold uppercase tracking-wider">
              Critical Urgency
            </CardTitle>
            <ShieldAlert className="text-rose-500 h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-rose-600 dark:text-rose-400 text-2xl font-bold">
              {data?.counts.critical ?? 0}
            </div>
            <p className="text-muted-foreground text-xs">Past due & channel outages</p>
          </CardContent>
        </Card>

        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-amber-600 dark:text-amber-400 text-xs font-semibold uppercase tracking-wider">
              Approaching Risks
            </CardTitle>
            <AlertTriangle className="text-amber-500 h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-amber-600 dark:text-amber-400 text-2xl font-bold">
              {data?.counts.warning ?? 0}
            </div>
            <p className="text-muted-foreground text-xs">Storage limits & renewals</p>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
              Platform Status
            </CardTitle>
            <CheckCircle2 className="text-emerald-500 h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {(data?.counts.critical ?? 0) === 0 ? "Optimal" : "Attention"}
            </div>
            <p className="text-muted-foreground text-xs">
              {(data?.counts.critical ?? 0) === 0 ? "No critical blockers active" : "Needs operator resolution"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search stores or action items…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-9 text-xs"
          />
        </div>

        <div className="bg-card flex flex-wrap items-center gap-1 rounded-lg border p-1">
          {[
            { id: "all", label: "All Items" },
            { id: "past_due", label: "Billing" },
            { id: "channel_down", label: "Channels" },
            { id: "renewal_risk", label: "Renewals" },
            { id: "storage_limit", label: "Storage" },
            { id: "bug_report", label: "Bugs" },
            { id: "unprofitable", label: "Losses" },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id as CategoryFilter)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                selectedCategory === cat.id
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ranked Action Table */}
      <Card className="border-border/60 overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 text-muted-foreground hover:bg-muted/40 text-xs font-semibold uppercase tracking-wider">
                <TableHead className="px-5 py-3.5 w-28">Priority</TableHead>
                <TableHead className="px-5 py-3.5">Store / Target</TableHead>
                <TableHead className="px-5 py-3.5">Issue & Context</TableHead>
                <TableHead className="px-5 py-3.5">Category</TableHead>
                <TableHead className="px-5 py-3.5">Time</TableHead>
                <TableHead className="px-5 py-3.5 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-xs">
              {isLoading ? (
                <TableSkeleton columns={6} rows={6} />
              ) : filtered.length === 0 ? (
                <TableEmpty colSpan={6}>
                  <div className="flex flex-col items-center justify-center py-6">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2" />
                    <p className="text-foreground font-semibold">No pending actions</p>
                    <p className="text-muted-foreground text-xs mt-1">
                      Everything in this category is currently operating smoothly.
                    </p>
                  </div>
                </TableEmpty>
              ) : (
                filtered.map((item) => {
                  const CatIcon = categoryIcons[item.category] ?? AlertCircle;
                  return (
                    <TableRow key={item.id} className="hover:bg-muted/30 transition-colors">
                      {/* Severity */}
                      <TableCell className="px-5 py-3.5">
                        {item.severity === "critical" ? (
                          <Badge className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 gap-1 text-[10px] font-semibold">
                            <AlertCircle className="h-3 w-3" />
                            CRITICAL
                          </Badge>
                        ) : item.severity === "warning" ? (
                          <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 gap-1 text-[10px] font-semibold">
                            <AlertTriangle className="h-3 w-3" />
                            WARNING
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground text-[10px]">
                            INFO
                          </Badge>
                        )}
                      </TableCell>

                      {/* Store */}
                      <TableCell className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="bg-primary/10 text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold">
                            <Store className="h-3.5 w-3.5" />
                          </div>
                          <div>
                            <div className="text-foreground font-semibold">
                              {item.businessName}
                            </div>
                            {item.businessSlug && (
                              <div className="text-muted-foreground font-mono text-[10px]">
                                /{item.businessSlug}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Issue */}
                      <TableCell className="px-5 py-3.5 max-w-md">
                        <p className="text-foreground font-semibold">{item.title}</p>
                        <p className="text-muted-foreground text-[11px] line-clamp-1 mt-0.5">
                          {item.description}
                        </p>
                      </TableCell>

                      {/* Category */}
                      <TableCell className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                          <CatIcon className="h-3.5 w-3.5" />
                          {item.categoryLabel}
                        </span>
                      </TableCell>

                      {/* Time */}
                      <TableCell className="px-5 py-3.5 text-muted-foreground font-mono text-[11px] whitespace-nowrap">
                        {new Date(item.timestamp).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>

                      {/* Action */}
                      <TableCell className="px-5 py-3.5 text-right whitespace-nowrap">
                        <Button asChild size="sm" variant="default" className="h-7 px-3 text-xs gap-1">
                          <Link href={item.actionUrl}>
                            {item.actionLabel}
                            <ArrowUpRight className="h-3 w-3" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
