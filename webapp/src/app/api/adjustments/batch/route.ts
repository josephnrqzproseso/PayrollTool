import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireMinRole } from "@/lib/rbac";

interface AdjustmentInput {
  employeeId: string;
  name: string;
  category: string;
  amount: number;
  periodKey: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "MEMBER" });
  if (ctx instanceof NextResponse) return ctx;

  const tenantId = ctx.tenantId;
  const { adjustments } = (await req.json()) as { adjustments: AdjustmentInput[] };

  if (!Array.isArray(adjustments))
    return NextResponse.json({ error: "adjustments array required" }, { status: 400 });

  let upserted = 0;
  let removed = 0;

  for (const adj of adjustments) {
    if (!adj.employeeId || !adj.name || !adj.periodKey) continue;

    const existing = await prisma.adjustment.findFirst({
      where: {
        tenantId,
        employeeId: adj.employeeId,
        name: adj.name,
        periodKey: adj.periodKey,
      },
    });

    if (adj.amount === 0 || adj.amount === null || adj.amount === undefined) {
      if (existing) {
        await prisma.adjustment.delete({ where: { id: existing.id } });
        removed++;
      }
      continue;
    }

    if (existing) {
      await prisma.adjustment.update({
        where: { id: existing.id },
        data: { amount: Number(adj.amount), category: adj.category },
      });
    } else {
      await prisma.adjustment.create({
        data: {
          tenantId,
          employeeId: adj.employeeId,
          name: adj.name,
          category: adj.category,
          amount: Number(adj.amount),
          periodKey: adj.periodKey,
          source: "manual",
        },
      });
    }
    upserted++;
  }

  return NextResponse.json({ upserted, removed });
}
