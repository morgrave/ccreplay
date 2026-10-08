export function roomURL(value: string): string {
  const url = new URL(value);
  if (
    url.origin !== "https://ccfolia.com" ||
    url.username ||
    url.password ||
    !/^\/rooms\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)
  )
    throw Error("https://ccfolia.com/rooms/방ID 형식의 주소를 입력하세요.");
  url.hash = "";
  url.search = "";
  return url.href;
}
