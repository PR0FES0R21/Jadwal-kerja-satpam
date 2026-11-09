# Jaga interface

Jaga is a mobile operational record book for shifts, money and loan obligations. The interface prioritizes reading amounts, dates and status, then recording an action. Keep the established emerald identity, light/dark themes and five destinations with Calendar in the center. Preserve the distinction between cash flow, PayLater purchases and platform debt.

## Readability decisions — 9 November 2026

| Decision | Options | Evidence | Tradeoff | Choice | Verification |
| --- | --- | --- | --- | --- | --- |
| Mobile financial summaries | Small paired tiles or full-width rows | Large synthetic amounts wrap between digits in narrow tiles | Rows use more vertical space | Full-width analytic summaries on phones; cash and PayLater outflow rows in one group | Rendered at 320/390 px with a 100 billion rupiah entry |
| Transaction hierarchy | Three competing columns or a dedicated amount line | Long descriptions leave little room beside amounts on phones | Each item may be taller | Description/source above amount; retain side-by-side layout on wider screens | Long descriptions, date/account captions and paginated history checked |
| Report controls | Separate filter button and date text or one summary control | Selected period and categories describe the same report | Control can grow with multiple categories | One button shows dates and current selection; opens existing filter sheet | Makan + Minum applied and reflected in results |
| Text and controls | Dense microcopy or readable captions | Existing metadata was often 9–11 px | Slightly lower density | 14 px transaction text/amount, 12 px captions; 16 px sheet inputs; larger category hit areas | Computed type sizes checked at narrow width |

Use the existing theme variables and Lucide icons. Keep warnings and explanations that distinguish balances, repayments and obligations. Do not add marketing copy, decorative imagery or fictional live records. Compact calendar codes remain a distinct, constrained notation with full date/shift labels available on their controls.

See `docs/ui-review.md` for verification scope and remaining limitations.
