/* ── Theology 11 Reviewer — App Logic ───────────────────── */

let DATA = null;
let READINGS_DATA = null;
let currentView = 'dashboard';
let flashcardIndex = 0;
let flashcardDeck = [];
let quizQuestions = [];
let quizIndex = 0;
let quizScore = 0;
let selectedQuizTopics = new Set();

// ── Init ────────────────────────────────────────────────────
async function init() {
  try {
    const [mainRes, readingsRes] = await Promise.all([
      fetch('./reviewer-data.json'),
      fetch('./readings-data.json').catch(() => null),
    ]);
    DATA = await mainRes.json();
    if (readingsRes?.ok) {
      READINGS_DATA = await readingsRes.json();
    }
    showDashboard();
  } catch (err) {
    document.getElementById('content').innerHTML = `
      <div class="loading-screen">
        <p style="color: var(--red)">Failed to load reviewer-data.json</p>
        <p style="color: var(--text-dim); font-size: 0.85rem;">Run: npm run generate-reviewer</p>
      </div>`;
  }
}

// ── Navigation ──────────────────────────────────────────────
function setActiveNav(view) {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  currentView = view;
}

// ── Dashboard View ──────────────────────────────────────────
function showDashboard() {
  setActiveNav('dashboard');
  const c = document.getElementById('content');

  let html = `
    <div class="dash-header">
      <h1>Theology 11 Reviewer</h1>
      <p>Your complete study companion</p>
      <div class="dash-stats">
        <div class="stat">
          <div class="stat-value">${DATA.stats.totalEntries}</div>
          <div class="stat-label">Entries</div>
        </div>
        <div class="stat">
          <div class="stat-value">${DATA.stats.totalGlossary}</div>
          <div class="stat-label">Glossary Terms</div>
        </div>
        <div class="stat">
          <div class="stat-value">${DATA.stats.totalTopics}</div>
          <div class="stat-label">Topics</div>
        </div>
        <div class="stat">
          <div class="stat-value">${countQuizQuestions()}</div>
          <div class="stat-label">Quiz Questions</div>
        </div>
      </div>
    </div>`;

  DATA.sets.forEach((set) => {
    html += `<div class="set-section">
      <div class="set-title">${set.code} — ${set.title}</div>
      <div class="topics-grid">`;

    set.topics.forEach((topic) => {
      const glossaryCount = topic.glossaryTerms?.length || topic.glossary?.length || 0;
      const quizCount = topic.quizQuestions?.length || 0;
      html += `
        <div class="topic-card" onclick="showTopic('${topic.slug}')">
          <h3>${topic.title}</h3>
          <div class="topic-meta">
            <span>📝 ${topic.entryCount} entries</span>
            <span>📖 ${glossaryCount} terms</span>
            ${quizCount ? `<span>❓ ${quizCount} quiz</span>` : ''}
          </div>
        </div>`;
    });

    html += `</div></div>`;
  });

  c.innerHTML = html;
}

