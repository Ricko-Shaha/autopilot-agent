# Deploying Autopilot on Alibaba Cloud

The hackathon requires (a) the backend running on Alibaba Cloud and (b) a short
recording proving it. This project is a single zero-dependency Node service, so
deployment is simple. Two supported paths:

## Option A — ECS (simplest, best for the demo recording)

1. Create an **ECS** instance (Ubuntu 22.04, smallest burstable size is fine), open
   the security-group inbound port `8787`.
2. SSH in and install Node 22:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt-get install -y nodejs git
   ```
3. Clone the repo and set env:
   ```bash
   git clone <your-repo-url> && cd autopilot
   cp .env.example .env   # set LLM_PROVIDER=qwen, QWEN_API_KEY, QWEN_MODEL
   set -a; source .env; set +a
   npm run serve          # → listening on http://<ecs-public-ip>:8787
   ```
4. Open `http://<ecs-public-ip>:8787` and run a workflow. **This is your "proof of
   Alibaba Cloud deployment" recording** — show the URL bar with the Alibaba public IP.

## Option B — Function Compute / Container (Dockerfile included)

```bash
# Build & push to Alibaba Cloud Container Registry (ACR)
docker build -t registry.<region>.aliyuncs.com/<ns>/autopilot:latest .
docker push registry.<region>.aliyuncs.com/<ns>/autopilot:latest
```
Deploy the image to **Function Compute (Web function)** or **Serverless App Engine
(SAE)**, set env vars (`LLM_PROVIDER=qwen`, `QWEN_API_KEY`, `QWEN_MODEL`), and map
port `8787`.

## What proves "uses Alibaba Cloud services & APIs"

- The agent's reasoning runs on **Qwen models via Qwen Cloud** — see the provider
  implementation that calls the Alibaba Cloud / Qwen Cloud endpoint:
  [`src/llm/qwen.ts`](src/llm/qwen.ts) (link this file in your submission).
- The service itself runs on **Alibaba Cloud ECS / Function Compute** (above).

## Notes

- Free hackathon credits: <https://www.qwencloud.com/challenge/hackathon/voucher-application>
- Confirm the exact OpenAI-compatible base URL + model id for your account on the
  "First API Call" and "Choose Your Model" docs (Resources page). Set them in `.env`
  via `QWEN_BASE_URL` / `QWEN_MODEL` — no code change needed.
- For a public HTTPS URL, put the ECS instance behind an Alibaba Cloud SLB/ALB or a
  reverse proxy with a cert; not required for the demo.
