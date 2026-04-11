export const config = { runtime: "edge", maxDuration: 60 };

export default async function handler(req) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  try {
    const body = await req.json();
    
    // Streaming Anthropic pour eviter le timeout 60s Vercel
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ ...body, stream: true }),
    });

    if (!upstream.ok) {
      const err = await upstream.json();
      return new Response(JSON.stringify(err), { status: upstream.status, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    let stopReason = "end_turn";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") break;
        try {
          const evt = JSON.parse(data);
          if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
            fullText += evt.delta.text;
          }
          if (evt.type === "message_delta") {
            stopReason = evt.delta?.stop_reason || stopReason;
          }
        } catch (e) {}
      }
    }

    return new Response(JSON.stringify({
      content: [{ type: "text", text: fullText }],
      stop_reason: stopReason,
    }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}
