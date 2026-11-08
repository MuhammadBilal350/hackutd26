
import { useState } from "react";
import { findNearestToyotaCenter } from "./roadsideFinder";

export default function RoadsideHelp() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<
    Awaited<ReturnType<typeof findNearestToyotaCenter>> | null
  >(null);

  async function handleFindCenter() {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const data = await findNearestToyotaCenter();
      setResult(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 500 }}>
      <h2>Need Roadside Assistance?</h2>
      <p>Find nearby Toyota-related service centers using your location.</p>

      <button onClick={handleFindCenter} disabled={loading}>
        {loading ? "Finding nearby centers..." : "Find Nearest Center"}
      </button>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 20 }}>
          {result.usedFallback && (
            <p>
              No Toyota-related listing was found. Showing nearby repair
              shops instead.
            </p>
          )}

          {result.nearest ? (
            <>
              <h3>{result.nearest.name}</h3>
              <p>{result.nearest.address}</p>

              <p>
                Distance:{" "}
                {result.nearest.drivingDistanceMiles != null
                  ? `${result.nearest.drivingDistanceMiles.toFixed(1)} driving miles`
                  : `${result.nearest.distanceMiles.toFixed(1)} miles (straight-line)`}
              </p>

              {result.nearest.durationMinutes != null && (
                <p>Estimated drive: {result.nearest.durationMinutes} minutes</p>
              )}

              {result.nearest.phone && (
                <p>Phone: {result.nearest.phone}</p>
              )}

              <p>
                Toyota authorization has not been verified. Please confirm
                with the business before relying on it as an official Toyota center.
              </p>

              <a
                href={`https://www.openstreetmap.org/?mlat=${result.nearest.lat}&mlon=${result.nearest.lon}#map=16/${result.nearest.lat}/${result.nearest.lon}`}
                target="_blank"
                rel="noreferrer"
              >
                View location on map
              </a>
            </>
          ) : (
            <p>No nearby service centers were found. Try again later.</p>
          )}

          {result.centers.length > 1 && (
            <>
              <h3>Other nearby options</h3>
              {result.centers.slice(1).map((center) => (
                <div key={center.id} style={{ marginBottom: 12 }}>
                  <strong>{center.name}</strong>
                  <p>{center.address}</p>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
