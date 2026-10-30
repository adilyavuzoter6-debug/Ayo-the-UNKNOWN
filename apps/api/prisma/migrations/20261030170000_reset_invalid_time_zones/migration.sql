-- Time zones used to be free text, and some were typed as a town ("Fethıye"). Every date the app
-- computes is in this zone, and an unknown one fails those requests, so reset the ones Postgres
-- (and with it the IANA database) doesn't know: a company to Turkey's zone, where every customer
-- so far farms, and a farm to none, which falls back to its company's.
UPDATE "companies" SET "timezone" = 'Europe/Istanbul'
WHERE "timezone" NOT IN (SELECT "name" FROM pg_timezone_names);

UPDATE "farms" SET "timezone" = NULL
WHERE "timezone" IS NOT NULL AND "timezone" NOT IN (SELECT "name" FROM pg_timezone_names);
