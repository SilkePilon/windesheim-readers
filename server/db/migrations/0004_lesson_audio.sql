CREATE TABLE `lesson_audio` (
	`lesson_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`stale` integer DEFAULT false NOT NULL,
	`script` text,
	`chapters` text DEFAULT '[]' NOT NULL,
	`provider` text,
	`model` text,
	`voice` text,
	`generated_at` integer,
	`error` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`lesson_id`) REFERENCES `lesson`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `lesson_progress` ADD `listen_ms` integer DEFAULT 0 NOT NULL;