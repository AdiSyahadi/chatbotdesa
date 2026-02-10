/*
  Warnings:

  - A unique constraint covering the columns `[wa_message_id,instance_id]` on the table `messages` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `broadcasts` MODIFY `message_type` ENUM('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'LOCATION', 'CONTACT', 'STICKER', 'REACTION', 'POLL', 'UNKNOWN') NOT NULL DEFAULT 'TEXT';

-- AlterTable
ALTER TABLE `message_templates` MODIFY `message_type` ENUM('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'LOCATION', 'CONTACT', 'STICKER', 'REACTION', 'POLL', 'UNKNOWN') NOT NULL DEFAULT 'TEXT';

-- AlterTable
ALTER TABLE `messages` ADD COLUMN `source` ENUM('REALTIME', 'HISTORY_SYNC', 'MANUAL_IMPORT') NOT NULL DEFAULT 'REALTIME',
    MODIFY `message_type` ENUM('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'LOCATION', 'CONTACT', 'STICKER', 'REACTION', 'POLL', 'UNKNOWN') NOT NULL DEFAULT 'TEXT';

-- AlterTable
ALTER TABLE `subscription_plans` ADD COLUMN `allow_history_sync` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `max_sync_messages` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `webhooks` MODIFY `max_attempts` INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE `whatsapp_instances` ADD COLUMN `auto_reply_enabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `auto_reply_max_per_hour` INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN `history_sync_progress` JSON NULL,
    ADD COLUMN `history_sync_status` ENUM('IDLE', 'SYNCING', 'COMPLETED', 'FAILED', 'PARTIAL') NOT NULL DEFAULT 'IDLE',
    ADD COLUMN `last_history_sync_at` DATETIME(3) NULL,
    ADD COLUMN `sync_history_on_connect` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX `idx_message_conversations` ON `messages`(`organization_id`, `chat_jid`, `instance_id`, `created_at`);

-- CreateIndex
CREATE INDEX `idx_message_autoreply_ratelimit` ON `messages`(`instance_id`, `direction`, `created_at`);

-- CreateIndex
CREATE INDEX `idx_message_sync_query` ON `messages`(`instance_id`, `source`, `created_at`);

-- CreateIndex
CREATE UNIQUE INDEX `messages_wa_message_id_instance_id_key` ON `messages`(`wa_message_id`, `instance_id`);
