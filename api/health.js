// Week in Fits health check.
// Reports whether a Clothsy key is set and, when the API answers,
// how many credits remain. Credits stay "unknown" if the account
// endpoint does not answer or does not report a balance.
// The account endpoint is GET /api/v1/account, as used by the
// Clothsy MCP server check. The key is never returned here.

const BASE_URL = "https://api.clothsyai.fabricvton.com/api/v1";

function send(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

module.exports = async (req, res) => {
  const apiKey = process.env.CLOTHSY_API_KEY || "";
  if (!apiKey) {
    return send(res, 200, { mode: "demo", hasKey: false, credits: "unknown" });
  }
  let credits = "unknown";
  try {
    const accountRes = await fetch(BASE_URL + "/account", {
      headers: { Authorization: "Bearer " + apiKey },
      signal: AbortSignal.timeout(10000),
    });
    if (accountRes.ok) {
      const data = await accountRes.json().catch(() => ({}));
      if (typeof data.credits === "number") {
        credits = data.credits;
      } else if (typeof data.creditsRemaining === "number") {
        credits = data.creditsRemaining;
      } else if (typeof data.balance === "number") {
        credits = data.balance;
      }
    }
  } catch (err) {
    // Keep credits as "unknown" when the account check fails.
    credits = "unknown";
  }
  return send(res, 200, { mode: "live", hasKey: true, credits: credits });
};
