People with a full wardrobe still wear the same three outfits because planning a week takes too long.

Week in Fits is a HackTheFashion Global'26 entry in the Styling and Wardrobe track. You upload your photo, build a closet from clothes you own, pick an occasion for each day of the week starting Monday Nov 16, 2026, and the app plans 7 outfits, one per day, matched to the Lagos weather and the occasion. Each day has a Try on button that shows you wearing that outfit through a Clothsy AI virtual try-on.

Live demo: https://week-in-fits.vercel.app (to be confirmed after deploy, not live yet)

## How it works

1. Pick a sample shopper or upload your own photo, and tick the consent box. Only adults, and only your own photo, or a photo you have permission to use.
2. Use the 14 sample garments, add your own by image URL, or remove custom garments you added. The closet is saved in localStorage in your browser.
3. Pick an occasion (work, casual, event, date, rest) for each day, Mon Nov 16 to Sun Nov 22, 2026.
4. Tap Generate my week. The planner is a deterministic rule system, not a black box: it matches garment warmth to the day's temperature, matches occasion tags, never repeats a garment in the week, and spreads colours across days.
5. Tap Try on for any day. The app sends your photo and the main garment photo to Clothsy through the server function in api/tryon.js, with consent true. For an outfit with two garments, the main garment (top or dress) is tried on, and the second garment is named as paired in text.

Weather comes from Open-Meteo for Lagos (latitude 6.5244, longitude 3.3792, daily max temperature and precipitation probability, timezone Africa/Lagos). If the weather fetch fails, the app uses 31C, sunny, 10 percent rain, and labels it as a fallback on each day.

## Clothsy API usage

Base URL: https://api.clothsyai.fabricvton.com/api/v1

Docs read before coding: https://clothsyai.fabricvton.com/docs/api, plus the endpoint pages for creating a try-on, getting a try-on, and uploading an image.

Endpoints used:

- POST /images, multipart form with a single file field, returns an img id, free, valid 24 hours. Used for an uploaded shopper photo, so the photo never needs a public URL.
- POST /tryons, async, with Authorization Bearer CLOTHSY_API_KEY, a fresh Idempotency-Key per try-on, and a JSON body with personImageUrl or personImageId, garmentImageUrl, title, and consent true. It returns 202 with an id and a pollUrl straight away, so the server answers fast and the browser polls for the result. This fits the Vercel Hobby 10 second function limit, since a try-on takes up to about 30 seconds.
- GET /tryons/{id}, polled every 3 seconds by the browser through GET /api/tryon?id=..., until status is success or failed.

Auth is Authorization Bearer CLOTHSY_API_KEY on every request. The key lives only in the server environment and never reaches the browser. One finished try-on costs 1 credit, and a failed try-on is refunded. New Clothsy accounts start with 20 free credits. Images must be JPEG or PNG up to 4 MB. Result URLs work for 24 hours. Every result is labelled on screen as an AI-generated try-on.

The health endpoint, api/health.js, reports mode live or demo, whether a key is set, and credits when the account endpoint answers. It uses GET /api/v1/account, the same check the Clothsy MCP server uses, and returns credits as unknown when that check does not answer or does not report a balance.

## Demo mode

If CLOTHSY_API_KEY is not set, api/tryon.js returns mode demo with a sample result image, and the UI labels it plainly as "Demo mode, sample try-on, not a live Clothsy call" and explains that setting CLOTHSY_API_KEY enables live try-ons. A demo result is never presented as a live Clothsy result. Set CLOTHSY_API_KEY as a Vercel env var to enable live try-ons.

## Tech

Plain static HTML, CSS, and JavaScript, no framework, no build step. Vercel serverless functions in api/ for the try-on and health check. Sample photos are Unsplash URLs, labelled as samples.

## Setup

No npm install is needed. To run locally, serve the folder with any static server, for example:

python3 -m http.server 8000

Then open http://localhost:8000

Note: the /api routes need Vercel or a local function runner. On a plain static server, /api/health and /api/tryon return 404, the app treats that as demo mode, and the planner, closet, and weather still work. The demo try-on needs the API route, so on a plain static server a try-on tap will show a failure message instead of the sample result. Deploy to Vercel for the full flow.

To enable live try-ons on Vercel, set CLOTHSY_API_KEY as an environment variable in the Vercel project settings, then redeploy. Get a key at https://app.clothsyai.fabricvton.com under Developer API.

## Known limits

- Sample shopper photos are full length Unsplash portraits, chosen because Clothsy prefers a full length photo facing the camera. A headshot or a photo with more than one adult may be rejected by Clothsy.
- Try-ons use the async Clothsy endpoint on purpose: the server starts a try-on in under 10 seconds and the browser polls for the result, so the Vercel Hobby 10 second function limit is not a blocker.
- The week is fixed to Mon Nov 16 to Sun Nov 22, 2026, the week after the build date, so the Open-Meteo forecast call uses those exact dates.

## Licence

MIT
