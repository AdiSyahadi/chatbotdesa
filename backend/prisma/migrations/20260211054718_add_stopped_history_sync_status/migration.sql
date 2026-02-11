-- AlterTable
ALTER TABLE `whatsapp_instances` MODIFY `history_sync_status` ENUM('IDLE', 'SYNCING', 'COMPLETED', 'FAILED', 'PARTIAL', 'STOPPED') NOT NULL DEFAULT 'IDLE';
