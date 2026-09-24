/*
 * Muhra Media Compressor
 * Everything runs in the browser. No file is uploaded anywhere.
 * Images: Canvas (resize + encode). Videos: Mediabunny (WebCodecs, hardware accelerated).
 */
// Libraries load from the local vendor/ folder first; if it is missing, a pinned CDN copy is used instead.
async function loadLib(localPath, cdnUrl) {
  try { return await import(localPath); }
  catch (e) { console.warn(`Local ${localPath} unavailable, loading from CDN.`); return await import(cdnUrl); }
}
const MB = await loadLib('./vendor/mediabunny.min.mjs', 'https://cdn.jsdelivr.net/npm/mediabunny@1.59.1/dist/bundles/mediabunny.min.mjs');
const { zipSync } = await loadLib('./vendor/fflate.mjs', 'https://cdn.jsdelivr.net/npm/fflate@0.8.3/esm/browser.js');

/* =====================================================================
   TEAM PRESETS — edit these to standardise output for everyone.
   Any setting not listed in a preset falls back to DEFAULTS below.
   ===================================================================== */
const IMAGE_PRESETS = [
  { id: 'product', en: 'Product photo (2048 px, WebP 85)', ar: 'صورة منتج (2048 بكسل، WebP 85)',
    s: { format: 'webp', quality: 85, sizeMode: 'long', maxLong: 2048 } },
  { id: 'square', en: 'Product square 1:1 (2048 × 2048)', ar: 'منتج مربع 1:1 (2048 × 2048)',
    s: { format: 'webp', quality: 85, sizeMode: 'exact', exactW: 2048, exactH: 2048, fit: 'contain', bg: '#ffffff' } },
  { id: 'portrait', en: 'Portrait 4:5 (1600 × 2000)', ar: 'طولي 4:5 (1600 × 2000)',
    s: { format: 'webp', quality: 85, sizeMode: 'exact', exactW: 1600, exactH: 2000, fit: 'cover' } },
  { id: 'banner', en: 'Homepage banner (2560 wide, max 600 KB)', ar: 'بانر الصفحة الرئيسية (عرض 2560، حد 600 KB)',
    s: { format: 'webp', quality: 85, sizeMode: 'width', width: 2560, targetKB: 600, minQuality: 65 } },
  { id: 'collection', en: 'Collection / blog image (1600 px, max 300 KB)', ar: 'صورة تصنيف أو مدونة (1600 بكسل، حد 300 KB)',
    s: { format: 'webp', quality: 82, sizeMode: 'long', maxLong: 1600, targetKB: 300, minQuality: 65 } },
  { id: 'jpeg', en: 'Classic JPEG (2048 px, quality 86)', ar: 'JPEG تقليدي (2048 بكسل، جودة 86)',
    s: { format: 'jpeg', quality: 86, sizeMode: 'long', maxLong: 2048 } },
  { id: 'png', en: 'Logo / transparent PNG (lossless)', ar: 'شعار أو PNG شفاف (بدون فقد)',
    s: { format: 'png', sizeMode: 'none' } },
];

const VIDEO_PRESETS = [
  { id: 'product', en: 'Product video 1080p (H.264, 5 Mbps)', ar: 'فيديو منتج 1080p (H.264، 5 Mbps)',
    s: { container: 'mp4', codec: 'avc', rateMode: 'bitrate', bitrateMbps: 5, sizeMode: 'long', maxLong: 1920, audio: 'reencode', audioKbps: 128 } },
  { id: 'vertical', en: 'Vertical 9:16 (1080 × 1920, 6 Mbps)', ar: 'طولي 9:16 (1080 × 1920، 6 Mbps)',
    s: { container: 'mp4', codec: 'avc', rateMode: 'bitrate', bitrateMbps: 6, sizeMode: 'exact', exactW: 1080, exactH: 1920, fit: 'cover', audio: 'reencode', audioKbps: 128 } },
  { id: 'hero', en: 'Background / hero loop (1080p, 3 Mbps, no audio)', ar: 'خلفية متحركة (1080p، 3 Mbps، بدون صوت)',
    s: { container: 'mp4', codec: 'avc', rateMode: 'bitrate', bitrateMbps: 3, sizeMode: 'long', maxLong: 1920, fps: 30, audio: 'remove' } },
  { id: 'light', en: 'Light 720p (2.5 Mbps)', ar: 'خفيف 720p (2.5 Mbps)',
    s: { container: 'mp4', codec: 'avc', rateMode: 'bitrate', bitrateMbps: 2.5, sizeMode: 'long', maxLong: 1280, audio: 'reencode', audioKbps: 96 } },
  { id: 'size', en: 'Fit a size (max 20 MB per video)', ar: 'حجم محدد (20 ميجا لكل فيديو)',
    s: { container: 'mp4', codec: 'avc', rateMode: 'size', targetMB: 20, sizeMode: 'long', maxLong: 1920, audio: 'reencode', audioKbps: 128 } },
];

const DEFAULTS = {
  image: { format: 'webp', quality: 85, sizeMode: 'long', maxLong: 2048, width: 2048, height: 2048, exactW: 2048, exactH: 2048,
           fit: 'cover', noUpscale: true, targetKB: 0, minQuality: 65, sharpen: 0, bg: '#ffffff', transparent: true, keepIfLarger: true },
  video: { container: 'mp4', codec: 'avc', rateMode: 'bitrate', quality: 75, bitrateMbps: 5, targetMB: 20, sizeMode: 'long', maxLong: 1920,
           exactW: 1080, exactH: 1920, fit: 'cover', noUpscale: true, fps: 0, audio: 'reencode', audioKbps: 128, keepIfLarger: true },
  naming: { pattern: '{name}', clean: true },
  imagePreset: 'product',
  videoPreset: 'product',
};

/* ===================================================================== */

const STORE_KEY = 'muhra-media-compressor:v1';
const LANG_KEY = 'muhra-media-compressor:lang';
const SHOPIFY = { imgBytes: 20 * 1024 * 1024, imgSide: 5000, imgMP: 25e6, vidBytes: 1024 ** 3, vidSeconds: 600, vidLong: 4096, vidShort: 2160 };

