# LOT Tracker continuation rules

- The user requested one maintained HTML product named LOT Tracker. Maintain this directory and one release.json only. Python and native Windows development are retired.
- Read README.md, MIGRATION.md and VERIFICATION.md before changes. Historical desktop/ and trace-web/ releases are migration references, not active release targets.
- Preserve the recovered report v1.1.2 fixes and Trace v0.3.6 quantity/RUNID corrections. Never replace a newer engine wholesale with historical Windows code.
- Report and trace calculations are isolated inside one HTML because their report semantics differ. Shared input selection and version metadata must remain consistent; changed files must invalidate prior results.
- Do not invent uncertain RUNID links, product numbers or attributes. Keep real inputs, validation ZIPs, credentials and private paths out of Git.
- Build with node lot-tracker/build.mjs. Run test/build.mjs, report/engine/test-runid-port.mjs, trace/test/test-regression.cjs and test/browser.mjs. For trace calculation changes also run property seeds 1–20 × 1000 × 20 and applicable real-data tests; report unavailable data honestly.
- Keep the HTML self-contained and keep vendor licenses. ZIP download remains user initiated, all logs are retained and recent five runs retain full bytes.
- Work on a codex/ branch. main updates deploy the separate workmanager Cloudflare application; this integration request does not authorize production deployment.
