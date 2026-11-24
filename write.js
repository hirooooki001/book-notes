(function () {
  const { renderArticle, sortBooks, esc } = window.BookNotes;
  let books = sortBooks(window.BOOKS || []);
  const form = document.getElementById("form");
  const pick = document.getElementById("pick");
  const status = document.getElementById("status");
  const preview = document.getElementById("preview");
  const delBtn = document.getElementById("delBtn");
  const uOut = document.getElementById("uOut");
  const DRAFT_KEY = "booknotes-draft";

  let currentId = null; // 編集中の記事ID（新規ならnull）

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const newId = (date) => `${date || today()}-${Math.random().toString(36).slice(2, 6)}`;

  // サーバー確認
  fetch("api/ping", { cache: "no-store" })
    .then((r) => r.json())
    .catch(() => null)
    .then((j) => { if (!(j && j.ok)) document.getElementById("offline").hidden = false; });

  /* ----- フォーム ⇄ データ ----- */
  function readForm() {
    const f = form.elements;
    const v = (n) => f[n].value.trim();
    return {
      id: currentId,
      title: v("title"),
      author: v("author"),
      readDate: v("readDate"),
      category: v("category"),
      tags: v("tags").split(/[,、，]/).map((t) => t.trim().replace(/^#/, "")).filter(Boolean),
      oneLine: v("oneLine"),
      why: v("why"),
      points: [1, 2, 3].map((i) => ({ head: v(`p${i}h`), body: v(`p${i}b`) })),
      easy: v("easy"),
      example: v("example"),
      opinion: v("opinion"),
      action: v("action"),
      quote: v("quote"),
      understanding: Number(f.understanding.value),
    };
  }

  function fillForm(b) {
    const f = form.elements;
    const set = (n, val) => (f[n].value = val ?? "");
    ["title", "author", "category", "oneLine", "why", "easy", "example", "opinion", "action", "quote"].forEach((n) => set(n, b[n]));
    set("readDate", b.readDate || today());
    set("tags", (b.tags || []).join(", "));
    [1, 2, 3].forEach((i) => {
      const pt = (b.points || [])[i - 1] || {};
      set(`p${i}h`, pt.head);
      set(`p${i}b`, pt.body);
    });
    set("understanding", b.understanding || 3);
    currentId = b.id || null;
    delBtn.hidden = !currentId;
    update(false);
  }

  /* ----- プレビュー・文字数 ----- */
  function update(saveDraft = true) {
    const b = readForm();
    uOut.textContent = b.understanding;
    preview.innerHTML = renderArticle(b, null);
    form.querySelectorAll("[data-limit]").forEach((el) => {
      const c = el.closest("fieldset").querySelector(".count");
      const n = [...el.value].length, lim = Number(el.dataset.limit);
      c.textContent = ` ${n} / ${lim}字`;
      c.classList.toggle("over", n > lim);
    });
    if (saveDraft) {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(b)); } catch (e) {}
      setStatus("下書き保存済み", "muted");
    }
  }
  form.addEventListener("input", () => update(true));

  function setStatus(msg, kind) {
    status.textContent = msg;
    status.className = `status ${kind || ""}`;
  }

  /* ----- 記事選択 ----- */
  function buildPicker() {
    pick.innerHTML = `<option value="">＋ 新しい記事</option>` +
      books.map((b) => `<option value="${esc(b.id)}">${esc(b.readDate || "")}　${esc(b.title)}</option>`).join("");
    pick.value = currentId || "";
    document.getElementById("cats").innerHTML =
      [...new Set(books.map((b) => b.category).filter(Boolean))].map((c) => `<option value="${esc(c)}">`).join("");
  }
  pick.addEventListener("change", () => {
    const b = books.find((x) => x.id === pick.value);
    fillForm(b || { readDate: today() });
    setStatus(b ? "既存の記事を編集中" : "新しい記事", "muted");
  });
  document.getElementById("newBtn").addEventListener("click", () => {
    fillForm({ readDate: today() });
    buildPicker();
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    setStatus("新しい記事", "muted");
    form.elements.title.focus();
  });

  /* ----- 保存 ----- */
  async function api(path, body) {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || `保存に失敗しました (${r.status})`);
    return j;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = readForm();
    if (!b.title || !b.oneLine) { setStatus("タイトルと「一言でいうと」は必須です", "err"); return; }
    if (!b.id) b.id = newId(b.readDate);
    b.points = b.points.filter((p) => p.head || p.body);
    try {
      const j = await api("api/save", b);
      books = sortBooks(j.books);
      currentId = b.id;
      delBtn.hidden = false;
      buildPicker();
      try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
      setStatus("保存しました ✓", "ok");
      status.innerHTML = `保存しました ✓ <a href="book.html?id=${encodeURIComponent(b.id)}" target="_blank">記事を見る</a>`;
    } catch (err) {
      setStatus(err.message.includes("fetch") ? "サーバーに接続できません（start.command で起動してください）" : err.message, "err");
    }
  });

  delBtn.addEventListener("click", async () => {
    if (!currentId) return;
    const b = books.find((x) => x.id === currentId);
    if (!confirm(`「${b ? b.title : currentId}」を削除します。元に戻せません。よろしいですか？`)) return;
    try {
      const j = await api("api/delete", { id: currentId });
      books = sortBooks(j.books);
      fillForm({ readDate: today() });
      buildPicker();
      setStatus("削除しました", "ok");
    } catch (err) { setStatus(err.message, "err"); }
  });

  /* ----- 初期化 ----- */
  const editId = new URLSearchParams(location.search).get("id");
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch (e) {}
  const target = editId && books.find((x) => x.id === editId);
  if (target) fillForm(target);
  else if (draft) { fillForm(draft); setStatus("前回の下書きを復元しました", "muted"); }
  else fillForm({ readDate: today() });
  buildPicker();
})();
