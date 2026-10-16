# AI voice sideband

Always-on WebSocket bridge between Twilio Media Streams and OpenAI Realtime. The same code can run as either the customer receptionist or the private owner assistant, but they should be separate Railway services.

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

For the private owner assistant service, set Railway `SIDEBAND_MODE=owner-assistant` and set Vercel `OWNER_ASSISTANT_PUBLIC_WSS_URL=wss://YOUR_OWNER_ASSISTANT_HOST/twilio/media`. Do not set `SIDEBAND_MODE=owner-assistant` on the receptionist service.

## Production

Deploy this package on Fly.io / Railway / Render with a public HTTPS/WSS hostname. Do not run it on Vercel serverless.

Uses the **GA** OpenAI Realtime API (`gpt-realtime` by default). Do not set the retired `OpenAI-Beta: realtime=v1` header or `gpt-4o-realtime-preview` unless you know you still have preview access.
