# Quotely design system (v1, dark theme only)

Direction: "Obsidian × Lime". Premium fintech feel, money is the interface, one primary action per state, automation visible and auditable, delight only on real progress (verified payment).

## Color tokens (dark)

| Token | Hex | Use |
|---|---|---|
| --bg-base | #080D0F | App background, Studio canvas |
| --bg-shell | #0D1416 | Nav rail, top bar, filters panel |
| --surface-1 | #111B1D | Cards, widgets, panels |
| --surface-2 | #172426 | Inputs, secondary cards, grid headers |
| --surface-3 | #203032 | Hover and selection |
| --border | #2B3B3E | Standard borders |
| --border-strong | #3F5558 | Emphasised borders |
| --text-primary | #F3F7F4 | Headings, figures |
| --text-secondary | #B8C8C6 | Labels, descriptions |
| --text-tertiary | #819593 | Timestamps, metadata |
| --accent | #C5FA82 | Primary CTA, focus, active nav, "money secured" |
| --accent-hover | #D7FFAC | Primary hover |
| --accent-foreground | #142013 | Text on primary CTA |
| --accent-subtle | #273F28 | Selected/emphasised surfaces |
| --focus-ring | #D7FFAC | Keyboard focus |
| --danger | #FF8C91 | Errors, destructive |

Lime is used only for primary actions and secured money, never for every icon.

## Money-state colors

| State | Hex | Meaning |
|---|---|---|
| Draft | #87969B | Unapproved quote |
| Sent | #8FAEFF | Invoice dispatched (event, not a stage) |
| Deposit due | #FFC66D | Awaiting deposit |
| Deposit paid | #69DBBE | Deposit secured |
| In progress | #63C7F4 | Job underway |
| Balance due | #BB9BFF | Final invoice outstanding |
| Paid | #C5FA82 | Fully collected |
| Overdue | #FF8C91 | Risk modifier, shown as a second pill next to the stage pill |

Every state pill carries text (and icon where useful); never color alone.

## Typography

Fonts (Google Fonts): Manrope for UI; IBM Plex Mono for amounts, IDs, timestamps, tabular numbers (tabular-nums, right-aligned money columns, 2 decimals on invoices).

| Style | Size/line | Weight |
|---|---|---|
| Hero amount | 44/52 | Mono 700 |
| Display | 32/40 | 800 |
| H1 | 26/34 | 750 |
| H2 | 20/28 | 700 |
| H3 (widget title) | 16/24 | 700 |
| Body | 14/22 | 450 |
| Body strong | 14/22 | 650 |
| Label | 12/18 | 650 |
| Micro | 11/16 | 550 |
| Financial (KPI) | 24/30 | Mono 600 |
| Grid financial | 13/20 | Mono 500 |

Wordmark: "quotely" lowercase, Manrope 800, letter-spacing -0.055em. Icon: rounded square with a Q whose tail extends diagonally. No coins, cards, dollar signs, robots.

## Spacing, radius, elevation

space: 4, 8, 12, 16 (widget gaps), 20 (card internals), 24 (page gutters), 32, 40.
radius: 6 badges, 10 inputs/buttons, 14 cards/widgets, 20 modals, 999 pills.
Cards: 1px border, no shadow; hover = stronger border. Menus: 0 12px 36px rgba(0,0,0,.30). Modals: 0 24px 80px rgba(0,0,0,.42). No glassmorphism, no permanent glows; a subtle radial lime glow only on the payment-received toast.

## Charts

Series palette: #8FAEFF (quoted), #69DBBE (deposits received), #C5FA82 (balances received), #BB9BFF (balance outstanding), #FFC66D (at risk), #FF8C91 (overdue). 2px lines, 6px hover markers, 1px gridlines, transparent plot background, max 3 series per chart (funnel exempt), solid vs dashed for comparisons, tooltips on --surface-2 with 1px border.

## Layout contract