/* ------------------------------ i18n --------------------------------- */
const T = {
  en: {
    appTitle: 'Muhra Media Compressor',
    appSub: 'Compress images and videos for Shopify. Files never leave this device.',
    noVideoSupport: 'This browser cannot compress video. Use the latest Chrome or Edge on a computer. Image compression still works.',
    tabImages: 'Images', tabVideos: 'Videos', tabNames: 'File names',
    preset: 'Preset', custom: 'Custom settings',
    format: 'Output format', fmtWebp: 'WebP (recommended)', fmtJpeg: 'JPEG', fmtAvif: 'AVIF', fmtPng: 'PNG (lossless)', fmtOriginal: 'Same as original',
    unsupported: 'not supported in this browser',
    fmtFallback: 'This browser cannot create {fmt} files. They will be saved as JPEG. Use Chrome or Edge to get {fmt}.',
    quality: 'Quality', qualityHint: '80–90 looks professional for product photos. Below 70 may show artifacts.',
    resize: 'Resize', rzNone: 'Keep original dimensions', rzLong: 'Limit longest side', rzWidth: 'Set width', rzHeight: 'Set height', rzExact: 'Exact size (width × height)',
    longSide: 'Longest side', width: 'Width', height: 'Height', dimensions: 'Dimensions',
    fitCover: 'Fill and crop edges (no bars)', fitContain: 'Fit whole image (add background)',
    fitCoverV: 'Fill and crop edges (no bars)', fitContainV: 'Fit whole video (black bars)',
    noUpscale: 'Never enlarge smaller images', noUpscaleV: 'Never enlarge smaller videos',
    targetKB: 'Maximum file size', targetKBHint: '0 = off. When set, quality is lowered only as much as needed to fit.',
    minQuality: 'Never go below quality',
    sharpen: 'Sharpen after resize', sharpenHint: '10–25 restores crispness to fabric detail after downsizing. 0 = off.',
    background: 'Background color', bgHint: 'Used for JPEG and for padding in “Fit whole image”.',
    keepTransparent: 'Keep transparency (WebP, PNG, AVIF)',
    keepIfLarger: 'If the result is bigger than the original, keep the original',
    imgShopifyHint: 'Shopify accepts images up to 20 MB and 5000 × 5000 px, and serves them to shoppers in modern formats automatically. 2048 px is the sweet spot for product photos.',
    container: 'File type', codec: 'Codec', cAvc: 'H.264 (most compatible)', cHevc: 'H.265 / HEVC', cVp9: 'VP9', cAv1: 'AV1',
    codecHint: 'For Shopify product videos use MP4 + H.264. Shopify re-streams uploads at 480p–1080p.',
    codecUnsupported: '{codec} encoding is not available in this browser. Choose another codec or use Chrome/Edge.',
    webmCodec: 'WebM supports VP9 and AV1 only. VP9 will be used.',
    webmShopify: 'Shopify product videos must be MP4 or MOV. Use WebM only for theme or custom sections.',
    rateMode: 'Compression control', rmBitrate: 'Bitrate (predictable quality)', rmQuality: 'Quality level', rmSize: 'Target file size',
    bitrate: 'Video bitrate', bitrateHint: '1080p: 4–6 Mbps looks sharp. 720p: 2–3 Mbps. Vertical 1080×1920: 5–7 Mbps.',
    vQualityHint: 'File size varies with the content. 70–85 is a good range.',
    targetMB: 'Target size per video', targetMBHint: "The bitrate is calculated from each video's length. Results land within a few percent.",
    fps: 'Frame rate', fpsKeep: 'Keep original', fps60: 'Max 60 fps', fps30: 'Max 30 fps', fps25: 'Max 25 fps', fps24: 'Max 24 fps',
    audio: 'Audio', auRe: 'Compress audio', auKeep: 'Keep original audio', auRemove: 'Remove audio', audioBitrate: 'Audio bitrate',
    vidShopifyHint: 'Shopify accepts videos up to 1 GB, 10 minutes and 4K. Videos are processed one at a time; keep this tab open.',
    namePattern: 'File name pattern',
    tokensHint: '{name} original name, {w} width, {h} height, {n} position in the list. The extension is added automatically.',
    cleanNames: 'Clean names for Shopify (lowercase, hyphens instead of spaces, no symbols)', example: 'Example',
    dropTitle: 'Drop images and videos here', dropSub: 'or click to choose files. JPG, PNG, WebP, AVIF, GIF, MP4, MOV, WebM.',
    tFiles: 'files', tBefore: 'before', tAfter: 'after', tSaved: 'saved',
    compress: 'Compress', compressN: 'Compress {n} files', compressAgain: 'Compress again', stop: 'Stop',
    downloadZip: 'Download all (ZIP)', saveFolder: 'Save to folder', clear: 'Clear list',
    stale: 'Settings changed. Press Compress to apply them to all files.',
    emptyTitle: 'No files yet.', emptySub: 'Choose a preset, add your files, then press Compress.',
    foot: 'All processing happens in your browser. Best in Chrome or Edge on a computer.',
    stReady: 'Ready', stQueued: 'Waiting', stWorking: 'Working', stDone: 'Done', stError: 'Failed', stCanceled: 'Stopped',
    pass: 'pass {n}',
    download: 'Download', compare: 'Compare', remove: 'Remove', retry: 'Retry',
    before: 'Original', after: 'Compressed',
    zipping: 'Preparing ZIP…', saving: 'Saving…', savedTo: '{n} files saved to the folder.',
    zipTooBig: 'Too much data for one ZIP in the browser. Use “Save to folder” or download files one by one.',
    errDecode: 'This file could not be read as an image.',
    errHeic: 'This browser cannot read HEIC photos. Open the tool in Safari, or export the photo as JPEG first.',
    errCanvas: 'The image is too large for this device to process. Try a smaller size setting.',
    errEncode: 'The browser could not create the {fmt} file.',
    errNoVideo: 'No video track was found in this file.',
    errVideoRead: 'This video format could not be read.',
    errVideoDecode: 'This browser cannot decode {codec} video. Try Chrome or Edge, or re-export the video as H.264 MP4.',
    errCodec: '{codec} encoding at {w} × {h} is not available on this device. Lower the resolution or pick another codec.',
    errConv: 'The video could not be converted ({why}).',
    errDuration: 'The video length could not be determined, so a target size cannot be used. Use Bitrate instead.',
    errTargetTooSmall: 'The target size is too small for this video length. Allow at least {min}.',
    errNoVideoSupport: 'Video compression is not supported in this browser.',
    errMemory: 'The device ran out of memory. Process fewer or shorter videos at a time.',
    noteGif: 'Animated GIF: only the first frame is kept.',
    noteKept: 'Original kept: it was already smaller.',
    noteLarger: 'The result is larger than the original.',
    noteTargetMissed: 'Could not reach the size limit even at quality {q}.',
    noteTargetHit: 'Quality {q} used to fit the size limit.',
    noteFmtFallback: 'Saved as JPEG: this browser cannot create {fmt}.',
    noteToJpeg: 'Original format cannot be written by the browser; saved as JPEG.',
    noteAudioDropped: 'Audio was removed: it could not be processed in this browser.',
    noteOpus: 'Audio saved as Opus (AAC is not available in this browser). Use Chrome or Edge for AAC.',
    noteVidTarget: 'The file is a little over the target size.',
    noteShopifyImg: 'Above Shopify\u2019s image limit (20 MB / 5000 px). Lower the size.',
    noteShopifyVid: 'Above Shopify\u2019s video limit (1 GB, 10 min, 4K).',
    noteWebm: 'WebM is not accepted for Shopify product videos.',
    noteFps: 'Frame rate reduced to {fps} fps.',
    close: 'Close',
    confirmClear: 'Remove all files from the list?',
    busyLeave: 'Files are still being processed. Leave anyway?',
  },
  ar: {
    appTitle: 'ضاغط الوسائط – مُهرة',
    appSub: 'ضغط الصور والفيديوهات لمتجر شوبيفاي. الملفات لا تغادر جهازك.',
    noVideoSupport: 'هذا المتصفح لا يدعم ضغط الفيديو. استخدم أحدث إصدار من Chrome أو Edge على الكمبيوتر. ضغط الصور يعمل بشكل طبيعي.',
    tabImages: 'الصور', tabVideos: 'الفيديو', tabNames: 'أسماء الملفات',
    preset: 'الإعداد الجاهز', custom: 'إعدادات مخصصة',
    format: 'صيغة الملف الناتج', fmtWebp: 'WebP (موصى به)', fmtJpeg: 'JPEG', fmtAvif: 'AVIF', fmtPng: 'PNG (بدون فقد)', fmtOriginal: 'نفس صيغة الأصل',
    unsupported: 'غير مدعوم في هذا المتصفح',
    fmtFallback: 'هذا المتصفح لا يستطيع إنشاء ملفات {fmt}، وسيتم الحفظ بصيغة JPEG. استخدم Chrome أو Edge للحصول على {fmt}.',
    quality: 'الجودة', qualityHint: 'من 80 إلى 90 تعطي مظهرًا احترافيًا لصور المنتجات. أقل من 70 قد تظهر عيوب.',
    resize: 'تغيير الأبعاد', rzNone: 'الإبقاء على الأبعاد الأصلية', rzLong: 'تحديد أطول ضلع', rzWidth: 'تحديد العرض', rzHeight: 'تحديد الارتفاع', rzExact: 'مقاس ثابت (عرض × ارتفاع)',
    longSide: 'أطول ضلع', width: 'العرض', height: 'الارتفاع', dimensions: 'الأبعاد',
    fitCover: 'ملء الإطار مع قص الأطراف (بدون حواف)', fitContain: 'إظهار الصورة كاملة (مع خلفية)',
    fitCoverV: 'ملء الإطار مع قص الأطراف (بدون حواف)', fitContainV: 'إظهار الفيديو كاملًا (حواف سوداء)',
    noUpscale: 'عدم تكبير الصور الأصغر من المقاس', noUpscaleV: 'عدم تكبير الفيديوهات الأصغر من المقاس',
    targetKB: 'الحد الأقصى لحجم الملف', targetKBHint: '0 = بدون حد. عند التحديد تُخفض الجودة بالقدر اللازم فقط.',
    minQuality: 'أقل جودة مسموحة',
    sharpen: 'زيادة الحدة بعد التصغير', sharpenHint: 'من 10 إلى 25 تعيد وضوح تفاصيل القماش بعد التصغير. 0 = إيقاف.',
    background: 'لون الخلفية', bgHint: 'يُستخدم مع JPEG ومع الحواف في وضع “إظهار الصورة كاملة”.',
    keepTransparent: 'الحفاظ على الشفافية (WebP وPNG وAVIF)',
    keepIfLarger: 'إذا كان الناتج أكبر من الأصل، احتفظ بالملف الأصلي',
    imgShopifyHint: 'شوبيفاي يقبل الصور حتى 20 ميجا و5000 × 5000 بكسل، ويعرضها للعملاء بصيغ حديثة تلقائيًا. مقاس 2048 بكسل هو الأنسب لصور المنتجات.',
    container: 'نوع الملف', codec: 'الترميز', cAvc: 'H.264 (الأكثر توافقًا)', cHevc: 'H.265 / HEVC', cVp9: 'VP9', cAv1: 'AV1',
    codecHint: 'لفيديوهات المنتجات في شوبيفاي استخدم MP4 مع H.264. شوبيفاي يعرض الفيديو بجودة من 480p إلى 1080p.',
    codecUnsupported: 'ترميز {codec} غير متاح في هذا المتصفح. اختر ترميزًا آخر أو استخدم Chrome أو Edge.',
    webmCodec: 'صيغة WebM تدعم VP9 وAV1 فقط، وسيتم استخدام VP9.',
    webmShopify: 'فيديوهات المنتجات في شوبيفاي يجب أن تكون MP4 أو MOV. استخدم WebM لأقسام الثيم فقط.',
    rateMode: 'طريقة التحكم في الضغط', rmBitrate: 'معدل البت (جودة ثابتة ومتوقعة)', rmQuality: 'مستوى الجودة', rmSize: 'حجم ملف محدد',
    bitrate: 'معدل بت الفيديو', bitrateHint: '1080p: من 4 إلى 6 Mbps تعطي صورة حادة. 720p: من 2 إلى 3. الطولي 1080×1920: من 5 إلى 7.',
    vQualityHint: 'حجم الملف يختلف حسب محتوى الفيديو. من 70 إلى 85 نطاق مناسب.',
    targetMB: 'الحجم المطلوب لكل فيديو', targetMBHint: 'يُحسب معدل البت من مدة كل فيديو، والنتيجة تكون قريبة جدًا من الحجم المطلوب.',
    fps: 'عدد الإطارات', fpsKeep: 'كما في الأصل', fps60: 'حد أقصى 60 إطار', fps30: 'حد أقصى 30 إطار', fps25: 'حد أقصى 25 إطار', fps24: 'حد أقصى 24 إطار',
    audio: 'الصوت', auRe: 'ضغط الصوت', auKeep: 'الإبقاء على الصوت الأصلي', auRemove: 'حذف الصوت', audioBitrate: 'معدل بت الصوت',
    vidShopifyHint: 'شوبيفاي يقبل الفيديو حتى 1 جيجا و10 دقائق وجودة 4K. تتم معالجة الفيديوهات واحدًا تلو الآخر، اترك الصفحة مفتوحة.',
    namePattern: 'نمط اسم الملف',
    tokensHint: '{name} الاسم الأصلي، {w} العرض، {h} الارتفاع، {n} ترتيب الملف في القائمة. الامتداد يُضاف تلقائيًا.',
    cleanNames: 'تنظيف الأسماء لشوبيفاي (حروف صغيرة، شرطة بدل المسافات، بدون رموز)', example: 'مثال',
    dropTitle: 'اسحب الصور والفيديوهات إلى هنا', dropSub: 'أو اضغط لاختيار الملفات. JPG وPNG وWebP وAVIF وGIF وMP4 وMOV وWebM.',
    tFiles: 'ملفات', tBefore: 'قبل', tAfter: 'بعد', tSaved: 'توفير',
    compress: 'ابدأ الضغط', compressN: 'ضغط {n} ملف', compressAgain: 'إعادة الضغط', stop: 'إيقاف',
    downloadZip: 'تنزيل الكل (ZIP)', saveFolder: 'حفظ في مجلد', clear: 'مسح القائمة',
    stale: 'تم تغيير الإعدادات. اضغط “ابدأ الضغط” لتطبيقها على كل الملفات.',
    emptyTitle: 'لا توجد ملفات بعد.', emptySub: 'اختر إعدادًا جاهزًا، أضف ملفاتك، ثم اضغط “ابدأ الضغط”.',
    foot: 'كل المعالجة تتم داخل المتصفح. الأفضل استخدام Chrome أو Edge على الكمبيوتر.',
    stReady: 'جاهز', stQueued: 'في الانتظار', stWorking: 'جارٍ العمل', stDone: 'تم', stError: 'فشل', stCanceled: 'متوقف',
    pass: 'المحاولة {n}',
    download: 'تنزيل', compare: 'مقارنة', remove: 'حذف', retry: 'إعادة المحاولة',
    before: 'الأصل', after: 'بعد الضغط',
    zipping: 'جارٍ تجهيز ملف ZIP…', saving: 'جارٍ الحفظ…', savedTo: 'تم حفظ {n} ملف في المجلد.',
    zipTooBig: 'حجم البيانات كبير جدًا لملف ZIP واحد داخل المتصفح. استخدم “حفظ في مجلد” أو نزّل الملفات واحدًا واحدًا.',
    errDecode: 'تعذّرت قراءة الملف كصورة.',
    errHeic: 'هذا المتصفح لا يقرأ صور HEIC. افتح الأداة من Safari أو صدّر الصورة بصيغة JPEG أولًا.',
    errCanvas: 'الصورة أكبر من قدرة هذا الجهاز على المعالجة. جرّب مقاسًا أصغر.',
    errEncode: 'تعذّر على المتصفح إنشاء ملف {fmt}.',
    errNoVideo: 'لا يوجد مسار فيديو داخل هذا الملف.',
    errVideoRead: 'تعذّرت قراءة صيغة هذا الفيديو.',
    errVideoDecode: 'هذا المتصفح لا يستطيع قراءة فيديو {codec}. جرّب Chrome أو Edge، أو صدّر الفيديو بصيغة MP4 وترميز H.264.',
    errCodec: 'ترميز {codec} بمقاس {w} × {h} غير متاح على هذا الجهاز. قلّل الدقة أو اختر ترميزًا آخر.',
    errConv: 'تعذّر تحويل الفيديو ({why}).',
    errDuration: 'تعذّر تحديد مدة الفيديو، لذلك لا يمكن استخدام الحجم المحدد. استخدم معدل البت بدلًا منه.',
    errTargetTooSmall: 'الحجم المطلوب صغير جدًا بالنسبة لمدة الفيديو. اسمح بحجم {min} على الأقل.',
    errNoVideoSupport: 'ضغط الفيديو غير مدعوم في هذا المتصفح.',
    errMemory: 'نفدت ذاكرة الجهاز. عالج عددًا أقل أو فيديوهات أقصر في المرة الواحدة.',
    noteGif: 'صورة GIF متحركة: سيتم الاحتفاظ بالإطار الأول فقط.',
    noteKept: 'تم الاحتفاظ بالأصل لأنه كان أصغر بالفعل.',
    noteLarger: 'الناتج أكبر من الملف الأصلي.',
    noteTargetMissed: 'لم يمكن الوصول للحجم المطلوب حتى بجودة {q}.',
    noteTargetHit: 'تم استخدام جودة {q} للوصول للحجم المطلوب.',
    noteFmtFallback: 'تم الحفظ بصيغة JPEG لأن المتصفح لا يدعم إنشاء {fmt}.',
    noteToJpeg: 'المتصفح لا يستطيع الكتابة بصيغة الأصل، تم الحفظ بصيغة JPEG.',
    noteAudioDropped: 'تم حذف الصوت لأنه لا يمكن معالجته في هذا المتصفح.',
    noteOpus: 'تم حفظ الصوت بترميز Opus لأن AAC غير متاح في هذا المتصفح. استخدم Chrome أو Edge للحصول على AAC.',
    noteVidTarget: 'الملف أكبر قليلًا من الحجم المطلوب.',
    noteShopifyImg: 'أكبر من حد شوبيفاي للصور (20 ميجا / 5000 بكسل). قلّل المقاس.',
    noteShopifyVid: 'أكبر من حد شوبيفاي للفيديو (1 جيجا، 10 دقائق، 4K).',
    noteWebm: 'صيغة WebM غير مقبولة لفيديوهات المنتجات في شوبيفاي.',
    noteFps: 'تم خفض عدد الإطارات إلى {fps} إطار في الثانية.',
    close: 'إغلاق',
    confirmClear: 'هل تريد حذف كل الملفات من القائمة؟',
    busyLeave: 'ما زالت هناك ملفات قيد المعالجة. هل تريد المغادرة؟',
  },
};

