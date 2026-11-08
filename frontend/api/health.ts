// Adapted from partner branch 66bde9a7: ToyotaUTD/api/health.ts
export default function handler(req: any, res: any) {
  return res.status(200).json({
    ok: true,
    service: "toyota-vercel-api",
    timestamp: new Date().toISOString(),
  });
}