// ── Topic View ──────────────────────────────────────────────
function showTopic(slug) {
  const topic = findTopic(slug);
  if (!topic) return;
  const set = findSetForTopic(slug);

  setActiveNav(null);
  const c = document.getElementById('content');

  // Determine glossary source (new cleaned or old raw)
  const glossary = topic.glossary || topic.glossaryTerms || [];

  let html = `
    <div class="topic-header">
      <button class="back-btn" onclick="showDashboard()">← Back</button>
      <h1>${topic.title}</h1>
      <span class="set-badge">${set.code} — ${set.title}</span>
    </div>

    <div class="topic-tabs">
      <button class="topic-tab active" onclick="switchTab(this, 'review')">📖 Full Review</button>
      <button class="topic-tab" onclick="switchTab(this, 'tips')">💡 Study Tips</button>
      <button class="topic-tab" onclick="switchTab(this, 'connections')">🔗 Connections</button>
      <button class="topic-tab" onclick="switchTab(this, 'glossary')">📚 Glossary</button>
      <button class="topic-tab" onclick="switchTab(this, 'exam')">📝 Exam Prep</button>
      <button class="topic-tab" onclick="switchTab(this, 'entries')">🗂 Raw Entries</button>
    </div>`;

  // ── Full Review panel (main content) ──
  html += `<div class="topic-content-panel active" id="panel-review">`;
  
  // Full review (new field)
  if (topic.review) {
    const paragraphs = topic.review.split('\n').filter((p) => p.trim());
    html += `<div class="review-text">${paragraphs.map((p) => `<p>${p}</p>`).join('')}</div>`;
  } else if (topic.summary) {
    // Fallback to old summary
    const paragraphs = topic.summary.split('\n').filter((p) => p.trim());
    html += `<div class="review-text">${paragraphs.map((p) => `<p>${p}</p>`).join('')}</div>`;
  }

  // Key takeaways
  if (topic.keyTakeaways?.length) {
    html += `<div class="takeaways"><h3>⚡ Key Takeaways</h3><ul>`;
    topic.keyTakeaways.forEach((t) => (html += `<li>${t}</li>`));
    html += `</ul></div>`;
  }
  html += `</div>`;

  // ── Study Tips panel ──
  html += `<div class="topic-content-panel" id="panel-tips">`;
  if (topic.studyTips?.length) {
    topic.studyTips.forEach((tip) => {
      html += `<div class="tip-card"><div class="tip-icon">💡</div><div>${tip}</div></div>`;
    });
  }
  html += `</div>`;

  // ── Connections panel (enhanced) ──
  html += `<div class="topic-content-panel" id="panel-connections">`;
  if (topic.connections?.length) {
    html += `<p style="color: var(--text-dim); margin-bottom: 16px; font-size: 0.85rem;">Click a topic to navigate — see how "${topic.title}" connects throughout the course.</p>`;
    topic.connections.forEach((conn) => {
      const connSlug = findSlugByTitle(conn.topic);
      html += `<div class="connection-card" ${connSlug ? `onclick="showTopic('${connSlug}')"` : ''}>
        <div class="connection-topic">${conn.topic} →</div>
        <div class="connection-explanation">${conn.relationship || conn.explanation || ''}</div>
        ${conn.example ? `<div class="connection-example">💬 ${conn.example}</div>` : ''}
      </div>`;
    });
  }
  html += `</div>`;

  // ── Glossary panel (uses cleaned AI glossary) ──
  html += `<div class="topic-content-panel" id="panel-glossary">`;
  if (glossary.length) {
    glossary.forEach((g) => {
      html += `<div class="glossary-card">
        <div class="glossary-term">${g.term}</div>
        <div class="glossary-def">${g.definition}</div>
      </div>`;
    });
  } else {
    html += `<p style="color: var(--text-dim)">No glossary terms for this topic.</p>`;
  }
  html += `</div>`;

  // ── Exam Prep panel ──
  html += `<div class="topic-content-panel" id="panel-exam">`;
  if (topic.examPrepQuestions?.length) {
    html += `<p style="color: var(--text-dim); margin-bottom: 16px; font-size: 0.85rem;">Practice short-answer questions. Click to reveal model answers.</p>`;
    topic.examPrepQuestions.forEach((q, i) => {
      html += `<div class="exam-card" onclick="this.classList.toggle('revealed')">
        <div class="exam-q"><span class="exam-q-num">Q${i + 1}</span> ${q.question}</div>
        <div class="exam-a"><div class="exam-a-label">Model Answer</div>${q.modelAnswer}</div>
      </div>`;
    });
  } else {
    html += `<p style="color: var(--text-dim)">No exam prep questions available. Run regeneration.</p>`;
  }
  html += `</div>`;

  // ── Raw entries panel ──
  html += `<div class="topic-content-panel" id="panel-entries">`;
  const types = [...new Set(topic.entries.map((e) => e.contentType))];
  html += `<div class="entry-filters">`;
  html += `<button class="filter-btn active" onclick="filterEntries(this, 'all')">All (${topic.entries.length})</button>`;
  types.forEach((t) => {
    const count = topic.entries.filter((e) => e.contentType === t).length;
    html += `<button class="filter-btn" onclick="filterEntries(this, '${t}')">${formatType(t)} (${count})</button>`;
  });
  html += `</div><div id="entries-list">`;
  topic.entries.forEach((e) => {
    html += renderEntry(e);
  });
  html += `</div></div>`;

  c.innerHTML = html;
  window.scrollTo(0, 0);
}

