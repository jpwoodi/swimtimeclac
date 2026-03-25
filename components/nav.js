(function () {
  document.addEventListener('DOMContentLoaded', function () {
  var path = window.location.pathname;
  var SPORTS_SUBNAV_STORAGE_KEY = 'sportsSubNavCollapsed';
  var CONTENT_TOP_GAP = 24;

  var topLinks = [
    { href: '/index.html', label: 'Home' },
    { href: '/work/index.html', label: 'Work' },
    { href: '/music/index.html', label: 'Music' },
    { href: '/sports/index.html', label: 'Sports' },
  ];

  var sportsSubLinks = [
    { href: '/sports/index.html', label: 'Overview' },
    { href: '/sports/calculator.html', label: 'Swim Calculator' },
    { href: '/sports/css.html', label: 'CSS Calculator' },
    { href: '/sports/pools.html', label: 'Pool Finder' },
    { href: '/sports/stravafeed.html', label: 'Swim Feed' },
    { href: '/sports/swim-plan-generator.html', label: 'AI Swim Plan' },
    { href: '/sports/swim-plan-library.html', label: 'Swim Plans' },
    { href: '/sports/cyclecommute.html', label: 'Cycle Commute' },
  ];

  function isActive(href) {
    return path === href || path.endsWith(href);
  }

  function isSportsSection() {
    return path.startsWith('/sports/') || path.startsWith('/sports\\');
  }

  // Determine which top-nav item is active
  function topActiveHref() {
    if (isSportsSection()) return '/sports/index.html';
    for (var i = 0; i < topLinks.length; i++) {
      if (isActive(topLinks[i].href)) return topLinks[i].href;
    }
    // Work section articles
    if (path.startsWith('/work/')) return '/work/index.html';
    return '/index.html';
  }

  var activeTop = topActiveHref();

  // Build top nav
  var topNav = document.createElement('nav');
  topNav.className = 'top-nav';

  var hamburger = document.createElement('button');
  hamburger.className = 'hamburger';
  hamburger.type = 'button';
  hamburger.setAttribute('aria-label', 'Toggle navigation menu');
  hamburger.setAttribute('aria-controls', 'primary-nav');
  hamburger.setAttribute('aria-expanded', 'false');
  hamburger.innerHTML = '&#9776;';
  hamburger.addEventListener('click', function () {
    var ul = topNav.querySelector('ul');
    var expanded = ul.classList.toggle('expanded');
    hamburger.setAttribute('aria-expanded', String(expanded));
  });

  var ul = document.createElement('ul');
  ul.id = 'primary-nav';
  for (var i = 0; i < topLinks.length; i++) {
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = topLinks[i].href;
    a.textContent = topLinks[i].label;
    if (topLinks[i].href === activeTop) a.className = 'active';
    li.appendChild(a);
    ul.appendChild(li);
  }

  topNav.appendChild(hamburger);
  topNav.appendChild(ul);
  document.body.prepend(topNav);

  // Build sub-nav for sports section
  if (isSportsSection()) {
    var body = document.body;
    var subNav = document.createElement('nav');
    subNav.className = 'sub-nav';
    subNav.id = 'sports-sub-nav';

    var subNavToggle = document.createElement('button');
    subNavToggle.className = 'sub-nav-toggle';
    subNavToggle.type = 'button';
    subNavToggle.setAttribute('aria-controls', 'sports-sub-nav');

    var subUl = document.createElement('ul');
    for (var j = 0; j < sportsSubLinks.length; j++) {
      var subLi = document.createElement('li');
      var subA = document.createElement('a');
      subA.href = sportsSubLinks[j].href;
      subA.textContent = sportsSubLinks[j].label;
      if (isActive(sportsSubLinks[j].href)) subA.className = 'active';
      subLi.appendChild(subA);
      subUl.appendChild(subLi);
    }

    subNav.appendChild(subUl);
    topNav.appendChild(subNavToggle);
    topNav.insertAdjacentElement('afterend', subNav);

    function isCollapsedPreference() {
      try {
        return window.localStorage.getItem(SPORTS_SUBNAV_STORAGE_KEY) !== 'expanded';
      } catch (error) {
        return true;
      }
    }

    function storeCollapsedPreference(collapsed) {
      try {
        window.localStorage.setItem(
          SPORTS_SUBNAV_STORAGE_KEY,
          collapsed ? 'collapsed' : 'expanded'
        );
      } catch (error) {
        // Ignore localStorage issues and keep the UI working.
      }
    }

    function updateBodyPadding() {
      var navOffset = topNav.offsetHeight + CONTENT_TOP_GAP;
      if (!subNav.classList.contains('is-collapsed')) {
        navOffset += subNav.offsetHeight;
      }
      body.style.paddingTop = navOffset + 'px';
    }

    function setCollapsedState(collapsed) {
      subNav.classList.toggle('is-collapsed', collapsed);
      body.classList.toggle('sports-sub-nav-collapsed', collapsed);
      subNavToggle.setAttribute('aria-expanded', String(!collapsed));
      subNavToggle.textContent = collapsed ? 'Sports Menu' : 'Hide Sports Menu';
      storeCollapsedPreference(collapsed);
      updateBodyPadding();
    }

    subNavToggle.addEventListener('click', function () {
      setCollapsedState(!subNav.classList.contains('is-collapsed'));
    });

    setCollapsedState(isCollapsedPreference());
    window.addEventListener('resize', updateBodyPadding);
  }
  });
})();
