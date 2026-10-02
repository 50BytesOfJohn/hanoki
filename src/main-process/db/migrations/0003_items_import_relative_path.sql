ALTER TABLE `items` ADD `import_relative_path` text;--> statement-breakpoint
ALTER TABLE `items` ADD `import_root_id` text;--> statement-breakpoint
CREATE INDEX `items_workspace_import_path_idx` ON `items` (`workspace_id`,`import_relative_path`);