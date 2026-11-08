export default function handler(req: any, res: any) {
  return res.status(200).json({
    ok: true,
    service: "toyota-vercel-api",
    timestamp: new Date().toISOString(),
  });
}
