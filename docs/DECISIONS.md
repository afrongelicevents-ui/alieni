# Decisions

Recorded so a new person understands why things are the way they are.

| Topic | Decision |
|---|---|
| Role of the platform | Alieni connects people with cleaners ("connect · clean · thrive"). The business-side model options are in `briefs/business-platform-plan.md`; the build keeps pricing configurable and inactive until a model is chosen. |
| Payments | Off. Charging needs a Mollie key, `PAYMENTS_ACTIVE=true` and a price in Admin. Seeded prices are 0; the admin form defaults to 0,00; public text is price-neutral. |
| Services | Five service types (connect, cover, turnover, one-off, contract) in `service_catalog`, switched per business type in Admin. |
| Quotations | A cleaner answers a job with a quotation; the business accepts (two-step) and the job is awarded; regular jobs generate visits four weeks ahead. |
| Chat privacy | Contact details are masked until both sides confirm a deal. Admins cannot read chats; a report copies only the reported message. |
| Cleaner privacy | Only the postcode area is public; school work needs a recent VOG. |
| Reviews | Written after a confirmed connection; no author name shown; a reported review is hidden until an admin decides. |
| Languages | Dutch default, English available; e-mails are sent in each user's language. |
| Tests | Real-Postgres checks for the access rules (fresh and upgrade) plus browser flows against a stand-in. Neither touches the live project. |
| Environments | Production and any test use **separate** Supabase projects. A preview build must never use the live project's keys for anything that writes data. |
| Deployment safety | Work happens on a non-production branch (`alieni-dev`); only the production branch deploys to production. |