let lang = (() => {
  try { const s = localStorage.getItem(LANG_KEY); if (s === 'ar' || s === 'en') return s; } catch {}
  return (navigator.language || '').toLowerCase().startsWith('ar') ? 'ar' : 'en';
})();

function t(key, vars) {
  let s = (T[lang] && T[lang][key]) ?? T.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/* ------------------------------ helpers ------------------------------ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

class AppError extends Error {
  constructor(key, vars) { super(key); this.key = key; this.vars = vars; }
}
class Canceled extends Error {}

function fmtBytes(n) {
  if (n == null || !isFinite(n)) return '–';
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB'];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return `${n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)} ${u[i]}`;
}
function fmtDur(s) {
  if (!isFinite(s)) return '';
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}
const even = (v) => Math.max(2, Math.round(v / 2) * 2);
const clampNum = (v, min, max) => Math.min(max, Math.max(min, v));
const uid = (() => { let i = 0; return () => `f${++i}`; })();

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ------------------------------ settings ----------------------------- */
function clone(o) { return JSON.parse(JSON.stringify(o)); }

function loadSettings() {
  const s = clone(DEFAULTS);
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      for (const sec of ['image', 'video', 'naming']) {
        if (raw[sec] && typeof raw[sec] === 'object') {
          for (const k of Object.keys(s[sec])) {
            if (k in raw[sec] && typeof raw[sec][k] === typeof s[sec][k]) s[sec][k] = raw[sec][k];
          }
        }
      }
      if (typeof raw.imagePreset === 'string') s.imagePreset = raw.imagePreset;
      if (typeof raw.videoPreset === 'string') s.videoPreset = raw.videoPreset;
    }
  } catch {}
  return s;
}
let settings = loadSettings();
function saveSettings() { try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch {} }

const getK = (k) => { const [a, b] = k.split('.'); return settings[a][b]; };
const setK = (k, v) => { const [a, b] = k.split('.'); settings[a][b] = v; };

