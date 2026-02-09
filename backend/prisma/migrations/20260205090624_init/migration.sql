-- CreateTable
CREATE TABLE `organizations` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `email` VARCHAR(255) NULL,
    `phone` VARCHAR(50) NULL,
    `logo_url` TEXT NULL,
    `subscription_plan_id` CHAR(36) NULL,
    `subscription_status` ENUM('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED') NOT NULL DEFAULT 'TRIAL',
    `trial_ends_at` DATETIME(3) NULL,
    `max_instances` INTEGER NOT NULL DEFAULT 1,
    `max_contacts` INTEGER NOT NULL DEFAULT 1000,
    `max_messages_per_day` INTEGER NOT NULL DEFAULT 100,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `organizations_slug_key`(`slug`),
    INDEX `organizations_slug_idx`(`slug`),
    INDEX `organizations_subscription_status_idx`(`subscription_status`),
    INDEX `organizations_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `full_name` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(50) NULL,
    `avatar_url` TEXT NULL,
    `role` ENUM('SUPER_ADMIN', 'ORG_OWNER', 'ORG_ADMIN', 'ORG_MEMBER') NOT NULL DEFAULT 'ORG_MEMBER',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `is_email_verified` BOOLEAN NOT NULL DEFAULT false,
    `email_verified_at` DATETIME(3) NULL,
    `last_login_at` DATETIME(3) NULL,
    `last_login_ip` VARCHAR(50) NULL,
    `refresh_token` TEXT NULL,
    `reset_token` VARCHAR(255) NULL,
    `reset_token_expires_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_organization_id_idx`(`organization_id`),
    INDEX `users_email_idx`(`email`),
    INDEX `users_role_idx`(`role`),
    INDEX `users_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `whatsapp_instances` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `phone_number` VARCHAR(50) NULL,
    `qr_code` TEXT NULL,
    `status` ENUM('DISCONNECTED', 'CONNECTING', 'CONNECTED', 'QR_READY', 'ERROR', 'BANNED') NOT NULL DEFAULT 'DISCONNECTED',
    `connection_state` VARCHAR(50) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `session_data` LONGTEXT NULL,
    `session_last_sync` DATETIME(3) NULL,
    `health_score` INTEGER NOT NULL DEFAULT 100,
    `account_age_days` INTEGER NOT NULL DEFAULT 0,
    `daily_message_count` INTEGER NOT NULL DEFAULT 0,
    `daily_limit` INTEGER NOT NULL DEFAULT 50,
    `last_message_at` DATETIME(3) NULL,
    `warming_phase` ENUM('DAY_1_3', 'DAY_4_7', 'DAY_8_14', 'DAY_15_PLUS') NOT NULL DEFAULT 'DAY_1_3',
    `connected_at` DATETIME(3) NULL,
    `disconnected_at` DATETIME(3) NULL,
    `last_seen_at` DATETIME(3) NULL,
    `webhook_url` TEXT NULL,
    `webhook_events` JSON NULL,
    `webhook_secret` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `whatsapp_instances_organization_id_idx`(`organization_id`),
    INDEX `whatsapp_instances_status_idx`(`status`),
    INDEX `whatsapp_instances_phone_number_idx`(`phone_number`),
    INDEX `whatsapp_instances_is_active_idx`(`is_active`),
    INDEX `whatsapp_instances_health_score_idx`(`health_score`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `messages` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `instance_id` CHAR(36) NOT NULL,
    `wa_message_id` VARCHAR(255) NULL,
    `chat_jid` VARCHAR(255) NOT NULL,
    `sender_jid` VARCHAR(255) NULL,
    `message_type` ENUM('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'LOCATION', 'CONTACT', 'STICKER') NOT NULL DEFAULT 'TEXT',
    `content` TEXT NULL,
    `media_url` TEXT NULL,
    `media_type` VARCHAR(50) NULL,
    `caption` TEXT NULL,
    `direction` ENUM('INCOMING', 'OUTGOING') NOT NULL DEFAULT 'OUTGOING',
    `status` ENUM('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `sent_at` DATETIME(3) NULL,
    `delivered_at` DATETIME(3) NULL,
    `read_at` DATETIME(3) NULL,
    `failed_at` DATETIME(3) NULL,
    `error_message` TEXT NULL,
    `retry_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `messages_organization_id_idx`(`organization_id`),
    INDEX `messages_instance_id_idx`(`instance_id`),
    INDEX `messages_wa_message_id_idx`(`wa_message_id`),
    INDEX `messages_chat_jid_idx`(`chat_jid`),
    INDEX `messages_status_idx`(`status`),
    INDEX `messages_direction_idx`(`direction`),
    INDEX `messages_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contacts` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `instance_id` CHAR(36) NOT NULL,
    `jid` VARCHAR(255) NOT NULL,
    `phone_number` VARCHAR(50) NULL,
    `name` VARCHAR(255) NULL,
    `push_name` VARCHAR(255) NULL,
    `is_business` BOOLEAN NOT NULL DEFAULT false,
    `is_enterprise` BOOLEAN NOT NULL DEFAULT false,
    `is_group` BOOLEAN NOT NULL DEFAULT false,
    `profile_pic_url` TEXT NULL,
    `status_text` TEXT NULL,
    `tags` JSON NULL,
    `custom_fields` JSON NULL,
    `notes` TEXT NULL,
    `last_seen_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `contacts_organization_id_idx`(`organization_id`),
    INDEX `contacts_instance_id_idx`(`instance_id`),
    INDEX `contacts_phone_number_idx`(`phone_number`),
    INDEX `contacts_jid_idx`(`jid`),
    UNIQUE INDEX `contacts_instance_id_jid_key`(`instance_id`, `jid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `webhooks` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `instance_id` CHAR(36) NOT NULL,
    `event_type` VARCHAR(100) NOT NULL,
    `payload` JSON NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `max_attempts` INTEGER NOT NULL DEFAULT 3,
    `next_retry_at` DATETIME(3) NULL,
    `last_attempt_at` DATETIME(3) NULL,
    `delivered_at` DATETIME(3) NULL,
    `failed_at` DATETIME(3) NULL,
    `response_status` INTEGER NULL,
    `response_body` TEXT NULL,
    `error_message` TEXT NULL,
    `idempotency_key` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `webhooks_organization_id_idx`(`organization_id`),
    INDEX `webhooks_instance_id_idx`(`instance_id`),
    INDEX `webhooks_status_idx`(`status`),
    INDEX `webhooks_event_type_idx`(`event_type`),
    INDEX `webhooks_next_retry_at_idx`(`next_retry_at`),
    INDEX `webhooks_idempotency_key_idx`(`idempotency_key`),
    INDEX `webhooks_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `webhook_logs` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `webhook_id` CHAR(36) NOT NULL,
    `attempt_number` INTEGER NOT NULL,
    `request_headers` JSON NULL,
    `request_body` JSON NULL,
    `response_status` INTEGER NULL,
    `response_headers` JSON NULL,
    `response_body` TEXT NULL,
    `duration_ms` INTEGER NULL,
    `error_message` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `webhook_logs_organization_id_idx`(`organization_id`),
    INDEX `webhook_logs_webhook_id_idx`(`webhook_id`),
    INDEX `webhook_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `api_keys` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `key_hash` VARCHAR(255) NOT NULL,
    `key_prefix` VARCHAR(20) NOT NULL,
    `permissions` JSON NULL,
    `rate_limit` INTEGER NOT NULL DEFAULT 1000,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `last_used_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `api_keys_key_hash_key`(`key_hash`),
    INDEX `api_keys_organization_id_idx`(`organization_id`),
    INDEX `api_keys_key_hash_idx`(`key_hash`),
    INDEX `api_keys_key_prefix_idx`(`key_prefix`),
    INDEX `api_keys_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscription_plans` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `slug` VARCHAR(50) NOT NULL,
    `description` TEXT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'IDR',
    `billing_period` ENUM('MONTHLY', 'QUARTERLY', 'YEARLY') NOT NULL DEFAULT 'MONTHLY',
    `max_instances` INTEGER NOT NULL DEFAULT 1,
    `max_contacts` INTEGER NOT NULL DEFAULT 1000,
    `max_messages_per_day` INTEGER NOT NULL DEFAULT 100,
    `features` JSON NULL,
    `trial_days` INTEGER NOT NULL DEFAULT 7,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `is_public` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `subscription_plans_slug_key`(`slug`),
    INDEX `subscription_plans_slug_idx`(`slug`),
    INDEX `subscription_plans_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscriptions` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `plan_id` CHAR(36) NOT NULL,
    `status` ENUM('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
    `current_period_start` DATETIME(3) NOT NULL,
    `current_period_end` DATETIME(3) NOT NULL,
    `cancel_at_period_end` BOOLEAN NOT NULL DEFAULT false,
    `canceled_at` DATETIME(3) NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(10) NOT NULL,
    `billing_period` ENUM('MONTHLY', 'QUARTERLY', 'YEARLY') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `subscriptions_organization_id_idx`(`organization_id`),
    INDEX `subscriptions_plan_id_idx`(`plan_id`),
    INDEX `subscriptions_status_idx`(`status`),
    INDEX `subscriptions_current_period_end_idx`(`current_period_end`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoices` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `subscription_id` CHAR(36) NULL,
    `invoice_number` VARCHAR(50) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(10) NOT NULL,
    `tax_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `total_amount` DECIMAL(10, 2) NOT NULL,
    `status` ENUM('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELED') NOT NULL DEFAULT 'PENDING',
    `payment_method` ENUM('MANUAL_TRANSFER', 'MIDTRANS_BANK_TRANSFER', 'MIDTRANS_CREDIT_CARD', 'MIDTRANS_GOPAY', 'MIDTRANS_OVO', 'MIDTRANS_QRIS') NOT NULL DEFAULT 'MANUAL_TRANSFER',
    `paid_at` DATETIME(3) NULL,
    `payment_proof_url` TEXT NULL,
    `payment_notes` TEXT NULL,
    `midtrans_order_id` VARCHAR(255) NULL,
    `midtrans_transaction_id` VARCHAR(255) NULL,
    `midtrans_payment_type` VARCHAR(50) NULL,
    `due_date` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `invoices_invoice_number_key`(`invoice_number`),
    UNIQUE INDEX `invoices_midtrans_order_id_key`(`midtrans_order_id`),
    INDEX `invoices_organization_id_idx`(`organization_id`),
    INDEX `invoices_subscription_id_idx`(`subscription_id`),
    INDEX `invoices_invoice_number_idx`(`invoice_number`),
    INDEX `invoices_status_idx`(`status`),
    INDEX `invoices_payment_method_idx`(`payment_method`),
    INDEX `invoices_midtrans_order_id_idx`(`midtrans_order_id`),
    INDEX `invoices_due_date_idx`(`due_date`),
    INDEX `invoices_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_methods_config` (
    `id` CHAR(36) NOT NULL,
    `method` ENUM('MANUAL_TRANSFER', 'MIDTRANS_BANK_TRANSFER', 'MIDTRANS_CREDIT_CARD', 'MIDTRANS_GOPAY', 'MIDTRANS_OVO', 'MIDTRANS_QRIS') NOT NULL,
    `is_enabled` BOOLEAN NOT NULL DEFAULT false,
    `display_name` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `config_data` JSON NULL,
    `bank_name` VARCHAR(100) NULL,
    `account_number` VARCHAR(50) NULL,
    `account_holder` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payment_methods_config_method_key`(`method`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usage_logs` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `resource_type` VARCHAR(50) NOT NULL,
    `action` VARCHAR(50) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `usage_logs_organization_id_idx`(`organization_id`),
    INDEX `usage_logs_resource_type_idx`(`resource_type`),
    INDEX `usage_logs_action_idx`(`action`),
    INDEX `usage_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `action` VARCHAR(100) NOT NULL,
    `resource_type` VARCHAR(50) NOT NULL,
    `resource_id` CHAR(36) NULL,
    `old_values` JSON NULL,
    `new_values` JSON NULL,
    `ip_address` VARCHAR(50) NULL,
    `user_agent` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_organization_id_idx`(`organization_id`),
    INDEX `audit_logs_user_id_idx`(`user_id`),
    INDEX `audit_logs_action_idx`(`action`),
    INDEX `audit_logs_resource_type_idx`(`resource_type`),
    INDEX `audit_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_settings` (
    `id` CHAR(36) NOT NULL,
    `key` VARCHAR(100) NOT NULL,
    `value` JSON NOT NULL,
    `description` TEXT NULL,
    `is_public` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `system_settings_key_key`(`key`),
    INDEX `system_settings_key_idx`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `session_backups` (
    `id` CHAR(36) NOT NULL,
    `instance_id` CHAR(36) NOT NULL,
    `session_data` LONGTEXT NOT NULL,
    `backup_size` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `session_backups_instance_id_idx`(`instance_id`),
    INDEX `session_backups_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `organizations` ADD CONSTRAINT `organizations_subscription_plan_id_fkey` FOREIGN KEY (`subscription_plan_id`) REFERENCES `subscription_plans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `whatsapp_instances` ADD CONSTRAINT `whatsapp_instances_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_instance_id_fkey` FOREIGN KEY (`instance_id`) REFERENCES `whatsapp_instances`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_instance_id_fkey` FOREIGN KEY (`instance_id`) REFERENCES `whatsapp_instances`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `webhooks` ADD CONSTRAINT `webhooks_instance_id_fkey` FOREIGN KEY (`instance_id`) REFERENCES `whatsapp_instances`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `webhook_logs` ADD CONSTRAINT `webhook_logs_webhook_id_fkey` FOREIGN KEY (`webhook_id`) REFERENCES `webhooks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `api_keys` ADD CONSTRAINT `api_keys_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_subscription_id_fkey` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usage_logs` ADD CONSTRAINT `usage_logs_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `session_backups` ADD CONSTRAINT `session_backups_instance_id_fkey` FOREIGN KEY (`instance_id`) REFERENCES `whatsapp_instances`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
