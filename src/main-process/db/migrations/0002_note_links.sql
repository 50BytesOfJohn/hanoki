CREATE TABLE `note_links` (
	`workspace_id` text NOT NULL,
	`from_item_id` text NOT NULL,
	`to_item_id` text,
	`target_text` text NOT NULL,
	`alias` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`from_item_id`, `target_text`, `alias`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `note_links_to_item_id_idx` ON `note_links` (`to_item_id`);--> statement-breakpoint
CREATE INDEX `note_links_workspace_to_idx` ON `note_links` (`workspace_id`,`to_item_id`);--> statement-breakpoint
CREATE INDEX `note_links_from_item_id_idx` ON `note_links` (`from_item_id`);