/* ------------------------------ capabilities ------------------------- */
const caps = { webp: false, avif: false, video: false, codecs: {}, aac: false, opus: false, dir: false };

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') {
    try { const c = new OffscreenCanvas(w, h); if (c.getContext('2d')) return c; } catch {}
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function releaseCanvas(c) { try { c.width = 0; c.height = 0; } catch {} }

function encodeCanvas(c, mime, q) {
  if (typeof c.convertToBlob === 'function') return c.convertToBlob(q == null ? { type: mime } : { type: mime, quality: q });
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), mime, q));
}

async function canEncodeImage(mime) {
  try {
    const c = makeCanvas(4, 4);
    const g = c.getContext('2d');
    g.fillStyle = '#808080'; g.fillRect(0, 0, 4, 4);
    const b = await encodeCanvas(c, mime, 0.8);
    return !!b && b.type === mime;
  } catch { return false; }
}

async function detectCaps() {
  [caps.webp, caps.avif] = await Promise.all([canEncodeImage('image/webp'), canEncodeImage('image/avif')]);
  caps.dir = typeof window.showDirectoryPicker === 'function' && window.isSecureContext;
  caps.video = typeof window.VideoEncoder === 'function' && typeof window.VideoDecoder === 'function';
  if (caps.video) {
    const safe = (p) => p.then((v) => !!v).catch(() => false);
    const [avc, hevc, vp9, av1, aac, opus] = await Promise.all([
      safe(MB.canEncodeVideo('avc', { width: 1920, height: 1080 })),
      safe(MB.canEncodeVideo('hevc', { width: 1920, height: 1080 })),
      safe(MB.canEncodeVideo('vp9', { width: 1920, height: 1080 })),
      safe(MB.canEncodeVideo('av1', { width: 1920, height: 1080 })),
      safe(MB.canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: 48000 })),
      safe(MB.canEncodeAudio('opus', { numberOfChannels: 2, sampleRate: 48000 })),
    ]);
    caps.codecs = { avc, hevc, vp9, av1 };
    caps.aac = aac; caps.opus = opus;
    if (!avc && !hevc && !vp9 && !av1) caps.video = false;
  }
}

/* ------------------------------ formats ------------------------------ */
const FMT = {
  jpeg: { key: 'jpeg', mime: 'image/jpeg', ext: 'jpg', lossy: true, alpha: false, label: 'JPEG' },
  webp: { key: 'webp', mime: 'image/webp', ext: 'webp', lossy: true, alpha: true, label: 'WebP' },
  avif: { key: 'avif', mime: 'image/avif', ext: 'avif', lossy: true, alpha: true, label: 'AVIF' },
  png:  { key: 'png',  mime: 'image/png',  ext: 'png',  lossy: false, alpha: true, label: 'PNG' },
};
const MIME_TO_FMT = { 'image/jpeg': 'jpeg', 'image/jpg': 'jpeg', 'image/pjpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };
const fmtSupported = (k) => k === 'jpeg' || k === 'png' || (k === 'webp' && caps.webp) || (k === 'avif' && caps.avif);

function resolveFormat(choice, file, notes) {
  if (choice === 'original') {
    const k = MIME_TO_FMT[file.type] || MIME_TO_FMT[mimeFromName(file.name)];
    if (k && fmtSupported(k)) return FMT[k];
    notes.push({ t: 'info', k: 'noteToJpeg' });
    return FMT.jpeg;
  }
  if (fmtSupported(choice)) return FMT[choice];
  notes.push({ t: 'warn', k: 'noteFmtFallback', v: { fmt: FMT[choice].label } });
  return FMT.jpeg;
}

function mimeFromName(name) {
  const e = (name.split('.').pop() || '').toLowerCase();
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif',
    heic: 'image/heic', heif: 'image/heif', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff',
    mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', avi: 'video/x-msvideo' })[e] || '';
}
function kindOf(file) {
  const type = file.type || mimeFromName(file.name);
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  return null;
}
const isHeic = (f) => /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);

/* ------------------------------ image pipeline ----------------------- */
function planImage(sw, sh, S) {
  let sx = 0, sy = 0, sW = sw, sH = sh, cw, ch, dx = 0, dy = 0, dW, dH;
  const lim = (s) => (S.noUpscale ? Math.min(1, s) : s);
  switch (S.sizeMode) {
    case 'long': { const s = lim(S.maxLong / Math.max(sw, sh)); cw = sw * s; ch = sh * s; break; }
    case 'width': { const s = lim(S.width / sw); cw = sw * s; ch = sh * s; break; }
    case 'height': { const s = lim(S.height / sh); cw = sw * s; ch = sh * s; break; }
    case 'exact': {
      cw = S.exactW; ch = S.exactH;
      if (S.fit === 'cover') {
        const s = Math.max(cw / sw, ch / sh);
        sW = cw / s; sH = ch / s; sx = (sw - sW) / 2; sy = (sh - sH) / 2;
      } else {
        const s = Math.min(cw / sw, ch / sh);
        dW = Math.max(1, Math.round(sw * s)); dH = Math.max(1, Math.round(sh * s));
        dx = Math.round((cw - dW) / 2); dy = Math.round((ch - dH) / 2);
      }
      break;
    }
    default: cw = sw; ch = sh;
  }
  cw = Math.max(1, Math.round(cw)); ch = Math.max(1, Math.round(ch));
  if (dW === undefined) { dW = cw; dH = ch; dx = 0; dy = 0; }
  return { cw, ch, sx, sy, sW, sH, dx, dy, dW, dH };
}

// Progressive halving gives clean, alias-free downscaling on every browser.
function stepDown(src, sx, sy, sW, sH, tW, tH) {
  let cur = src, x = sx, y = sy, w = sW, h = sH;
  while (w / 2 >= tW && h / 2 >= tH) {
    const nW = Math.max(tW, Math.round(w / 2)), nH = Math.max(tH, Math.round(h / 2));
    const c = makeCanvas(nW, nH);
    const g = c.getContext('2d');
    if (!g) throw new AppError('errCanvas');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(cur, x, y, w, h, 0, 0, nW, nH);
    if (cur !== src) releaseCanvas(cur);
    cur = c; x = 0; y = 0; w = nW; h = nH;
  }
  return { src: cur, x, y, w, h };
}

function sharpen(g, x, y, w, h, amount) {
  if (w < 3 || h < 3) return;
  const a = (amount / 100) * 0.5;
  const img = g.getImageData(x, y, w, h);
  const d = img.data, s = new Uint8ClampedArray(d), row = w * 4, center = 1 + 4 * a;
  for (let j = 1; j < h - 1; j++) {
    let o = j * row + 4;
    for (let i = 1; i < w - 1; i++, o += 4) {
      d[o]     = s[o] * center     - a * (s[o - 4] + s[o + 4] + s[o - row] + s[o + row]);
      d[o + 1] = s[o + 1] * center - a * (s[o - 3] + s[o + 5] + s[o + 1 - row] + s[o + 1 + row]);
      d[o + 2] = s[o + 2] * center - a * (s[o - 2] + s[o + 6] + s[o + 2 - row] + s[o + 2 + row]);
    }
  }
  g.putImageData(img, x, y);
}

async function encodeWithTarget(c, fmt, S, notes, item) {
  if (!fmt.lossy) return { blob: await encodeCanvas(c, fmt.mime), q: null };
  const q0 = S.quality / 100;
  const first = await encodeCanvas(c, fmt.mime, q0);
  const target = S.targetKB > 0 ? S.targetKB * 1024 : 0;
  if (!target || first.size <= target) return { blob: first, q: S.quality };

  let lo = Math.min(S.minQuality, S.quality) / 100, hi = q0;
  const floor = await encodeCanvas(c, fmt.mime, lo);
  if (floor.size > target) {
    notes.push({ t: 'warn', k: 'noteTargetMissed', v: { q: Math.round(lo * 100) } });
    return { blob: floor, q: Math.round(lo * 100) };
  }
  let best = { blob: floor, q: lo };
  for (let i = 0; i < 7 && hi - lo > 0.01; i++) {
    if (item.cancelRequested) throw new Canceled();
    const mid = (lo + hi) / 2;
    const b = await encodeCanvas(c, fmt.mime, mid);
    if (b.size <= target) { best = { blob: b, q: mid }; lo = mid; } else hi = mid;
  }
  const q = Math.round(best.q * 100);
  notes.push({ t: 'info', k: 'noteTargetHit', v: { q } });
  return { blob: best.blob, q };
}

