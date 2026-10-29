# Child profile refinement

## Brief
Preserve the existing React, Radix and Tailwind system. This is a staff record editor, not a marketing page; photography, loaders, scroll theatre and additional pages do not belong here. Keep all existing capabilities and access boundaries.

## Concept options
| Territory | Idea | Signature | Anchor | Originality / fit / feasibility / portability |
| --- | --- | --- | --- | --- |
| Profession | A readable camp record | Fixed identity and actions, scrolling record | Supervisors consult and edit child records | 3 / 5 / 5 / 3 |
| Process | A handoff between registration and supervision | Source-labelled notes | Registration notes become supervisor notes when edited | 4 / 5 / 4 / 2 |
| Formal | One continuous form | Unframed sections with quiet dividers | Frequent mobile editing | 3 / 5 / 5 / 4 |

Choose the camp record: identity stays visible while the details move; preserve source-labelled notes from the handoff idea.

## Concept card
Idea: A calm child record with identity and actions always within reach.
Metaphor: The practical camp record, not a promotional card.
Signature: Stable header and footer around a single scrolling form.
Emotion: Clear, trustworthy, familiar.
Motion verb: Settle; short dialog entry and tactile button feedback.
Screenshot: Full name, contact fields and notes without neon panels or stacked cards.

## System
Redesign: preserve. Dials: variance 3, motion 2, density 5.
Reuse the app font, primary accent and semantic tokens. Scope neutral surface overrides to the portalled editor and restore the saved staff light theme. No global palette/font change. Controls and framed medical note: 8px radius; dialog: 12px. Body/inputs: 16px; labels: 13px; identity: 20px. No all-caps display, emojis, gradients or blur.

```text
Name                           Close
Team / category
------------------------------------
Data                 Transactions
[medical note if present]
Phone
Telegram
Supervisor notes [source]
Balance                 [-] [n] [+]
Gender
Imported details (disclosure)
------------------------------------
Save status           Save and close
```

Desktop: constrained 520px editor. Phone: viewport-bounded dialog with independently scrolling body, safe-area footer and full-width inputs. Reduced motion: instant transitions. Idle motion intentionally absent: this is a form.

## Genericness check
Remove the bright balance banner, ornamental pills, repeated cards, heavy uppercase name and duplicate close button. Prioritize medical details and actual child fields. No invented content or images.

## Verification
Focused tests for no writes on open, changed-fields-only saving, pending edits on close, failure retention, child switching and invalid balance. Browser checks on the authenticated staff flow; intercepted writes only for disposable preview input, never mutate real child records.