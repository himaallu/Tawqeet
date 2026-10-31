---
name: Gemini model availability
description: Listed models can still reject generation for newly created accounts.
---
Gemini model discovery is not sufficient to establish that a model is callable.

**Why:** On 2026-10-31, the supplied account listed gemini-2.5-flash but generation returned404 saying it was no longer available to new users. A generation request with gemini-3.5-flash succeeded.

**How to apply:** For model404 responses, inspect the provider's error and verify a supported alternative with a minimal generation call rather than asking for a replacement key when model discovery already authenticates successfully.