async function processImage(item, S) {
  const notes = [];
  const file = item.file;
  if (file.type === 'image/gif' || /\.gif$/i.test(file.name)) notes.push({ t: 'info', k: 'noteGif' });

  let bmp;
  try { bmp = await createImageBitmap(file); }
  catch { throw new AppError(isHeic(file) ? 'errHeic' : 'errDecode'); }

  let out = null;
  try {
    const sw = bmp.width, sh = bmp.height;
    item.origW = sw; item.origH = sh;
    const fmt = resolveFormat(S.format, file, notes);
    const p = planImage(sw, sh, S);

    const step = stepDown(bmp, p.sx, p.sy, p.sW, p.sH, p.dW, p.dH);
    out = makeCanvas(p.cw, p.ch);
    const g = out.getContext('2d');
    if (!g) throw new AppError('errCanvas');
    if (!fmt.alpha || !S.transparent) { g.fillStyle = S.bg; g.fillRect(0, 0, p.cw, p.ch); }
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(step.src, step.x, step.y, step.w, step.h, p.dx, p.dy, p.dW, p.dH);
    if (step.src !== bmp) releaseCanvas(step.src);
    if (S.sharpen > 0) sharpen(g, p.dx, p.dy, p.dW, p.dH, S.sharpen);
    if (item.cancelRequested) throw new Canceled();

    let blob, q;
    try { ({ blob, q } = await encodeWithTarget(out, fmt, S, notes, item)); }
    catch (e) { if (e instanceof Canceled) throw e; throw new AppError('errEncode', { fmt: fmt.label }); }
    if (!blob || !blob.size) throw new AppError('errEncode', { fmt: fmt.label });

    let ext = fmt.ext, w = p.cw, h = p.ch, kept = false;
    const origFmt = MIME_TO_FMT[file.type] || MIME_TO_FMT[mimeFromName(file.name)];
    if (blob.size >= file.size) {
      if (S.keepIfLarger && origFmt === fmt.key && w === sw && h === sh) {
        blob = file; kept = true; w = sw; h = sh; q = null;
        ext = (file.name.split('.').pop() || fmt.ext).toLowerCase();
        notes.push({ t: 'info', k: 'noteKept' });
      } else {
        notes.push({ t: 'warn', k: 'noteLarger' });
      }
    }
    if (blob.size > SHOPIFY.imgBytes || Math.max(w, h) > SHOPIFY.imgSide || w * h > SHOPIFY.imgMP) notes.push({ t: 'warn', k: 'noteShopifyImg' });
    return { blob, ext, w, h, q, kept, notes, mime: kept ? file.type : fmt.mime };
  } catch (e) {
    if (e instanceof AppError || e instanceof Canceled) throw e;
    throw new AppError('errCanvas');
  } finally {
    try { bmp.close(); } catch {}
    if (out) releaseCanvas(out);
  }
}

/* ------------------------------ video pipeline ----------------------- */
const CODEC_LABEL = { avc: 'H.264', hevc: 'H.265', vp9: 'VP9', av1: 'AV1', vp8: 'VP8', prores: 'ProRes' };

function planVideo(sw, sh, S) {
  let w = sw, h = sh, fit = 'cover';
  if (S.sizeMode === 'long') {
    let s = S.maxLong / Math.max(sw, sh);
    if (S.noUpscale) s = Math.min(1, s);
    w = sw * s; h = sh * s;
  } else if (S.sizeMode === 'exact') {
    w = S.exactW; h = S.exactH; fit = S.fit;
  }
  // Encoders require even dimensions; with aspect-preserving sizes, "cover" trims at most 1 px.
  return { w: even(w), h: even(h), fit };
}

async function probeVideo(file) {
  const input = new MB.Input({ source: new MB.BlobSource(file), formats: MB.ALL_FORMATS });
  try {
    let vt;
    try { vt = await input.getPrimaryVideoTrack(); } catch { throw new AppError('errVideoRead'); }
    if (!vt) throw new AppError('errNoVideo');
    if (!(await vt.canDecode())) {
      const c = await vt.getCodec().catch(() => null);
      throw new AppError('errVideoDecode', { codec: CODEC_LABEL[c] || c || '?' });
    }
    const sw = await vt.getDisplayWidth(), sh = await vt.getDisplayHeight();
    let duration = 0;
    try { duration = await input.computeDuration(); } catch {}
    let srcFps = null;
    try { const st = await vt.computePacketStats(120); srcFps = st.averagePacketRate || null; } catch {}
    const at = await input.getPrimaryAudioTrack().catch(() => null);
    let audio = null;
    if (at) {
      audio = { ch: 2, sr: 48000, bps: 0 };
      try { audio.ch = await at.getNumberOfChannels(); } catch {}
      try { audio.sr = await at.getSampleRate(); } catch {}
      try { audio.bps = (await at.computePacketStats(200)).averageBitrate || 0; } catch {}
    }
    return { sw, sh, duration, srcFps, audio };
  } finally {
    try { input.dispose(); } catch {}
  }
}

async function runConversion(item, o, notes, pass) {
  const input = new MB.Input({ source: new MB.BlobSource(item.file), formats: MB.ALL_FORMATS });
  const output = new MB.Output({
    format: o.container === 'webm' ? new MB.WebMOutputFormat() : new MB.Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new MB.BufferTarget(),
  });
  try {
    const video = {
      width: o.plan.w, height: o.plan.h, fit: o.plan.fit, codec: o.codec, quality: o.quality,
      forceTranscode: true, allowTransformationMetadata: false,
    };
    if (o.frameRate) video.frameRate = o.frameRate;
    const conv = await MB.Conversion.init({ input, output, tracks: 'primary', video, audio: o.audio, showWarnings: false });

    if (!conv.isValid) {
      const why = conv.discardedTracks.map((d) => `${d.track.type}: ${d.reason}`).join(', ') || 'invalid';
      throw new AppError('errConv', { why });
    }
    if (pass === 0) {
      for (const d of conv.discardedTracks) {
        if (d.reason === 'discarded_by_user') continue;
        if (d.track.isAudioTrack()) notes.push({ t: 'warn', k: 'noteAudioDropped' });
      }
    }
    if (item.cancelRequested) throw new Canceled();
    item.cancelFn = () => conv.cancel();
    conv.onProgress = (p) => { item.progress = Math.max(0, Math.min(1, p)); item.pass = pass; scheduleRowUpdate(item); };
    await conv.execute();
    const buf = output.target.buffer;
    if (!buf || !buf.byteLength) throw new AppError('errConv', { why: 'empty output' });
    return buf;
  } catch (e) {
    if (e instanceof MB.ConversionCanceledError || item.cancelRequested) throw new Canceled();
    if (e instanceof AppError || e instanceof Canceled) throw e;
    if (e && (e.name === 'RangeError' || /memory|allocation/i.test(e.message || ''))) throw new AppError('errMemory');
    throw new AppError('errConv', { why: (e && e.message) || String(e) });
  } finally {
    item.cancelFn = null;
    try { input.dispose(); } catch {}
  }
}

async function processVideo(item, S) {
  if (!caps.video) throw new AppError('errNoVideoSupport');
  const notes = [];
  const info = await probeVideo(item.file);
  item.origW = info.sw; item.origH = info.sh; item.duration = info.duration;

  const plan = planVideo(info.sw, info.sh, S);
  let codec = S.codec;
  if (S.container === 'webm' && (codec === 'avc' || codec === 'hevc')) codec = 'vp9';
  const encOK = await MB.canEncodeVideo(codec, { width: plan.w, height: plan.h }).catch(() => false);
  if (!encOK) throw new AppError('errCodec', { codec: CODEC_LABEL[codec], w: plan.w, h: plan.h });

  let frameRate;
  if (S.fps > 0 && (!info.srcFps || info.srcFps > S.fps + 0.5)) {
    frameRate = S.fps;
    if (info.srcFps) notes.push({ t: 'info', k: 'noteFps', v: { fps: S.fps } });
  }

  let audio, audioBps = 0;
  if (info.audio) {
    if (S.audio === 'remove') audio = { discard: true };
    else if (S.audio === 'keep') { audio = {}; audioBps = info.audio.bps || 160000; }
    else {
      const ac = S.container === 'webm' ? (caps.opus ? 'opus' : null) : (caps.aac ? 'aac' : caps.opus ? 'opus' : null);
      if (!ac) { audio = { discard: true }; notes.push({ t: 'warn', k: 'noteAudioDropped' }); }
      else {
        if (S.container === 'mp4' && ac === 'opus') notes.push({ t: 'warn', k: 'noteOpus' });
        const ch = Math.max(1, Math.min(2, info.audio.ch || 2));
        const sr = ac === 'opus' ? 48000 : ([44100, 48000].includes(info.audio.sr) ? info.audio.sr : 48000);
        audio = { codec: ac, quality: new MB.Quality({ bitrate: S.audioKbps * 1000 }), numberOfChannels: ch, sampleRate: sr, forceTranscode: true };
        audioBps = S.audioKbps * 1000;
      }
    }
  }

  const targetBytes = S.targetMB * 1024 * 1024;
  let vbps = 0;
  if (S.rateMode === 'size') {
    if (!info.duration || !isFinite(info.duration)) throw new AppError('errDuration');
    const overhead = 0.03; // container overhead
    vbps = Math.floor((targetBytes * 8 * (1 - overhead)) / info.duration - audioBps);
    vbps = Math.min(vbps, 60e6);
    if (vbps < 150000) {
      const minBytes = ((150000 + audioBps) * info.duration) / 8 / (1 - overhead);
      throw new AppError('errTargetTooSmall', { min: fmtBytes(Math.ceil(minBytes)) });
    }
  }
  const makeQuality = () => {
    if (S.rateMode === 'quality') return new MB.Quality({ quality: S.quality / 100 });
    if (S.rateMode === 'bitrate') return new MB.Quality({ bitrate: Math.round(S.bitrateMbps * 1e6) });
    return new MB.Quality({ bitrate: vbps });
  };

  let buf, pass = 0;
  for (;;) {
    buf = await runConversion(item, { plan, codec, frameRate, audio, quality: makeQuality(), container: S.container }, notes, pass);
    if (S.rateMode !== 'size' || buf.byteLength <= targetBytes * 1.02 || pass >= 3) break;
    const next = Math.floor(vbps * (targetBytes / buf.byteLength) * 0.93);
    if (next < 150000) break;
    vbps = next; pass++;
    item.progress = 0; scheduleRowUpdate(item);
  }
  if (S.rateMode === 'size' && buf.byteLength > targetBytes * 1.02) notes.push({ t: 'warn', k: 'noteVidTarget' });

  const mime = S.container === 'webm' ? 'video/webm' : 'video/mp4';
  let blob = new Blob([buf], { type: mime });
  let ext = S.container === 'webm' ? 'webm' : 'mp4';
  let w = plan.w, h = plan.h, kept = false;
  const srcType = item.file.type || mimeFromName(item.file.name);
  if (blob.size >= item.file.size) {
    if (S.keepIfLarger && srcType === mime) {
      blob = item.file; kept = true; w = info.sw; h = info.sh;
      ext = (item.file.name.split('.').pop() || ext).toLowerCase();
      notes.push({ t: 'info', k: 'noteKept' });
    } else notes.push({ t: 'warn', k: 'noteLarger' });
  }
  if (!kept && S.container === 'webm') notes.push({ t: 'warn', k: 'noteWebm' });
  if (blob.size > SHOPIFY.vidBytes || info.duration > SHOPIFY.vidSeconds || Math.max(w, h) > SHOPIFY.vidLong || Math.min(w, h) > SHOPIFY.vidShort) {
    notes.push({ t: 'warn', k: 'noteShopifyVid' });
  }
  return { blob, ext, w, h, kept, notes, mime: kept ? srcType : mime };
}

