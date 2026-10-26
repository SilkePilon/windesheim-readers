CREATE TABLE `quest_progress` (
	`user_id` text NOT NULL,
	`day_key` text NOT NULL,
	`quest_id` text NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`seen_lessons` text DEFAULT '[]' NOT NULL,
	`completed_at` integer,
	PRIMARY KEY(`user_id`, `day_key`, `quest_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
