CREATE TABLE `email_send_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`ip` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_send_log_email_idx` ON `email_send_log` (`email`,`created_at`);--> statement-breakpoint
CREATE INDEX `email_send_log_ip_idx` ON `email_send_log` (`ip`,`created_at`);--> statement-breakpoint
CREATE INDEX `email_send_log_created_idx` ON `email_send_log` (`created_at`);