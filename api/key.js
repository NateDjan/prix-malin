export const config = { runtime: "edge" };

export default function handler(req) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const key = process.env.ANTHROPIC_API_KEY || "";
  return new Response(JSON.stringify({ k: key }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
