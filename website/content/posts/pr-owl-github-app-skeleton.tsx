import Link from "next/link";
import { Callout, CodeBlock } from "@/components/CodeBlock";
import { CompareTable, Cta, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "pr-owl-github-app-skeleton",
  title: "The GitHub App: manifest, environment, and a route that does nothing yet",
  metaTitle: "PR Owl Part 2: The GitHub App Skeleton",
  description:
    "The skeleton PR Owl is built on: a Next.js app, a GitHub App manifest, the environment it needs, and a webhook route wired up and deliberately doing nothing.",
  date: "2026-10-06",
  readingMinutes: 8,
  tags: ["Tutorial", "Next.js", "GitHub", "Tooling"],
  keyword: "github app next.js webhook",
  series: { slug: "pr-owl-course", order: 2 },
  related: ["pr-owl-course-overview", "mcp-server-for-coding-agents", "cli-doctor-preflight-checks"],
  faq: [
    {
      q: "Why Next.js for a webhook receiver?",
      a: "It is not a marketing decision — it is that a GitHub App needs three things at once: an HTTPS endpoint, a place to keep state, and somewhere a human can look to see what it is doing. A Next.js route handler is the endpoint, and the same app gives you a status page for free. If you already run Next.js, adding two routes is a much smaller commitment than standing up a separate service.",
    },
    {
      q: "Do I need the GitHub App manifest checked into the repo?",
      a: "The manifest is what you paste into GitHub's App-creation form, and it is safe to check in — it contains the App id and the webhook URL but no secret. The private key and the webhook secret must not be. The manifest is in pr-owl/app-manifest.yml in this repository.",
    },
    {
      q: "Why does the route do nothing on purpose?",
      a: "Because the most useful first milestone is a server that receives a delivery and correctly rejects everything. That proves the plumbing — tunnel, TLS, secret, header parsing — before any part of it depends on a model, a clone or a diff. If the signature check works in part 3 with a curl command, you have already de-risked the only part of this app that runs on the public internet.",
    },
    {
      q: "Can I develop this without registering a GitHub App?",
      a: "Yes, and you should. Part 3 signs a payload by hand with a local secret and posts it to localhost, which tests the verification logic without a round trip through GitHub. You only need the real App once part 5 sends an actual pull request.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          PR Owl is three directories: <code className="font-mono text-[13px]">lib/</code>{" "}
          holds pure functions, <code className="font-mono text-[13px]">app/api/</code> holds
          two routes, and one module —{" "}
          <code className="font-mono text-[13px]">lib/owl.ts</code> — is the only place real
          credentials exist.
        </p>
        <p>
          The first milestone is not a working reviewer. It is{" "}
          <strong>a server that receives a delivery and correctly rejects
          everything</strong>.
        </p>
      </KeyTakeaways>

      <H2 id="app" text="The app" />
      <p>
        Four files, and the dependency list is short enough to read in one go. No
        Octokit, no ORM, no state library — the reasons are in{" "}
        <a
          href="https://github.com/KunjShah95/SENTINEL-CLI/tree/main/pr-owl"
          className="text-moss underline-offset-4 hover:underline"
        >
          pr-owl/
        </a>
        , and the short version is that every one of those is a thing you have to keep
        current, and this app touches code that runs on a stranger&rsquo;s commit.
      </p>
      <CodeBlock
        label="pr-owl/package.json"
        code={`{
  "name": "pr-owl",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "test": "node --import tsx --test __tests__/*.test.ts"
  },
  "dependencies": {
    "next": "^15.5.26",
    "react": "^19.2.7",
    "react-dom": "^19.2.7"
  },
  "devDependencies": {
    "tsx": "^4.22.3",
    "typescript": "^5.9.3"
  }
}`}
      />
      <p>
        <code className="font-mono text-[13px]">node --test</code> rather than Vitest or
        Jest, for the same reason Sentinel uses it: the test runner is built into Node, so
        the app is installable offline and a test failure is never a dependency conflict.
        The tests are 124 of them and none of them touch the network.
      </p>

      <H3 id="external" text="One non-obvious config line" />
      <p>
        PR Owl imports Sentinel&rsquo;s agent from outside its own directory. Next refuses
        that by default, which surfaces as a confusing module-not-found rather than a
        message about directory boundaries.
      </p>
      <CodeBlock
        label="pr-owl/next.config.mjs"
        code={`export default {
  reactStrictMode: true,
  experimental: {
    // PR Owl imports Sentinel's agent from the repository root, which is
    // outside this app's directory. Without this it refuses to compile the
    // import as external, and the error names the module rather than the cause.
    externalDir: true,
  },
};`}
      />

      <H2 id="runtime" text="The Node runtime, and why it is not the default" />
      <p>
        Next.js defaults new apps to the Edge runtime, which does not have{" "}
        <code className="font-mono text-[13px]">node:crypto</code>, no{" "}
        <code className="font-mono text-[13px]">child_process</code>, and no filesystem.
        PR Owl needs all three. The override is one line per route.
      </p>
      <CodeBlock
        label="pr-owl/app/api/webhooks/route.ts"
        code={`// Node runtime: this needs crypto and the Sentinel agent, neither of
// which exists in the edge runtime.
export const runtime = 'nodejs';
// A review is queued, not awaited, so this must not be a cached route.
export const dynamic = 'force-dynamic';`}
      />
      <p>
        <code className="font-mono text-[13px]">force-dynamic</code> is not optional. A
        cached POST handler is a webhook that silently stops receiving deliveries after
        the first one, and the symptom is a reviewer that worked in development and does
        nothing in production.
      </p>

      <H2 id="manifest" text="The manifest" />
      <p>
        A GitHub App is created from a manifest. This one is checked in, because it
        contains the App id and the webhook URL and no secret — the private key and the
        webhook secret are environment variables and never appear in a file.
      </p>
      <CodeBlock
        label="pr-owl/app-manifest.yml"
        code={`name: pr-owl
description: Reviews pull requests and leaves inline comments.

default_events:
  # Deliberately NOT \`edited\`. A description typo should not cost a
  # model call — see part 4.
  - pull_request
default_permissions:
  contents: read        # clone the branch
  pull_requests: write  # post a review
  checks: write         # a check run per review
webhook:
  url: https://YOUR_TUNNEL.example.com/api/webhooks
  active: true`}
      />
      <Callout title="Why three permissions and not one">
        <p>
          <code className="font-mono text-[13px]">contents: read</code> to clone,{" "}
          <code className="font-mono text-[13px]">pull_requests: write</code> to post,{" "}
          <code className="font-mono text-[13px]">checks: write</code> for the status
          check. The first is the only one a fork pull request could ever want, and it
          cannot be granted conditionally — so the safety in part 8 has to come from the
          permission rung the agent runs under, not from the App&rsquo;s scopes.
        </p>
      </Callout>

      <H2 id="route" text="The route that does nothing" />
      <p>
        The whole handler for this part. It reads the body, says it is not ready, and is
        gone — which is the point, because in part 3 the same five lines grow into the
        only code in this app that runs on the public internet.
      </p>
      <CodeBlock
        label="pr-owl/app/api/webhooks/route.ts"
        code={`export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();      // raw bytes, NOT req.json()
  return NextResponse.json({ error: 'not configured' }, { status: 500 });
}

export async function GET(): Promise<Response> {
  return NextResponse.json({ ok: true, service: 'pr-owl' });
}`}
      />
      <p>
        One thing is decided now and looks like a detail:{" "}
        <code className="font-mono text-[13px]">req.text()</code>, not{" "}
        <code className="font-mono text-[13px]">req.json()</code>. The signature is over the
        exact bytes GitHub sent, and parsing first destroys the only copy you need. Part 3
        is entirely about why that is not a style preference.
      </p>

      <H2 id="config" text="Where the credentials live" />
      <p>
        One module reads the environment and constructs the queue. It is deliberately the
        only one, and it is loaded lazily so a build without credentials does not crash.
      </p>
      <CodeBlock
        label="pr-owl/lib/owl.ts"
        code={`export function loadConfig(): OwlConfig {
  const required = (name: string): string => {
    const v = process.env[name];
    if (!v) throw new Error(\`\${name} is not set\`);
    return v;
  };

  return {
    appId: required('PR_OWL_APP_ID'),
    // A PEM read from the environment has a literal backslash-n on every
    // platform but Windows, which is a confusing 400 from GitHub if it is not
    // normalised here.
    privateKey: required('PR_OWL_PRIVATE_KEY').replace(/\\\\n/g, '\\n'),
    webhookSecret: required('PR_OWL_WEBHOOK_SECRET'),
    concurrency: envInt('PR_OWL_CONCURRENCY', 2),
    policy: DEFAULT_POLICY,
    log: (msg, extra) => console.log(\`[pr-owl] \${msg}\`, extra ?? ''),
  };
}`}
      />
      <p>
        The queue hangs off <code className="font-mono text-[13px]">globalThis</code>{" "}
        rather than a module-level variable. That is not enterprise thinking — it is that
        Next&rsquo;s dev server re-evaluates modules on every hot reload, so a
        module-level queue loses every queued review each time you save a file, and you
        spend an afternoon believing your coalescing logic is broken.
      </p>

      <H2 id="verify" text="Prove it runs" />
      <CodeBlock
        label="terminal"
        code={`cd pr-owl && npm install && npm run dev

# in another terminal
curl localhost:3000/api/webhooks
# {"ok":true,"service":"pr-owl"}

curl -X POST localhost:3000/api/webhooks -d '{}'
# {"error":"not configured"}  500 — which is the correct answer right now`}
      />
      <p>
        The 500 is deliberate and load-bearing. A misconfigured app must not{" "}
        <em>accept</em> deliveries it cannot verify; it must refuse them and tell the
        operator why. GitHub will retry a 500, which is unfortunate here — retrying
        cannot fix a missing environment variable — so the route logs loudly and part 3
        makes the retry harmless.
      </p>

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "Why Next.js for a webhook receiver?",
            a: "It is not a marketing decision — it is that a GitHub App needs three things at once: an HTTPS endpoint, a place to keep state, and somewhere a human can look to see what it is doing. A Next.js route handler is the endpoint, and the same app gives you a status page for free. If you already run Next.js, adding two routes is a much smaller commitment than standing up a separate service.",
          },
          {
            q: "Do I need the GitHub App manifest checked into the repo?",
            a: "The manifest is what you paste into GitHub's App-creation form, and it is safe to check in — it contains the App id and the webhook URL but no secret. The private key and the webhook secret must not be. The manifest is in `pr-owl/app-manifest.yml` in this repository.",
          },
          {
            q: "Why does the route do nothing on purpose?",
            a: "Because the most useful first milestone is a server that receives a delivery and correctly rejects everything. That proves the plumbing — tunnel, TLS, secret, header parsing — before any part of it depends on a model, a clone or a diff. If the signature check works in part 3 with a curl command, you have already de-risked the only part of this app that runs on the public internet.",
          },
          {
            q: "Can I develop this without registering a GitHub App?",
            a: "Yes, and you should. Part 3 signs a payload by hand with a local secret and posts it to localhost, which tests the verification logic without a round trip through GitHub. You only need the real App once part 5 sends an actual pull request.",
          },
        ]}
      />

      <Cta
        title="Next: the only code here that faces the internet"
        body="Part 3 verifies an HMAC signature over raw request bytes — and shows you the three ways to get it subtly, expensively wrong."
        href="/blog/pr-owl-webhook-signature-verification"
        cta="Start part 3"
      />

      <p className="text-sm text-muted">
        If you want the short version of the whole app,{" "}
        <Link href="/blog/pr-owl-course-overview" className="text-moss underline-offset-4 hover:underline">
          part 1 is the brief
        </Link>
        . And if you have not read{" "}
        <Link href="/blog/cli-doctor-preflight-checks" className="text-moss underline-offset-4 hover:underline">
          the doctor pre-flight
        </Link>
        , the fail-loudly-when-misconfigured idea comes from there.
      </p>
    </>
  ),
} satisfies Post;
