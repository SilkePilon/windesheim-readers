-- user.locale becomes nullable; NULL = "never chosen" (the UI then follows the browser).
-- Not a table rebuild: migrations run inside a transaction, where PRAGMA foreign_keys=OFF is a no-op,
-- so DROP TABLE `user` would cascade-delete sessions, stats and progress. Existing values become NULL by design.
ALTER TABLE `user` DROP COLUMN `locale`;--> statement-breakpoint
ALTER TABLE `user` ADD `locale` text;
