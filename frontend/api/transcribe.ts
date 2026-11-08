// Adapted from partner branch 66bde9a7: ToyotaUTD/api/transcribe.ts
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

    const audioType = typeof mimeType === 'string' ? mimeType.split(';')[0].trim().toLowerCase() : 'audio/mp4';
    const extensions: Record<string,string> = {'audio/webm':'webm','audio/mp4':'m4a','audio/m4a':'m4a','audio/ogg':'ogg','audio/wav':'wav','audio/mpeg':'mp3'};
    if (!extensions[audioType]) return res.status(400).json({error:'Unsupported recording format.'});
    const audioBlob = new Blob(
      [audioBuffer],
      { type: audioType }
    );

    const extension = extensions[audioType];
    form.append("file", audioBlob, `recording.${extension}`);
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

    if (!response.ok) {


      return res.status(response.status).json({
        error: await speechError(response,'Speech transcription failed'),
      });
    }

    const data = await response.json();
    return res.status(200).json({
      text: data.text || "",
    });
  } catch (error) {


    return res.status(500).json({
      error: "Could not transcribe audio.",
    });
  }
}
