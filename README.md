# Muhra Media Compressor

Bulk image and video compression for the Shopify team. Everything runs inside the browser on each team member's device. No file is uploaded anywhere.

## Publish on GitHub Pages (one time)

1. Create a new repository on GitHub, for example `media-compressor`.
2. Upload **all** files and folders from this package, keeping the structure:
   ```
   index.html
   app.js
   .nojekyll
   README.md
   vendor/mediabunny.min.mjs
   vendor/fflate.mjs
   vendor/LICENSE-mediabunny.txt
   vendor/LICENSE-fflate.txt
   ```
3. Open **Settings → Pages**. Under “Build and deployment”, set Source to **Deploy from a branch**, Branch to **main**, folder **/ (root)**, then Save.
4. After about one minute the tool is live at `https://YOUR-USERNAME.github.io/media-compressor/`. Share that link with the team.

The page must be opened through a web address. Double-clicking `index.html` will not work because browsers block the video engine on `file://`.

## Run locally without GitHub (optional)

From the project folder run `python -m http.server 8080` (or `npx serve`) and open `http://localhost:8080`.

## Browser support

| Task | Chrome / Edge (computer) | Safari 16.4+ | Firefox 130+ |
|---|---|---|---|
| Images: WebP, JPEG, PNG | Yes | JPEG/PNG (WebP falls back to JPEG) | Yes |
| Images: AVIF output | Where the browser supports it | No | No |
| Videos: H.264 MP4 + AAC audio | Yes (hardware accelerated) | Yes; audio falls back to Opus if AAC is unavailable | Yes; audio falls back to Opus if AAC is unavailable |

Recommendation for the team: **Chrome or Edge on a computer**.

## Team presets

Presets live at the top of `app.js` (`IMAGE_PRESETS` and `VIDEO_PRESETS`). Edit a line, commit, and every team member gets the new preset on the next page load. Each person's last-used settings are remembered in their own browser.

## What each control does

- **Images**: format (WebP, JPEG, AVIF, PNG, same as original), quality 1–100, resize (longest side, width, height, exact size with crop or pad), maximum file size in KB with a minimum-quality floor, sharpening after resize, background color, transparency, keep-original-if-smaller.
- **Videos**: MP4 or WebM, H.264 / H.265 / VP9 / AV1, bitrate or quality level or target file size, resize (longest side or exact size), frame-rate cap, audio compress / keep / remove, keep-original-if-smaller.
- **File names**: pattern with `{name}`, `{w}`, `{h}`, `{n}`, and optional Shopify-safe cleaning.
- **Output**: per-file download, ZIP of all files, or Save to folder (Chrome/Edge). Save to folder never overwrites an existing file.

Photo orientation from phone cameras is applied automatically and metadata (including GPS location) is removed from re-encoded images. Files kept as original are untouched.

---

# ضاغط الوسائط – مُهرة

أداة لضغط الصور والفيديوهات بالجملة لفريق متجر شوبيفاي. كل المعالجة تتم داخل المتصفح على جهاز كل عضو في الفريق، ولا يتم رفع أي ملف لأي مكان.

## النشر على GitHub Pages (مرة واحدة)

1. أنشئ مستودعًا جديدًا على GitHub، مثلًا `media-compressor`.
2. ارفع **كل** الملفات والمجلدات الموجودة في الحزمة بنفس الترتيب، ومن ضمنها مجلد `vendor` كاملًا وملف `.nojekyll`.
3. افتح **Settings ثم Pages**. في قسم “Build and deployment” اختر Source: **Deploy from a branch**، والفرع **main**، والمجلد **/ (root)** ثم اضغط Save.
4. بعد دقيقة تقريبًا ستعمل الأداة على الرابط `https://اسم-المستخدم.github.io/media-compressor/`. شارك الرابط مع الفريق.

يجب فتح الأداة من الرابط. فتح ملف `index.html` بالضغط المزدوج لن يعمل لأن المتصفح يمنع محرك الفيديو في هذه الحالة.

## التشغيل المحلي بدون GitHub (اختياري)

من داخل مجلد المشروع شغّل الأمر `python -m http.server 8080` ثم افتح `http://localhost:8080`.

## المتصفحات

الأفضل للفريق: **Chrome أو Edge على الكمبيوتر**. على Safari يعمل ضغط الفيديو، لكن صيغة WebP للصور تتحول تلقائيًا إلى JPEG. إذا لم يتوفر ترميز AAC في المتصفح يُحفظ الصوت بترميز Opus تلقائيًا.

## الإعدادات الجاهزة للفريق

الإعدادات الجاهزة موجودة في أول ملف `app.js` تحت `IMAGE_PRESETS` و`VIDEO_PRESETS`. أي تعديل عليها ثم Commit يظهر لكل الفريق عند إعادة تحميل الصفحة. آخر إعدادات استخدمها كل شخص تُحفظ في متصفحه.

## طرق الحفظ

تنزيل كل ملف منفردًا، أو تنزيل الكل في ملف ZIP، أو “حفظ في مجلد” (على Chrome وEdge) مع ضمان عدم الكتابة فوق أي ملف موجود، لحماية الملفات الأصلية.

اتجاه صور الموبايل يُضبط تلقائيًا، وبيانات الصورة الوصفية (ومنها الموقع الجغرافي) تُحذف من الصور التي أُعيد ضغطها، أما الملفات المحتفظ بها كما هي فلا تتغير.

---

Libraries (bundled in `vendor/`, no CDN needed): [Mediabunny](https://mediabunny.dev) 1.59.1 (MPL-2.0), [fflate](https://github.com/101arrowz/fflate) 0.8.3 (MIT).
