import { ImageResponse } from "next/og";

// Route handlers only accept the documented segment config keys. `size`,
// `contentType` and `alt` are file-convention-only exports, so the dimensions
// and headers are set on the response instead.
export const runtime = "nodejs";
const WIDTH = 1200;
const HEIGHT = 630;

/**
 * One card generator for the whole site. `/api/og?t=&d=&p=` renders the title,
 * the description and a path label, so every URL gets a distinct image without a
 * hand-made PNG per page. Static assets beat generated ones for the homepage,
 * but 30+ hand-drawn cards do not get maintained — this is the honest trade.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get("t") || "The coding agent that shows its work.").slice(0, 90);
  const description = (
    searchParams.get("s") || "Minimalist AI coding assistant for the terminal."
  ).slice(0, 96);
  const path = searchParams.get("p") || "/";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0A0B0A",
          padding: "64px 72px",
          // A single light source from the top, same as the site's .surface.
          backgroundImage:
            "linear-gradient(180deg, #161916 0%, #0A0B0A 62%), radial-gradient(ellipse 80% 55% at 50% -10%, rgba(139,217,154,0.16) 0%, rgba(139,217,154,0) 70%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* The ◈ glyph is missing from Satori's bundled font, so the mark is
              drawn: a rotated square with a counter-rotated square inside. */}
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              background: "#8BD99A",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                background: "#0A0B0A",
                transform: "rotate(45deg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div style={{ width: 10, height: 10, background: "#8BD99A" }} />
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "#ECEEE9", fontWeight: 600 }}>
            Sentinel
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "#959C94" }}>v3.1.0</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              display: "flex",
              fontSize: title.length > 52 ? 60 : 72,
              lineHeight: 1.08,
              letterSpacing: "-0.035em",
              color: "#ECEEE9",
              fontWeight: 600,
              maxWidth: 1010,
            }}
          >
            {title}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              lineHeight: 1.35,
              color: "#959C94",
              maxWidth: 940,
            }}
          >
            {description}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid #222622",
            paddingTop: 26,
          }}
        >
          <div style={{ display: "flex", fontSize: 26, color: "#8BD99A", fontFamily: "monospace" }}>
            {`sentinel-cli.dev${path}`}
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "#959C94" }}>
            MIT · no servers · no telemetry
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=604800, stale-while-revalidate=2592000",
      },
    }
  );
}
