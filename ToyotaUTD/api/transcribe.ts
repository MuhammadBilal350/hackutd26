import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST required" });
  }

  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "ELEVENLABS_API_KEY is not configured.",
      });
    }

    const { audioBase64, mimeType } = req.body ?? {};

    if (!audioBase64) {
      return res.status(400).json({
        error: "Audio data is required.",
      });
    }

    const audioBuffer = Buffer.from(
      audioBase64,
      "base64"
    );

    if (audioBuffer.length > 4 * 1024 * 1024) {
      return res.status(413).json({
        error: "Audio must be smaller than 4 MB.",
      });
    }

    const form = new FormData();

    const audioBlob = new Blob(
      [audioBuffer],
      { type: mimeType || "audio/m4a" }
    );

    form.append("file", audioBlob, "recording.m4a");
    form.append("model_id", "scribe_v2");

    const response = await fetch(
      "https://api.elevenlabs.io/v1/speech-to-text",
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
        },
        body: form,
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Transcription error:", data);

      return res.status(response.status).json({
        error: "Speech transcription failed.",
      });
    }

    return res.status(200).json({
      text: data.text || "",
    });
  } catch (error) {
    console.error("Transcription endpoint error:", error);

    return res.status(500).json({
      error: "Could not transcribe audio.",
    });
  }
}