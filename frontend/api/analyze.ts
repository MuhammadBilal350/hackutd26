// Adapted from partner branch 66bde9a7: ToyotaUTD/api/analyze.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const REASONING_MODEL =
  process.env.NVIDIA_MODEL || "nvidia/nemotron-3.5-lightning-30b-a3b";
const VISION_MODEL =
  process.env.NVIDIA_VISION_MODEL || "nvidia/nemotron-3.5-super-vl-120b-a12b";

function getNvidiaApiKey() {
  const configuredKey = process.env.NVIDIA_API_KEY?.trim();
  if (!configuredKey) return "";

  const withoutBearer = configuredKey.replace(/^Bearer\s+/i, "");
  return withoutBearer.replace(/^(['"])(.*)\1$/, "$2").trim();
}

type MessageContent =
  | string
  | {
      type: string;
      text?: string;
      image_url?: { url: string };
    }[];

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

async function callNvidia(
  model: string,
  messages: { role: string; content: MessageContent }[]
): Promise<string> {
  const apiKey = getNvidiaApiKey();
  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY is not configured on the server.");
  }

  const response = await fetch(NVIDIA_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: 2500,
      stream: false,
    }),
  });

  const raw = await response.text();
  let data: {
    choices?: { message?: { content?: string | { text?: string }[] } }[];
    detail?: string;
    message?: string;
  };
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      `${model} returned a non-JSON response (HTTP ${response.status}).`
    );
  }

  if (!response.ok) {
    if (
      response.status === 401 &&
      /Invalid JWT serialization|Missing dot delimiter/i.test(
        data.detail || data.message || raw
      )
    ) {
      throw new Error(
        "NVIDIA rejected NVIDIA_API_KEY's format. For integrate.api.nvidia.com, use the hosted API key from build.nvidia.com (typically starts with nvapi-). Store only the key value in Vercel—without quotes or a Bearer prefix—then redeploy."
      );
    }

    throw new Error(
      `${model} API error (HTTP ${response.status}). Check the server provider configuration.`
    );
  }

  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => part.text || "").join("\n");
  }
  throw new Error(`${model} returned an empty response.`);
}

function isConversationMessage(value: unknown): value is ConversationMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<ConversationMessage>;
  return (
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string"
  );
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST." });
  }

  if (!getNvidiaApiKey()) {
    return res.status(500).json({
      error: "NVIDIA_API_KEY is not configured on the server.",
    });
  }

  try {
    const {
      message = "",
      imageDataUrl,
      vehicle = {},
      comparison = {},
      nearbyServices = "",
      history = [],
      inspectionResults,
      visionResults = inspectionResults,
    } = req.body || {};

    if (
      typeof message !== "string" ||
      (!message.trim() && !imageDataUrl)
    ) {
      return res.status(400).json({
        error: "Send a message or a vehicle photo.",
      });
    }

    if (
      !Array.isArray(history) ||
      history.length > 12 ||
      history.some((item: unknown) => !isConversationMessage(item))
    ) {
      return res.status(400).json({
        error: "Conversation history is invalid.",
      });
    }

    if (
      typeof nearbyServices !== "string" ||
      nearbyServices.length > 8000
    ) {
      return res.status(400).json({
        error: "Nearby service details are invalid.",
      });
    }

    // Existing Python inspection evidence remains distinct from optional hosted photo observations.
    let inspectionContext = "";
    if (visionResults !== undefined) {
      if (!visionResults || typeof visionResults !== "object" || Array.isArray(visionResults)) {
        return res.status(400).json({ error: "Inspection results must be an object." });
      }
      inspectionContext = JSON.stringify(visionResults);
      if (inspectionContext.length > 60_000) {
        return res.status(413).json({ error: "Inspection results are too large." });
      }
    }
    let visualObservations = "";
    if (imageDataUrl) {
      if (
        typeof imageDataUrl !== "string" ||
        !imageDataUrl.startsWith("data:image/")
      ) {
        return res.status(400).json({
          error: "The photo must be supplied as an image data URL.",
        });
      }

      if (imageDataUrl.length > 4_000_000) {
        return res.status(413).json({
          error: "Image is too large for upload. Please use a smaller photo.",
        });
      }

      visualObservations = await callNvidia(VISION_MODEL, [
        {
          role: "system",
          content:
            "You are a careful vehicle photo observation assistant. Describe " +
            "only details visibly supported by the image. For vehicle photos, " +
            "describe visible exterior condition and obvious damage. For " +
            "dashboard photos, transcribe clearly visible warning lights, " +
            "readable text, and mileage only when legible. Do not guess hidden " +
            "mechanical problems, exact repair costs, vehicle identity, or " +
            "unreadable mileage. State uncertainty. This is not a diagnosis.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Inspect this vehicle photo. Report visible observations, " +
                "readable dashboard warnings, and anything uncertain.",
            },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ]);
    }

    const vehicleDetails =
      typeof vehicle === "string" ? vehicle : JSON.stringify(vehicle);
    const priorMessages: {
      role: "user" | "assistant";
      content: string;
    }[] = history.slice(-8).map((item: ConversationMessage) => ({
      role: item.role,
      content: item.content.slice(0, 2000),
    }));

    const answer = await callNvidia(REASONING_MODEL, [
      {
        role: "system",
        content:
          "You are a neutral Toyota ownership decision assistant. Your main " +
          "job is helping users compare keeping their current vehicle with " +
          "buying or leasing a replacement. Do not steer them toward a purchase " +
          "or repairs; doing nothing is a valid choice. Treat the supplied " +
          "calculated comparison as the source for financial totals and explain " +
          "its assumptions. Use visual observations only as evidence; they are " +
          "not a professional inspection. Never invent a market value, " +
          "depreciation amount, repair quote, dealer price, APR, credit approval, " +
          "or lease offer. Label estimates and user-provided assumptions. Ask " +
          "for missing inputs rather than guessing. For safety warnings or " +
          "suspected major mechanical issues, advise checking with a qualified " +
          "mechanic. When nearby service details are supplied, report them " +
          "accurately and say if Toyota authorization is unverified. Keep " +
          "answers concise and conversational, usually under 120 words, so " +
          "they work well as spoken replies.",
      },
      ...priorMessages,
      {
        role: "user",
        content:
          `User question: ${message || "Please review this vehicle photo."}\n\n` +
          `Vehicle details supplied by user: ${vehicleDetails}\n\n` +
          `Calculated comparison (estimates based on user-entered assumptions): ${JSON.stringify(comparison)}\n\n` +
          `Observations from the vision model: ${
            visualObservations || "No photo was supplied."
          }\n\n` +
          `Structured inspection evidence supplied by the existing vision service: ${inspectionContext || "Not supplied."}\n` +
          "Preserve withheld/null ratings, uncertainty and reported limitations. Never infer missing scores or treat experimental findings as confirmed diagnoses.\n\n" +
          `Nearby service lookup: ${
            nearbyServices || "No location lookup was requested or supplied."
          }\n\n` +
          "Separate visible observations from assumptions and financial " +
          "estimates. Do not repeat or fabricate facts absent from this context.",
      },
    ]);

    return res.status(200).json({
      answer,
      analysis: answer,
      visualObservations,
      reasoningModel: REASONING_MODEL,
      visionModel: imageDataUrl ? VISION_MODEL : null,
    });
  } catch (error: unknown) {
    // Provider payloads and credentials are never written to local logs.
    return res.status(502).json({
      error:
        error instanceof Error ? error.message : "Vehicle analysis failed.",
    });
  }
}
