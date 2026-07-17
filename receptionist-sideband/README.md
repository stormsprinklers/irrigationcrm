# AI Receptionist sideband

Always-on WebSocket bridge between Twilio Media Streams and OpenAI Realtime.

## Run locally

```bash
cd receptionist-sideband
npm install
cp .env.example .env
# set CRM_BASE_URL, OPENAI_API_KEY
npm run dev
```

Expose with a tunnel that supports WSS (e.g. ngrok):

```bash
ngrok http 8090
```

Set CRM env `SIDEBAND_PUBLIC_WSS_URL=wss://YOUR_HOST/twilio/media`.

## Production

Deploy this package on Fly.io / Railway / Render with a public HTTPS/WSS hostname. Do not run it on Vercel serverless.
