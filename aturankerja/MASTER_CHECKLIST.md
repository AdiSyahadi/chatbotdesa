# ⛔ MASTER CHECKLIST — WAJIB BACA SETIAP SESI

**Baca file ini SEBELUM mulai kerja. Tidak ada pengecualian.**

---

# STOP GATE 1: SEBELUM MULAI KERJA

- [ ] Baca file ini sampai habis
- [ ] Identifikasi framework & version project ini
- [ ] Cek existing patterns (baca 2-3 file sejenis sebelum nulis kode baru)
- [ ] Pahami tugas: 1 kalimat, 1 objective

Jika tugas tidak bisa dijelaskan dalam 1 kalimat → TANYA USER dulu.

---

# STOP GATE 2: SEBELUM MENULIS KODE

- [ ] Baca FULL file yang akan diedit (bukan cuma 50 baris)
- [ ] Cek apakah fungsi serupa sudah ada (grep dulu)
- [ ] Hitung file yang akan berubah (>5 file → minta konfirmasi user)
- [ ] Deklarasi scope: "Saya akan ubah [file1, file2] untuk [objective]"
- [ ] Semua import ditambah SEBELUM nulis kode yang memakainya
- [ ] Semua asset/file yang direferensi SUDAH ADA

Jika file belum ada → BUAT DULU sebelum referensi.

---

# STOP GATE 3: SAAT MENULIS KODE

- [ ] Pakai pattern SAMA dengan file lain di project (bukan gaya sendiri)
- [ ] Copy-paste → review SETIAP token (nama, path, type, endpoint)
- [ ] Hooks React → SEMUA di atas, SEBELUM conditional return
- [ ] Async function → SEMUA di-await
- [ ] Buka tag/bracket → langsung tulis penutupnya
- [ ] Tidak buat abstraksi baru kalau cuma dipakai 1 tempat

---

# STOP GATE 4: SEBELUM HAPUS/RENAME KODE

- [ ] grep_search nama yang akan dihapus di SELURUH codebase
- [ ] Referensi > 0 → update SEMUA referensi DULU, baru hapus
- [ ] grep_search lagi setelah hapus → harus 0 hasil
- [ ] JANGAN hapus dulu fix belakangan. SELALU fix dulu hapus belakangan.

---

# STOP GATE 5: SETELAH MENULIS KODE

- [ ] Semua import lengkap, tidak ada yang unused
- [ ] Tidak ada hardcoded localhost/port/URL (pakai env variable)
- [ ] Tidak ada sisa copy-paste dari file lain
- [ ] Bracket/tag count: buka = tutup

---

# STOP GATE 6: SEBELUM DECLARE DONE

- [ ] `docker compose build [service]` → SUKSES
- [ ] `docker compose up -d [service]` → container jalan
- [ ] Buka browser → halaman load tanpa error
- [ ] Fitur yang diubah → berfungsi
- [ ] Fitur lama terkait → masih berfungsi
- [ ] Update patches.csv

**"Done" = build ✅ + deploy ✅ + browser ✅ + no regression ✅**
**"Code written" ≠ "Done"**

---

# STOP GATE 7: SAAT ERROR MUNCUL

- [ ] BACA pesan error LENGKAP (bukan cuma baris terakhir)
- [ ] PERTANYAAN PERTAMA: "Apa yang baru saya ubah?"
- [ ] Fix 1 error → rebuild → cek → baru fix error berikutnya
- [ ] Fix gagal → REVERT fix, bukan tumpuk fix baru
- [ ] Fix gagal 3x → STOP, revert semua, analisa ulang dari awal
- [ ] JANGAN panic-fix. READ → THINK → FIX → VERIFY.

---

# STOP GATE 8: SAAT DIMINTA AUDIT/CEK

- [ ] Setiap klaim HARUS ada evidence (file + line number)
- [ ] Setiap item dicek INDIVIDUAL (tidak boleh batch "semua done")
- [ ] Kalau tidak buka file di sesi ini → TIDAK TAHU isinya
- [ ] "Saya ingat" = TIDAK VALID. "Saya baca di line X" = VALID.

---

# STOP GATE 9: SAAT DIMINTA SARAN/IMPROVEMENT

- [ ] Baca existing code DULU sebelum suggest
- [ ] Max 3-5 saran, ranked by priority
- [ ] Setiap saran ada complexity estimate (Low/Medium/High)
- [ ] Ragu → round UP (Medium, bukan Low)
- [ ] JANGAN mulai implement sebelum user pilih mana yang mau dikerjakan

---

# 5 GOLDEN RULES (HAFAL INI)

```
1. BACA DULU, BARU KERJA         (jangan coding sebelum paham)
2. KECIL ITU BAGUS                (1 patch = 1 objective, max 5 file)
3. FIX REFERENSI DULU, HAPUS TERAKHIR  (jangan pernah terbalik)
4. BUILD SUKSES ≠ SELESAI         (wajib browser verify)
5. ERROR = BACA, BUKAN PANIC      (read → think → fix → verify)
```

---

# REFERENSI DETAIL

Jika butuh penjelasan lebih dalam, baca protocol yang relevan:

| Situasi | Baca Protocol |
|---|---|
| Core workflow & patch | `AI ENGINEERING EXECUTION PROTOCOL (STRICT MODE).md` |
| Tulis kode | `CODE_WRITING_IMPLEMENTATION.md` |
| Edit UI | `UI_UX_STRICT_MODE.md` |
| Design flow | `USER_FLOW_STRICT_MODE.md` |
| Hapus/rename kode | `DELETION_SIDE_EFFECT_SAFETY.md` |
| Referensi file/asset | `ASSET_DEPENDENCY_INTEGRITY.md` |
| Scope & komunikasi | `SCOPE_COMMUNICATION_DISCIPLINE.md` |
| Framework rules | `FRAMEWORK_CONSTRAINTS.md` |
| Error handling | `ERROR_DIAGNOSIS_RECOVERY.md` |
| Audit/explore | `AUDIT_EXPLORATION.md` |
| Saran improvement | `IMPROVEMENT_NEW_FEATURE.md` |
| Sebelum declare done | `PRE_COMMIT_SAFETY.md` |

---

**File ini adalah gerbang pertama. Kalau kamu skip file ini, semua aturan lain tidak berguna.**
