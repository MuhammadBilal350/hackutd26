
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const host = (
    process.env.SPACETIMEDB_HOST || "https://maincloud.spacetimedb.com"
  ).replace(/\/$/, "");

  const database = process.env.SPACETIMEDB_DATABASE || "toyotautd-b9e7n";
  const token = process.env.SPACETIMEDB_TOKEN;

  const centers = req.body?.centers;

  if (!Array.isArray(centers) || centers.length === 0 || centers.length > 50) {
    return res.status(400).json({ error: "Invalid centers array" });
  }

  const saved = [];
  const errors = [];

  for (const center of centers) {
    if (
      !center.id ||
      !center.name ||
      !Number.isFinite(center.lat) ||
      !Number.isFinite(center.lon)
    ) {
      errors.push({ id: center.id, error: "Invalid center data" });
      continue;
    }

    const args = [
      String(center.id),
      String(center.name),
      String(center.address || ""),
      center.lat,
      center.lon,
      String(center.phone || ""),
      "",
      false,
      "unverified",
      "geoapify",
    ];

    try {
      const response = await fetch(
        `${host}/v1/database/${encodeURIComponent(database)}/call/upsert_toyota_service_center`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(args),
        }
      );

      if (!response.ok) {
        errors.push({
          id: center.id,
          error: await response.text(),
        });
      } else {
        saved.push(center.id);
      }
    } catch (error) {
      errors.push({
        id: center.id,
        error: error instanceof Error ? error.message : "Database request failed",
      });
    }
  }

  return res.status(errors.length ? 207 : 200).json({
    success: errors.length === 0,
    saved: saved.length,
    errors,
  });
}
