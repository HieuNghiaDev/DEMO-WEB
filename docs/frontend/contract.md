# Required document inspector — interaction contract

- `review_status` is visible and actionable in the required-document inspector only when the current user has both `case.update` and role `level_4` or `level_5`.
- The API independently rejects any PATCH containing `review_status` from other roles with HTTP 403.
- Collection conditions, collection status, fulfillment, and exceptions retain their existing `case.update` behavior.
- The review step is presented after the operational document checks so it represents the final review of the whole required document.
