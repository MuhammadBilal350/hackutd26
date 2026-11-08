// Adapted from partner branch 66bde9a7: ToyotaUTD/api/speak.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { speechError } from '../server/speechError';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST required" });
  }

  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID;

    if (!apiKey || !voiceId) {
      return res.status(500).json({
        error:
          "Configure ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID.",
      });
    }

    const { text } = req.body ?? {};

    if (!text || typeof text !== "string") {
      return res.status(400).json({
        error: "A text value is required.",
      });
    }

    if (text.length > 4000) {
      return res.status(413).json({
        error: "Text must be 4,000 characters or fewer.",
      });
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_flash_v2_5",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      return res.status(response.status).json({
        error: await speechError(response,'ElevenLabs could not generate speech'),
      });
    }

    const audio = Buffer.from(
      await response.arrayBuffer()
    );

    return res.status(200).json({
      audioBase64: audio.toString("base64"),
      contentType: "audio/mpeg",
    });
  } catch (error) {


    return res.status(500).json({
      error: "Speech generation failed.",
    });
  }
}
