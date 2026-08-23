PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_items` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`folder_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`extensions` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "items_type_check" CHECK("__new_items"."type" in ('chat', 'terminal', 'markdown'))
);
--> statement-breakpoint
INSERT INTO `__new_items`("id", "workspace_id", "folder_id", "type", "title", "data", "metadata", "extensions", "created_at", "updated_at") SELECT "id", "workspace_id", "folder_id", "type", "title", "data", "metadata", "extensions", "created_at", "updated_at" FROM `items`;--> statement-breakpoint
DROP TABLE `items`;--> statement-breakpoint
ALTER TABLE `__new_items` RENAME TO `items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `items_workspace_id_idx` ON `items` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `items_folder_id_idx` ON `items` (`folder_id`);--> statement-breakpoint
CREATE INDEX `items_type_idx` ON `items` (`type`);