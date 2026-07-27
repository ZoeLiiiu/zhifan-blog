CREATE TABLE `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`date` text NOT NULL,
	`read_time` text NOT NULL,
	`title` text NOT NULL,
	`excerpt` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`accent` text DEFAULT 'mint' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`published_at` text
);
--> statement-breakpoint
CREATE INDEX `articles_status_idx` ON `articles` (`status`);--> statement-breakpoint
CREATE INDEX `articles_updated_at_idx` ON `articles` (`updated_at`);--> statement-breakpoint
INSERT OR IGNORE INTO `articles` (`id`, `category`, `date`, `read_time`, `title`, `excerpt`, `body`, `accent`, `status`, `created_at`, `updated_at`, `published_at`) VALUES
('slow-work', '专业经验', '2026.07.12', '6 分钟', '把复杂的事，讲成别人听得懂的事', '好的表达不是把话说满，而是给对方一条可以走下去的路。', '我把这件事拆成三个动作：先说结论，再补关键证据，最后留下一个可执行的下一步。写文档、做汇报、和人协作，其实都适用。', 'mint', 'published', '2026-07-12T00:00:00.000Z', '2026-07-12T00:00:00.000Z', '2026-07-12T00:00:00.000Z'),
('small-launch', '项目复盘', '2026.06.28', '8 分钟', '一个小功能上线后，我学会了先问为什么', '复盘不是寻找谁做错了，而是找出系统怎样才能更温柔地工作。', '这次上线最有价值的部分，不是交付了多少代码，而是让我们看见了需求、节奏和反馈之间的缝隙。下一次，我会把验证提前一周。', 'coral', 'published', '2026-06-28T00:00:00.000Z', '2026-06-28T00:00:00.000Z', '2026-06-28T00:00:00.000Z'),
('window-light', '生活随想', '2026.06.05', '4 分钟', '给日子留一点没有安排的时间', '当生活不再只剩下待办事项，心里才会长出新的方向。', '我开始把每周的一小段时间留给散步、发呆和不带目的地读几页书。那些看似没有产出的时刻，反而让下一次出发变得清醒。', 'sky', 'published', '2026-06-05T00:00:00.000Z', '2026-06-05T00:00:00.000Z', '2026-06-05T00:00:00.000Z');
