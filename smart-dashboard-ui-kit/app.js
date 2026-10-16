document.addEventListener('DOMContentLoaded', () => {
  initStackFilters();
  initTabNavigation();
  initRealtimeUserTracker();
});

/* 2. Tech Stack Filtering */
function initStackFilters() {
  const btns = document.querySelectorAll('.filter-pill-btn');
  const cards = document.querySelectorAll('.stack-box-card');

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.getAttribute('data-filter');
      cards.forEach(card => {
        const category = card.getAttribute('data-category');
        if (filter === 'all' || category === filter) {
          card.style.display = 'flex';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });
}

/* 4. Active Tab Underline Navigation */
function initTabNavigation() {
  const tabs = document.querySelectorAll('.nav-tab-item');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });
}

/* 5. Real-Time User Action Telemetry Tracker (Click & Hover Logging) */
function initRealtimeUserTracker() {
  const output = document.getElementById('terminal-output');
  if (!output) return;

  let lastHoverTarget = null;
  let hoverTimer = null;

  // Track Click Events
  document.addEventListener('click', (e) => {
    const target = e.target.closest('a, button, input, label, .card-panel, .service-card, .stack-box-card, .edu-item-card, .nav-tab-item, .filter-pill-btn, .stack-row-item');
    if (target) {
      const type = getElementType(target);
      const text = getElementLabel(target);
      appendLogLine('USER_CLICK', `Target: ${type} ("${text}")`);
    }
  });

  // Track Hover Events (Mouseover) throttled
  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('a, button, input, label, .card-panel, .service-card, .stack-box-card, .edu-item-card, .nav-tab-item, .filter-pill-btn, .stack-row-item');
    if (target && target !== lastHoverTarget) {
      lastHoverTarget = target;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        const type = getElementType(target);
        const text = getElementLabel(target);
        appendLogLine('USER_HOVER', `Target: ${type} ("${text}")`);
      }, 120);
    }
  });
}

function getElementType(el) {
  if (el.classList.contains('nav-tab-item')) return 'NAV_TAB';
  if (el.classList.contains('btn-pill-header') || el.classList.contains('btn-pill-cta')) return 'LINKEDIN_BUTTON';
  if (el.classList.contains('filter-pill-btn')) return 'FILTER_PILL';
  if (el.classList.contains('srv-checkbox') || el.classList.contains('switch-toggle')) return 'SERVICE_SWITCH';
  if (el.classList.contains('service-card')) return 'SERVICE_CARD';
  if (el.classList.contains('stack-box-card')) return 'STACK_MODULE';
  if (el.classList.contains('stack-row-item')) return 'STACK_SKILL';
  if (el.classList.contains('edu-item-card')) return 'EDU_CARD';
  if (el.classList.contains('card-panel')) return 'METRIC_PANEL';
  if (el.tagName === 'A') return 'LINK';
  if (el.tagName === 'BUTTON') return 'BUTTON';
  return 'ELEMENT';
}

function getElementLabel(el) {
  const text = el.textContent.trim().replace(/\s+/g, ' ');
  return text.length > 32 ? text.substring(0, 32) + '...' : text;
}

function appendLogLine(sys, text) {
  const output = document.getElementById('terminal-output');
  if (!output) return;

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;

  const line = document.createElement('div');
  line.textContent = `[${timeStr}] ${sys} > ${text}`;
  output.appendChild(line);

  // Keep max 50 log lines to maintain high performance
  while (output.children.length > 50) {
    output.removeChild(output.firstChild);
  }

  output.scrollTop = output.scrollHeight;
}

/* 6. Toast Notification */
function showToast(msg) {
  const toast = document.getElementById('toast-notice');
  if (!toast) return;

  toast.textContent = `SYSTEM: ${msg}`;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}
