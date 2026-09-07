DO $$
BEGIN
  IF EXISTS (
    SELECT lower(btrim("email"))
    FROM "User"
    GROUP BY lower(btrim("email"))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot normalize User.email: case-insensitive duplicates exist';
  END IF;
END $$;

UPDATE "User" SET "email" = lower(btrim("email"))
WHERE "email" <> lower(btrim("email"));

CREATE UNIQUE INDEX "User_email_normalized_key" ON "User" (lower(btrim("email")));
ALTER TABLE "User" ADD CONSTRAINT "User_email_normalized_check"
CHECK ("email" = lower(btrim("email")));
