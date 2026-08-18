param([string]$ProjectRoot = "D:\proyectos\WhatsAppSaas")
$ErrorActionPreference = "Stop"
$envPath = Join-Path $ProjectRoot ".env"
$backend = Join-Path $ProjectRoot "backend"

Write-Host "`n==> Failover configuration" -ForegroundColor Cyan
if (Test-Path -LiteralPath $envPath) {
    Get-Content -LiteralPath $envPath | Where-Object {
        $_ -match '^(AUTO_FAILOVER_|SESSION_QUARANTINE_|CIRCUIT_BREAKER_)'
    }
}

$scriptPath = Join-Path $backend "tmp-diagnosticar-failover.mjs"
@'
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
try {
  const sessions = await prisma.whatsAppSession.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, phoneE164: true, status: true, lastConnectionCode: true, lastConnectionError: true },
  });
  const queueGroups = await prisma.messageQueue.groupBy({
    by: ["assignedSessionId", "status"],
    where: { status: { in: ["PENDING", "PROCESSING", "SENT", "DEAD_LETTER"] } },
    _count: { _all: true },
  });
  const sessionRows = sessions.map((session) => {
    const counts = Object.fromEntries(queueGroups.filter((row) => row.assignedSessionId === session.id).map((row) => [row.status, row._count._all]));
    return {
      id: session.id,
      name: session.name,
      phone: session.phoneE164 ?? "",
      status: session.status,
      pending: (counts.PENDING ?? 0) + (counts.PROCESSING ?? 0),
      sent: counts.SENT ?? 0,
      dlq: counts.DEAD_LETTER ?? 0,
      code: session.lastConnectionCode ?? "",
      error: session.lastConnectionError ?? "",
    };
  });
  console.log("\nSESSIONS AND QUEUES");
  console.table(sessionRows);

  const campaigns = await prisma.campaign.findMany({
    where: { status: { in: ["RUNNING", "PREPARING", "PAUSED", "PAUSED_BY_CIRCUIT_BREAKER"] } },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, name: true, status: true, totalMessages: true, sentMessages: true, failedMessages: true },
  });
  const campaignIds = campaigns.map((campaign) => campaign.id);
  const campaignGroups = campaignIds.length
    ? await prisma.messageQueue.groupBy({
        by: ["campaignId", "status"],
        where: { campaignId: { in: campaignIds } },
        _count: { _all: true },
      })
    : [];
  const heldGroups = campaignIds.length
    ? await prisma.messageQueue.groupBy({
        by: ["campaignId"],
        where: { campaignId: { in: campaignIds }, lastErrorCode: "HELD_SESSION_QUARANTINED" },
        _count: { _all: true },
      })
    : [];
  console.log("\nACTIVE OR PAUSED CAMPAIGNS");
  console.table(campaigns.map((campaign) => {
    const counts = Object.fromEntries(campaignGroups.filter((row) => row.campaignId === campaign.id).map((row) => [row.status, row._count._all]));
    const held = heldGroups.find((row) => row.campaignId === campaign.id)?._count._all ?? 0;
    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      total: campaign.totalMessages,
      sent: counts.SENT ?? campaign.sentMessages,
      pending: (counts.PENDING ?? 0) + (counts.PROCESSING ?? 0) - held,
      held,
      dlq: counts.DEAD_LETTER ?? campaign.failedMessages,
    };
  }));
} finally {
  await prisma.$disconnect();
}
'@ | Set-Content -LiteralPath $scriptPath -Encoding UTF8

Push-Location $backend
try {
    & node.exe "--env-file=../.env" $scriptPath
    if ($LASTEXITCODE -ne 0) { throw "Failover diagnostic failed." }
} finally {
    Pop-Location
    Remove-Item -LiteralPath $scriptPath -Force -ErrorAction SilentlyContinue
}
