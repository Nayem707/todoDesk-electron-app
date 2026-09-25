import { counted, formatBytes, makeCheck, plural } from "../checks.js";
import { estimatePageWeight } from "./performance.js";

const LARGE_IMAGE_BYTES = 300 * 1024;
const MODERN_FORMAT = /\.(webp|avif)(\?|$)|image\/(webp|avif)/i;

/**
 * @param {{ facts: any, perf: any | null, responses: any[] }} ctx
 */
export function analyzeImages({ facts, perf, responses }) {
  const checks = [];
  const images = facts.images;

  if (images.length === 0) {
    checks.push(
      makeCheck({
        id: "img-none",
        title: "Images",
        status: "info",
        weight: 1,
        summary: "The page has no images.",
        why: "There's nothing to check in this category.",
      })
    );
    return checks;
  }

  const failedUrls = new Set(
    responses.filter((r) => r.type === "image" && r.status >= 400).map((r) => r.url)
  );
  const broken = images.filter(
    (img) => img.src && ((img.complete && img.naturalWidth === 0) || failedUrls.has(img.src))
  );
  checks.push(
    makeCheck({
      id: "img-broken",
      title: "Broken images",
      status: broken.length ? "critical" : "pass",
      weight: 3,
      summary: broken.length ? `${plural(broken.length, "image")} failed to load.` : "All loaded images display correctly.",
      why: "Broken images leave empty boxes or broken-image icons that look unprofessional.",
      fix: "Fix the image addresses or upload the missing files.",
      items: broken.map((img) => ({ label: img.src, detail: img.selector })),
    })
  );

  const sized = images.filter((img) => img.visible && img.displayWidth > 0 && img.naturalWidth > 0);
  const oversized = sized.filter(
    (img) => img.naturalWidth > img.displayWidth * 2 && img.naturalWidth - img.displayWidth > 400
  );
  checks.push(
    makeCheck({
      id: "img-oversized",
      title: "Properly sized images",
      status: oversized.length ? "warning" : "pass",
      weight: 2,
      summary: oversized.length
        ? `${counted(oversized.length, "image is", "images are")} much larger than the size shown on screen.`
        : "Images are sized appropriately for how they're displayed.",
      why: "Downloading a 3000-pixel photo to show it at 300 pixels wastes bandwidth and slows the page.",
      fix: "Resize images to about the displayed size (2× for sharp screens) or use srcset for responsive images.",
      items: oversized.map((img) => ({
        label: img.src,
        detail: `${img.naturalWidth}×${img.naturalHeight} shown at ${img.displayWidth}×${img.displayHeight}`,
      })),
    })
  );

  const noDimensions = images.filter((img) => img.visible && !img.hasDimensions);
  checks.push(
    makeCheck({
      id: "img-dimensions",
      title: "Image dimensions set",
      status: noDimensions.length ? "warning" : "pass",
      weight: 1,
      summary: noDimensions.length
        ? `${counted(noDimensions.length, "image has", "images have")} no width and height set.`
        : "Images reserve their space before loading.",
      why: "Without dimensions, the page jumps as each image loads (layout shift).",
      fix: "Add width and height attributes (or a CSS aspect-ratio) to every image.",
      items: noDimensions.map((img) => ({ label: img.src, detail: img.selector })),
    })
  );

  const offscreenEager = images.filter((img) => img.visible && !img.aboveFold && img.loading !== "lazy");
  checks.push(
    makeCheck({
      id: "img-lazy",
      title: "Lazy loading",
      status: offscreenEager.length > 3 ? "warning" : "pass",
      weight: 1,
      summary:
        offscreenEager.length > 3
          ? `${counted(offscreenEager.length, "image below the first screen loads", "images below the first screen load")} immediately.`
          : "Images below the first screen are lazy-loaded or few enough not to matter.",
      why: "Loading images nobody has scrolled to yet delays what visitors actually see.",
      fix: 'Add loading="lazy" to images further down the page.',
      items: offscreenEager.map((img) => ({ label: img.src, detail: img.selector })),
    })
  );

  if (perf) {
    const { resources } = estimatePageWeight(perf, responses);
    const large = resources.filter((r) => (r.type === "img" || r.type === "image" || r.type === "css") && /\.(jpe?g|png|gif|webp|avif|bmp|tiff?)(\?|$)/i.test(r.url) && r.bytes > LARGE_IMAGE_BYTES);
    checks.push(
      makeCheck({
        id: "img-large-files",
        title: "Image file sizes",
        status: large.length ? "warning" : "pass",
        weight: 2,
        summary: large.length
          ? `${counted(large.length, "image is", "images are")} over ${formatBytes(LARGE_IMAGE_BYTES)}.`
          : `No image is over ${formatBytes(LARGE_IMAGE_BYTES)}.`,
        why: "Heavy images are the most common reason pages load slowly.",
        fix: "Compress images (e.g. with Squoosh or TinyPNG) and prefer WebP/AVIF.",
        items: large.map((r) => ({ label: formatBytes(r.bytes), detail: r.url })),
      })
    );
  }

  const raster = images.filter((img) => img.src && !/\.svg(\?|$)|^data:image\/svg/i.test(img.src));
  const imageTypes = new Map(responses.filter((r) => r.type === "image").map((r) => [r.url, r.headers["content-type"] ?? ""]));
  const modern = raster.filter((img) => MODERN_FORMAT.test(img.src) || MODERN_FORMAT.test(imageTypes.get(img.src) ?? ""));
  if (raster.length >= 5) {
    checks.push(
      makeCheck({
        id: "img-modern-formats",
        title: "Modern image formats",
        status: modern.length ? "pass" : "info",
        weight: 1,
        summary: modern.length
          ? `${modern.length} of ${raster.length} images use modern formats (WebP/AVIF).`
          : "No images use modern formats like WebP or AVIF.",
        why: "WebP and AVIF are typically 25–50% smaller than JPEG/PNG at the same quality.",
        fix: "Convert photos to WebP or AVIF, keeping JPEG/PNG as a fallback if needed.",
      })
    );
  }

  return checks;
}
