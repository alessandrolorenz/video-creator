# Repository Fixture Policy

Status: Approved M0.1 policy — created under Amendment 001

## Purpose and milestone ownership

Fixtures exist to make deterministic behavior reproducible without introducing sensitive, oversized, or legally ambiguous test data. Each milestone owns and explicitly approves the fixtures it needs. M0.1 establishes this policy only and authorizes no binary fixture.

## Approved location

Future committed fixture sources may live only under `packages/fixtures/` after an approved milestone explicitly creates that package. Tests may reference fixtures through that package rather than copying fixture data into application or domain packages.

`packages/fixtures/` does not exist in M0.1 and must not be created by the repository-foundation milestone.

## Synthetic-data preference

Synthetic fixtures are preferred. When a fixture can be generated deterministically, its manifest must record the creation command or generator version and parameters. A captured real-world asset requires written justification that a synthetic fixture cannot exercise the behavior adequately.

## Provenance and license record

Every future fixture must have a manifest entry recording:

- stable fixture ID and version;
- repository-relative path;
- origin and author or owner;
- license and redistribution permission;
- intended tests and expected behavior;
- creation command when synthetic;
- byte size and SHA-256 digest;
- approving milestone and review reference.

A fixture without clear redistribution permission cannot be committed.

## Privacy and sensitive-data restrictions

Fixtures must not contain personal, confidential, client-owned, biometric-identifying, or otherwise sensitive material. Faces, voices, names, contact details, credentials, private locations, production footage, and unpublished transcripts are forbidden unless they are fully synthetic and cannot identify a real person or organization.

Secrets and API keys are never fixtures.

## Size budgets

The M0.1 binary-fixture budget is zero bytes. No audio, video, image, subtitle, transcript-data archive, compressed archive, or other binary fixture is authorized.

Before the first later milestone adds media fixtures, an approved amendment must define both:

- a maximum size per fixture file;
- a maximum aggregate size for committed fixture data.

Committed fixtures must always be the smallest samples that prove the required behavior.

## Versioning and checksums

Every future fixture is versioned and checksummed with SHA-256. A fixture replacement creates a new versioned file and manifest entry; golden inputs must never change silently in place. Tests must identify which fixture version they consume.

## Binary-media review

Adding any binary media fixture requires milestone approval, provenance/license review, privacy review, declared size budgets, and a documented test purpose. Downloading test media during normal CI is forbidden unless a later approved design defines integrity, caching, availability, and privacy controls.

## Git LFS

Git LFS is not introduced by M0.1. It requires a later explicit architecture or repository decision before any LFS configuration or pointer file is added.

## Exceptions

An exception requires a specification amendment that records the old rule, new rule, reason, affected tests and artifacts, risk review, and product-owner approval. An implementation convenience is not sufficient justification.

## M0.1 enforcement

M0.1 must contain no fixture binary, no `packages/fixtures/` content, and no Git LFS configuration. Checkpoint 1 verifies this state through direct inventory inspection. Checkpoint 2 introduces the reusable repository guard and negative fixtures that enforce these rules without committing prohibited media.
