# Initial Risk Register

Status: Approved initial register / Frozen — M0.0 (2026-07-21)

| Risk | Impact | Early mitigation | Gate |
|---|---:|---|---|
| Transcript text does not map uniquely to source | High | ordered matching, context windows, alternatives, user confirmation | M1.1 |
| Word timestamps are inaccurate | High | handles, waveform/source preview, alignment confidence, boundary smoke | M1.1–M1.2 |
| Variable frame rate causes boundary drift | High | explicit metadata, rational export time, fixtures, proxy/normalization decision | M1.0/M1.3 |
| A/V sync changes after render | High | sync-marker fixture, ffprobe checks, full playback smoke | M1.3 |
| NLE interchange loses information | Medium | simple-cut contract, FCP7 XML first, warnings, real import judge | M1.3 |
| AI chooses semantically plausible but editorially poor clips | High | brief schema, alternatives, locks, eval set, human approval | M2–M3 |
| AI invents assets or timestamps | Critical | candidate-ID-only output, strict schema, semantic validator | M2.0 |
| Large media overwhelms renderer | High | no media processing in renderer; worker process; proxies later | M0.1/M4 |
| API cost becomes unpredictable | Medium | sampled frames, transcript-first mode, budgets, usage record | M2–M3 |
| Sensitive footage is uploaded unexpectedly | Critical | local-first mode, explicit visual-upload consent, provider adapter | M2.0 |
| FFmpeg packaging/license constraints | High | development uses declared external dependency; distribution review before packaging | M4 |
| Electron privileged APIs leak into UI | Critical | sandbox, context isolation, narrow typed preload bridge | M0.1 |
| Product expands into a full NLE too early | High | frozen non-goals and scope judge | Every milestone |
