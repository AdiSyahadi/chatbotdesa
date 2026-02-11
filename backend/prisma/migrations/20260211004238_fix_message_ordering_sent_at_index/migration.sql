-- DropIndex
DROP INDEX `idx_message_conversations` ON `messages`;

-- CreateIndex
CREATE INDEX `messages_sent_at_idx` ON `messages`(`sent_at`);

-- CreateIndex
CREATE INDEX `idx_message_conversations` ON `messages`(`organization_id`, `chat_jid`, `instance_id`, `sent_at`);
