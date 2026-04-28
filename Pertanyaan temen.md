Berapa minimum delay antar pesan? — Instance kita di warming phase DAY_1_3. Error MSG_002 "Please wait between messages" muncul walau kita sudah kasih delay 4 detik antar pesan. Berapa detik yang aman?

Health score kontradiktif — API GET /instances menunjukkan health_score: 100, tapi error MSG_001 bilang "Health score too low". Yang mana yang benar? Kapan health score di-reset?

Beda rate limit text vs image? — Apakah send-media (image/document) punya rate limit lebih ketat dari send-text?

Ada endpoint cek cooldown? — Apakah ada API untuk cek sisa cooldown / kapan boleh kirim lagi? Supaya bot bisa await sampai waktu yang tepat daripada trial-and-error.

Warming phase bisa di-skip untuk development? — Atau ada mode "development" yang tidak kena rate limit? Karena ini menyulitkan testing.

Daily limit 1000 tapi kena limit di 76 pesan — daily_message_count: 76 dari daily_limit: 1000. Kenapa sudah dibatasi padahal masih jauh dari limit?