72px icon rail (Dashboard, Inbox, Quotes; Settings and avatar at the bottom; active item = 44x44 lime-tinted background + 3px lime bar; tooltips). 64px top bar (page context, PayPal connection indicator, company "Northstar Rentals"). 24px page gutters, 16px widget gaps, 44px primary control height, 1280px minimum (1160px usable), 1440px target (1320px usable).

## Screens

### Inbox `/inbox`
Header 76px: "Every request. One clear next step." + button "New request". Left list 340px (rows 80 to 100px, newest first, accent border on selection). Right: customer, email, received time, request id; original message at max 72ch; extracted facts ("3 price-list matches · Dates recognized"); sticky bar with "Draft quote with AI". Modal "Paste customer request" (640px) with textarea + "Add to inbox".
States: loading "Reading the request and matching your price list…"; success "Draft ready to review" then navigate; error "We couldn't read this request. Your original message is safe." + Try again / Create manually; empty "Your next job starts here." body "Paste a customer email to turn it into a structured quote." CTA "Paste a request"; partial "2 items matched. 1 needs a price." CTA "Review quote". Never invent a price.

### Quote builder `/quotes/new`
Columns 280 / 516 / 324 with 20px gaps (editor grows first). Left: source text with highlighted phrases linked to line items (selecting a line highlights the source). Middle: customer card, dates, editable items table (Item, Qty, Unit price, Amount, Total), inline edit on blur/Enter, Escape reverts, "Edited from price list" marker, "Matched to price list" / "Needs review" indicators. Right (sticky): AI review, payment terms (30% deposit), due date, total, "Approve & send deposit invoice". Confirmation dialog 480px: "Ready to request the deposit?", customer, email, "Deposit: €840.00 (30%)", due date, buttons "Create & send PayPal invoice" / "Keep editing".
States: "Building your quote from 3 price-list items…"; "Draft ready · Review before sending"; validation "Enter a valid quantity" / "A unit price is required"; "Sending invoice…" (block double submit); success "Deposit invoice sent · €840.00 requested"; PayPal error "PayPal couldn't send this invoice. No payment was requested." CTA "Retry sending" (retry must reconcile an existing invoice id, never create a second one, show "Checking invoice status…"); empty "No items yet."

### Quote detail `/quotes/[id]`
Main 736px + right rail 404px, 20px gutter. Header: quote id, customer, title, dates, place, stage pill (+ overdue pill). Horizontal stage rail: Quote approved → Deposit paid → In progress → Balance due → Paid. Vertical timeline: Quote approved, Deposit invoice sent (PayPal id, amount), Deposit received ("Verified by PayPal"), Job completed, Balance invoice, Reminder activity, Final payment; future events as muted placeholders, never fake timestamps. Right rail: Payment breakdown (Deposit secured €840.00 / Remaining balance €1,960.00), Invoices (with PayPal links), Reminder activity. Primary action by state: before deposit "Waiting for €840.00 deposit" (informational); after deposit "Mark job complete & send balance invoice" (confirm dialog); after balance invoice "Waiting for €1,960.00 balance"; paid "Job fully paid" with date; overdue adds "Reminder scheduled for 29 Oct, 09:00" from the real rule schedule.
States: "Loading payment history…"; "€840.00 received. Deposit secured."; "Payment notification received · Verifying with PayPal"; error "Payment status couldn't be refreshed. Your invoice remains unchanged." CTA Retry; "No reminders yet. The agent will act when a payment is due."; "All paid. This job is settled." Never show paid from an unverified webhook.

### Quotes `/quotes`
Heading "Quotes & jobs", search, tabs All / Awaiting payment / Completed, 52px rows: Quote, Customer, Job date, Total (right-aligned), Current state, Next action (human text, not a repeat of state). Row click opens detail and keeps search on Back. No bulk actions. Empty: "Your first quote starts with a request." CTA "Go to inbox"; no results: "No quotes match your search." CTA "Clear search".

### Dashboard `/dashboard`
Header 88px: H1 "Money, moving.", subtitle "Your quote-to-cash overview", period "This month", "PayPal connected", Filters, "Customize dashboard" (switches real AG Studio Edit mode, "Done customizing" to exit). Studio canvas fills the rest, 24-track grid:

