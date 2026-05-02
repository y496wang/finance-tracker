export const CATS = [
  { name: 'Food & Dining',     icon: '🍔', color: '#f97316' },
  { name: 'Groceries',         icon: '🛒', color: '#84cc16' },
  { name: 'Coffee & Drinks',   icon: '☕', color: '#a78bfa' },
  { name: 'Transportation',    icon: '🚗', color: '#38bdf8' },
  { name: 'Gas',               icon: '⛽', color: '#fb923c' },
  { name: 'Shopping',          icon: '🛍️', color: '#e879f9' },
  { name: 'Entertainment',     icon: '🎬', color: '#facc15' },
  { name: 'Bills & Utilities', icon: '💡', color: '#94a3b8' },
  { name: 'Health & Pharmacy', icon: '💊', color: '#f43f5e' },
  { name: 'Travel',            icon: '✈️', color: '#22d3ee' },
  { name: 'Income',            icon: '💰', color: '#22c55e' },
  { name: 'Other',             icon: '📦', color: '#64748b' },
];

export const CAT_COLOR = Object.fromEntries(CATS.map(c => [c.name, c.color]));
export const CAT_ICON  = Object.fromEntries(CATS.map(c => [c.name, c.icon]));

export const RULES = [
  { re: /tim horton|starbucks|second cup|booster juice|coffee/i,              cat: 'Coffee & Drinks' },
  { re: /loblaws|sobeys|no frills|metro|walmart|food basics|freshco|zehrs|farm boy|longos|grocery/i, cat: 'Groceries' },
  { re: /mcdonald|subway|pizza|burger|kfc|wendy|a&w|dairy queen|harvey|swiss chalet|restaurant|sushi|thai|pho|dine|grill|pub|diner|skip the dish|uber.*eat|doordash/i, cat: 'Food & Dining' },
  { re: /shell|petro.can|esso|husky|ultramar|pioneer|gas station/i,            cat: 'Gas' },
  { re: /netflix|spotify|apple.*music|amazon prime|disney|crave|youtube.*premium|apple tv|hulu/i, cat: 'Entertainment' },
  { re: /rogers|bell|telus|hydro|enbridge|shaw|freedom|fido|koodo|videotron|cogeco|eastlink/i, cat: 'Bills & Utilities' },
  { re: /shoppers|pharma.*plus|rexall|london drugs|medical|dental|pharmacy|drug|clinic/i, cat: 'Health & Pharmacy' },
  { re: /amazon|ebay|best buy|staples|home depot|ikea|winners|marshalls|costco|canadian tire|sport chek|aritzia|h&m|zara|gap|old navy|uniqlo|indigo/i, cat: 'Shopping' },
  { re: /uber(?!.*eat)|lyft|transit|ttc|go train|go bus|via rail|taxi|oc transpo|presto/i, cat: 'Transportation' },
  { re: /airbnb|hotel|motel|marriott|hilton|holiday inn|air canada|westjet|porter|expedia|booking\.com/i, cat: 'Travel' },
  { re: /payroll|salary|e.?transfer.*received|direct deposit|payment received/i, cat: 'Income' },
];

export const ACCOUNT_LABELS = {
  'cibc-chequing':   'CIBC Chequing',
  'cibc-credit':     'CIBC Credit Card',
  'scotia-chequing': 'Scotiabank Chequing',
  'scotia-credit':   'Scotiabank Credit Card',
  'amex':            'American Express',
  'canadian-tire':   'Canadian Tire Triangle',
};

export const ALL_ACCOUNTS = Object.values(ACCOUNT_LABELS);

export const BANK_QUERIES = [
  { label: 'CIBC',          q: 'from:(cibc.com) subject:(transaction OR alert OR purchase OR statement)' },
  { label: 'Scotiabank',    q: 'from:(scotiabank.com) subject:(transaction OR alert OR purchase OR statement)' },
  { label: 'Amex',          q: 'from:(americanexpress.com) subject:(charge OR transaction OR statement OR purchase)' },
  { label: 'Canadian Tire', q: 'from:(canadiantire.ca OR triangle.com) subject:(transaction OR alert OR statement)' },
];
