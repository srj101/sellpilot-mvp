"use client";

import { useState } from "react";
import { Clock, AlertCircle, CheckCircle2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@acme/ui/card";
import { Badge } from "@acme/ui/badge";

export function SupportClient() {
  const [tickets, setTickets] = useState([
    { id: "TK-4820", subject: "WhatsApp connection failing intermittently", customer: "Abir Rahman", status: "Open", priority: "High", date: "Jul 19, 2026" },
    { id: "TK-4781", subject: "Billing receipt not showing discount promo", customer: "Farhana Islam", status: "In Progress", priority: "Medium", date: "Jul 18, 2026" },
    { id: "TK-4512", subject: "Refund request for double billing", customer: "Imran Khan", status: "Resolved", priority: "Low", date: "Jul 15, 2026" },
  ]);

  return (
    <div className="space-y-6">
      {/* Status breakdown cards */}
      <div className="grid gap-6 sm:grid-cols-3">
        <Card className="card-hover p-5 flex items-center gap-4">
          <div className="rounded-xl bg-amber-500/10 p-3 text-amber-500 shrink-0">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Pending Tickets</p>
            <p className="text-2xl font-bold text-foreground">2</p>
          </div>
        </Card>

        <Card className="card-hover p-5 flex items-center gap-4">
          <div className="rounded-xl bg-blue-500/10 p-3 text-blue-500 shrink-0">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">In Progress</p>
            <p className="text-2xl font-bold text-foreground">1</p>
          </div>
        </Card>

        <Card className="card-hover p-5 flex items-center gap-4">
          <div className="rounded-xl bg-green-500/10 p-3 text-green-500 shrink-0">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Resolved Tickets</p>
            <p className="text-2xl font-bold text-foreground">24</p>
          </div>
        </Card>
      </div>

      {/* Tickets log */}
      <Card className="card-hover">
        <CardHeader className="border-b py-4">
          <CardTitle>Active Tickets</CardTitle>
          <CardDescription>Follow up on customer inquiries and issues</CardDescription>
        </CardHeader>
        <CardContent className="py-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-3 font-medium">Ticket ID</th>
                  <th className="py-3 font-medium">Subject</th>
                  <th className="py-3 font-medium">Customer</th>
                  <th className="py-3 font-medium">Priority</th>
                  <th className="py-3 font-medium">Status</th>
                  <th className="py-3 text-right font-medium">Last Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td className="py-3 font-mono font-semibold text-foreground">{t.id}</td>
                    <td className="py-3 font-medium text-foreground">{t.subject}</td>
                    <td className="py-3 text-muted-foreground">{t.customer}</td>
                    <td className="py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        t.priority === "High" ? "bg-rose-500/10 text-rose-500" :
                        t.priority === "Medium" ? "bg-amber-500/10 text-amber-500" :
                        "bg-blue-500/10 text-blue-500"
                      }`}>
                        {t.priority}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        t.status === "Open" ? "bg-rose-500/10 text-rose-500" :
                        t.status === "In Progress" ? "bg-blue-500/10 text-blue-500" :
                        "bg-green-500/10 text-green-500"
                      }`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="py-3 text-right text-muted-foreground">{t.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
