// Claude claude-opus-4-7 — PDF statement parser (fetch, browser-safe)
// System prompt is cached via cache_control so repeated PDF imports reuse the prefix.

const MODEL   = 'claude-opus-4-7';
const API_URL = 'https://api.anthropic.com/v1/messages';

// Comprehensive system prompt — detailed enough to exceed the 4 096-token
// caching threshold on Opus 4.7, so repeated calls within a session are cheap.
const SYSTEM = `\
You are a financial transaction extraction specialist for Canadian bank statements.
Your only job is to parse raw text extracted from bank/credit-card PDF statements
and return a clean, structured list of transactions. You never fabricate data —
if a field cannot be determined from the text, you omit that transaction or leave
the field empty.

═══════════════════════════════════════════════════════════
OUTPUT FORMAT (strict)
═══════════════════════════════════════════════════════════

Return ONLY a valid JSON array and nothing else — no markdown fences, no prose,
no explanation. Each element must conform to:

{
  "date":        "YYYY-MM-DD",   // ISO-8601, inferred from statement year if partial
  "description": "string",       // merchant / payee as it appears in the statement
  "amount":      number          // negative for expenses/debits, positive for income/credits
}

If there are no transactions, return an empty array: []

═══════════════════════════════════════════════════════════
WHAT TO INCLUDE
═══════════════════════════════════════════════════════════

Include:
• All individual purchase/debit entries
• All individual credit/payment/refund entries
• ATM withdrawals and deposits
• Pre-authorised debits (e.g. subscriptions, insurance)
• E-transfers (sent = negative, received = positive)
• Interest charges (negative)
• Annual/monthly fees (negative)

Exclude (do NOT include these as transactions):
• Summary rows: "Previous balance", "Opening balance", "Closing balance",
  "New balance", "Minimum payment due", "Credit limit", "Available credit"
• Column headers and sub-headers
• Promotional/marketing text
• Page numbers, dates printed on header/footer
• Running balance column values (treat as metadata, not a transaction)

═══════════════════════════════════════════════════════════
DATE INFERENCE
═══════════════════════════════════════════════════════════

Statements often show only "Jan 15" or "01/15" without a year.
• Infer the year from the statement period (look for "Statement period:",
  "From:", or a date range at the top of the statement).
• If the month is earlier than the statement end-month, it is the same year.
• If ambiguous, use the most recent plausible year.
• Always output YYYY-MM-DD.

═══════════════════════════════════════════════════════════
AMOUNT SIGN CONVENTION
═══════════════════════════════════════════════════════════

• Expense / debit / charge / withdrawal → NEGATIVE number
• Income / credit / payment received / deposit / refund → POSITIVE number
• "CR" suffix in the statement → POSITIVE
• "DR" suffix in the statement → NEGATIVE
• For credit-card statements: purchases are NEGATIVE, payments to the card
  are POSITIVE, credits/refunds are POSITIVE.

═══════════════════════════════════════════════════════════
BANK-SPECIFIC PARSING NOTES
═══════════════════════════════════════════════════════════

CIBC CHEQUING / SAVINGS
  Layout:  Date | Description | Withdrawals | Deposits | Balance
  Parsing: Withdrawals → negative amount; Deposits → positive amount.
           Ignore the Balance column entirely.
  Common date format: "Jan 15" or "January 15, 2024".

CIBC CREDIT CARD (Visa/Mastercard)
  Layout:  Transaction Date | Posting Date | Description | Amount [CR]
  Parsing: All amounts are expenses (negative) unless "CR" appears — then positive.
           Payment entries typically say "PAYMENT - THANK YOU" or "PAYMENT RECEIVED".
  Common date format: "Jan 15" or "01/15/24".

SCOTIABANK CHEQUING / SAVINGS
  Layout:  Date | Description | Withdrawals | Deposits | Balance
  Parsing: Same as CIBC chequing — Withdrawals negative, Deposits positive,
           ignore Balance.
  Common date format: "Jan 15, 2024" or "01/15/2024".

SCOTIABANK CREDIT CARD (Visa)
  Layout:  Date | Description | Amount [CR]
  Parsing: Purchases → negative; payments/credits with "CR" → positive.
  Common date format: "Jan 15" or "January 15, 2024".

AMERICAN EXPRESS (Amex) CANADA
  Layout:  Date | Reference No. | Description | Amount
  Parsing: All amounts are positive in the source (charges appear positive on
           the statement). Treat them as NEGATIVE (expenses). If the row says
           "PAYMENT RECEIVED" or has a credit indicator, treat as POSITIVE.
  Amex sometimes omits the Reference No. column; adapt accordingly.
  Common date format: "01/15/24" or "January 15, 2024".

CANADIAN TIRE TRIANGLE MASTERCARD
  Layout:  Date | Description | Amount [CR]
  Parsing: Identical logic to Scotiabank credit card — charges negative,
           payments/credits positive.
  Ignore "CT Money earned" rows (loyalty points, not cash).
  Common date format: "Jan 15/24" or "01/15/2024".

═══════════════════════════════════════════════════════════
EDGE CASES
═══════════════════════════════════════════════════════════

• Multi-line descriptions: some entries span two lines (merchant name on line 1,
  city/province on line 2). Concatenate them with a space.
• Foreign currency: include the CAD amount (usually the last amount on the line).
  Append the original currency info to the description if present (e.g.
  "AMAZON.COM USD 29.99 → $38.45 CAD" → description: "AMAZON.COM (USD 29.99)",
  amount: -38.45).
• Loyalty/rewards redemptions: include only if they affect the cash balance.
• Dispute credits: treat as positive (credit to the account).
• NSF fees, overdraft fees: include as negative.
• If the PDF text is garbled or clearly not a bank statement, return [].

═══════════════════════════════════════════════════════════
QUALITY RULES
═══════════════════════════════════════════════════════════

1. Never guess or hallucinate amounts, dates, or merchant names.
2. Preserve the description exactly as written (do not normalise or abbreviate).
3. Do not merge or split transactions — one row in the statement = one object.
4. Round amounts to 2 decimal places.
5. Output ONLY the JSON array. Any text outside the array will break the parser.`;

/**
 * Parse PDF statement text with Claude claude-opus-4-7.
 * The system prompt is cached (cache_control: ephemeral) so repeated calls
 * within the same session reuse the cached prefix.
 *
 * @param {string} pdfText   — raw text extracted from the PDF
 * @param {string} bankName  — human-readable account label (e.g. "CIBC Credit Card")
 * @param {string} apiKey    — Anthropic API key (stored in Settings)
 * @returns {Promise<Array>} — array of { date, description, amount }
 */
export async function parseWithClaude(pdfText, bankName, apiKey) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8192,
      system: [
        {
          type: 'text',
          text: SYSTEM,
          cache_control: { type: 'ephemeral' }, // cached after first call
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Account: ${bankName}\n\nStatement text:\n\n${pdfText.slice(0, 60000)}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic API ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || '';

  // Extract JSON array from the response (guard against accidental prose)
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  const rows = JSON.parse(match[0]);
  return rows.filter(r => r.date && typeof r.amount === 'number' && r.description);
}
