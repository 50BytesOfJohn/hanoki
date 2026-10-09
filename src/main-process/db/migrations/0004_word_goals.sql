CREATE TABLE `folder_goal_baselines` (
	`folder_id` text NOT NULL,
	`item_id` text NOT NULL,
	`baseline_words` integer NOT NULL,
	PRIMARY KEY(`folder_id`, `item_id`),
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `folder_word_goals` (
	`folder_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`target_words` integer DEFAULT 50000 NOT NULL,
	`started_at` integer NOT NULL,
	`start_day` text NOT NULL,
	`baseline_words` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "folder_word_goals_target_positive" CHECK("folder_word_goals"."target_words" > 0)
);
--> statement-breakpoint
CREATE INDEX `folder_word_goals_workspace_id_idx` ON `folder_word_goals` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `note_word_days` (
	`item_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`day` text NOT NULL,
	`start_words` integer NOT NULL,
	`end_words` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`item_id`, `day`, `folder_id`),
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `note_word_days_folder_day_idx` ON `note_word_days` (`folder_id`,`day`);--> statement-breakpoint
ALTER TABLE `items` ADD `word_count` integer;