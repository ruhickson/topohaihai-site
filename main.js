document.getElementById("year").textContent = String(new Date().getFullYear());

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (!reduced) {
  window.addEventListener(
    "scroll",
    () => {
      const y = Math.min(window.scrollY, 400);
      const visual = document.querySelector(".board");
      if (visual) {
        visual.style.transform = `translateY(${y * 0.12}px)`;
      }
    },
    { passive: true }
  );
}

const BSKY_HANDLE = "thhru.bsky.social";
const BSKY_LIMIT = 5;

function postUrl(uri) {
  // at://did:plc:.../app.bsky.feed.post/rkey
  const parts = uri.replace("at://", "").split("/");
  const did = parts[0];
  const rkey = parts[parts.length - 1];
  return `https://bsky.app/profile/${did}/post/${rkey}`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatRelative(iso) {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.round((now - then) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(seconds) < 60) return rtf.format(-seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(-hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return rtf.format(-days, "day");
  const months = Math.round(days / 30);
  if (Math.abs(months) < 12) return rtf.format(-months, "month");
  return rtf.format(-Math.round(months / 12), "year");
}

function renderText(record) {
  const text = record?.text || "";
  if (!text) return "";

  const facets = Array.isArray(record.facets) ? [...record.facets] : [];
  facets.sort((a, b) => a.index.byteStart - b.index.byteStart);

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const bytes = encoder.encode(text);
  let cursor = 0;
  let html = "";

  for (const facet of facets) {
    const start = facet.index.byteStart;
    const end = facet.index.byteEnd;
    if (start < cursor || end > bytes.length) continue;

    html += escapeHtml(decoder.decode(bytes.slice(cursor, start)));

    const slice = decoder.decode(bytes.slice(start, end));
    const feature = facet.features?.[0];
    if (feature?.$type === "app.bsky.richtext.facet#link" && feature.uri) {
      html += `<a href="${escapeHtml(feature.uri)}" target="_blank" rel="noopener noreferrer">${escapeHtml(slice)}</a>`;
    } else if (feature?.$type === "app.bsky.richtext.facet#mention" && feature.did) {
      html += `<a href="https://bsky.app/profile/${escapeHtml(feature.did)}" target="_blank" rel="noopener noreferrer">${escapeHtml(slice)}</a>`;
    } else if (feature?.$type === "app.bsky.richtext.facet#tag" && feature.tag) {
      html += `<a href="https://bsky.app/hashtag/${escapeHtml(feature.tag)}" target="_blank" rel="noopener noreferrer">${escapeHtml(slice)}</a>`;
    } else {
      html += escapeHtml(slice);
    }

    cursor = end;
  }

  html += escapeHtml(decoder.decode(bytes.slice(cursor)));
  return html.replace(/\n/g, "<br>");
}

function renderImages(embed) {
  if (!embed || embed.$type !== "app.bsky.embed.images#view") return "";
  const images = embed.images || [];
  if (!images.length) return "";

  return `<div class="bsky-images">${images
    .slice(0, 2)
    .map(
      (img) =>
        `<img src="${escapeHtml(img.thumb)}" alt="${escapeHtml(img.alt || "")}" loading="lazy" />`
    )
    .join("")}</div>`;
}

function renderExternal(embed) {
  if (!embed || embed.$type !== "app.bsky.embed.external#view") return "";
  const ext = embed.external;
  if (!ext?.uri) return "";

  const thumb = ext.thumb
    ? `<img src="${escapeHtml(ext.thumb)}" alt="" loading="lazy" />`
    : "";

  return `<a class="bsky-external" href="${escapeHtml(ext.uri)}" target="_blank" rel="noopener noreferrer">
    ${thumb}
    <span>
      <strong>${escapeHtml(ext.title || ext.uri)}</strong>
      ${ext.description ? `<small>${escapeHtml(ext.description)}</small>` : ""}
    </span>
  </a>`;
}

function renderPost(item) {
  const post = item.post;
  const reason = item.reason;
  const isRepost = reason?.$type === "app.bsky.feed.defs#reasonRepost";
  const author = post.author;
  const when = post.record?.createdAt || post.indexedAt;

  const meta = isRepost
    ? `<p class="bsky-meta">Reposted · ${formatRelative(reason.indexedAt || when)}</p>`
    : `<p class="bsky-meta">${formatRelative(when)}</p>`;

  const authorLine = `<p class="bsky-author">
    <span class="bsky-name">${escapeHtml(author.displayName || author.handle)}</span>
    <span class="bsky-handle">@${escapeHtml(author.handle)}</span>
  </p>`;

  return `<article class="bsky-post">
    <a class="bsky-post-link" href="${postUrl(post.uri)}" target="_blank" rel="noopener noreferrer">
      ${meta}
      ${authorLine}
      <p class="bsky-text">${renderText(post.record)}</p>
    </a>
    ${renderImages(post.embed)}
    ${renderExternal(post.embed)}
  </article>`;
}

async function loadBlueskyFeed() {
  const root = document.getElementById("bsky-feed");
  if (!root) return;

  const handle = root.dataset.handle || BSKY_HANDLE;
  const url =
    `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed` +
    `?actor=${encodeURIComponent(handle)}&limit=${BSKY_LIMIT}&filter=posts_and_author_threads`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Bluesky API ${res.status}`);
    const data = await res.json();
    const items = (data.feed || []).slice(0, BSKY_LIMIT);

    if (!items.length) {
      root.innerHTML = `<p class="bsky-status">No posts yet — <a href="https://bsky.app/profile/${escapeHtml(handle)}" target="_blank" rel="noopener noreferrer">follow @thhru on Bluesky</a>.</p>`;
      return;
    }

    root.innerHTML = items.map(renderPost).join("");
  } catch (err) {
    console.error(err);
    root.innerHTML = `<p class="bsky-status">Couldn’t load the feed. <a href="https://bsky.app/profile/${escapeHtml(handle)}" target="_blank" rel="noopener noreferrer">Open @thhru on Bluesky</a>.</p>`;
  }
}

loadBlueskyFeed();
