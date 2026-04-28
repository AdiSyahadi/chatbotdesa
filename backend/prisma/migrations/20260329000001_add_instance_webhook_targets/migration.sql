-- CreateTable: instance_webhook_targets
-- PATCH-171: Multi-webhook per instance
CREATE TABLE `instance_webhook_targets` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `instance_id` CHAR(36) NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `url` TEXT NOT NULL,
    `events` JSON NOT NULL,
    `secret` VARCHAR(255) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `instance_webhook_targets_organization_id_idx`(`organization_id`),
    INDEX `instance_webhook_targets_instance_id_idx`(`instance_id`),
    INDEX `instance_webhook_targets_is_active_idx`(`is_active`),
    CONSTRAINT `instance_webhook_targets_instance_id_fkey` FOREIGN KEY (`instance_id`) REFERENCES `whatsapp_instances`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
