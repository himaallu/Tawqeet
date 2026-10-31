---
name: Connection attachment visibility
description: Avoid stalled provider replacements when different collaborators authorize and attach connections.
---

A newly authorized integration connection may only be visible for attachment from the Replit account that authorized it. A collaborator replying from another account does not inherit that authorization. Application access to an already assigned connection is a separate matter.

**Why:** A Resend replacement was authorized by one collaborator, while another removed the old assignment and continued the chat. Attachment remained “not visible here”; Replit documentation confirmed account-scoped authorization. Repeated attachment retries did not solve the account mismatch.

**How to apply:** Before replacing an assigned provider connection, coordinate for the authorizing collaborator to perform the attachment from their account. If attachment reports invisibility after collaborators switch, ask the original authorizer to resume rather than requesting credentials again or reattaching the old account. A project permits only one assigned Resend connection, so removal and replacement temporarily interrupt sign-in email delivery.
