CREATE TABLE `qeval_evaluations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`evaluation_type` text NOT NULL,
	`lot_no` text NOT NULL,
	`product` text NOT NULL,
	`part_no` text DEFAULT '' NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`equipment` text DEFAULT '' NOT NULL,
	`step` text DEFAULT '' NOT NULL,
	`owner` text DEFAULT '' NOT NULL,
	`start_date` text DEFAULT '' NOT NULL,
	`target_date` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Chờ thực hiện' NOT NULL,
	`result` text DEFAULT '-' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`fail_qty` integer DEFAULT 0 NOT NULL,
	`yield_rate` real DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX `evaluations_lot_no_unique` ON `qeval_evaluations` (`lot_no`);
ALTER TABLE `qeval_evaluations` ADD `evaluation_content` text DEFAULT '' NOT NULL;
CREATE TABLE `qeval_evaluation_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`evaluation_id` integer,
	`action` text NOT NULL,
	`lot_no` text NOT NULL,
	`evaluation_type` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`actor` text DEFAULT 'Người dùng web' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE `qeval_evaluation_timeline` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`evaluation_id` integer NOT NULL,
	`stage` text NOT NULL,
	`event_date` text NOT NULL,
	`status` text DEFAULT 'Chờ thực hiện' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
ALTER TABLE `qeval_evaluations` ADD `density` text DEFAULT '' NOT NULL;
ALTER TABLE `qeval_evaluations` ADD `evaluation_no` text DEFAULT '' NOT NULL;
ALTER TABLE `qeval_evaluation_timeline` ADD `sequence` integer DEFAULT 0 NOT NULL;
ALTER TABLE `qeval_evaluations` ADD `form_factor` text DEFAULT '' NOT NULL;
ALTER TABLE `qeval_evaluations` ADD `approval_status` text DEFAULT 'Chưa phê duyệt' NOT NULL;
CREATE TABLE `qeval_mass_evaluation_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`evaluation_no` text DEFAULT '' NOT NULL,
	`evaluation_type` text NOT NULL,
	`classification` text DEFAULT '' NOT NULL,
	`product` text DEFAULT '' NOT NULL,
	`form_factor` text DEFAULT '' NOT NULL,
	`start_step` text DEFAULT '' NOT NULL,
	`part_id` text DEFAULT '' NOT NULL,
	`density` text DEFAULT '' NOT NULL,
	`lane` text DEFAULT '' NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'Chờ thực hiện' NOT NULL,
	`lots_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
ALTER TABLE `qeval_mass_evaluation_reports` ADD `reason` text DEFAULT '' NOT NULL;
CREATE TABLE tech_eval_permissions (user_id INTEGER PRIMARY KEY REFERENCES techops_users(id) ON DELETE CASCADE, role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('editor','viewer')), status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('approved','pending','rejected')), approved_by TEXT NOT NULL DEFAULT '', approved_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
