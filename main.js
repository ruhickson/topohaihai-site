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
  const parts = uri.replace("at://", "").split("/");
  const did = parts[0];
  const rkey = parts[parts.length - 1];
  return `https://bsky.app/profile/${did}/post/${rkey}`;
}

function escapeHtml(text) {
  return String(text)
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

function shortHandle(handle) {
  if (!handle) return "";
  return handle.replace(/\.bsky\.social$/i, "");
}

function formatCount(n) {
  if (!n) return "0";
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`;
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
  return html.replace(/\n{2,}/g, "<br><br>").replace(/\n/g, "<br>");
}

function renderImages(embed) {
  if (!embed || embed.$type !== "app.bsky.embed.images#view") return "";
  const images = embed.images || [];
  if (!images.length) return "";

  const count = Math.min(images.length, 4);
  return `<div class="bsky-images bsky-images-${count}">${images
    .slice(0, 4)
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

  let host = "";
  try {
    host = new URL(ext.uri).hostname.replace(/^www\./, "");
  } catch {
    host = "";
  }

  const thumb = ext.thumb
    ? `<img src="${escapeHtml(ext.thumb)}" alt="" loading="lazy" />`
    : `<span class="bsky-external-fallback" aria-hidden="true"></span>`;

  return `<a class="bsky-external" href="${escapeHtml(ext.uri)}" target="_blank" rel="noopener noreferrer">
    ${thumb}
    <span class="bsky-external-copy">
      ${host ? `<em>${escapeHtml(host)}</em>` : ""}
      <strong>${escapeHtml(ext.title || ext.uri)}</strong>
      ${ext.description ? `<small>${escapeHtml(ext.description)}</small>` : ""}
    </span>
  </a>`;
}

function avatarMarkup(author) {
  const name = author.displayName || author.handle || "?";
  const initial = escapeHtml(name.trim().charAt(0).toUpperCase() || "?");
  if (author.avatar) {
    return `<img class="bsky-avatar" src="${escapeHtml(author.avatar)}" alt="" width="44" height="44" loading="lazy" />`;
  }
  return `<span class="bsky-avatar bsky-avatar-fallback" aria-hidden="true">${initial}</span>`;
}

function renderStats(post) {
  const likes = post.likeCount || 0;
  const reposts = post.repostCount || 0;
  const replies = post.replyCount || 0;
  if (!likes && !reposts && !replies) return "";

  return `<span class="bsky-stats">
    <span title="Replies">${formatCount(replies)} replies</span>
    <span title="Reposts">${formatCount(reposts)} reposts</span>
    <span title="Likes">${formatCount(likes)} likes</span>
  </span>`;
}

function renderPost(item) {
  const post = item.post;
  const reason = item.reason;
  const isRepost = reason?.$type === "app.bsky.feed.defs#reasonRepost";
  const author = post.author;
  const when = isRepost
    ? reason.indexedAt || post.record?.createdAt || post.indexedAt
    : post.record?.createdAt || post.indexedAt;
  const handle = shortHandle(author.handle);

  const repostLabel = isRepost
    ? `<p class="bsky-repost">Reposted</p>`
    : "";

  return `<article class="bsky-post">
    ${repostLabel}
    <div class="bsky-row">
      <a class="bsky-avatar-link" href="https://bsky.app/profile/${escapeHtml(author.handle)}" target="_blank" rel="noopener noreferrer">
        ${avatarMarkup(author)}
      </a>
      <div class="bsky-body">
        <header class="bsky-header">
          <div class="bsky-identity">
            <a class="bsky-name" href="https://bsky.app/profile/${escapeHtml(author.handle)}" target="_blank" rel="noopener noreferrer">${escapeHtml(author.displayName || handle)}</a>
            <span class="bsky-handle">@${escapeHtml(handle)}</span>
          </div>
          <time class="bsky-time" datetime="${escapeHtml(when)}">${escapeHtml(formatRelative(when))}</time>
        </header>
        <a class="bsky-post-link" href="${postUrl(post.uri)}" target="_blank" rel="noopener noreferrer">
          <p class="bsky-text">${renderText(post.record)}</p>
        </a>
        ${renderImages(post.embed)}
        ${renderExternal(post.embed)}
        <footer class="bsky-footer">
          ${renderStats(post)}
          <a class="bsky-open" href="${postUrl(post.uri)}" target="_blank" rel="noopener noreferrer">View</a>
        </footer>
      </div>
    </div>
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
