// Vinhedo do Pão — OCR de rótulos via Google Cloud Vision
// A chave fica protegida na Vercel em GOOGLE_VISION_API_KEY.

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      service: "vinhedo-label-ocr",
      configured: Boolean(process.env.GOOGLE_VISION_API_KEY)
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({
      ok: false,
      error: "METHOD_NOT_ALLOWED"
    });
  }

  const apiKey = process.env.GOOGLE_VISION_API_KEY;

  if (!apiKey) {
    return res.status(501).json({
      ok: false,
      error: "VISION_NOT_CONFIGURED"
    });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : (req.body || {});

    const image = String(body.image || "");

    const match = image.match(
      /^data:image\/(?:jpeg|jpg|png|webp);base64,(.+)$/i
    );

    if (!match) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_IMAGE"
      });
    }

    const base64 = match[1];

    if (base64.length > 4500000) {
      return res.status(413).json({
        ok: false,
        error: "IMAGE_TOO_LARGE"
      });
    }

    const started = Date.now();

    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requests: [
            {
              image: {
                content: base64
              },
              features: [
                {
                  type: "TEXT_DETECTION",
                  maxResults: 50
                }
              ],
              imageContext: {
                languageHints: ["pt", "en", "es", "it", "fr"]
              }
            }
          ]
        })
      }
    );

    const data = await visionRes.json().catch(() => ({}));

    if (!visionRes.ok) {
      return res.status(502).json({
        ok: false,
        error: "VISION_HTTP_ERROR",
        status: visionRes.status
      });
    }

    const response = data?.responses?.[0] || {};

    if (response.error) {
      return res.status(502).json({
        ok: false,
        error: "VISION_API_ERROR",
        message: String(response.error.message || "").slice(0, 300)
      });
    }

    const text = String(
      response?.fullTextAnnotation?.text ||
      response?.textAnnotations?.[0]?.description ||
      ""
    ).trim();

    const words = Array.isArray(response?.textAnnotations)
      ? response.textAnnotations
          .slice(1, 40)
          .map(x => x?.description)
          .filter(Boolean)
      : [];

    return res.status(200).json({
      ok: true,
      text,
      words,
      latencyMs: Date.now() - started
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR"
    });
  }
  }