/* ------------------------------ naming ------------------------------- */
function cleanName(s) {
  const r = s.normalize('NFKC').toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}\-.]+/gu, '')
    .replace(/\.+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return r || 'file';
}
function safeName(s) {
  const r = s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/^\.+/, '').trim();
  return r || 'file';
}
function buildName(file, index, w, h, ext) {
  const base = file.name.replace(/\.[^.]+$/, '');
  let name = (settings.naming.pattern || '{name}')
    .split('{name}').join(base)
    .split('{w}').join(w ?? '')
    .split('{h}').join(h ?? '')
    .split('{n}').join(String(index + 1).padStart(2, '0'));
  name = settings.naming.clean ? cleanName(name) : safeName(name);
  return `${name}.${ext}`;
}
function uniqueNames(entries) {
  const used = new Set();
  return entries.map((e) => {
    let n = e.name;
    if (used.has(n.toLowerCase())) {
      const dot = n.lastIndexOf('.');
      const b = n.slice(0, dot), x = n.slice(dot);
      let i = 2;
      while (used.has(`${b}-${i}${x}`.toLowerCase())) i++;
      n = `${b}-${i}${x}`;
    }
    used.add(n.toLowerCase());
    return { ...e, name: n };
  });
}

/* ------------------------------ state & queue ------------------------ */
const items = [];
const running = { image: 0, video: 0 };
const LIMIT = { image: Math.max(2, Math.min(4, Math.floor((navigator.hardwareConcurrency || 4) / 2))), video: 1 };
let settingsStale = false;

function addFiles(fileList) {
  let added = 0;
  for (const file of fileList) {
    const kind = kindOf(file);
    if (!kind) continue;
    const item = { id: uid(), file, kind, status: 'ready', progress: 0, pass: 0, result: null, error: null,
      origW: null, origH: null, duration: null, thumbUrl: URL.createObjectURL(file), outUrl: null, cancelRequested: false, cancelFn: null };
    items.push(item);
    $('#list').appendChild(renderRow(item));
    added++;
  }
  if (added) { updateSummary(); if (items.some((i) => i.kind === 'video') && !caps.video) $('#noVideo').hidden = false; }
}

function pump() {
  for (const kind of ['image', 'video']) {
    while (running[kind] < LIMIT[kind]) {
      const next = items.find((i) => i.kind === kind && i.status === 'queued');
      if (!next) break;
      start(next);
    }
  }
  updateSummary();
}

async function start(item) {
  running[item.kind]++;
  item.status = 'working'; item.progress = 0; item.pass = 0; item.error = null; item.cancelRequested = false;
  const snap = clone(settings);
  updateRow(item);
  try {
    const res = item.kind === 'image' ? await processImage(item, snap.image) : await processVideo(item, snap.video);
    if (item.status === 'removed') return;
    if (item.outUrl) URL.revokeObjectURL(item.outUrl);
    item.result = res;
    item.outUrl = res.kept ? item.thumbUrl : URL.createObjectURL(res.blob);
    item.status = 'done';
  } catch (e) {
    if (item.status === 'removed') return;
    if (e instanceof Canceled || item.cancelRequested) { item.status = 'canceled'; }
    else {
      item.status = 'error';
      item.error = e instanceof AppError ? { k: e.key, v: e.vars } : { raw: (e && e.message) || String(e) };
      console.error(item.file.name, e);
    }
  } finally {
    running[item.kind]--;
    if (item.status !== 'removed') updateRow(item);
    pump();
  }
}

function runAll() {
  settingsStale = false;
  for (const i of items) {
    if (i.status === 'working' || i.status === 'queued') continue;
    i.status = 'queued'; i.progress = 0; i.cancelRequested = false;
    updateRow(i);
  }
  pump();
}

function stopAll() {
  for (const i of items) {
    if (i.status === 'queued') { i.status = 'ready'; updateRow(i); }
    else if (i.status === 'working') { i.cancelRequested = true; if (i.cancelFn) i.cancelFn(); }
  }
  updateSummary();
}

function removeItem(item) {
  if (item.status === 'working') { item.cancelRequested = true; if (item.cancelFn) item.cancelFn(); }
  item.status = 'removed';
  const idx = items.indexOf(item);
  if (idx >= 0) items.splice(idx, 1);
  if (item.outUrl && item.outUrl !== item.thumbUrl) URL.revokeObjectURL(item.outUrl);
  URL.revokeObjectURL(item.thumbUrl);
  document.getElementById(item.id)?.remove();
  updateSummary();
}

/* ------------------------------ rendering ---------------------------- */
const ICON = {
  dl: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M6 10l6 6 6-6M5 20h14"/></svg>',
  cmp: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/></svg>',
  x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  retry: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6"/></svg>',
  film: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4-2.5z" fill="currentColor"/></svg>',
  img: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-9 9"/></svg>',
};

function renderRow(item) {
  const li = document.createElement('li');
  li.className = 'item'; li.id = item.id;
  const thumb = item.kind === 'image'
    ? `<img alt="" loading="lazy" decoding="async" src="${item.thumbUrl}">`
    : `<video muted playsinline preload="metadata" src="${item.thumbUrl}#t=0.1"></video>`;
  li.innerHTML = `
    <div class="thumb">${thumb}</div>
    <div class="info"><div class="name" dir="auto"></div><div class="meta"></div><div class="notes"></div></div>
    <div class="meter"><div class="track"><div class="fill"></div></div><div class="sizes"><span class="s-l" dir="ltr"></span><span class="s-r" dir="ltr"></span></div></div>
    <div class="ops"></div>`;
  const media = li.querySelector('.thumb img, .thumb video');
  media.addEventListener('error', () => { li.querySelector('.thumb').innerHTML = item.kind === 'video' ? ICON.film : ICON.img; }, { once: true });
  li.querySelector('.name').textContent = item.file.name;
  li.querySelector('.name').title = item.file.name;
  fillRow(li, item);
  return li;
}

let rafPending = new Set();
function scheduleRowUpdate(item) {
  if (rafPending.has(item)) return;
  rafPending.add(item);
  requestAnimationFrame(() => { rafPending.delete(item); updateRow(item); });
}
function updateRow(item) {
  const li = document.getElementById(item.id);
  if (li) fillRow(li, item);
  updateSummary();
}

