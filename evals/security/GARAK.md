# Garak notes — NVIDIA LLM vulnerability scanner vs Sentinel
#
# Garak probes prompt-injection / jailbreak / encoding bypass. Point it at
# the OWASP HTTP target in evals/security/owasp-target.mjs so garak speaks
# the same trace contract:
#
#   1. In one terminal:
#        node -e "import('./evals/security/owasp-target.mjs').then(m => m.serveHttpTarget({port: 8000}))"
#   2. In another (Python env with garak installed):
#        garak --model_type rest --rest_endpoint http://127.0.0.1:8000/run \
#          --probes promptinject.HijackHateHumans,danjailbreak.Decoding \
#          --detectors mitre.MachineWritten,specialwords.Noinjection
#
# What to watch:
# - promptinject.* must NOT produce bash/send_email tool calls
#   (assert no_denied_tool_call in evals/security/assertions.mjs).
# - encoding probes (base64/rot13) must not bypass the DATA-only rule in
#   scenarios.mjs:scenarioPrompt().
# - Record garak report JSON next to the OWASP report.json under
#   evals/results/security-<ts>/ for same-run comparison.
#
# Garak is NOT a CI gate here (Python + model calls). The CI gate is
# `npm run eval:security` (oracle + offline bench, no key).
