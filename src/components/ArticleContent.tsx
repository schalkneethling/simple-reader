import DOMPurify from "dompurify";
import { useMemo } from "react";

export interface ArticleContentProps {
  html: string;
}

const ALLOWED_TAGS: string[] = [
  "a",
  "blockquote",
  "br",
  "code",
  "em",
  "figcaption",
  "figure",
  "h2",
  "h3",
  "h4",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "ul",
];
const ALLOWED_ATTRIBUTES: string[] = ["alt", "height", "href", "src", "title", "width"];
const allowedTagNames = new Set<string>(ALLOWED_TAGS);
const allowedAttributeNames = new Set<string>(ALLOWED_ATTRIBUTES);

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      hostname.includes(".") &&
      hostname !== "localhost" &&
      !hostname.endsWith(".localhost") &&
      !hostname.endsWith(".local") &&
      !hostname.endsWith(".internal") &&
      !hostname.endsWith(".lan") &&
      !hostname.endsWith(".home") &&
      !hostname.includes(":") &&
      !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
    );
  } catch {
    return false;
  }
}

function sanitizeArticleHtml(html: string): string | null {
  const purifier = DOMPurify(window);
  if (!purifier.isSupported) return null;

  const fragment = purifier.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    ALLOWED_TAGS,
    ALLOWED_ATTR: ALLOWED_ATTRIBUTES,
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    SANITIZE_DOM: true,
  });

  const elements = fragment.querySelectorAll("*");
  for (const element of elements) {
    if (!allowedTagNames.has(element.localName)) return null;
    for (const attribute of element.attributes) {
      if (!allowedAttributeNames.has(attribute.localName)) return null;
    }
  }

  for (const link of fragment.querySelectorAll("a")) {
    const href = link.getAttribute("href");
    if (href === null || !isHttpsUrl(href)) {
      link.removeAttribute("href");
      continue;
    }
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
    link.setAttribute("referrerpolicy", "no-referrer");
  }

  for (const image of fragment.querySelectorAll("img")) {
    const src = image.getAttribute("src");
    if (src === null || !isHttpsUrl(src)) {
      image.remove();
      continue;
    }
    image.setAttribute("loading", "lazy");
    image.setAttribute("decoding", "async");
    image.setAttribute("referrerpolicy", "no-referrer");
  }

  const template = document.createElement("template");
  template.content.append(fragment);
  return template.innerHTML;
}

export function ArticleContent({ html }: ArticleContentProps) {
  const sanitizedHtml = useMemo(() => sanitizeArticleHtml(html), [html]);

  if (sanitizedHtml === null) return <div className="article-content">{html}</div>;

  return <div className="article-content" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />;
}