| Widget | Type | Cols | Position | Height |
|---|---|---|---|---|
| Outstanding now | KPI | 6 | row1 x0 | 128 |
| Overdue now | KPI (coral value) | 6 | row1 x6 | 128 |
| Deposits secured | KPI (teal) | 6 | row1 x12 | 128 |
| Collected this month | KPI (lime, most emphasis) | 6 | row1 x18 | 128 |
| Cash movement | line chart, weekly collected (lime solid) vs expected (blue dashed) | 14 | row2 x0 | 272 |
| Money-flow funnel | custom SVG, fixed order: Approved quotes → Deposits received → Fully paid, % of cohort | 10 | row2 x14 | 272 |
| Who owes what | custom, 5 debtors ordered overdue → nearest due → amount; monogram, company, amount, stage pill, due, chevron; row click opens quote; footer "View all receivables" | 16 | row3 x0 | 320 |
| Nudge agent activity | custom, latest 4 events with outcome icon (sent/scheduled/skipped/failed), action, customer, amount, reason, time | 8 | row3 x16 | 320 |
| Receivables ledger | grid: Customer, Invoice, Stage, Amount owed, Due date, Reminder status; 44px rows, sticky header, overdue rows tinted | 16 | row4 x0 | 320 |
| Payment composition | donut: deposits vs balances, centre total | 8 | row4 x16 | 320 |

KPI captions: "As of now" for stock measures (Outstanding, Overdue), "This month" for flows. Custom widget empty states: "You're all caught up. No outstanding invoices." / "Approve your first quote to start tracking conversion." / "No agent activity yet. Reminders will appear here when payments need attention." Payment-received toast (transient, top-right, from the same confirmed backend event): "PAYMENT RECEIVED +€840.00, Studio Marconi S.r.l., Deposit secured · Confirmed by PayPal, Quote Q-1042 updated automatically"; auto-dismiss after 5s unless hovered.

Studio theme (`studioTheme.withParams`): backgroundColor #080D0F, chromeBackgroundColor #0D1416, foregroundColor #F3F7F4, accentColor #C5FA82, borderColor #2B3B3E, borderRadius 10px, fontFamily Manrope, fontSize 13px, browserColorScheme dark, canvas background #080D0F, widget background #111B1D with 1px #2B3B3E border, radius 14px, padding 18px, title 14px/700 #F3F7F4, panel width 280px, panel group bg #172426, grid header bg #172426, grid data bg #111B1D, cell text #F3F7F4, row hover #203032, row height 44px, chart palette fills 1 to 6 = #8FAEFF #69DBBE #C5FA82 #BB9BFF #FFC66D #FF8C91. Verify parameter names against the installed AG Studio version; do not invent ones that do not exist.

### Settings `/settings`
220px tab nav + 920px content, forms max 680px. Tabs: Price list (Item, Unit, Price, Currency, Last updated; Add item; Save prices; validation on blank/negative/duplicate; success "Price list updated. New drafts will use these prices."); PayPal (card: "Connected to PayPal", Sandbox, masked account, Last verified, "Verify connection"; never show credentials; error "Connection check failed. Invoices can't be sent until PayPal is connected."); Reminder rules (two policies: Unpaid deposit 2 days before due; Overdue balance 1 day after due; toggle, day offset, message preview with customer, amount, due date, PayPal link; "Save reminder rules"; note "Reminders are checked against the latest payment status before sending.").

## Motion

micro 120ms ease-out (hover); fast 180ms cubic-bezier(.2,.8,.2,1) (tabs, pills); panel 240ms cubic-bezier(.22,1,.36,1); data 360ms (KPI value change); payment 650ms cubic-bezier(.16,1,.3,1). Payment-received sequence: toast slides up 12px with fade (0 to 180ms), amount counts up (120 to 480ms), stage pill amber → teal and timeline node checks (200 to 560ms), dashboard KPIs/charts transition (280 to 650ms). No infinite pulsing on amounts. Respect prefers-reduced-motion (instant updates). AI draft reveals as a complete result with 40ms row stagger max 240ms total, no fake typing.
