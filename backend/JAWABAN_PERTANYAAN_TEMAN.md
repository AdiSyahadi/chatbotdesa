Ada beberapa hal yang perlu saya sampaikan:

Bug/Info dari WA API Teman Kamu
1. Field send-text masih pakai message, bukan text
Dokumentasi baru bilang field-nya text, tapi API masih validasi message. Ini inkonsistensi di docs vs implementasi. Bukan masalah besar, CRM kita sudah handle pakai message.

2. Duplicate constraint error saat kirim pesan
Tadi saya coba kirim pesan via API dan dapat error:

Unique constraint failed on: messages_wa_message_id_instance_id_key
Ini bug di WA API side — dia gagal simpan pesan outgoing karena duplicate. Mungkin pesan sudah ada di DB tapi dia coba insert lagi. Tanyakan ke teman kamu apakah ini known issue.

3. Message type templateMessage dan placeholderMessage tidak di-handle
WA API mengirim pesan dengan type seperti templateMessage, placeholderMessage yang tidak ada di mapping. Ini bukan bug kritis — saya sudah handle di CRM dengan fallback ke OTHER.

Pertanyaan untuk Teman Kamu
Tolong tanyakan ini:

Apakah WA API mengirim webhook message.sent untuk pesan outgoing yang dikirim via API? — Karena tadi webhook yang masuk cuma message.received, saya perlu tahu apakah pesan yang kita kirim via CRM juga akan di-webhook balik supaya bisa update status di CRM.
Duplicate constraint error di messages_wa_message_id_instance_id_key — apakah ini known bug? Terjadi saat kirim pesan via /api/v1/messages/send-text.
Apakah webhook payload menyertakan phone_number? — Karena beberapa kontak pakai format @lid (JID baru WhatsApp), saya perlu phone_number di webhook payload untuk bisa identifikasi kontak. Kalau tidak ada, pesan dari kontak @lid akan di-skip.