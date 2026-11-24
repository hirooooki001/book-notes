(function () {
  const sortBooks = (arr) => arr.slice().sort((a, b) => (b.readDate || "").localeCompare(a.readDate || ""));
  const books = sortBooks(window.BOOKS || []);

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // 改行を段落・改行として表示
  const para = (s) => esc(s).split(/\n{2,}/).map((t) => `<p>${t.replace(/\n/g, "<br>")}</p>`).join("");
  const fmtDate = (d) => (d ? d.replace(/-/g, ".") : "");
  const meter = (n) => {
    const v = Math.max(0, Math.min(5, Number(n) || 0));
    return `<span class="meter" aria-label="理解度 ${v} / 5">${"●".repeat(v)}<span class="off">${"●".repeat(5 - v)}</span></span>`;
  };

  // 記事本文のHTMLを作る（記事ページと「書く」画面のプレビューで共用）
  function renderArticle(b, all) {
    const has = (s) => String(s ?? "").trim() !== "";
    const section = (num, label, html) => (html ? `
      <section class="block">
        <h3><span class="num">${num}</span>${label}</h3>
        ${html}
      </section>` : "");
    const p = (s) => (has(s) ? para(s) : "");
    const pts = (b.points || []).filter((pt) => has(pt.head) || has(pt.body));
    const points = pts.map((pt, i) => `
      <li><span class="pt-n">${i + 1}</span><div><h4>${esc(pt.head)}</h4>${para(pt.body)}</div></li>`).join("");
    const tags = (b.tags || []).filter(has);

    let pager = "";
    if (all) {
      const idx = all.findIndex((x) => x.id === b.id);
      const newer = all[idx - 1], older = all[idx + 1];
      pager = `<nav class="pager">
        ${older ? `<a href="book.html?id=${encodeURIComponent(older.id)}">← ${esc(older.title)}</a>` : "<span></span>"}
        ${newer ? `<a href="book.html?id=${encodeURIComponent(newer.id)}">${esc(newer.title)} →</a>` : "<span></span>"}
      </nav>`;
    }

    return `
      <header class="art-head">
        <div class="card-top">${has(b.category) ? `<span class="cat">${esc(b.category)}</span>` : ""}${b.sample ? '<span class="badge">サンプル</span>' : ""}</div>
        <h1>${esc(b.title) || "（タイトル未入力）"}</h1>
        <p class="meta">${[has(b.author) ? esc(b.author) : "", has(b.readDate) ? `読了 ${fmtDate(b.readDate)}` : "", `理解度 ${meter(b.understanding)}`].filter(Boolean).join(" ・ ")}</p>
        ${tags.length ? `<p class="tags">${tags.map((t) => `<span>#${esc(t)}</span>`).join("")}</p>` : ""}
      </header>
      ${has(b.oneLine) ? `<div class="oneline"><span class="label">一言でいうと</span><p>${esc(b.oneLine)}</p></div>` : ""}
      ${section("01", "なぜ読んだか", p(b.why))}
      ${section("02", "3つの要点", points ? `<ol class="points">${points}</ol>` : "")}
      ${section("03", "中学生に説明するなら", p(b.easy))}
      ${section("04", "身近な例でいうと", p(b.example))}
      ${section("05", "自分の考え", p(b.opinion))}
      ${section("06", "明日から試すこと", p(b.action))}
      ${has(b.quote) ? `<blockquote class="quote">${para(b.quote)}</blockquote>` : ""}
      ${pager}`;
  }
  window.BookNotes = { renderArticle, sortBooks, esc };

  document.querySelectorAll("#year").forEach((el) => (el.textContent = new Date().getFullYear()));

  // 自分のPCでサーバーを動かしている時だけ「書く」リンクを出す
  const writeLink = document.getElementById("write-link");
  if (writeLink) {
    fetch("api/ping", { cache: "no-store" })
      .then((r) => r.ok && r.json())
      .then((j) => {
        if (!(j && j.ok)) return;
        writeLink.hidden = false;
        const id = new URLSearchParams(location.search).get("id");
        const back = document.querySelector(".back");
        if (id && back && books.some((x) => x.id === id)) {
          back.insertAdjacentHTML("afterend", ` <a class="back edit" href="write.html?id=${encodeURIComponent(id)}">✎ この記事を編集</a>`);
        }
      })
      .catch(() => {});
  }

  /* ---------- 一覧ページ ---------- */
  const list = document.getElementById("list");
  if (list) {
    const search = document.getElementById("search");
    const chips = document.getElementById("chips");
    const empty = document.getElementById("empty");
    let active = "すべて";

    const real = books.filter((b) => !b.sample);
    document.getElementById("stats").innerHTML =
      `<span><strong>${real.length}</strong> 冊</span>` +
      `<span><strong>${new Set(real.map((b) => b.category)).size}</strong> ジャンル</span>`;

    const cats = ["すべて", ...new Set(books.map((b) => b.category).filter(Boolean))];
    chips.innerHTML = cats.map((c) => `<button class="chip" data-cat="${esc(c)}">${esc(c)}</button>`).join("");
    chips.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      active = btn.dataset.cat;
      render();
    });
    search.addEventListener("input", render);

    function render() {
      const q = search.value.trim().toLowerCase();
      chips.querySelectorAll(".chip").forEach((b) => b.classList.toggle("on", b.dataset.cat === active));
      const shown = books.filter((b) => {
        if (active !== "すべて" && b.category !== active) return false;
        if (!q) return true;
        const hay = [b.title, b.author, b.oneLine, b.category, ...(b.tags || [])].join(" ").toLowerCase();
        return hay.includes(q);
      });
      list.innerHTML = shown.map((b) => `
        <a class="card" href="book.html?id=${encodeURIComponent(b.id)}">
          <div class="card-top">
            ${b.category ? `<span class="cat">${esc(b.category)}</span>` : ""}
            ${b.sample ? '<span class="badge">サンプル</span>' : ""}
          </div>
          <h2>${esc(b.title)}</h2>
          <p class="author">${esc(b.author)}</p>
          <p class="one">「${esc(b.oneLine)}」</p>
          <div class="card-foot">
            <span>${fmtDate(b.readDate)}</span>
            ${meter(b.understanding)}
          </div>
        </a>`).join("");
      empty.hidden = shown.length > 0;
    }
    render();
  }

  /* ---------- 記事ページ ---------- */
  const article = document.getElementById("article");
  if (article) {
    const id = new URLSearchParams(location.search).get("id");
    const b = books.find((x) => x.id === id);
    if (!b) {
      article.innerHTML = `<p class="empty">記事が見つかりませんでした。</p>`;
    } else {
      document.title = `${b.title} | かみくだき読書ノート`;
      article.innerHTML = renderArticle(b, books);
    }
  }
})();
