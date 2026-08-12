export { Link } from "react-router-dom";
export { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

export const NextResponse = {
  json: (body: unknown, init?: { status?: number }) =>
    new Response(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: { "content-type": "application/json" },
    }),
  redirect: (url: string) => new Response(null, { status: 302, headers: { location: url } }),
  next: (init?: { request?: unknown }) => new Response(null, init as ResponseInit),
};

export type NextRequest = Request;
