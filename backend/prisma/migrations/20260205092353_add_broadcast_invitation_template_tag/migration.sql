-- AlterTable
ALTER TABLE `users` ADD COLUMN `notify_browser` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `notify_email` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `two_factor_enabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `two_factor_secret` VARCHAR(255) NULL;

-- CreateTable
CREATE TABLE `broadcasts` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `instance_id` CHAR(36) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `message_type` ENUM('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'LOCATION', 'CONTACT', 'STICKER') NOT NULL DEFAULT 'TEXT',
    `content` TEXT NULL,
    `media_url` TEXT NULL,
    `caption` TEXT NULL,
    `recipient_type` ENUM('ALL_CONTACTS', 'SELECTED_TAGS', 'SELECTED_CONTACTS', 'CSV_UPLOAD', 'MANUAL_INPUT') NOT NULL DEFAULT 'ALL_CONTACTS',
    `recipient_filter` JSON NULL,
    `recipient_count` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'DRAFT',
    `scheduled_at` DATETIME(3) NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `sent_count` INTEGER NOT NULL DEFAULT 0,
    `failed_count` INTEGER NOT NULL DEFAULT 0,
    `delay_min_ms` INTEGER NOT NULL DEFAULT 3000,
    `delay_max_ms` INTEGER NOT NULL DEFAULT 5000,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `broadcasts_organization_id_idx`(`organization_id`),
    INDEX `broadcasts_instance_id_idx`(`instance_id`),
    INDEX `broadcasts_status_idx`(`status`),
    INDEX `broadcasts_scheduled_at_idx`(`scheduled_at`),
    INDEX `broadcasts_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `broadcast_recipients` (
    `id` CHAR(36) NOT NULL,
    `broadcast_id` CHAR(36) NOT NULL,
    `phone_number` VARCHAR(50) NOT NULL,
    `contact_name` VARCHAR(255) NULL,
    `variables` JSON NULL,
    `status` ENUM('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `sent_at` DATETIME(3) NULL,
    `delivered_at` DATETIME(3) NULL,
    `read_at` DATETIME(3) NULL,
    `failed_at` DATETIME(3) NULL,
    `error_message` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `broadcast_recipients_broadcast_id_idx`(`broadcast_id`),
    INDEX `broadcast_recipients_status_idx`(`status`),
    INDEX `broadcast_recipients_phone_number_idx`(`phone_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `team_invitations` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `role` ENUM('SUPER_ADMIN', 'ORG_OWNER', 'ORG_ADMIN', 'ORG_MEMBER') NOT NULL DEFAULT 'ORG_MEMBER',
    `token` VARCHAR(255) NOT NULL,
    `status` ENUM('PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELED') NOT NULL DEFAULT 'PENDING',
    `expires_at` DATETIME(3) NOT NULL,
    `accepted_at` DATETIME(3) NULL,
    `invited_by_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `team_invitations_token_key`(`token`),
    INDEX `team_invitations_organization_id_idx`(`organization_id`),
    INDEX `team_invitations_email_idx`(`email`),
    INDEX `team_invitations_token_idx`(`token`),
    INDEX `team_invitations_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `message_templates` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `category` VARCHAR(100) NULL,
    `message_type` ENUM('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'LOCATION', 'CONTACT', 'STICKER') NOT NULL DEFAULT 'TEXT',
    `content` TEXT NOT NULL,
    `media_url` TEXT NULL,
    `caption` TEXT NULL,
    `variables` JSON NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `usage_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `message_templates_organization_id_idx`(`organization_id`),
    INDEX `message_templates_category_idx`(`category`),
    INDEX `message_templates_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tags` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `color` VARCHAR(20) NOT NULL DEFAULT '#6B7280',
    `description` VARCHAR(255) NULL,
    `contact_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `tags_organization_id_idx`(`organization_id`),
    UNIQUE INDEX `tags_organization_id_name_key`(`organization_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contact_tags` (
    `id` CHAR(36) NOT NULL,
    `contact_id` CHAR(36) NOT NULL,
    `tag_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `contact_tags_contact_id_idx`(`contact_id`),
    INDEX `contact_tags_tag_id_idx`(`tag_id`),
    UNIQUE INDEX `contact_tags_contact_id_tag_id_key`(`contact_id`, `tag_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `broadcast_recipients` ADD CONSTRAINT `broadcast_recipients_broadcast_id_fkey` FOREIGN KEY (`broadcast_id`) REFERENCES `broadcasts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contact_tags` ADD CONSTRAINT `contact_tags_tag_id_fkey` FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
