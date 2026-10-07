import Link from "next/link";
import { Callout, CodeBlock } from "@/components/CodeBlock";
import { CompareTable, Cta, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "pr-owl-webhook-signature-verification",
  title: "Verifying the webhook signature over raw bytes",
  metaTitle: "PR Owl Part 3: Webhook Signature Verification",
  description:
    "HMAC-SHA256 verification for a GitHub webhook, and the three ways to get it subtly wrong: verifying a re-serialised body, comparing digests with a string equality, and acting before checking.",
  date: "2026-10-06",
  readingMinutes: 11,
  tags: ["Security", "Webhooks", "HMAC", "GitHub"],
  keyword: "github webhook signature verification hmac",
  series: { slug: "pr-owl-course", order: 3 },
  related: ["pr-owl-github-app-skeleton", "ai-agent-file-permissions", "risk-ledger-command-shapes"],
  faq: [
    {
      q: "Why not just use an SDK's verify helper?",
      a: "Several exist and they are fine, as long as the one you use takes the raw request body and not a parsed object — that distinction is the whole post. If your framework hands you a parsed body by the time you see it, the raw bytes may already be gone, which is the situation part 3 exists to help you notice.",
    },
    {
      q: "Does the length check leak anything?",
      a: "It leaks the length of a correct digest, which is a constant: a sha256 hex digest is always 64 characters. Comparing lengths before using timingSafeEqual is required, because timingSafeEqual throws on a mismatch, and the alternative to a throwing API is padding both to a fixed size — which is also fine and slightly more work.",
    },
    {
      q: "Should a failed verification return 401 or 403?",
      a: "401, and the body should not say which check failed. A response that distinguishes a missing header from a wrong digest is a free oracle: an attacker learns whether their signature was structurally valid before they start guessing it, and that is one fewer thing they have to brute-force.",
    },
    {
      q: "What about replay attacks — can someone resend a delivery?",
      a: "Yes, and the defence is not in the signature. GitHub's `x-github-delivery` header is a unique id per delivery, so remember the ids you have seen and ignore repeats. Part 5 does that as a side effect of coalescing on the pull request, which turns out to be the same mechanism.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          The digest is{" "}
          <code className="font-mono text-[13px]">HMAC-SHA256(secret, rawBody)</code>{" "}
          where <code className="font-mono text-[13px]">rawBody</code> is the exact bytes
          GitHub sent. Read them with{" "}
          <code className="font-mono text-[13px]">req.text()</code> and never parse before
          verifying.
        </p>
        <p>
          Three ways to get this wrong, each of which has shipped a real bug: verify
          after parsing, compare digests with{" "}
          <code className="font-mono text-[13px]">===</code>, and act before checking.
        </p>
      </KeyTakeaways>

      <H2 id="problem" text="What you are defending against" />
      <p>
        Without a signature check, anybody who learns your webhook URL can make your app do
        work. In PR Owl that work costs money and posts comments on a repository — so an
        unauthenticated caller can make your reviewer post arbitrary text into a pull
        request, on a schedule, at your expense.
      </p>
      <p>
        The defence is a shared secret. GitHub computes{" "}
        <code className="font-mono text-[13px]">sha256=&lt;hex&gt;</code> over the request
        body with your webhook secret and sends it in{" "}
        <code className="font-mono text-[13px]">x-hub-signature-256</code>. You compute
        the same thing and compare. A caller without the secret cannot produce a matching
        digest.
      </p>

      <H2 id="implementation" text="The implementation" />
      <p>
        Twenty lines, and three of them are the reason this part exists.
      </p>
      <CodeBlock
        label="pr-owl/lib/webhook.ts"
        code={`import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifySignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string | null | undefined,
): VerifyResult {
  // Fail closed. An app that starts without its secret must not accept
  // deliveries merely because it cannot check them.
  if (!secret) return { ok: false, reason: 'no-secret' };
  if (!signature) return { ok: false, reason: 'missing-signature' };
  if (!signature.startsWith('sha256=')) return { ok: false, reason: 'malformed-signature' };

  const expected = \`sha256=\${createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex')}\`;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');

  // timingSafeEqual THROWS on unequal lengths, so a truncated or padded
  // signature must be screened out first or it becomes a 500.
  if (a.length !== b.length) return { ok: false, reason: 'mismatch' };
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: 'mismatch' };
}`}
      />

      <H3 id="one" text="Bug one: verifying after parsing" />
      <p>
        The most common mistake, and the most expensive to debug, because the reviewer
        simply never fires and the logs are empty.
      </p>
      <CodeBlock
        label="the wrong version"
        code={`// DO NOT DO THIS.
const body = await req.json();                       // parsed
const raw = JSON.stringify(body);                    // re-serialised
const ok = verify(raw, sig, secret);                // never matches`}
      />
      <p>
        <code className="font-mono text-[13px]">JSON.parse</code> followed by{" "}
        <code className="font-mono text-[13px]">JSON.stringify</code> is not an identity
        function. Key order survives, but whitespace does not, number formatting does not,
        and unicode escaping does not. GitHub sends compact JSON with its own escaping
        choices, so the digest you compute is a digest over{" "}
        <em>your</em> serialisation rather than over{" "}
        <em>GitHub&rsquo;s</em> bytes.
      </p>
      <Callout title="The fix that makes it worse">
        <p>
          When this fails in production the reflex is to normalise both sides — pretty-print
          the incoming body, or sort keys. That does make the check pass, and it introduces
          a worse bug: <strong>the attacker now chooses the canonical form</strong>. Several
          byte sequences hash to the same normalised form, so a payload the signature never
          covered can be smuggled through a body that matches after normalisation.
        </p>
        <p>
          The only correct fix is to verify the bytes you received. There is no normalisation
          step that makes this safe.
        </p>
      </Callout>

      <H3 id="two" text="Bug two: comparing with ===" />
      <CodeBlock
        label="the wrong version"
        code={`// DO NOT DO THIS.
return expected === signature ? { ok: true } : { ok: false, reason: 'mismatch' };`}
      />
      <p>
        A string comparison returns on the first differing byte. Its running time therefore
        varies with how many leading characters a guess got right, and a remote attacker
        with a stopwatch can recover a digest one hex character at a time. It is not a
        fast attack and it is entirely sufficient: 64 characters is not many.
      </p>
      <p>
        <code className="font-mono text-[13px]">timingSafeEqual</code> compares in
        constant time. It also throws when the buffers differ in length, which is why the
        length check above comes first — and why that check leaks nothing, since a sha256
        digest is always 64 characters.
      </p>

      <H3 id="three" text="Bug three: acting before checking" />
      <p>
        The signature is a gate, not a step. Anything that costs money or touches a
        repository has to happen after it, including the cheapest-looking thing: logging
        the payload, which leaks a private repository&rsquo;s contents into logs that a
        stranger can guess the URL for.
      </p>

      <H2 id="order" text="The order of operations" />
      <CodeBlock
        label="pr-owl/app/api/webhooks/route.ts"
        code={`const raw = await req.text();                       // 1. raw bytes
const verdict = verifySignature(
  raw, req.headers.get(SIGNATURE_HEADER), config.webhookSecret); // 2. verify
if (!verdict.ok) {
  // 401 with no detail about WHICH check failed. A response that
  // distinguishes "missing header" from "wrong digest" is a free oracle.
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}
const payload = JSON.parse(raw);                                // 3. now parse`}
      />
      <p>
        Steps 1 and 2 in the other order are bug one. The comment on the 401 is the other
        half of the decision: the function distinguishes four failure reasons internally
        because the logs need them, and the response deliberately does not.
      </p>

      <H2 id="filter" text="Filter the actions, not just the event" />
      <p>
        Verification tells you the delivery is genuine. It says nothing about whether this
        particular delivery is worth a model call, and getting that wrong is how an AI
        reviewer becomes the most expensive line in a CI bill.
      </p>
      <CodeBlock
        label="pr-owl/lib/webhook.ts"
        code={`export const REVIEWED_ACTIONS = Object.freeze([
  'opened', 'synchronize', 'reopened',
]);

export function shouldReview(event: string | null, action: string | null): boolean {
  if (!event || !HANDLED_EVENTS.includes(event)) return false;
  if (event !== 'pull_request') return false;
  return !!action && REVIEWED_ACTIONS.includes(action);
}`}
      />
      <p>
        <code className="font-mono text-[13px]">edited</code> is the one that matters. It
        fires when someone fixes a typo in the description, and it is the action most
        likely to be left in by an{" "}
        <code className="font-mono text-[13px]">if</code> that says &ldquo;review pull
        requests&rdquo; without enumerating. <code className="font-mono text-[13px]">closed</code>{" "}
        is the other one: reviewing a closed pull request costs a call to learn nothing.
      </p>
      <p>
        Note the default. An unknown action is <strong>not</strong> reviewed. A future
        GitHub action you have never heard of should cost you nothing rather than a model
        call.
      </p>

      <H2 id="testing" text="Testing it without GitHub" />
      <p>
        You do not need an App to test this, which is fortunate because it is the part you
        most want to test repeatedly.
      </p>
      <CodeBlock
        label="__tests__/webhook.test.ts"
        code={`const SECRET = 'whsec_test_secret';
const sign = (body: string) =>
  \`sha256=\${createHmac('sha256', SECRET).update(body, 'utf8').digest('hex')}\`;

it('fails on a body that was parsed and re-serialised', () => {
  const original = JSON.stringify({ action: 'opened', number: 7 });
  const pretty = JSON.stringify(JSON.parse(original), null, 2);
  // Different bytes, same object. The signature covers the bytes.
  assert.equal(verifySignature(pretty, sign(original), SECRET).ok, false);
});

it('treats a truncated digest as a mismatch, not a crash', () => {
  assert.deepEqual(
    verifySignature(BODY, sign(BODY).slice(0, -4), SECRET),
    { ok: false, reason: 'mismatch' },
  );
});

it('refuses to verify anything when no secret is configured', () => {
  assert.deepEqual(verifySignature(BODY, sign(BODY), ''),
    { ok: false, reason: 'no-secret' });
});`}
      />
      <p>
        And the manual check, which is the one that catches a misconfigured tunnel before
        GitHub does:
      </p>
      <CodeBlock
        label="terminal"
        code={`SECRET=whsec_dev_secret

BODY='{"action":"opened"}'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)"

# correct signature -> passes verification, fails later on the payload
curl -X POST localhost:3000/api/webhooks \\
  -H "x-hub-signature-256: $SIG" \\
  -H "x-github-event: pull_request" \\
  -H "content-type: application/json" \\
  -d "$BODY"

# wrong signature -> 401, and the body does not say which check failed
curl -X POST localhost:3000/api/webhooks \\
  -H "x-hub-signature-256: sha256=deadbeef" -d "$BODY"`}
      />

      <H2 id="table" text="The whole checklist" />
      <CompareTable
        caption="Signature verification, review by review"
        head={["Check", "Doing it", "The failure if you do not"]}
        rows={[
          ["Read the body", "req.text()", "Every legitimate delivery is rejected"],
          ["Secret missing", "Fail closed", "Unauthenticated callers get a free reviewer"],
          ["Algorithm prefix", "Require sha256=", "A sha1 signature is accepted or 500s"],
          ["Comparison", "timingSafeEqual", "Digest leaks one char at a time"],
          ["Length mismatch", "Screen before comparing", "A truncated sig is a 500, not a 401"],
          ["Failure response", "401, no detail", "An oracle for probing"],
          ["Parse", "Only after verifying", "You verified the wrong bytes"],
          ["Action filter", "Explicit allow-list", "A typo in a description costs a call"],
          ["Unknown action", "Do not review", "A future GitHub action bills you"],
        ]}
      />

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "Why not just use an SDK's verify helper?",
            a: "Several exist and they are fine, as long as the one you use takes the raw request body and not a parsed object — that distinction is the whole post. If your framework hands you a parsed body by the time you see it, the raw bytes may already be gone, which is the situation part 3 exists to help you notice.",
          },
          {
            q: "Does the length check leak anything?",
            a: "It leaks the length of a correct digest, which is a constant: a sha256 hex digest is always 64 characters. Comparing lengths before using timingSafeEqual is required, because timingSafeEqual throws on a mismatch, and the alternative to a throwing API is padding both to a fixed size — which is also fine and slightly more work.",
          },
          {
            q: "Should a failed verification return 401 or 403?",
            a: "401, and the body should not say which check failed. A response that distinguishes a missing header from a wrong digest is a free oracle: an attacker learns whether their signature was structurally valid before they start guessing it, and that is one fewer thing they have to brute-force.",
          },
          {
            q: "What about replay attacks — can someone resend a delivery?",
            a: "Yes, and the defence is not in the signature. GitHub's `x-github-delivery` header is a unique id per delivery, so remember the ids you have seen and ignore repeats. Part 5 does that as a side effect of coalescing on the pull request, which turns out to be the same mechanism.",
          },
        ]}
      />

      <Cta
        title="Next: what not to review"
        body="Part 4 is the cheapest part of the app and the one that most directly decides your bill — drafts, forks, oversized diffs and lockfile-only changes."
        href="/blog/pr-owl-review-policy"
        cta="Start part 4"
      />

      <p className="text-sm text-muted">
        The permission model this leans on is covered in{" "}
        <Link href="/blog/ai-agent-file-permissions" className="text-moss underline-offset-4 hover:underline">
          the file permissions post
        </Link>
        , and the &ldquo;refusal is code, not a sentence in the prompt&rdquo; argument is
        made in{" "}
        <Link href="/blog/blast-radius-gate" className="text-moss underline-offset-4 hover:underline">
          the blast radius gate
        </Link>
        .
      </p>
    </>
  ),
} satisfies Post;
