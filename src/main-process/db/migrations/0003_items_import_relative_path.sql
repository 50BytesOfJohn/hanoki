ALTER TABLE `items` ADD `import_relative_path` text;--> statement-breakpoint
CREATE INDEX `items_workspace_import_path_idx` ON `items` (`workspace_id`,`import_relative_path`);