-- CreateTable
CREATE TABLE `lid_phone_mappings` (
    `id` CHAR(36) NOT NULL,
    `instance_id` CHAR(36) NOT NULL,
    `lid_jid` VARCHAR(255) NOT NULL,
    `phone_jid` VARCHAR(255) NOT NULL,
    `phone_number` VARCHAR(50) NOT NULL,
    `source` VARCHAR(50) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `lid_phone_mappings_instance_id_idx`(`instance_id`),
    INDEX `lid_phone_mappings_lid_jid_idx`(`lid_jid`),
    INDEX `lid_phone_mappings_phone_number_idx`(`phone_number`),
    UNIQUE INDEX `lid_phone_mappings_instance_id_lid_jid_key`(`instance_id`, `lid_jid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
