CREATE TABLE `concept_map` (
	`reader_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`data` text,
	`edited_at` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`reader_id`) REFERENCES `reader`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `episode_progress` (
	`user_id` text NOT NULL,
	`reader_id` text NOT NULL,
	`week` integer NOT NULL,
	`listen_ms` integer DEFAULT 0 NOT NULL,
	`position_ms` integer DEFAULT 0 NOT NULL,
	`awarded` integer DEFAULT false NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `reader_id`, `week`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reader_id`) REFERENCES `reader`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `question_result` (
	`user_id` text NOT NULL,
	`question_id` text NOT NULL,
	`last_correct` integer NOT NULL,
	`seen` integer DEFAULT 1 NOT NULL,
	`last_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `question_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `question`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reader_episode` (
	`reader_id` text NOT NULL,
	`week` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`title` text,
	`script` text,
	`chapters` text DEFAULT '[]' NOT NULL,
	`generated_at` integer,
	`provider` text,
	`model` text,
	`voice` text,
	`source_snapshot` text,
	PRIMARY KEY(`reader_id`, `week`),
	FOREIGN KEY (`reader_id`) REFERENCES `reader`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reader_session_day` (
	`user_id` text NOT NULL,
	`reader_id` text NOT NULL,
	`day` text NOT NULL,
	`sessions` integer DEFAULT 0 NOT NULL,
	`completed_at` integer,
	`xp` integer DEFAULT 0 NOT NULL,
	`cards` integer DEFAULT 0 NOT NULL,
	`questions` integer DEFAULT 0 NOT NULL,
	`correct` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `reader_id`, `day`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reader_id`) REFERENCES `reader`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `reader` ADD `exam_date` integer;