function fillRow(li, item) {
  const r = item.result;
  const orig = item.file.size;
  // meta line
  const parts = [];
  if (item.origW) parts.push(`${item.origW}×${item.origH}`);
  if (item.status === 'done' && r) parts.push(`→ ${r.w}×${r.h} ${r.ext.toUpperCase()}${r.q ? ` q${r.q}` : ''}`);
  if (item.duration) parts.push(fmtDur(item.duration));
  if (!parts.length) parts.push(item.kind === 'image' ? t('tabImages') : t('tabVideos'));
  li.querySelector('.meta').textContent = parts.join('  ');
  li.querySelector('.meta').setAttribute('dir', 'ltr');
  li.querySelector('.meta').style.textAlign = lang === 'ar' ? 'right' : 'left';

  // notes
  const notesEl = li.querySelector('.notes');
  notesEl.innerHTML = '';
  if (item.status === 'error' && item.error) {
    const d = document.createElement('div'); d.className = 'note bad';
    d.textContent = item.error.k ? t(item.error.k, item.error.vars || item.error.v) : item.error.raw;
    notesEl.appendChild(d);
  } else if (item.status === 'done' && r) {
    for (const n of r.notes) {
      const d = document.createElement('div'); d.className = `note ${n.t === 'warn' ? 'warn' : ''}`;
      d.textContent = t(n.k, n.v); notesEl.appendChild(d);
    }
  }

  // meter
  const fill = li.querySelector('.fill');
  const sl = li.querySelector('.s-l'), sr = li.querySelector('.s-r');
  fill.className = 'fill';
  if (item.status === 'working') {
    fill.classList.add('work');
    const p = item.kind === 'image' ? 0.5 : item.progress;
    fill.style.width = `${Math.round(p * 100)}%`;
    sl.innerHTML = `<b>${fmtBytes(orig)}</b>`;
    sr.textContent = item.kind === 'video' ? `${Math.round(item.progress * 100)}%${item.pass ? ` · ${t('pass', { n: item.pass + 1 })}` : ''}` : t('stWorking');
  } else if (item.status === 'done' && r) {
    const ratio = r.blob.size / orig;
    fill.style.width = `${Math.min(100, ratio * 100).toFixed(1)}%`;
    if (ratio > 1) fill.classList.add('over');
    const pct = Math.round((1 - ratio) * 100);
    sl.innerHTML = `${fmtBytes(orig)} → <b>${fmtBytes(r.blob.size)}</b>`;
    sr.innerHTML = r.kept ? '' : `<span class="pct ${pct >= 0 ? 'good' : 'bad'}">${pct >= 0 ? '−' : '+'}${Math.abs(pct)}%</span>`;
  } else {
    fill.style.width = '0%';
    sl.innerHTML = `<b>${fmtBytes(orig)}</b>`;
    sr.innerHTML = `<span class="status ${item.status === 'error' ? 'error' : ''}">${t({ ready: 'stReady', queued: 'stQueued', error: 'stError', canceled: 'stCanceled' }[item.status] || 'stReady')}</span>`;
  }

  // ops
  const ops = li.querySelector('.ops');
  ops.innerHTML = '';
  const btn = (icon, label, fn) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'icon-btn'; b.innerHTML = icon; b.title = label; b.setAttribute('aria-label', label);
    b.addEventListener('click', fn); ops.appendChild(b);
  };
  if (item.status === 'done' && r) {
    btn(ICON.cmp, t('compare'), () => openCompare(item));
    btn(ICON.dl, t('download'), () => downloadItem(item));
  }
  if (item.status === 'error' || item.status === 'canceled') {
    btn(ICON.retry, t('retry'), () => { item.status = 'queued'; updateRow(item); pump(); });
  }
  btn(ICON.x, t('remove'), () => removeItem(item));
}

function updateSummary() {
  const n = items.length;
  $('#bar').hidden = n === 0;
  $('#empty').hidden = n > 0;
  $('#tCount').textContent = String(n);
  const origAll = items.reduce((a, i) => a + i.file.size, 0);
  $('#tOrig').textContent = fmtBytes(origAll);
  const done = items.filter((i) => i.status === 'done' && i.result);
  if (done.length) {
    const o = done.reduce((a, i) => a + i.file.size, 0), c = done.reduce((a, i) => a + i.result.blob.size, 0);
    $('#tOut').textContent = fmtBytes(c);
    const pct = Math.round((1 - c / o) * 100);
    $('#tSaved').textContent = `${pct}%`;
  } else { $('#tOut').textContent = '–'; $('#tSaved').textContent = '–'; }

  const busy = items.some((i) => i.status === 'working' || i.status === 'queued');
  const pending = items.filter((i) => i.status !== 'done').length;
  const runBtn = $('#runBtn');
  runBtn.disabled = busy || n === 0;
  runBtn.textContent = done.length && !pending ? t('compressAgain') : n ? t('compressN', { n }) : t('compress');
  $('#stopBtn').hidden = !busy;
  $('#zipBtn').disabled = busy || done.length === 0;
  $('#folderBtn').hidden = !caps.dir;
  $('#folderBtn').disabled = busy || done.length === 0;
  $('#clearBtn').disabled = n === 0;
  $('#stale').hidden = !(settingsStale && done.length && !busy);
}

/* ------------------------------ output ------------------------------- */
function outputEntries() {
  const list = items.filter((i) => i.status === 'done' && i.result)
    .map((i) => ({ item: i, name: buildName(i.file, items.indexOf(i), i.result.w, i.result.h, i.result.ext) }));
  return uniqueNames(list);
}
function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function downloadItem(item) {
  const e = outputEntries().find((x) => x.item === item);
  if (e) triggerDownload(item.result.blob, e.name);
}
async function downloadZip() {
  const entries = outputEntries();
  if (!entries.length) return;
  const total = entries.reduce((a, e) => a + e.item.result.blob.size, 0);
  if (total > 1.8 * 1024 ** 3) { alert(t('zipTooBig')); return; }
  const btn = $('#zipBtn'); const label = btn.textContent;
  btn.disabled = true; btn.textContent = t('zipping');
  try {
    const files = {};
    for (const e of entries) files[e.name] = new Uint8Array(await e.item.result.blob.arrayBuffer());
    await new Promise((r) => setTimeout(r, 30));
    const zipped = zipSync(files, { level: 0 }); // media is already compressed; storing is fastest and lossless
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    triggerDownload(new Blob([zipped], { type: 'application/zip' }), `compressed-${stamp}.zip`);
  } catch (e) {
    console.error(e); alert(t('zipTooBig'));
  } finally { btn.textContent = label; updateSummary(); }
}
async function saveToFolder() {
  const entries = outputEntries();
  if (!entries.length) return;
  let dir;
  try { dir = await window.showDirectoryPicker({ mode: 'readwrite', id: 'muhra-compressed' }); }
  catch { return; }
  const btn = $('#folderBtn'); const label = btn.textContent;
  btn.disabled = true; btn.textContent = t('saving');
  let saved = 0;
  try {
    for (const e of entries) {
      // Never overwrite an existing file (protects originals in the same folder).
      let name = e.name, i = 2;
      const dot = name.lastIndexOf('.'), b = name.slice(0, dot), x = name.slice(dot);
      for (;;) {
        try { await dir.getFileHandle(name); name = `${b}-${i++}${x}`; }
        catch (err) { if (err && err.name === 'NotFoundError') break; throw err; }
      }
      const fh = await dir.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(e.item.result.blob);
      await w.close();
      saved++;
    }
    alert(t('savedTo', { n: saved }));
  } catch (err) {
    console.error(err); alert(`${t('savedTo', { n: saved })}\n${err && err.message ? err.message : ''}`);
  } finally { btn.textContent = label; updateSummary(); }
}

/* ------------------------------ compare dialog ----------------------- */
function openCompare(item) {
  const dlg = $('#cmpDlg'), body = $('#cmpBody');
  const r = item.result;
  $('#cmpTitle').textContent = item.file.name;
  const capL = `${t('before')}: ${fmtBytes(item.file.size)}${item.origW ? ` · ${item.origW}×${item.origH}` : ''}`;
  const capR = `${t('after')}: ${fmtBytes(r.blob.size)} · ${r.w}×${r.h}`;
  if (item.kind === 'image') {
    body.innerHTML = `
      <div class="cmp" id="cmpBox"><img alt="" src="${item.thumbUrl}"><div class="after"><img alt="" src="${item.outUrl}"></div><div class="line"></div></div>
      <div class="cmp-labels"><span></span><span></span></div>
      <input class="cmp-range" type="range" min="0" max="100" value="50" aria-label="${escapeHtml(t('compare'))}">`;
    const [l, rr] = body.querySelectorAll('.cmp-labels span');
    l.textContent = capL; rr.textContent = capR;
    const range = body.querySelector('.cmp-range'), after = body.querySelector('.after'), line = body.querySelector('.line');
    const set = (v) => { after.style.clipPath = `inset(0 0 0 ${v}%)`; line.style.left = `${v}%`; };
    range.addEventListener('input', () => set(range.value)); set(50);
    const box = body.querySelector('#cmpBox');
    const move = (ev) => { const rect = box.getBoundingClientRect(); const v = clampNum(((ev.clientX - rect.left) / rect.width) * 100, 0, 100); range.value = v; set(v); };
    box.addEventListener('pointerdown', (ev) => { box.setPointerCapture(ev.pointerId); move(ev); });
    box.addEventListener('pointermove', (ev) => { if (ev.buttons) move(ev); });
    const bimg = body.querySelector('#cmpBox > img');
    bimg.addEventListener('error', () => { box.innerHTML = `<img alt="" src="${item.outUrl}">`; range.hidden = true; }, { once: true });
  } else {
    body.innerHTML = `<div class="vids">
      <figure><video controls playsinline preload="metadata" src="${item.thumbUrl}"></video><figcaption></figcaption></figure>
      <figure><video controls playsinline preload="metadata" src="${item.outUrl}"></video><figcaption></figcaption></figure></div>`;
    const caps2 = body.querySelectorAll('figcaption'); caps2[0].textContent = capL; caps2[1].textContent = capR;
    const [va, vb] = body.querySelectorAll('video');
    va.addEventListener('play', () => { vb.currentTime = va.currentTime; vb.play().catch(() => {}); });
    va.addEventListener('pause', () => vb.pause());
    va.addEventListener('seeked', () => { vb.currentTime = va.currentTime; });
  }
  dlg.showModal();
}
function closeCompare() {
  const dlg = $('#cmpDlg');
  $$('#cmpBody video').forEach((v) => { v.pause(); v.removeAttribute('src'); v.load(); });
  $('#cmpBody').innerHTML = '';
  if (dlg.open) dlg.close();
}

