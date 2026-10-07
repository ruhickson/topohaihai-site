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

  initHeroBallPhysics();
} else {
  placeStaticHeroBalls();
}

function placeStaticHeroBalls() {
  const layer = document.getElementById("hero-balls");
  const hero = document.querySelector(".hero");
  if (!layer || !hero) return;

  const rect = hero.getBoundingClientRect();
  const size = Math.min(68, Math.max(48, rect.width * 0.07));
  const starts = [
    [0.28, 0.22],
    [0.72, 0.38],
    [0.42, 0.58],
    [0.82, 0.2],
  ];

  [...layer.querySelectorAll(".phys-ball")].forEach((el, i) => {
    const [px, py] = starts[i] || [0.5, 0.5];
    el.style.setProperty("--ball-size", `${size}px`);
    el.style.transform = `translate3d(${px * rect.width - size / 2}px, ${py * rect.height - size / 2}px, 0)`;
  });
}

function initHeroBallPhysics() {
  const hero = document.querySelector(".hero");
  const layer = document.getElementById("hero-balls");
  if (!hero || !layer) return;

  const RESTITUTION = 0.86;
  const FRICTION = 1.85; // velocity decay per second
  const STOP_SPEED = 8;
  const MAX_SPEED = 2200;
  const NUDGE_GAIN = 0.55;
  const THROW_GAIN = 1.15;
  const STARTS = [
    [0.28, 0.22],
    [0.72, 0.38],
    [0.42, 0.58],
    [0.82, 0.2],
  ];

  /** @type {{el: HTMLElement, x: number, y: number, vx: number, vy: number, r: number, held: boolean}[]} */
  const balls = [...layer.querySelectorAll(".phys-ball")].map((el, i) => ({
    el,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    r: 34,
    held: false,
    start: STARTS[i] || [0.5, 0.5],
  }));

  let width = 0;
  let height = 0;
  let running = false;
  let raf = 0;
  let lastTs = 0;
  let held = null;
  let grabDX = 0;
  let grabDY = 0;
  let pointerId = null;
  const trail = [];
  let prevPointer = null;

  function ballSize() {
    return Math.min(72, Math.max(50, width * 0.065));
  }

  function layout(resetPositions) {
    const rect = hero.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    const size = ballSize();
    const r = size / 2;

    for (const b of balls) {
      b.r = r;
      b.el.style.setProperty("--ball-size", `${size}px`);
      if (resetPositions) {
        b.x = b.start[0] * width;
        b.y = b.start[1] * height;
        b.vx = 0;
        b.vy = 0;
      }
      b.x = clamp(b.x, r, width - r);
      b.y = clamp(b.y, r, height - r);
      paint(b);
    }
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function paint(b) {
    b.el.style.transform = `translate3d(${b.x - b.r}px, ${b.y - b.r}px, 0)`;
  }

  function speed(b) {
    return Math.hypot(b.vx, b.vy);
  }

  function anyMoving() {
    return balls.some((b) => b.held || speed(b) > STOP_SPEED);
  }

  function wake() {
    if (running) return;
    running = true;
    lastTs = 0;
    raf = requestAnimationFrame(tick);
  }

  function sleepMaybe() {
    if (!anyMoving()) {
      running = false;
      for (const b of balls) {
        b.vx = 0;
        b.vy = 0;
      }
    }
  }

  function bounceWalls(b) {
    if (b.x < b.r) {
      b.x = b.r;
      b.vx = Math.abs(b.vx) * RESTITUTION;
    } else if (b.x > width - b.r) {
      b.x = width - b.r;
      b.vx = -Math.abs(b.vx) * RESTITUTION;
    }

    if (b.y < b.r) {
      b.y = b.r;
      b.vy = Math.abs(b.vy) * RESTITUTION;
    } else if (b.y > height - b.r) {
      b.y = height - b.r;
      b.vy = -Math.abs(b.vy) * RESTITUTION;
    }
  }

  function collideBalls() {
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i];
        const b = balls[j];
        if (a.held && b.held) continue;

        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        const minDist = a.r + b.r;

        if (dist === 0) {
          dx = 0.01;
          dy = 0;
          dist = 0.01;
        }

        if (dist >= minDist) continue;

        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;

        // Separate (skip moving a held ball)
        if (a.held) {
          b.x += nx * overlap;
          b.y += ny * overlap;
        } else if (b.held) {
          a.x -= nx * overlap;
          a.y -= ny * overlap;
        } else {
          a.x -= nx * overlap * 0.5;
          a.y -= ny * overlap * 0.5;
          b.x += nx * overlap * 0.5;
          b.y += ny * overlap * 0.5;
        }

        const dvx = a.vx - b.vx;
        const dvy = a.vy - b.vy;
        const impact = dvx * nx + dvy * ny;
        if (impact <= 0) continue;

        const impulse = impact * RESTITUTION;
        if (!a.held) {
          a.vx -= impulse * nx;
          a.vy -= impulse * ny;
        }
        if (!b.held) {
          b.vx += impulse * nx;
          b.vy += impulse * ny;
        }
      }
    }
  }

  function capSpeed(b) {
    const s = speed(b);
    if (s > MAX_SPEED) {
      const k = MAX_SPEED / s;
      b.vx *= k;
      b.vy *= k;
    }
  }

  function tick(ts) {
    if (!running) return;
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    dt = Math.min(dt, 0.032);

    for (const b of balls) {
      if (b.held) {
        paint(b);
        continue;
      }

      // Frame-rate independent damping
      const damp = Math.exp(-FRICTION * dt);
      b.vx *= damp;
      b.vy *= damp;

      if (speed(b) < STOP_SPEED) {
        b.vx = 0;
        b.vy = 0;
      } else {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        bounceWalls(b);
        capSpeed(b);
      }
    }

    collideBalls();

    for (const b of balls) {
      if (!b.held) bounceWalls(b);
      paint(b);
    }

    if (anyMoving()) {
      raf = requestAnimationFrame(tick);
    } else {
      running = false;
      sleepMaybe();
    }
  }

  function localPoint(e) {
    const rect = hero.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function hitBall(x, y) {
    let best = null;
    let bestDist = Infinity;
    for (const b of balls) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d <= b.r + 4 && d < bestDist) {
        best = b;
        bestDist = d;
      }
    }
    return best;
  }

  function recordTrail(x, y, t) {
    trail.push({ x, y, t });
    while (trail.length > 8) trail.shift();
  }

  function trailVelocity() {
    if (trail.length < 2) return { vx: 0, vy: 0 };
    const a = trail[0];
    const b = trail[trail.length - 1];
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0.001) return { vx: 0, vy: 0 };
    return {
      vx: ((b.x - a.x) / dt) * THROW_GAIN,
      vy: ((b.y - a.y) / dt) * THROW_GAIN,
    };
  }

  function nudgeFromPointer(x, y, vx, vy) {
    const cursorSpeed = Math.hypot(vx, vy);
    if (cursorSpeed < 40) return;

    let woke = false;
    for (const b of balls) {
      if (b.held) continue;
      const dx = b.x - x;
      const dy = b.y - y;
      const dist = Math.hypot(dx, dy);
      const reach = b.r + 18;
      if (dist > reach || dist < 0.001) continue;

      // Only nudge when cursor is moving roughly into/across the ball
      const approach = (vx * dx + vy * dy) / (cursorSpeed * dist);
      if (approach < -0.15) continue;

      const strength = (1 - dist / reach) * cursorSpeed * NUDGE_GAIN;
      b.vx += (dx / dist) * strength * 0.35 + vx * NUDGE_GAIN * 0.25;
      b.vy += (dy / dist) * strength * 0.35 + vy * NUDGE_GAIN * 0.25;
      capSpeed(b);
      woke = true;
    }
    if (woke) wake();
  }

  function onPointerDown(e) {
    if (e.target.closest("a, button, input, textarea, .bsky-feed, .hero-copy, .site-header")) {
      return;
    }
    const p = localPoint(e);
    if (p.x < 0 || p.y < 0 || p.x > width || p.y > height) return;

    const b = hitBall(p.x, p.y);
    if (!b) return;

    e.preventDefault();
    held = b;
    pointerId = e.pointerId;
    b.held = true;
    b.vx = 0;
    b.vy = 0;
    grabDX = b.x - p.x;
    grabDY = b.y - p.y;
    b.el.classList.add("is-held");
    trail.length = 0;
    recordTrail(p.x, p.y, performance.now());
    try {
      b.el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    wake();
  }

  function onPointerMove(e) {
    const p = localPoint(e);
    const now = performance.now();

    if (held && e.pointerId === pointerId) {
      held.x = clamp(p.x + grabDX, held.r, width - held.r);
      held.y = clamp(p.y + grabDY, held.r, height - held.r);
      recordTrail(p.x, p.y, now);
      paint(held);
      collideBalls();
      for (const b of balls) paint(b);
      wake();
      return;
    }

    // Cursor "hit" nudges while moving over the hero felt
    if (p.x < 0 || p.y < 0 || p.x > width || p.y > height) {
      prevPointer = null;
      return;
    }

    if (prevPointer) {
      const dt = (now - prevPointer.t) / 1000;
      if (dt > 0 && dt < 0.08) {
        const vx = (p.x - prevPointer.x) / dt;
        const vy = (p.y - prevPointer.y) / dt;
        nudgeFromPointer(p.x, p.y, vx, vy);
      }
    }
    prevPointer = { x: p.x, y: p.y, t: now };
  }

  function onPointerUp(e) {
    if (!held || e.pointerId !== pointerId) return;
    const v = trailVelocity();
    held.vx = clamp(v.vx, -MAX_SPEED, MAX_SPEED);
    held.vy = clamp(v.vy, -MAX_SPEED, MAX_SPEED);
    held.held = false;
    held.el.classList.remove("is-held");
    try {
      held.el.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    held = null;
    pointerId = null;
    trail.length = 0;
    wake();
  }

  layout(true);

  const ro = new ResizeObserver(() => layout(false));
  ro.observe(hero);

  hero.addEventListener("pointerdown", onPointerDown, { passive: false });
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
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
