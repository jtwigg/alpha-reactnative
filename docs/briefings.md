# Daily email briefings

John's Assistant posts one JSON document per calendar day to Convex. The Alpha app (Briefings tab) reads it behind the Clerk allowlist. All values in this file are synthetic.

## Ingest

```
POST https://posh-mink-581.convex.site/briefings/ingest
Authorization: Bearer $BRIEFINGS_INGEST_SECRET
Content-Type: application/json
```

The body is one whole day. A re-send overwrites both `personal` and `crankcase` rows for that date (idempotent). Both accounts are required; empty lists are fine.

### Schema

```ts
type BriefingDay = {
  date: string; // YYYY-MM-DD
  accounts: {
    personal: AccountBriefing;
    crankcase: AccountBriefing;
  };
};

type AccountBriefing = {
  account: "personal" | "crankcase"; // must match the object key
  deckName: "Personal" | "Crankcase"; // must match the account
  headline: string;
  sub: string;                       // may be empty
  priorityHeading?: string;
  glanceHeading?: string;
  priorities: PriorityItem[];        // max 50
  glance: GlanceItem[];              // max 100
  rest: { total: number; breakdown: { label: string; count: number }[] };
};

type GlanceItem = {
  threadId: string;  // Gmail thread id, 6–24 hex chars
  sender: string;
  gist: string;
  webUrl: string;    // https desktop Gmail link
  mobileUrl: string; // https mobile Gmail link
};

type PriorityItem = GlanceItem & {
  rank: number;      // >= 1
  deadline: string;
  todo: string;
};
```

Rejected payloads return `400` with `{ error, errors: [{ path, message }] }`.

### Synthetic example

```json
{
  "date": "2026-01-15",
  "accounts": {
    "personal": {
      "account": "personal",
      "deckName": "Personal",
      "headline": "Two things need you today",
      "sub": "Synthetic subline",
      "priorityHeading": "Do these",
      "glanceHeading": "1 quick FYI",
      "priorities": [
        {
          "rank": 1,
          "deadline": "Friday",
          "threadId": "112210f47de98115",
          "sender": "Example Sender",
          "gist": "Example Co needs a signed form by Friday",
          "todo": "Sign and return the form",
          "webUrl": "https://mail.google.com/mail/?authuser=user@example.com#all/thread-f:1234567890123456789",
          "mobileUrl": "https://mail.google.com/mail/mu/mp/?authuser=user@example.com#cv/all/112210f47de98115"
        }
      ],
      "glance": [
        {
          "threadId": "abc123def456",
          "sender": "Example Newsletter",
          "gist": "Synthetic FYI",
          "webUrl": "https://mail.google.com/mail/?authuser=user@example.com#all/thread-f:123",
          "mobileUrl": "https://mail.google.com/mail/mu/mp/?authuser=user@example.com#cv/all/abc123def456"
        }
      ],
      "rest": {
        "total": 12,
        "breakdown": [
          { "label": "promos/social", "count": 7 },
          { "label": "newsletters", "count": 5 }
        ]
      }
    },
    "crankcase": {
      "account": "crankcase",
      "deckName": "Crankcase",
      "headline": "Quiet day",
      "sub": "",
      "priorities": [],
      "glance": [],
      "rest": { "total": 0, "breakdown": [] }
    }
  }
}
```

## Feedback

The app calls the allowlisted Convex action `briefings/feedback:send`. That action POSTs to `FEEDBACK_WEBHOOK_URL` with `Authorization: Bearer FEEDBACK_WEBHOOK_KEY`. The body is the same shape the old `/api/feedback` forwarded:

```json
{
  "source": "email-briefing-deck",
  "deck": "Personal",
  "date": "2026-01-15",
  "itemId": "2026-01-15-personal-112210f47de98115",
  "title": "Example Co needs a signed form by Friday",
  "sender": "Example Sender",
  "threadUrl": "https://mail.google.com/mail/?authuser=user@example.com#all/thread-f:1234567890123456789",
  "threadId": "112210f47de98115",
  "account": "personal",
  "reaction": "remember",
  "comment": "",
  "at": "2026-01-15T15:04:05.000Z"
}
```

`itemId` is `date-account-threadId`, not the card's position on the page. `reaction` is `remember` | `stop` | `archive` | `null`. A null reaction needs a non-empty comment. Archive needs a valid `threadId` and `account`.

## Convex env vars

Set on `posh-mink-581` (server-side only; never `EXPO_PUBLIC_*`):

| Name | Used by |
| --- | --- |
| `BRIEFINGS_INGEST_SECRET` | `POST /briefings/ingest` bearer token |
| `FEEDBACK_WEBHOOK_URL` | Feedback forward destination |
| `FEEDBACK_WEBHOOK_KEY` | `Authorization: Bearer` on that POST |
| `ALLOWED_EMAILS` / `ALLOWED_USER_IDS` | Existing Clerk allowlist (reads + feedback) |