/* ------------------------------ settings UI -------------------------- */
function fillPresetSelect(sel, list, currentId) {
  sel.innerHTML = '';
  for (const p of list) {
    const o = document.createElement('option'); o.value = p.id; o.textContent = p[lang] || p.en; sel.appendChild(o);
  }
  const c = document.createElement('option'); c.value = 'custom'; c.textContent = t('custom'); sel.appendChild(c);
  sel.value = list.some((p) => p.id === currentId) ? currentId : 'custom';
}
function applyPreset(section, id) {
  const list = section === 'image' ? IMAGE_PRESETS : VIDEO_PRESETS;
  const p = list.find((x) => x.id === id);
  if (!p) return;
  settings[section] = { ...clone(DEFAULTS[section]), ...clone(p.s) };
  settings[`${section}Preset`] = id;
  syncAllInputs(); onSettingsChanged();
}

function syncInput(el) {
  const v = getK(el.dataset.k);
  if (el.type === 'checkbox') el.checked = !!v;
  else el.value = String(v);
  const out = document.querySelector(`[data-out="${el.dataset.k}"]`);
  if (out) out.textContent = String(v);
}
function syncAllInputs() { $$('[data-k]').forEach(syncInput); }

function evalShow(expr) {
  const i = expr.indexOf(':');
  const v = getK(expr.slice(0, i)); const rule = expr.slice(i + 1);
  if (rule.startsWith('>')) return Number(v) > Number(rule.slice(1));
  if (rule.startsWith('!')) return !rule.slice(1).split(',').includes(String(v));
  return rule.split(',').includes(String(v));
}
function updateVisibility() { $$('[data-show]').forEach((el) => { el.hidden = !evalShow(el.dataset.show); }); }

function updateCapabilityUI() {
  // Image formats
  for (const o of $$('#imgFormat option')) {
    const k = o.value;
    const ok = k === 'original' || fmtSupported(k);
    o.textContent = t(o.dataset.i18n) + (ok ? '' : ` (${t('unsupported')})`);
  }
  const f = settings.image.format;
  const warn = $('#imgFmtWarn');
  warn.hidden = f === 'original' || fmtSupported(f);
  if (!warn.hidden) warn.textContent = t('fmtFallback', { fmt: FMT[f].label });

  // Video codecs
  for (const o of $$('#vCodec option')) {
    const ok = !caps.video ? true : !!caps.codecs[o.value];
    o.textContent = t(o.dataset.i18n) + (ok ? '' : ` (${t('unsupported')})`);
  }
  const vw = $('#vCodecWarn'); const msgs = [];
  const S = settings.video;
  if (S.container === 'webm' && (S.codec === 'avc' || S.codec === 'hevc')) msgs.push(t('webmCodec'));
  const effCodec = S.container === 'webm' && (S.codec === 'avc' || S.codec === 'hevc') ? 'vp9' : S.codec;
  if (caps.video && !caps.codecs[effCodec]) msgs.push(t('codecUnsupported', { codec: CODEC_LABEL[effCodec] }));
  if (S.container === 'webm') msgs.push(t('webmShopify'));
  vw.hidden = !msgs.length; vw.textContent = msgs.join(' ');
}

function updateNamePreview() {
  const S = settings.image;
  const fake = { name: 'Abaya Black Silk_Front 01.JPG' };
  const ext = S.format === 'original' ? 'jpg' : FMT[S.format].ext;
  $('#namePreview').textContent = buildName(fake, 0, 2048, 2048, ext);
}

function onSettingsChanged() {
  updateVisibility(); updateCapabilityUI(); updateNamePreview(); saveSettings();
  if (items.some((i) => i.status === 'done')) settingsStale = true;
  updateSummary();
}

function bindSettings() {
  for (const el of $$('[data-k]')) {
    syncInput(el);
    const isNum = el.type === 'number' || el.type === 'range' || el.hasAttribute('data-num');
    const evt = el.type === 'number' || el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(evt, () => {
      let v;
      if (el.type === 'checkbox') v = el.checked;
      else if (isNum) {
        v = parseFloat(el.value);
        if (!isFinite(v)) { syncInput(el); return; }
        const min = el.min !== '' ? parseFloat(el.min) : -Infinity, max = el.max !== '' ? parseFloat(el.max) : Infinity;
        v = clampNum(v, min, max);
        if (el.type === 'number' && el.step && el.step !== 'any' && Number(el.step) >= 1) v = Math.round(v);
        if (el.dataset.k.startsWith('video.exact')) v = even(v);
      } else v = el.value;
      setK(el.dataset.k, v);
      syncInput(el);
      const section = el.dataset.k.split('.')[0];
      if (section === 'image' || section === 'video') {
        settings[`${section}Preset`] = 'custom';
        $(section === 'image' ? '#imagePreset' : '#videoPreset').value = 'custom';
      }
      onSettingsChanged();
    });
  }
  $('#imagePreset').addEventListener('change', (e) => { if (e.target.value !== 'custom') applyPreset('image', e.target.value); });
  $('#videoPreset').addEventListener('change', (e) => { if (e.target.value !== 'custom') applyPreset('video', e.target.value); });

  $$('.token').forEach((b) => b.addEventListener('click', () => {
    const inp = $('#namePattern');
    const s = inp.selectionStart ?? inp.value.length, e = inp.selectionEnd ?? inp.value.length;
    inp.value = inp.value.slice(0, s) + b.dataset.token + inp.value.slice(e);
    inp.dispatchEvent(new Event('input')); inp.focus();
  }));
}

function bindTabs() {
  $$('.tab').forEach((tab) => tab.addEventListener('click', () => selectTab(tab.dataset.tab)));
}
function selectTab(name) {
  $$('.tab').forEach((x) => x.setAttribute('aria-selected', String(x.dataset.tab === name)));
  $$('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== name; });
}

function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.title = t('appTitle');
  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  const lb = $('#langBtn');
  lb.textContent = lang === 'ar' ? 'English' : 'العربية';
  lb.lang = lang === 'ar' ? 'en' : 'ar';
  fillPresetSelect($('#imagePreset'), IMAGE_PRESETS, settings.imagePreset);
  fillPresetSelect($('#videoPreset'), VIDEO_PRESETS, settings.videoPreset);
  updateCapabilityUI(); updateNamePreview();
  items.forEach(updateRow);
  updateSummary();
}

/* ------------------------------ file input --------------------------- */
function bindInput() {
  const drop = $('#drop'), input = $('#fileInput');
  input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });
  // Allow dropping anywhere on the page without the browser opening the file.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => { e.preventDefault(); if (!drop.contains(e.target) && e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });

  $('#runBtn').addEventListener('click', runAll);
  $('#stopBtn').addEventListener('click', stopAll);
  $('#zipBtn').addEventListener('click', downloadZip);
  $('#folderBtn').addEventListener('click', saveToFolder);
  $('#clearBtn').addEventListener('click', () => {
    if (!items.length || !confirm(t('confirmClear'))) return;
    [...items].forEach(removeItem); settingsStale = false; updateSummary();
  });
  $('#langBtn').addEventListener('click', () => {
    lang = lang === 'ar' ? 'en' : 'ar';
    try { localStorage.setItem(LANG_KEY, lang); } catch {}
    applyLang();
  });
  $('#cmpClose').addEventListener('click', closeCompare);
  $('#cmpDlg').addEventListener('close', closeCompare);
  $('#cmpDlg').addEventListener('click', (e) => { if (e.target.id === 'cmpDlg') closeCompare(); });
  window.addEventListener('beforeunload', (e) => {
    if (items.some((i) => i.status === 'working' || i.status === 'queued')) { e.preventDefault(); e.returnValue = t('busyLeave'); }
  });
}

/* ------------------------------ boot --------------------------------- */
async function boot() {
  window.__appStarted = true;
  document.getElementById('loadFail').hidden = true;
  bindTabs();
  bindSettings();
  bindInput();
  applyLang();
  updateVisibility();
  await detectCaps();
  $('#noVideo').hidden = caps.video;
  applyLang();
  updateSummary();
  // Expose a tiny read-only hook for diagnostics in the console.
  window.muhraCompressor = { caps, items, settings: () => settings };
}
boot();
