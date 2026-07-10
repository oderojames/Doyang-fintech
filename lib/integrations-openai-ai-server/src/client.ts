import OpenAI from "openai";

const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://openrouter.ai/api/v1";

const makeClient = () => {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY must be set.");
  }
  return new OpenAI({ apiKey, baseURL });
};

let _client: OpenAI | null = null;

export const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    if (!_client) _client = makeClient();
    return (_client as any)[prop];
  },
});