function switchTab(btn, panelId) {
  document.querySelectorAll('.topic-tab').forEach((t) => t.classList.remove('active'));
  document.querySelectorAll('.topic-content-panel').forEach((p) => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(`panel-${panelId}`).classList.add('active');
}

function filterEntries(btn, type) {
  document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  const items = document.querySelectorAll('#panel-entries .entry-item');
  items.forEach((item) => {
    if (type === 'all' || item.dataset.type === type) {
      item.style.display = '';
    } else {
      item.style.display = 'none';
    }
  });
}

function renderEntry(e) {
  return `<div class="entry-item" data-type="${e.contentType}">
    ${e.content}
    <div class="entry-badges">
      <span class="entry-badge badge-type">${formatType(e.contentType)}</span>
      <span class="entry-badge badge-source">${e.sourceType}</span>
    </div>
  </div>`;
}

// ── Flashcard Mode ──────────────────────────────────────────
function showFlashcards() {
  setActiveNav('flashcards');
  flashcardDeck = [];
  DATA.sets.forEach((set) => {
    set.topics.forEach((topic) => {
      // Use cleaned glossary if available, fallback to raw
      const glossary = topic.glossary || topic.glossaryTerms || [];
      glossary.forEach((g) => {
        flashcardDeck.push({ front: g.term, back: g.definition, topic: topic.title, type: 'term' });
      });
    });
  });
  flashcardDeck.sort(() => Math.random() - 0.5);
  flashcardIndex = 0;
  renderFlashcard();
}

function renderFlashcard() {
  const c = document.getElementById('content');
  if (flashcardDeck.length === 0) {
    c.innerHTML = `<div class="loading-screen"><p>No flashcards available.</p></div>`;
    return;
  }
  const card = flashcardDeck[flashcardIndex];
  c.innerHTML = `
    <div class="flashcard-container">
      <div class="flashcard-header">
        <h1>Flashcards</h1>
        <div class="flashcard-progress">${flashcardIndex + 1} of ${flashcardDeck.length} · ${card.topic}</div>
      </div>
      <div class="flashcard" id="flashcard" onclick="document.getElementById('flashcard').classList.toggle('flipped')">
        <div class="flashcard-inner">
          <div class="flashcard-front">
            <div class="flashcard-label">Term</div>
            <div class="flashcard-text">${card.front}</div>
            <div class="flashcard-hint">Tap to reveal</div>
          </div>
          <div class="flashcard-back">
            <div class="flashcard-label">Definition</div>
            <div class="flashcard-text" style="font-size: 1rem; font-weight: 400;">${card.back}</div>
          </div>
        </div>
      </div>
      <div class="flashcard-controls">
        <button class="fc-btn" onclick="prevFlashcard()">← Previous</button>
        <button class="fc-btn" onclick="shuffleFlashcards()">🔀 Shuffle</button>
        <button class="fc-btn primary" onclick="nextFlashcard()">Next →</button>
      </div>
    </div>`;
}

function nextFlashcard() {
  flashcardIndex = (flashcardIndex + 1) % flashcardDeck.length;
  renderFlashcard();
}

function prevFlashcard() {
  flashcardIndex = (flashcardIndex - 1 + flashcardDeck.length) % flashcardDeck.length;
  renderFlashcard();
}

function shuffleFlashcards() {
  flashcardDeck.sort(() => Math.random() - 0.5);
  flashcardIndex = 0;
  renderFlashcard();
}

// ── Quiz Mode ───────────────────────────────────────────────
function showQuiz() {
  setActiveNav('quiz');
  selectedQuizTopics.clear();
  const c = document.getElementById('content');

  let html = `
    <div class="quiz-container">
      <div class="quiz-header">
        <h1>Quiz Mode</h1>
        <p style="color: var(--text-dim)">Select topics to quiz on</p>
      </div>
      <div class="quiz-setup">
        <div class="quiz-topic-grid">
          <button class="quiz-topic-btn" onclick="toggleQuizTopic(this, 'all')">📚 All Topics</button>`;

  DATA.sets.forEach((set) => {
    set.topics.forEach((topic) => {
      if (topic.quizQuestions?.length) {
        html += `<button class="quiz-topic-btn" onclick="toggleQuizTopic(this, '${topic.slug}')">${topic.title}</button>`;
      }
    });
  });

  html += `</div>
        <button class="quiz-start-btn" onclick="startQuiz()">Start Quiz</button>
      </div>
    </div>`;

  c.innerHTML = html;
}

function toggleQuizTopic(btn, slug) {
  if (slug === 'all') {
    selectedQuizTopics.clear();
    selectedQuizTopics.add('all');
    document.querySelectorAll('.quiz-topic-btn').forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
  } else {
    selectedQuizTopics.delete('all');
    document.querySelector('.quiz-topic-btn')?.classList.remove('selected');
    if (selectedQuizTopics.has(slug)) {
      selectedQuizTopics.delete(slug);
      btn.classList.remove('selected');
    } else {
      selectedQuizTopics.add(slug);
      btn.classList.add('selected');
    }
  }
}

function startQuiz() {
  quizQuestions = [];
  DATA.sets.forEach((set) => {
    set.topics.forEach((topic) => {
      if (selectedQuizTopics.has('all') || selectedQuizTopics.has(topic.slug)) {
        (topic.quizQuestions || []).forEach((q) => {
          quizQuestions.push({ ...q, topicTitle: topic.title });
        });
      }
    });
  });

  if (quizQuestions.length === 0) {
    alert('Select at least one topic!');
    return;
  }

  quizQuestions.sort(() => Math.random() - 0.5);
  quizQuestions = quizQuestions.slice(0, 20);
  quizIndex = 0;
  quizScore = 0;
  renderQuizQuestion();
}

function renderQuizQuestion() {
  const c = document.getElementById('content');

  if (quizIndex >= quizQuestions.length) {
    const pct = Math.round((quizScore / quizQuestions.length) * 100);
    const emoji = pct >= 80 ? '🎉' : pct >= 60 ? '👍' : '💪';
    c.innerHTML = `
      <div class="quiz-container">
        <div class="quiz-score">
          <h2>${emoji} Quiz Complete!</h2>
          <div class="score-big">${quizScore}/${quizQuestions.length}</div>
          <p style="color: var(--text-dim)">${pct}% correct</p>
          <button class="quiz-start-btn" onclick="showQuiz()" style="margin-top: 24px">Try Again</button>
        </div>
      </div>`;
    return;
  }

  const q = quizQuestions[quizIndex];
  let html = `
    <div class="quiz-container">
      <div class="quiz-header">
        <div class="flashcard-progress">Question ${quizIndex + 1} of ${quizQuestions.length} · ${q.topicTitle}</div>
      </div>
      <div class="quiz-question-card">
        <div class="quiz-q-text">${q.question}</div>
        <div class="quiz-choices">`;

  q.choices.forEach((choice, i) => {
    html += `<button class="quiz-choice" onclick="answerQuiz(${i}, ${q.correctIndex})">${choice}</button>`;
  });

  html += `</div>
        <div class="quiz-explanation" id="quiz-explanation">${q.explanation || ''}</div>
      </div>
    </div>`;

  c.innerHTML = html;
}

function answerQuiz(selected, correct) {
  const choices = document.querySelectorAll('.quiz-choice');
  if (choices[0].classList.contains('answered')) return;

  choices.forEach((c, i) => {
    c.classList.add('answered');
    if (i === correct) c.classList.add('correct');
    if (i === selected && i !== correct) c.classList.add('wrong');
  });

  if (selected === correct) quizScore++;

  document.getElementById('quiz-explanation').classList.add('show');

  setTimeout(() => {
    quizIndex++;
    renderQuizQuestion();
  }, 2500);
}

// ── Readings View ───────────────────────────────────────────
function showReadings() {
  setActiveNav('readings');
  const c = document.getElementById('content');

  if (!READINGS_DATA?.readings?.length) {
    c.innerHTML = `<div class="loading-screen">
      <p style="color: var(--text-dim)">No readings data available.</p>
      <p style="color: var(--text-muted); font-size: 0.85rem;">Run: npm run generate-readings</p>
    </div>`;
    return;
  }

  let html = `
    <div class="dash-header">
      <h1>Course Readings</h1>
      <p>Deep study guides for each assigned reading</p>
    </div>`;

  READINGS_DATA.readings.forEach((r, i) => {
    const termCount = r.keyTerms?.length || 0;
    const examCount = r.examQuestions?.length || 0;
    html += `
      <div class="reading-card" onclick="showReading(${i})">
        <div class="reading-num">R${i + 1}</div>
        <div class="reading-info">
          <h3>${r.title || r.filename}</h3>
          <div class="reading-author">${r.author || ''}</div>
          <div class="topic-meta">
            <span>📝 ${r.entryCount} entries</span>
            <span>🔑 ${termCount} key terms</span>
            <span>📝 ${examCount} exam Q's</span>
          </div>
        </div>
      </div>`;
  });

  c.innerHTML = html;
}

function showReading(index) {
  const r = READINGS_DATA.readings[index];
  if (!r) return;

  setActiveNav(null);
  const c = document.getElementById('content');

  let html = `
    <div class="topic-header">
      <button class="back-btn" onclick="showReadings()">← Back to Readings</button>
      <h1>${r.title || r.filename}</h1>
      ${r.author ? `<span class="set-badge">by ${r.author}</span>` : ''}
    </div>

    <div class="topic-tabs">
      <button class="topic-tab active" onclick="switchTab(this, 'r-overview')">📖 Overview</button>
      <button class="topic-tab" onclick="switchTab(this, 'r-terms')">🔑 Key Terms</button>
      <button class="topic-tab" onclick="switchTab(this, 'r-ideas')">💭 Key Ideas</button>
      <button class="topic-tab" onclick="switchTab(this, 'r-connections')">🔗 Connections</button>
      <button class="topic-tab" onclick="switchTab(this, 'r-exam')">📝 Exam Prep</button>
    </div>`;

  // Overview
  html += `<div class="topic-content-panel active" id="panel-r-overview">`;
  if (r.overview) {
    html += `<div class="review-text">${r.overview.split('\n').filter(p => p.trim()).map(p => `<p>${p}</p>`).join('')}</div>`;
  }
  html += `</div>`;

  // Key Terms
  html += `<div class="topic-content-panel" id="panel-r-terms">`;
  if (r.keyTerms?.length) {
    html += `<p style="color: var(--text-dim); margin-bottom: 16px; font-size: 0.85rem;">Terms your professor is most likely to quiz you on from this reading.</p>`;
    r.keyTerms.forEach(t => {
      html += `<div class="glossary-card">
        <div class="glossary-term">${t.term}</div>
        <div class="glossary-def">${t.definition}</div>
        ${t.significance ? `<div class="term-significance">⚡ ${t.significance}</div>` : ''}
      </div>`;
    });
  }
  html += `</div>`;

  // Key Ideas
  html += `<div class="topic-content-panel" id="panel-r-ideas">`;
  if (r.keyIdeas?.length) {
    r.keyIdeas.forEach(idea => {
      html += `<div class="idea-card">
        <div class="idea-title">${idea.idea}</div>
        <div class="idea-explanation">${idea.explanation}</div>
        ${idea.example ? `<div class="idea-example">📌 ${idea.example}</div>` : ''}
      </div>`;
    });
  }
  html += `</div>`;

  // Connections
  html += `<div class="topic-content-panel" id="panel-r-connections">`;
  if (r.connections?.length) {
    r.connections.forEach(conn => {
      const connSlug = findSlugByTitle(conn.courseTopic);
      html += `<div class="connection-card" ${connSlug ? `onclick="showTopic('${connSlug}')"` : ''}>
        <div class="connection-topic">${conn.courseTopic} →</div>
        <div class="connection-explanation">${conn.howItConnects}</div>
      </div>`;
    });
  }
  html += `</div>`;

  // Exam Prep (short-answer + quiz)
  html += `<div class="topic-content-panel" id="panel-r-exam">`;
  if (r.examQuestions?.length) {
    html += `<h3 style="font-size: 0.9rem; color: var(--text-dim); margin-bottom: 16px;">Short Answer Questions</h3>`;
    r.examQuestions.forEach((q, i) => {
      html += `<div class="exam-card" onclick="this.classList.toggle('revealed')">
        <div class="exam-q"><span class="exam-q-num">Q${i + 1}</span> ${q.question}</div>
        <div class="exam-a"><div class="exam-a-label">Model Answer</div>${q.modelAnswer}</div>
      </div>`;
    });
  }
  if (r.quizQuestions?.length) {
    html += `<h3 style="font-size: 0.9rem; color: var(--text-dim); margin: 24px 0 16px;">Multiple Choice</h3>`;
    r.quizQuestions.forEach((q, i) => {
      html += `<div class="quiz-question-card" style="margin-bottom: 12px;">
        <div class="quiz-q-text">${q.question}</div>
        <div class="quiz-choices">`;
      q.choices.forEach((choice, ci) => {
        html += `<button class="quiz-choice" onclick="revealReadingQuiz(this, ${ci}, ${q.correctIndex}, '${(q.explanation || '').replace(/'/g, "\\'")}')">${choice}</button>`;
      });
      html += `</div><div class="quiz-explanation" id="r-quiz-exp-${i}"></div></div>`;
    });
  }
  html += `</div>`;

  c.innerHTML = html;
  window.scrollTo(0, 0);
}

function revealReadingQuiz(btn, selected, correct, explanation) {
  const card = btn.closest('.quiz-question-card');
  const choices = card.querySelectorAll('.quiz-choice');
  if (choices[0].classList.contains('answered')) return;
  choices.forEach((c, i) => {
    c.classList.add('answered');
    if (i === correct) c.classList.add('correct');
    if (i === selected && i !== correct) c.classList.add('wrong');
  });
  const expDiv = card.querySelector('.quiz-explanation');
  if (expDiv && explanation) {
    expDiv.textContent = explanation;
    expDiv.classList.add('show');
  }
}

// ── Search ──────────────────────────────────────────────────
function handleSearch(query) {
  if (!query || query.length < 2) {
    if (currentView === 'search') showDashboard();
    return;
  }

  currentView = 'search';
  setActiveNav(null);
  const lower = query.toLowerCase();
  const results = [];

  DATA.sets.forEach((set) => {
    set.topics.forEach((topic) => {
      // Search entries
      topic.entries.forEach((e) => {
        if (e.content.toLowerCase().includes(lower)) {
          results.push({ ...e, topicTitle: topic.title, topicSlug: topic.slug });
        }
      });
      // Also search reviews
      if (topic.review?.toLowerCase().includes(lower)) {
        results.push({ content: topic.review.substring(0, 300) + '…', contentType: 'review', sourceType: 'AI', topicTitle: topic.title, topicSlug: topic.slug });
      }
    });
  });

  const c = document.getElementById('content');
  let html = `<div class="search-header">
    <h1>Search: "${query}"</h1>
    <p style="color: var(--text-dim)">${results.length} results</p>
  </div>`;

  results.slice(0, 50).forEach((r) => {
    const highlighted = r.content.replace(
      new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
      '<mark>$1</mark>'
    );
    html += `<div class="search-result" onclick="showTopic('${r.topicSlug}')">
      <div>${highlighted}</div>
      <div class="search-result-meta">${r.topicTitle} · ${formatType(r.contentType)} · ${r.sourceType}</div>
    </div>`;
  });

  c.innerHTML = html;
}

// ── Helpers ─────────────────────────────────────────────────
function findTopic(slug) {
  for (const set of DATA.sets) {
    for (const topic of set.topics) {
      if (topic.slug === slug) return topic;
    }
  }
  return null;
}

function findSetForTopic(slug) {
  for (const set of DATA.sets) {
    for (const topic of set.topics) {
      if (topic.slug === slug) return set;
    }
  }
  return null;
}

function findSlugByTitle(title) {
  for (const set of DATA.sets) {
    for (const topic of set.topics) {
      if (topic.title.toLowerCase() === title.toLowerCase()) return topic.slug;
    }
  }
  return null;
}

function countQuizQuestions() {
  let count = 0;
  DATA.sets.forEach((s) => s.topics.forEach((t) => (count += t.quizQuestions?.length || 0)));
  return count;
}

function formatType(type) {
  const map = {
    'core-lesson': 'Core Lesson',
    'term-definition': 'Definition',
    'example-illustration': 'Example',
    'external-quote': 'Quote',
    'author-line': 'Author',
    'insight-implication': 'Insight',
    'raw-text': 'Note',
    'chapter-heading': 'Heading',
    'distinction': 'Distinction',
    'review': 'Review',
  };
  return map[type] || type;
}

// ── Boot ────────────────────────────────────────────────────
init();
