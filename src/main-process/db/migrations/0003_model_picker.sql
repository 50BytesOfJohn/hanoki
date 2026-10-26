CREATE TABLE `model_usage` (
	`model_id` text NOT NULL,
	`reasoning_effort` text DEFAULT '' NOT NULL,
	`used_at` integer NOT NULL,
	PRIMARY KEY(`model_id`, `reasoning_effort`),
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `model_usage_used_at_idx` ON `model_usage` (`used_at`);--> statement-breakpoint
ALTER TABLE `models` ADD `pinned_at` integer;--> statement-breakpoint
ALTER TABLE `models` ADD `reasoning_effort` text;