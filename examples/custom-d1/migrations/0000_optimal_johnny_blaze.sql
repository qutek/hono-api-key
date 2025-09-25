CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`ownerId` text NOT NULL,
	`name` text NOT NULL,
	`permissions` text DEFAULT '{}' NOT NULL,
	`rateLimit` text,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`lastUsedAt` integer,
	`expiresAt` integer,
	`metadata` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `owner_index` ON `api_keys` (`ownerId`);--> statement-breakpoint
CREATE INDEX `key_index` ON `api_keys` (`key`);