document.getElementById("year").textContent = String(new Date().getFullYear());

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (!reduced) {
  const hero = document.querySelector(".hero-copy");
  if (hero) {
    hero.style.setProperty("--parallax", "0");
  }

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
