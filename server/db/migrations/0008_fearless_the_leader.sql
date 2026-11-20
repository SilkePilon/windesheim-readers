CREATE INDEX `user_stats_xp_idx` ON `user_stats` (`xp`);--> statement-breakpoint
CREATE INDEX `xp_event_created_user_idx` ON `xp_event` (`created_at`,`user_id`);