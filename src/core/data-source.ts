/** Library data lives outside the Pages application bundle. */
export function dataURL(path: string): URL {
  const configured = document.querySelector<HTMLMetaElement>(
    'meta[name="ccreplay-data-base"]',
  )?.content;
  const base = new URL(configured || "./", location.href.split("#")[0]);
  return new URL(path, base);
}
