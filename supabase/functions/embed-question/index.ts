import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Authentication required" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Supabase Auth environment variables are not configured");
    return jsonResponse({ error: "Function configuration error" }, 500);
  }

  let authResponse: Response;
  try {
    authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: authorization,
      },
    });
  } catch (error) {
    console.error("Could not verify the Supabase user:", error);
    return jsonResponse({ error: "Could not verify authentication" }, 502);
  }

  if (authResponse.status === 401 || authResponse.status === 403) {
    return jsonResponse({ error: "Invalid or expired authentication token" }, 401);
  }
  if (!authResponse.ok) {
    console.error("Supabase Auth returned status", authResponse.status);
    return jsonResponse({ error: "Could not verify authentication" }, 502);
  }

  let body: { question?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON" }, 400);
  }

  if (typeof body.question !== "string" || !body.question.trim()) {
    return jsonResponse({ error: "A non-empty question is required" }, 400);
  }

  const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAiApiKey) {
    console.error("OPENAI_API_KEY is not configured");
    return jsonResponse({ error: "Function configuration error" }, 500);
  }

  let openAiResponse: Response;
  try {
    openAiResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: body.question.trim(),
      }),
    });
  } catch (error) {
    console.error("Could not reach the OpenAI embeddings API:", error);
    return jsonResponse({ error: "Could not generate question embedding" }, 502);
  }

  if (!openAiResponse.ok) {
    console.error("OpenAI embeddings API returned status", openAiResponse.status);
    return jsonResponse({ error: "Could not generate question embedding" }, 502);
  }

  let embedding: unknown;
  try {
    const result: { data?: Array<{ embedding?: unknown }> } = await openAiResponse.json();
    embedding = result.data?.[0]?.embedding;
  } catch (error) {
    console.error("Could not parse the OpenAI embeddings response:", error);
    return jsonResponse({ error: "Invalid response from embedding provider" }, 502);
  }

  if (!Array.isArray(embedding) || !embedding.every((value) => typeof value === "number")) {
    console.error("OpenAI embeddings response did not contain a numeric vector");
    return jsonResponse({ error: "Invalid response from embedding provider" }, 502);
  }

  return jsonResponse({ embedding });
});
