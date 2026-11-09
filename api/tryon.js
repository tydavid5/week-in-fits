// Week in Fits, server-side Clothsy try-on.
// The API key lives only in the server environment as CLOTHSY_API_KEY.
// It is never sent to the browser.
// Docs: https://clothsyai.fabricvton.com/docs/api
// Base URL: https://api.clothsyai.fabricvton.com/api/v1
// Endpoints used:
//   POST /images (multipart file field, returns an img id, free, valid 24 hours)
//   POST /tryons (async, returns 202 with an id and pollUrl straight away)
//   GET /tryons/{id} (poll every 2 to 3 seconds until status is success or failed)
// Async is used on purpose: Vercel Hobby functions cap at 10 seconds,
// while a try-on takes up to about 30 seconds, so the server starts the
// try-on fast and the browser polls for the result.
// One finished try-on costs 1 credit. A failed try-on is refunded.

const BASE_URL = "https://api.clothsyai.fabricvton.com/api/v1";
const DEMO_RESULT_URL = "https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?w=800&q=80";
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function send(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === "string") {
        try {
          resolve(JSON.parse(req.body));
        } catch (err) {
          reject(err);
        }
      } else {
        resolve(req.body);
      }
      return;
    }
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 8 * 1024 * 1024) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

// Upload a data URL photo to Clothsy and return its img id.
async function uploadPersonPhoto(apiKey, dataUrl) {
  const match = /^data:(image\/(jpeg|png));base64,(.+)$/.exec(dataUrl || "");
  if (!match) {
    throw new Error("Person photo must be a JPEG or PNG data URL");
  }
  const mime = match[1];
  const buffer = Buffer.from(match[3], "base64");
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Person photo is larger than 4 MB");
  }
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mime }), "person.jpg");
  const res = await fetch(BASE_URL + "/images", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey },
    body: form,
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) {
    throw new Error(data.error || data.message || ("Image upload failed with HTTP " + res.status));
  }
  return data.id;
}

function newIdempotencyKey() {
  if (globalThis.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "tryon-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

module.exports = async (req, res) => {
  const apiKey = process.env.CLOTHSY_API_KEY || "";

  // GET /api/tryon?id=... polls one try-on.
  if (req.method === "GET") {
    const url = new URL(req.url || "/api/tryon", "https://example.com");
    const id = url.searchParams.get("id") || "";
    if (!id) {
      return send(res, 400, { error: "A try-on id is required, as ?id=..." });
    }
    if (!apiKey) {
      return send(res, 200, {
        mode: "demo",
        status: "success",
        id: id,
        resultUrl: DEMO_RESULT_URL,
        message: "Demo mode, sample try-on, not a live Clothsy call.",
      });
    }
    try {
      const pollRes = await fetch(BASE_URL + "/tryons/" + encodeURIComponent(id), {
        headers: { Authorization: "Bearer " + apiKey },
        signal: AbortSignal.timeout(10000),
      });
      const data = await pollRes.json().catch(() => ({}));
      if (!pollRes.ok) {
        return send(res, pollRes.status || 502, {
          mode: "live",
          status: "failed",
          id: id,
          resultUrl: null,
          error: data.error || data.message || ("Clothsy returned HTTP " + pollRes.status),
          code: data.code || null,
        });
      }
      if (data.status === "success" && data.resultUrl) {
        return send(res, 200, {
          mode: "live",
          status: "success",
          id: data.id || id,
          resultUrl: data.resultUrl,
          message: "Live Clothsy try-on. Result link works for 24 hours.",
        });
      }
      if (data.status === "failed") {
        return send(res, 200, {
          mode: "live",
          status: "failed",
          id: data.id || id,
          resultUrl: null,
          message: data.message || "That try-on did not finish. Your credit has been returned.",
        });
      }
      return send(res, 200, {
        mode: "live",
        status: "pending",
        id: data.id || id,
        resultUrl: null,
        message: "Try-on is still working.",
      });
    } catch (err) {
      return send(res, 502, { mode: "live", status: "failed", id: id, resultUrl: null, error: "Live try-on check failed: " + err.message });
    }
  }

  if (req.method !== "POST") {
    return send(res, 405, { error: "Method not allowed. Use POST to start, or GET with ?id= to poll." });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return send(res, 400, { error: "Request body was not valid JSON." });
  }

  const personImageUrl = body.personImageUrl || null;
  const personImageData = body.personImageData || null;
  const garmentImageUrl = body.garmentImageUrl || null;
  const title = (body.title || "Outfit").slice(0, 120);
  const consent = body.consent === true;

  if (!consent) {
    return send(res, 400, { error: "Consent is required. The person in the photo must be an adult who agreed to the try-on." });
  }
  if (!garmentImageUrl || !/^https:\/\//.test(garmentImageUrl)) {
    return send(res, 400, { error: "A garment image URL starting with https:// is required." });
  }
  if (!personImageUrl && !personImageData) {
    return send(res, 400, { error: "A person photo is required, as an image URL or an uploaded photo." });
  }
  if (personImageUrl && !/^https:\/\//.test(personImageUrl)) {
    return send(res, 400, { error: "Person image URL must start with https://." });
  }

  // Demo mode: no key is set, so no live Clothsy call is made.
  // The result is a sample photo, clearly labelled as a demo in the response
  // and in the UI. Set CLOTHSY_API_KEY to enable live try-ons.
  if (!apiKey) {
    return send(res, 200, {
      mode: "demo",
      status: "success",
      resultUrl: DEMO_RESULT_URL,
      title: title,
      message: "Demo mode, sample try-on, not a live Clothsy call. Set CLOTHSY_API_KEY as a Vercel env var to enable live try-ons.",
    });
  }

  try {
    let personImageId = null;
    if (personImageData) {
      personImageId = await uploadPersonPhoto(apiKey, personImageData);
    }

    const payload = {
      garmentImageUrl: garmentImageUrl,
      title: title,
      consent: true,
    };
    if (personImageId) {
      payload.personImageId = personImageId;
    } else {
      payload.personImageUrl = personImageUrl;
    }

    // Async endpoint: returns 202 with an id straight away, no long wait.
    const startRes = await fetch(BASE_URL + "/tryons", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Idempotency-Key": newIdempotencyKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    const startData = await startRes.json().catch(() => ({}));
    if (!startRes.ok || !startData.id) {
      return send(res, startRes.status || 502, {
        mode: "live",
        status: "failed",
        resultUrl: null,
        error: startData.error || startData.message || ("Clothsy returned HTTP " + startRes.status),
        code: startData.code || null,
      });
    }
    return send(res, 200, {
      mode: "live",
      status: "pending",
      id: startData.id,
      resultUrl: null,
      title: title,
      message: "Live Clothsy try-on started. Polling for the result.",
    });
  } catch (err) {
    return send(res, 502, {
      mode: "live",
      status: "failed",
      resultUrl: null,
      error: "Live try-on failed: " + err.message,
    });
  }
};
