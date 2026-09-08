-- The idempotency key is identified by its ROUTE as well as its value.
--
-- With `(userId, key)` alone, a key already seen at one route could never be
-- recorded at another: the insert failed the unique constraint, was caught,
-- and that endpoint silently lost its replay protection. Making the scope part
-- of the identity turns the check from a comparison into a structural fact.
DROP INDEX "IdempotencyKey_userId_key_key";

CREATE UNIQUE INDEX "IdempotencyKey_userId_scope_key_key"
  ON "IdempotencyKey"("userId", "scope", "key");
